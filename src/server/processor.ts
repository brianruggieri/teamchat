import type {
	BeatType,
	ChatEvent,
	ContentMessage,
	PresenceChange,
	RawInboxMessage,
	RawTaskData,
	ReactionEvent,
	SystemEvent,
	TaskInfo,
	TaskUpdate,
	TeamConfig,
	ThreadMarker,
	ThreadStatus,
} from '../shared/types.js';
import {
	generateEventId,
	isLeadAgent,
	isWithinWindow,
	tryParseSystemEvent,
} from '../shared/parse.js';
import type { WatcherDelta } from './watcher.js';

/** Acknowledgment phrases for compact mode (Tier 2 reactions). */
const ACK_PHRASES: Record<string, string> = {
	'got it': '👍',
	'on it': '👍',
	'will do': '👍',
	'sounds good': '👍',
	'understood': '👍',
	'confirmed': '👍',
	'makes sense': '👍',
	'agreed': '👍',
	'roger': '👍',
	'ok': '👍',
	'sure': '👍',
	'thanks': '🙏',
	'good catch': '🙏',
};

/** Conversational beat patterns — structural dialogue markers derived from real content. */
const BEAT_PATTERNS: { type: BeatType; emoji: string; patterns: RegExp[] }[] = [
	// New patterns: most specific first, before existing patterns
	{
		type: 'completion',
		emoji: '✅',
		patterns: [/\bdone\b/i, /\bcomplete\b/i, /\bfinished\b/i, /all\s+passing/i, /\bimplemented\b/i],
	},
	{
		type: 'blocker',
		emoji: '🚧',
		patterns: [/blocked\s+on/i, /waiting\s+on/i, /need\s+.*before/i, /can't\s+start\s+until/i],
	},
	{
		type: 'sharing',
		emoji: '📎',
		patterns: [/```/, /\bschema\b/i, /interface\s+\w/i, /type\s+\w.*=/i],
	},
	{
		type: 'question',
		emoji: '❓',
		patterns: [/\?$/],
	},
	// Check "resolution" BEFORE plain "agreement" (ordering matters)
	{
		type: 'resolution',
		emoji: '🤝',
		patterns: [/\bwe'?re aligned\b/i, /\bconfirmed\b/i, /\bimplementation matches\b/i, /\bfully aligned\b/i],
	},
	{
		type: 'counter-proposal',
		emoji: '🔄',
		patterns: [/\bwhat about\b/i, /\binstead\b/i, /\bmy preference\b/i, /\bi'?d suggest\b/i, /\bprefer\b.*\binstead\b/i],
	},
	{
		type: 'agreement',
		emoji: '✅',
		patterns: [/\bagreed\b/i, /\bsounds good\b/i, /\blet'?s go with\b/i, /\bthis works\b/i, /\bworks for me\b/i],
	},
	{
		type: 'acknowledgement',
		emoji: '👍',
		patterns: [/\bgot it\b/i, /\bunderstood\b/i, /\bnoted\b/i, /\bmakes sense\b/i],
	},
];

interface PendingBroadcast {
	text: string;
	timestamp: string;
	from: string;
	fromColor: string;
	summary: string | null;
	inboxes: Set<string>;
	timer: ReturnType<typeof setTimeout>;
}

interface IdleState {
	firstSeen: string;
	surfaced: boolean;
}

export type EventEmitter = (events: ChatEvent[]) => void;

export class EventProcessor {
	private emitter: EventEmitter;
	private compactMode: boolean;

	// State tracking
	private processedMessageKeys: Set<string> = new Set();
	private pendingBroadcasts: Map<string, PendingBroadcast> = new Map();
	private idleStates: Map<string, IdleState> = new Map();
	private presence: Map<string, 'working' | 'idle' | 'offline'> = new Map();
	private previousTasks: Map<string, RawTaskData> = new Map();
	private emittedBottlenecks: Set<string> = new Set();
	private previousMembers: Set<string> = new Set();
	private shutdownApproved: Set<string> = new Set();
	private teamCreatedEmitted = false;
	private emittedTaskIds: Set<string> = new Set();
	private idlePingCount = 0;
	private idleSurfacedCount = 0;
	private recentLeadMessages: { id: string; text: string; timestamp: string }[] = [];
	private threadStatuses: Map<string, ThreadStatus> = new Map();
	private allEvents: ChatEvent[] = [];
	private broadcastHoldMs = 500;
	private idleSurfaceMs = 30_000;
	private taskClaimWindowMs = 120_000;

	// Reaction inference tracking
	private recentShutdownRequests: Map<string, string> = new Map(); // agent name → event ID
	private recentNudges: Map<string, { eventId: string; timestamp: string }> = new Map(); // agent name → nudge info
	private recentBroadcasts: { eventId: string; timestamp: string; from: string }[] = [];

	constructor(emitter: EventEmitter, compactMode = false) {
		this.emitter = emitter;
		this.compactMode = compactMode;
	}

	/** Process a delta from the file watcher. */
	processDelta(delta: WatcherDelta): void {
		switch (delta.type) {
			case 'config':
				this.processConfigChange(
					delta.previous as TeamConfig | null,
					delta.current as TeamConfig | null,
				);
				break;
			case 'inbox':
				this.processInboxChange(
					delta.agentName!,
					(delta.previous as RawInboxMessage[] | null) ?? [],
					(delta.current as RawInboxMessage[] | null) ?? [],
				);
				break;
			case 'tasks':
				this.processTasksChange(
					(delta.previous as RawTaskData[] | null) ?? [],
					(delta.current as RawTaskData[] | null) ?? [],
				);
				break;
		}
	}

	/** Get all events emitted so far. */
	getAllEvents(): ChatEvent[] {
		return this.allEvents;
	}

	/** Get current presence state. */
	getPresence(): Record<string, 'working' | 'idle' | 'offline'> {
		return Object.fromEntries(this.presence);
	}

	/** Get current task state. */
	getTasks(): TaskInfo[] {
		return Array.from(this.previousTasks.values()).map((t) => ({ ...t }));
	}

	/** Get current thread status tracking. */
	getThreadStatuses(): ThreadStatus[] {
		return Array.from(this.threadStatuses.values());
	}

	// === Config changes (member join/leave) ===

	private processConfigChange(
		previous: TeamConfig | null,
		current: TeamConfig | null,
	): void {
		if (!current) {
			// Team deleted
			this.emit([
				this.makeSystemEvent('team-deleted', 'Team has been disbanded', null, null),
			]);
			return;
		}

		const prevNames = previous ? new Set(previous.members.map((m) => m.name)) : new Set<string>();
		const currNames = new Set(current.members.map((m) => m.name));
		const currByName = new Map(current.members.map((m) => [m.name, m]));

		const events: ChatEvent[] = [];

		// Team created (first config, emit only once)
		if (!previous && current && !this.teamCreatedEmitted) {
			this.teamCreatedEmitted = true;
			const createdTs = current.createdAt
				? new Date(current.createdAt).toISOString()
				: undefined;
			events.push(
				this.makeSystemEvent(
					'team-created',
					`Team created`,
					null,
					null,
					undefined,
					undefined,
					createdTs,
				),
			);
		}

		// Members joined — use joinedAt for accurate timestamps
		// Use previousMembers (tracks current members) instead of prevNames (per-diff) to prevent re-emitting
		for (const name of currNames) {
			if (!this.previousMembers.has(name) && !isLeadAgent(name)) {
				const member = currByName.get(name)!;
				this.presence.set(name, 'working');
				this.previousMembers.add(name);
				const joinedTs = member.joinedAt
					? new Date(member.joinedAt).toISOString()
					: undefined;
				events.push(
					this.makeSystemEvent(
						'member-joined',
						`${name} joined the chat`,
						name,
						member.color,
						undefined,
						undefined,
						joinedTs,
						member.model,
					),
				);
			}
		}

		// Members left (suppress if shutdown-approved already fired)
		for (const name of prevNames) {
			if (!currNames.has(name) && !isLeadAgent(name)) {
				this.presence.set(name, 'offline');
				this.previousMembers.delete(name);
				if (!this.shutdownApproved.has(name)) {
					events.push(
						this.makeSystemEvent(
							'member-left',
							`${name} left the chat`,
							name,
							null,
						),
					);
				}
			}
		}

		if (events.length > 0) {
			this.emit(events);
		}
	}

	// === Inbox changes (new messages) ===

	private processInboxChange(
		inboxOwner: string,
		previous: RawInboxMessage[],
		current: RawInboxMessage[],
	): void {
		// Find new messages (messages in current that weren't in previous)
		const newMessages = current.slice(previous.length);

		for (const msg of newMessages) {
			const msgKey = `${inboxOwner}:${msg.from}:${msg.timestamp}:${msg.text.slice(0, 100)}`;
			if (this.processedMessageKeys.has(msgKey)) {
				continue;
			}
			this.processedMessageKeys.add(msgKey);

			// Prune to prevent unbounded growth — keep the most recent half
			if (this.processedMessageKeys.size > 10_000) {
				const keys = Array.from(this.processedMessageKeys);
				this.processedMessageKeys = new Set(keys.slice(keys.length - 5_000));
			}

			// Try parsing as system event
			const sysEvent = tryParseSystemEvent(msg.text);
			if (sysEvent) {
				this.processSystemMessage(inboxOwner, msg, sysEvent);
			} else {
				this.processContentMessage(inboxOwner, msg);
			}
		}
	}

	private processSystemMessage(
		inboxOwner: string,
		msg: RawInboxMessage,
		parsed: NonNullable<ReturnType<typeof tryParseSystemEvent>>,
	): void {

		switch (parsed.type) {
			case 'idle_notification':
				this.handleIdleNotification(msg.from, msg.timestamp, parsed);
				break;

			case 'shutdown_request': {
				const shutdownReqEvent = this.makeSystemEvent(
					'shutdown-requested',
					`team-lead asked ${inboxOwner} to leave`,
					inboxOwner,
					msg.color,
				);
				this.recentShutdownRequests.set(inboxOwner, shutdownReqEvent.id);
				this.emit([shutdownReqEvent]);
				break;
			}

			case 'shutdown_approved': {
				this.presence.set(msg.from, 'offline');
				this.shutdownApproved.add(msg.from);
				const approvalEvents: ChatEvent[] = [
					this.makeSystemEvent(
						'shutdown-approved',
						`${msg.from} has left the chat`,
						msg.from,
						msg.color,
					),
					this.makePresenceChange(msg.from, 'offline', msg.timestamp),
				];
				// Emit 👋 reaction on the original shutdown-requested event
				const requestEventId = this.recentShutdownRequests.get(msg.from);
				if (requestEventId) {
					approvalEvents.push(
						this.makeReaction(requestEventId, '👋', msg.from, msg.color, msg.timestamp, 'shutdown compliance'),
					);
					this.recentShutdownRequests.delete(msg.from);
				}
				this.emit(approvalEvents);
				break;
			}

			case 'shutdown_rejected':
				this.emit([
					this.makeSystemEvent(
						'shutdown-rejected',
						`${msg.from} declined: ${parsed.reason ?? 'still working'}`,
						msg.from,
						msg.color,
					),
				]);
				break;

			case 'task_completed': {
				const taskId = parsed.taskId ?? parsed.completedTaskId ?? null;
				const taskSubject = parsed.taskSubject ?? null;
				const events: ChatEvent[] = [
					this.makeSystemEvent(
						'task-completed',
						`${msg.from} completed: ${taskSubject ?? `#${taskId}`}`,
						msg.from,
						msg.color,
						taskId ?? undefined,
						taskSubject ?? undefined,
					),
				];

				// Attach ✅ reaction to originating message if found
				const origMsg = this.findOriginatingMessage(taskId, taskSubject);
				if (origMsg) {
					events.push(this.makeReaction(origMsg, '✅', msg.from, msg.color, msg.timestamp));
				}

				// Clear idle state — agent just finished work
				this.idleStates.delete(msg.from);
				this.presence.set(msg.from, 'working');

				this.emit(events);
				break;
			}

			case 'plan_approval_request': {
				// Render as a content message with plan card styling
				const planText = `📋 PLAN: ${parsed.planContent ?? '(plan content)'}`;
				const planMsg: ContentMessage = {
					type: 'message',
					id: generateEventId(),
					from: msg.from,
					fromColor: msg.color,
					text: planText,
					summary: `Plan from ${msg.from}`,
					timestamp: msg.timestamp,
					isBroadcast: false,
					isDM: false,
					dmParticipants: null,
					isLead: false,
					replyToId: null,
				};
				this.emit([planMsg]);
				break;
			}

			case 'plan_approval_response': {
				const approved = parsed.approved ?? false;
				const feedback = parsed.feedback ?? null;
				// Find the plan message to react to
				const planMsg = this.findPlanMessage(msg.from === 'team-lead' ? inboxOwner : msg.from);
				const events: ChatEvent[] = [];
				if (planMsg) {
					events.push(
						this.makeReaction(
							planMsg,
							approved ? '👍' : '👎',
							msg.from,
							msg.color,
							msg.timestamp,
							feedback,
						),
					);
				}
				this.emit(events);
				break;
			}

			case 'permission_request': {
				const permText = `🔐 ${parsed.workerName ?? msg.from} wants to run: \`${parsed.toolName ?? 'unknown'}\`${parsed.description ? ` — ${parsed.description}` : ''}`;
				const permMsg: ContentMessage = {
					type: 'message',
					id: generateEventId(),
					from: parsed.workerName ?? msg.from,
					fromColor: parsed.workerColor ?? msg.color,
					text: permText,
					summary: `Permission request: ${parsed.toolName ?? 'unknown'}`,
					timestamp: msg.timestamp,
					isBroadcast: false,
					isDM: false,
					dmParticipants: null,
					isLead: false,
					replyToId: null,
				};
				this.emit([permMsg]);
				break;
			}

			default:
				// Unknown system event type — log as system message
				break;
		}
	}

	private processContentMessage(inboxOwner: string, msg: RawInboxMessage): void {
		const senderIsTeammate = !isLeadAgent(msg.from);
		const ownerIsTeammate = !isLeadAgent(inboxOwner);

		// Teammate→teammate: always a DM — emit immediately, no hold window needed.
		// Each inbox gets its own DM event. This preserves synchronous emission
		// for presence transitions (clearIdleState) and compact mode ack detection.
		if (senderIsTeammate && ownerIsTeammate) {
			this.emitDM(inboxOwner, msg);
			return;
		}

		// Lead-involved messages (lead→teammate or teammate→lead) go through
		// broadcast detection. Lead broadcasts appear in 3+ teammate inboxes
		// within the hold window — we need to deduplicate those.
		const broadcastKey = `${msg.from}:${msg.text.slice(0, 100)}:${msg.timestamp}`;
		const existing = this.pendingBroadcasts.get(broadcastKey);
		if (existing) {
			existing.inboxes.add(inboxOwner);
			return;
		}
		const pending: PendingBroadcast = {
			text: msg.text,
			timestamp: msg.timestamp,
			from: msg.from,
			fromColor: msg.color,
			summary: msg.summary ?? null,
			inboxes: new Set([inboxOwner]),
			timer: setTimeout(() => {
				this.finalizeBroadcastCheck(broadcastKey);
			}, this.broadcastHoldMs),
		};
		this.pendingBroadcasts.set(broadcastKey, pending);
	}

	private emitDM(inboxOwner: string, msg: RawInboxMessage): void {
		const events: ChatEvent[] = [];
		const participants = [msg.from, inboxOwner].sort();
		const threadKey = participants.join(':');

		// Check if we need a thread-start marker
		if (!this.isInActiveThread(participants)) {
			events.push({
				type: 'thread-marker',
				id: generateEventId(),
				subtype: 'thread-start',
				participants,
				timestamp: msg.timestamp,
			});
		}

		const contentMsg = this.buildContentMessage(msg, false, true, participants);
		events.push(contentMsg);

		// Track thread status
		const existing = this.threadStatuses.get(threadKey);
		if (existing) {
			existing.messageCount++;
			existing.lastMessageTimestamp = msg.timestamp;
			if (existing.status === 'new') existing.status = 'active';
		} else {
			this.threadStatuses.set(threadKey, {
				threadKey,
				participants,
				topic: msg.text.slice(0, 60).replace(/\n/g, ' '),
				messageCount: 1,
				status: 'new',
				firstMessageTimestamp: msg.timestamp,
				lastMessageTimestamp: msg.timestamp,
				beats: [],
			});
		}

		// Beat detection — detect conversational structure from message content
		const thread = this.threadStatuses.get(threadKey)!;
		const beat = this.detectBeat(thread, msg.text);
		if (beat) {
			thread.beats.push(beat.type);
			// Resolution marks thread resolved
			if (beat.type === 'resolution') {
				thread.status = 'resolved';
			}
			events.push(
				this.makeReaction(contentMsg.id, beat.emoji, msg.from, msg.color, msg.timestamp, `beat:${beat.type}`),
			);
		}

		// Compact mode: check for acknowledgment phrases (existing behavior)
		// Beat detection takes priority — if a beat was detected, skip ack detection
		if (!beat && this.compactMode && msg.text.length < 50) {
			const ackEmoji = this.detectAcknowledgment(msg.text);
			if (ackEmoji) {
				const recentMsg = this.findRecentMessageFrom(inboxOwner, msg.timestamp, 30_000);
				if (recentMsg) {
					// Replace the content message with a reaction, but preserve
					// thread-start markers that were pushed earlier in this call.
					const preserved = events.filter((e) => e.type === 'thread-marker');
					events.length = 0;
					events.push(
						...preserved,
						this.makeReaction(recentMsg, ackEmoji, msg.from, msg.color, msg.timestamp, msg.text),
					);
				}
			}
		}

		// Nudge ack: if this agent was recently nudged, emit 👍 on the nudge event
		const nudgeAck = this.checkNudgeAck(msg.from, msg.timestamp);
		if (nudgeAck) {
			events.push(nudgeAck);
		}

		this.emit(events);
	}

	private finalizeBroadcastCheck(key: string): void {
		const pending = this.pendingBroadcasts.get(key);
		if (!pending) return;
		this.pendingBroadcasts.delete(key);

		const isBroadcast = pending.inboxes.size >= 3;
		const senderIsTeammate = !isLeadAgent(pending.from);

		// DM: teammate→teammate message that appeared in only one inbox
		if (senderIsTeammate && pending.inboxes.size === 1) {
			const inboxOwner = [...pending.inboxes][0]!;
			if (!isLeadAgent(inboxOwner)) {
				// It's a true DM — emit via the DM path
				const rawMsg: RawInboxMessage = {
					from: pending.from,
					text: pending.text,
					timestamp: pending.timestamp,
					color: pending.fromColor,
					summary: pending.summary ?? undefined,
					read: true,
				};
				this.emitDM(inboxOwner, rawMsg);
				return;
			}
		}

		const msg: ContentMessage = {
			type: 'message',
			id: generateEventId(),
			from: pending.from,
			fromColor: pending.fromColor,
			text: pending.text,
			summary: pending.summary,
			timestamp: pending.timestamp,
			isBroadcast,
			isDM: false,
			dmParticipants: null,
			isLead: isLeadAgent(pending.from),
			replyToId: null,
		};

		const events: ChatEvent[] = [msg];

		// Track lead messages for task claim correlation
		if (isLeadAgent(pending.from)) {
			this.recentLeadMessages.push({
				id: msg.id,
				text: msg.text,
				timestamp: msg.timestamp,
			});
			// Keep only last 50 lead messages
			if (this.recentLeadMessages.length > 50) {
				this.recentLeadMessages.shift();
			}

			// Nudge detection: lead → single idle agent (non-assignment message)
			if (!isBroadcast && pending.inboxes.size === 1) {
				const target = [...pending.inboxes][0]!;
				const isIdle = this.presence.get(target) === 'idle';
				const isAssignment = pending.text.includes('"type":"task_assignment"');
				if (isIdle && !isAssignment && !isLeadAgent(target)) {
					const nudgeEvent = this.makeSystemEvent(
						'nudge',
						`team-lead nudged ${target}`,
						target,
						null,
					);
					events.push(nudgeEvent);
					this.recentNudges.set(target, { eventId: nudgeEvent.id, timestamp: pending.timestamp });
				}
			}

			// Track broadcast for ack detection
			if (isBroadcast) {
				this.recentBroadcasts.push({ eventId: msg.id, timestamp: msg.timestamp, from: msg.from });
				// Keep only last 20 broadcasts
				if (this.recentBroadcasts.length > 20) {
					this.recentBroadcasts.shift();
				}
			}
		}

		// Compact mode acknowledgment detection
		if (this.compactMode && pending.text.length < 50 && !isBroadcast) {
			const ackEmoji = this.detectAcknowledgment(pending.text);
			if (ackEmoji) {
				const iterator = pending.inboxes.values();
				const firstInbox = iterator.next().value;
				if (firstInbox) {
					const recentMsg = this.findRecentMessageFrom(firstInbox, pending.timestamp, 30_000);
					if (recentMsg) {
						events.length = 0;
						events.push(
							this.makeReaction(recentMsg, ackEmoji, pending.from, pending.fromColor, pending.timestamp, pending.text),
						);
					}
				}
			}
		}

		// Nudge ack: if this agent was recently nudged, emit 👍 on the nudge event
		if (senderIsTeammate) {
			const nudgeAck = this.checkNudgeAck(pending.from, pending.timestamp);
			if (nudgeAck) {
				events.push(nudgeAck);
			}
		}

		// Broadcast ack: short message from non-lead agent within 60s of a broadcast
		if (senderIsTeammate && !isBroadcast) {
			const broadcastAck = this.checkBroadcastAck(pending.from, pending.text, pending.timestamp);
			if (broadcastAck) {
				events.push(broadcastAck);
			}
		}

		this.emit(events);
	}

	// === Task changes ===

	private processTasksChange(
		previous: RawTaskData[],
		current: RawTaskData[],
	): void {
		const prevMap = new Map(previous.map((t) => [t.id, t]));
		const currMap = new Map(current.map((t) => [t.id, t]));
		const events: ChatEvent[] = [];

		// Detect new tasks (deduplicate — replay can re-fire)
		for (const [id, task] of currMap) {
			if (!prevMap.has(id) && !this.emittedTaskIds.has(id)) {
				this.emittedTaskIds.add(id);
				events.push(
					this.makeSystemEvent(
						'task-created',
						`Task #${task.id}: ${task.subject}`,
						null,
						null,
						task.id,
						task.subject,
						task.created || undefined,
					),
				);
				events.push(this.makeTaskUpdate(task));
			}
		}

		// Detect changes in existing tasks
		for (const [id, curr] of currMap) {
			const prev = prevMap.get(id);
			if (!prev) continue;

			// Owner change (task claimed)
			if (prev.owner !== curr.owner && curr.owner !== null) {
				events.push(
					this.makeSystemEvent(
						'task-claimed',
						`${curr.owner} claimed #${curr.id}: ${curr.subject}`,
						curr.owner,
						null,
						curr.id,
						curr.subject,
					),
				);

				// Correlate with lead assignment message for ✋ reaction
				const leadMsg = this.findLeadMessageAboutTask(curr.id, curr.subject, curr.updated);
				if (leadMsg) {
					events.push(
						this.makeReaction(leadMsg, '✋', curr.owner, '', curr.updated),
					);
				}
			}

			// Status change
			if (prev.status !== curr.status) {
				if (curr.status === 'completed') {
					events.push(
						this.makeSystemEvent(
							'task-completed',
							`${curr.owner ?? curr.subject ?? 'Someone'} completed #${curr.id}${curr.owner ? `: ${curr.subject}` : ''}`,
							curr.owner ?? curr.subject,
							null,
							curr.id,
							curr.subject,
						),
					);
				} else if (curr.status === 'failed') {
					events.push(
						this.makeSystemEvent(
							'task-failed',
							`Task #${curr.id} failed: ${curr.subject}`,
							curr.owner,
							null,
							curr.id,
							curr.subject,
						),
					);
				}
			}

			// Emit task update for any change
			if (JSON.stringify(prev) !== JSON.stringify(curr)) {
				events.push(this.makeTaskUpdate(curr));
			}
		}

		// Check for dependency unblocks (must happen BEFORE updating previousTasks)
		const unblockedEvents = this.computeUnblocks(currMap);
		events.push(...unblockedEvents);

		// Bottleneck detection: 2+ idle agents blocked on the same incomplete task
		const blockerCounts = new Map<string, string[]>();
		for (const [, task] of currMap) {
			if (task.status !== 'completed' && task.owner && this.presence.get(task.owner) !== 'idle') {
				// This task is in-progress by a working agent — check who it blocks
				continue;
			}
			// Find tasks blocked by incomplete tasks where the owner is idle
			if (task.blockedBy) {
				for (const blockerId of task.blockedBy) {
					const blocker = currMap.get(blockerId);
					if (blocker && blocker.status !== 'completed' && blocker.owner) {
						const waiters = blockerCounts.get(blockerId) ?? [];
						if (task.owner && !waiters.includes(task.owner)) {
							waiters.push(task.owner);
						}
						blockerCounts.set(blockerId, waiters);
					}
				}
			}
		}
		for (const [blockerId, waiters] of blockerCounts) {
			if (waiters.length >= 2 && waiters.some((w) => this.presence.get(w) === 'idle')) {
				const blocker = currMap.get(blockerId);
				const bottleneckKey = `bottleneck:${blockerId}`;
				if (blocker && !this.emittedBottlenecks.has(bottleneckKey)) {
					this.emittedBottlenecks.add(bottleneckKey);
					events.push(
						this.makeSystemEvent(
							'bottleneck',
							`${blocker.owner ?? 'Task #' + blockerId} is a bottleneck — ${waiters.join(', ')} waiting`,
							blocker.owner,
							null,
							blockerId,
							blocker.subject,
						),
					);
				}
			}
		}

		// Update stored tasks
		this.previousTasks = currMap;

		// Check for all-tasks-completed
		if (current.length > 0 && current.every((t) => t.status === 'completed')) {
			const prevAllComplete = previous.length > 0 && previous.every((t) => t.status === 'completed');
			if (!prevAllComplete) {
				events.push(
					this.makeSystemEvent(
						'all-tasks-completed',
						`All ${current.length} tasks completed!`,
						null,
						null,
					),
				);
				// 🎉 reaction on the final task-completed system event
				const lastComplete = events.findLast(
					(e) => e.type === 'system' && (e as SystemEvent).subtype === 'task-completed',
				);
				if (lastComplete) {
					events.push(
						this.makeReaction(lastComplete.id, '🎉', 'teamchat', '', new Date().toISOString()),
					);
				}

				// Session summary
				const allEvents = this.getAllEvents();
				const messageCount = allEvents.filter((e) => e.type === 'message').length;
				const dmCount = allEvents.filter((e) => e.type === 'message' && (e as ContentMessage).isDM).length;
				const broadcastCount = allEvents.filter((e) => e.type === 'message' && (e as ContentMessage).isBroadcast).length;
				const memberCount = this.previousMembers.size;
				const taskCount = current.filter((t) => !this.isInternalTask(t)).length;
				const idleSuppressed = this.idlePingCount - (this.idleSurfacedCount ?? 0);
				const firstEvent = allEvents[0];
				const duration = firstEvent
					? Math.round((Date.now() - new Date(firstEvent.timestamp).getTime()) / 60_000)
					: 0;

				const lines = [
					`${taskCount} tasks completed by ${memberCount} agents in ~${duration}min`,
					`${messageCount} messages (${dmCount} DMs, ${broadcastCount} broadcasts)`,
					idleSuppressed > 0 ? `${idleSuppressed} idle pings suppressed` : null,
				].filter(Boolean);

				events.push(
					this.makeSystemEvent(
						'session-summary',
						lines.join(' · '),
						null,
						null,
					),
				);
			}
		}

		if (events.length > 0) {
			this.emit(events);
		}
	}

	private computeUnblocks(tasks: Map<string, RawTaskData>): ChatEvent[] {
		const events: ChatEvent[] = [];
		const completedIds = new Set<string>();
		for (const task of tasks.values()) {
			if (task.status === 'completed') {
				completedIds.add(task.id);
			}
		}

		for (const task of tasks.values()) {
			if (task.status !== 'pending' || !task.blockedBy || task.blockedBy.length === 0) {
				continue;
			}
			const allBlockersComplete = task.blockedBy.every((id) => completedIds.has(id));
			if (!allBlockersComplete) continue;

			// Check if we previously knew about this unblock
			const prevTask = this.previousTasks.get(task.id);
			if (prevTask) {
				// Check if blockers were previously not all complete
				const prevBlockersComplete = prevTask.blockedBy?.every((id) => {
					const bt = this.previousTasks.get(id);
					return bt && bt.status === 'completed';
				}) ?? false;
				if (prevBlockersComplete) continue; // Already unblocked before
			}

			events.push(
				this.makeSystemEvent(
					'task-unblocked',
					`#${task.id} unblocked → available for ${task.owner ?? 'anyone'}`,
					null,
					null,
					task.id,
					task.subject,
				),
			);
		}

		return events;
	}

	// === Idle notification handling ===

	private handleIdleNotification(
		agentName: string,
		timestamp: string,
		parsed: { completedTaskId?: string; completedStatus?: string; idleReason?: string },
	): void {
		this.presence.set(agentName, 'idle');
		this.idlePingCount++;

		const existing = this.idleStates.get(agentName);
		if (!existing) {
			// First idle ping
			this.idleStates.set(agentName, { firstSeen: timestamp, surfaced: false });
			this.emit([this.makePresenceChange(agentName, 'idle', timestamp)]);
			return;
		}

		// Check if we should surface the idle message (after 30s)
		if (!existing.surfaced && !isWithinWindow(existing.firstSeen, timestamp, this.idleSurfaceMs)) {
			existing.surfaced = true;
			this.idleSurfacedCount++;
			this.emit([
				this.makeSystemEvent(
					'idle-surfaced',
					`${agentName} is idle${parsed.idleReason ? `: ${parsed.idleReason}` : ''}`,
					agentName,
					null,
				),
			]);
		}
		// Otherwise silently absorb the ping — no chat noise
	}

	/** Call when a non-idle message arrives from an agent to clear idle state. */
	private clearIdleState(agentName: string, timestamp: string): void {
		if (this.idleStates.has(agentName)) {
			this.idleStates.delete(agentName);
			this.presence.set(agentName, 'working');
			this.emit([this.makePresenceChange(agentName, 'working', timestamp)]);
		}
	}

	// === Helper methods ===

	private buildContentMessage(
		msg: RawInboxMessage,
		isBroadcast: boolean,
		isDM: boolean,
		dmParticipants: string[] | null,
	): ContentMessage {
		// Clear idle state when agent sends a content message
		this.clearIdleState(msg.from, msg.timestamp);

		const contentMsg: ContentMessage = {
			type: 'message',
			id: generateEventId(),
			from: msg.from,
			fromColor: msg.color,
			text: msg.text,
			summary: msg.summary ?? null,
			timestamp: msg.timestamp,
			isBroadcast,
			isDM,
			dmParticipants,
			isLead: isLeadAgent(msg.from),
			replyToId: null,
		};

		// Track lead messages for task claim correlation
		if (isLeadAgent(msg.from)) {
			this.recentLeadMessages.push({
				id: contentMsg.id,
				text: contentMsg.text,
				timestamp: contentMsg.timestamp,
			});
			if (this.recentLeadMessages.length > 50) {
				this.recentLeadMessages.shift();
			}
		}

		return contentMsg;
	}

	private isInActiveThread(participants: string[]): boolean {
		const key = [...participants].sort().join(':');
		// Check recent events for an active thread with these participants
		for (let i = this.allEvents.length - 1; i >= 0; i--) {
			const ev = this.allEvents[i]!;
			if (ev.type === 'thread-marker') {
				const marker = ev as ThreadMarker;
				const markerKey = [...marker.participants].sort().join(':');
				if (markerKey === key) {
					return marker.subtype === 'thread-start';
				}
			}
		}
		return false;
	}

	private findRecentMessageFrom(
		from: string,
		beforeTimestamp: string,
		windowMs: number,
	): string | null {
		for (let i = this.allEvents.length - 1; i >= 0; i--) {
			const ev = this.allEvents[i]!;
			if (ev.type === 'message') {
				const msg = ev as ContentMessage;
				if (msg.from === from && isWithinWindow(msg.timestamp, beforeTimestamp, windowMs)) {
					return msg.id;
				}
			}
		}
		return null;
	}

	private findOriginatingMessage(
		taskId: string | null,
		taskSubject: string | null,
	): string | null {
		if (!taskId && !taskSubject) return null;
		for (let i = this.allEvents.length - 1; i >= 0; i--) {
			const ev = this.allEvents[i]!;
			if (ev.type === 'message') {
				const msg = ev as ContentMessage;
				if (taskId && msg.text.includes(`#${taskId}`)) return msg.id;
				if (taskSubject && msg.text.toLowerCase().includes(taskSubject.toLowerCase())) return msg.id;
			}
			if (ev.type === 'system') {
				const sys = ev as SystemEvent;
				if (sys.taskId === taskId) return sys.id;
			}
		}
		return null;
	}

	private findPlanMessage(agentName: string): string | null {
		for (let i = this.allEvents.length - 1; i >= 0; i--) {
			const ev = this.allEvents[i]!;
			if (ev.type === 'message') {
				const msg = ev as ContentMessage;
				if (msg.from === agentName && msg.text.startsWith('📋 PLAN:')) {
					return msg.id;
				}
			}
		}
		return null;
	}

	private findLeadMessageAboutTask(
		taskId: string,
		taskSubject: string,
		claimTimestamp: string,
	): string | null {
		// Look for a lead message within the claim window that references this task
		for (let i = this.recentLeadMessages.length - 1; i >= 0; i--) {
			const leadMsg = this.recentLeadMessages[i]!;
			if (!isWithinWindow(leadMsg.timestamp, claimTimestamp, this.taskClaimWindowMs)) {
				continue;
			}
			const text = leadMsg.text.toLowerCase();
			if (text.includes(`#${taskId}`) || text.includes(taskSubject.toLowerCase())) {
				return leadMsg.id;
			}
		}
		return null;
	}

	private detectAcknowledgment(text: string): string | null {
		const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, '');
		return ACK_PHRASES[normalized] ?? null;
	}

	private detectBeat(thread: ThreadStatus, text: string): { type: BeatType; emoji: string } | null {
		// First message in a thread is always a proposal
		if (thread.messageCount === 1) {
			return { type: 'proposal', emoji: '📋' };
		}

		// Check beat patterns in priority order
		for (const { type, emoji, patterns } of BEAT_PATTERNS) {
			if (patterns.some((p) => p.test(text))) {
				return { type, emoji };
			}
		}

		return null;
	}

	// === Reaction inference helpers ===

	/** Check if an agent message should trigger a nudge ack reaction (👍 on the nudge event). */
	private checkNudgeAck(agentName: string, timestamp: string): ReactionEvent | null {
		const nudge = this.recentNudges.get(agentName);
		if (!nudge) return null;
		if (!isWithinWindow(nudge.timestamp, timestamp, 60_000)) {
			this.recentNudges.delete(agentName);
			return null;
		}
		this.recentNudges.delete(agentName);
		const agentColor = this.getAgentColor(agentName);
		return this.makeReaction(nudge.eventId, '👍', agentName, agentColor, timestamp, 'nudge response');
	}

	/** Check if a short message from a non-lead agent should trigger a broadcast ack (👍 on the broadcast). */
	private checkBroadcastAck(agentName: string, text: string, timestamp: string): ReactionEvent | null {
		if (isLeadAgent(agentName)) return null;
		if (text.length >= 50) return null;
		// Find the most recent broadcast from a different agent within 60s
		for (let i = this.recentBroadcasts.length - 1; i >= 0; i--) {
			const bc = this.recentBroadcasts[i]!;
			if (bc.from === agentName) continue;
			if (isWithinWindow(bc.timestamp, timestamp, 60_000)) {
				const agentColor = this.getAgentColor(agentName);
				return this.makeReaction(bc.eventId, '👍', agentName, agentColor, timestamp, 'broadcast ack');
			}
		}
		return null;
	}

	/** Get agent color from presence or default to empty. */
	private getAgentColor(agentName: string): string {
		// Look up from recent events
		for (let i = this.allEvents.length - 1; i >= 0; i--) {
			const ev = this.allEvents[i]!;
			if (ev.type === 'message' && (ev as ContentMessage).from === agentName) {
				return (ev as ContentMessage).fromColor;
			}
		}
		return '';
	}

	// === Event creation helpers ===

	private makeSystemEvent(
		subtype: SystemEvent['subtype'],
		text: string,
		agentName: string | null,
		agentColor: string | null,
		taskId?: string,
		taskSubject?: string,
		timestamp?: string,
		agentModel?: string,
	): SystemEvent {
		return {
			type: 'system',
			id: generateEventId(),
			subtype,
			text,
			timestamp: timestamp ?? new Date().toISOString(),
			agentName,
			agentColor,
			agentModel: agentModel ?? null,
			taskId: taskId ?? null,
			taskSubject: taskSubject ?? null,
		};
	}

	private makePresenceChange(
		agentName: string,
		status: PresenceChange['status'],
		timestamp: string,
	): PresenceChange {
		return {
			type: 'presence',
			id: generateEventId(),
			agentName,
			status,
			timestamp,
		};
	}

	private makeReaction(
		targetMessageId: string,
		emoji: string,
		fromAgent: string,
		fromColor: string,
		timestamp: string,
		tooltip?: string | null,
	): ReactionEvent {
		return {
			type: 'reaction',
			id: generateEventId(),
			targetMessageId,
			emoji,
			fromAgent,
			fromColor,
			timestamp,
			tooltip: tooltip ?? null,
		};
	}

	private makeTaskUpdate(task: RawTaskData): TaskUpdate {
		return {
			type: 'task-update',
			id: generateEventId(),
			task: { ...task },
			timestamp: new Date().toISOString(),
		};
	}

	/** Check if a task is an internal agent-tracking task (subject = agent name). */
	private isInternalTask(task: RawTaskData): boolean {
		return this.previousMembers.has(task.subject) || isLeadAgent(task.subject);
	}

	private emit(events: ChatEvent[]): void {
		this.allEvents.push(...events);
		this.emitter(events);
	}
}
