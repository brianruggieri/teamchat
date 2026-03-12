import type {
	PostMortemData,
	AgentContribution,
	CoordinationCell,
	KeyMoment,
	ContentMessage,
	SystemEvent,
	AgentInfo,
} from '../shared/types.js';
import type { ReplayBundle } from '../shared/replay.js';
import type { ChatState } from './types.js';

/**
 * Derive post-mortem data from live ChatState.
 * Returns null if the session hasn't completed all tasks yet.
 */
export function derivePostMortem(state: ChatState): PostMortemData | null {
	const allTasksEvent = state.events.find(
		(e) => e.type === 'system' && (e as SystemEvent).subtype === 'all-tasks-completed',
	);
	if (!allTasksEvent) return null;

	const sessionStart = state.sessionStart
		? new Date(state.sessionStart).getTime()
		: null;
	const sessionEnd = new Date(allTasksEvent.timestamp).getTime();

	const members = state.team?.members ?? [];
	const membersByName = new Map(members.map((m) => [m.name, m]));

	return buildPostMortem(
		state.events,
		state.tasks,
		state.threadStatuses,
		state.suppressionStats,
		members,
		membersByName,
		sessionStart,
		sessionEnd,
	);
}

/**
 * Derive post-mortem data from a replay bundle.
 * Suppression stats are unavailable for replays (suppressed pings were never recorded).
 */
export function derivePostMortemFromReplay(
	bundle: ReplayBundle,
	chatState: ChatState,
): PostMortemData | null {
	const allTasksEvent = chatState.events.find(
		(e) => e.type === 'system' && (e as SystemEvent).subtype === 'all-tasks-completed',
	);
	if (!allTasksEvent) return null;

	const sessionStart = new Date(bundle.manifest.startedAt).getTime();
	const sessionEnd = new Date(allTasksEvent.timestamp).getTime();

	const members = bundle.team.members;
	const membersByName = new Map(members.map((m) => [m.name, m]));

	return buildPostMortem(
		chatState.events,
		bundle.finalTasks.length > 0 ? bundle.finalTasks : chatState.tasks,
		chatState.threadStatuses,
		// Suppression stats not available in replays
		{ idlePingCount: 0, idleSurfacedCount: 0 },
		members,
		membersByName,
		sessionStart,
		sessionEnd,
	);
}

function buildPostMortem(
	events: ChatState['events'],
	tasks: ChatState['tasks'],
	threadStatuses: ChatState['threadStatuses'],
	suppressionStats: { idlePingCount: number; idleSurfacedCount: number },
	members: AgentInfo[],
	membersByName: Map<string, AgentInfo>,
	sessionStart: number | null,
	sessionEnd: number,
): PostMortemData {
	const sessionDurationMs = sessionStart
		? Math.max(0, sessionEnd - sessionStart)
		: 0;

	// Walk events once to compute per-agent stats
	const agentMessages = new Map<string, number>();
	let messageCount = 0;
	let broadcastCount = 0;
	const dmPairs = new Map<string, { messages: number; agents: Set<string> }>();
	const keyMoments: KeyMoment[] = [];
	let firstTaskClaimedEmitted = false;

	for (const event of events) {
		if (event.type === 'message') {
			const msg = event as ContentMessage;
			messageCount++;
			agentMessages.set(msg.from, (agentMessages.get(msg.from) ?? 0) + 1);
			if (msg.isBroadcast) broadcastCount++;
			if (msg.isDM && msg.dmParticipants) {
				const key = [...msg.dmParticipants].sort().join(':');
				const existing = dmPairs.get(key);
				if (existing) {
					existing.messages++;
				} else {
					dmPairs.set(key, { messages: 1, agents: new Set(msg.dmParticipants) });
				}
			}
		}

		if (event.type === 'system') {
			const sys = event as SystemEvent;
			const atMs = sessionStart
				? Math.max(0, new Date(sys.timestamp).getTime() - sessionStart)
				: 0;

			switch (sys.subtype) {
				case 'task-claimed':
					if (!firstTaskClaimedEmitted) {
						firstTaskClaimedEmitted = true;
						keyMoments.push({
							timestamp: sys.timestamp,
							atMs,
							kind: 'first-task-claimed',
							label: sys.text,
							agentName: sys.agentName,
							taskId: sys.taskId,
						});
					}
					break;
				case 'bottleneck':
					keyMoments.push({
						timestamp: sys.timestamp,
						atMs,
						kind: 'bottleneck',
						label: sys.text,
						agentName: sys.agentName,
						taskId: sys.taskId,
					});
					break;
				case 'task-unblocked':
					keyMoments.push({
						timestamp: sys.timestamp,
						atMs,
						kind: 'cascade',
						label: sys.text,
						agentName: sys.agentName,
						taskId: sys.taskId,
					});
					break;
				case 'task-completed':
					keyMoments.push({
						timestamp: sys.timestamp,
						atMs,
						kind: 'task-completed',
						label: sys.text,
						agentName: sys.agentName,
						taskId: sys.taskId,
					});
					break;
				case 'all-tasks-completed':
					keyMoments.push({
						timestamp: sys.timestamp,
						atMs,
						kind: 'all-tasks-completed',
						label: sys.text,
						agentName: null,
						taskId: null,
					});
					break;
			}
		}
	}

	// Add session-start as first key moment
	if (sessionStart) {
		keyMoments.unshift({
			timestamp: new Date(sessionStart).toISOString(),
			atMs: 0,
			kind: 'session-start',
			label: 'Session started',
			agentName: null,
			taskId: null,
		});
	}

	// Cap key moments at 8, keeping start, first-task-claimed, bottlenecks, and all-tasks-completed
	const cappedMoments = capKeyMoments(keyMoments, 8);

	// Build agent contributions
	const agentDmThreads = new Map<string, Set<string>>();
	for (const [key, pair] of dmPairs) {
		for (const agent of pair.agents) {
			const threads = agentDmThreads.get(agent) ?? new Set();
			threads.add(key);
			agentDmThreads.set(agent, threads);
		}
	}

	const agents: AgentContribution[] = members
		.filter((m) => m.agentType !== 'lead' && m.name !== 'team-lead')
		.map((m) => {
			const agentTasks = tasks.filter((t) => t.owner === m.name);
			return {
				name: m.name,
				color: m.color,
				tasksCompleted: agentTasks.filter((t) => t.status === 'completed').length,
				tasksTotal: agentTasks.length,
				messagesSent: agentMessages.get(m.name) ?? 0,
				dmThreads: agentDmThreads.get(m.name)?.size ?? 0,
				joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null,
			};
		});

	// Build coordination matrix from thread statuses
	const threadEntries = Object.values(threadStatuses);
	const coordinationMatrix: CoordinationCell[] = [];
	const pairMap = new Map<string, CoordinationCell>();

	for (const thread of threadEntries) {
		if (thread.participants.length !== 2) continue;
		const [a, b] = thread.participants.sort();
		const key = `${a}:${b}`;
		const existing = pairMap.get(key);
		if (existing) {
			existing.messageCount += thread.messageCount;
			existing.threadCount++;
			if (thread.status === 'resolved') existing.resolvedCount++;
		} else {
			const cell: CoordinationCell = {
				agentA: a!,
				agentB: b!,
				messageCount: thread.messageCount,
				threadCount: 1,
				resolvedCount: thread.status === 'resolved' ? 1 : 0,
			};
			pairMap.set(key, cell);
		}
	}
	coordinationMatrix.push(...Array.from(pairMap.values()).sort((a, b) => b.messageCount - a.messageCount));

	// Signal-to-noise
	const idlePingsAbsorbed = Math.max(0, suppressionStats.idlePingCount - suppressionStats.idleSurfacedCount);
	const meaningfulEvents = events.length;
	const totalRawEvents = meaningfulEvents + idlePingsAbsorbed;

	// Summary stats
	const dmThreadCount = threadEntries.length;
	const resolvedThreadCount = threadEntries.filter((t) => t.status === 'resolved').length;
	const bottleneckCount = keyMoments.filter((m) => m.kind === 'bottleneck').length;
	const completedCount = tasks.filter((t) => t.status === 'completed').length;

	return {
		sessionDurationMs,
		signalNoise: {
			totalRawEvents,
			meaningfulEvents,
			idlePingsAbsorbed,
			compressionRatio: meaningfulEvents > 0 ? totalRawEvents / meaningfulEvents : 1,
		},
		agents,
		coordinationMatrix,
		keyMoments: cappedMoments,
		summary: {
			taskCount: tasks.length,
			completedCount,
			messageCount,
			broadcastCount,
			dmThreadCount,
			resolvedThreadCount,
			bottleneckCount,
		},
	};
}

function capKeyMoments(moments: KeyMoment[], maxCount: number): KeyMoment[] {
	if (moments.length <= maxCount) return moments;

	// Priority: session-start, first-task-claimed, all-tasks-completed always kept
	const priority = ['session-start', 'first-task-claimed', 'all-tasks-completed', 'bottleneck'];
	const kept: KeyMoment[] = [];
	const rest: KeyMoment[] = [];

	for (const m of moments) {
		if (priority.includes(m.kind)) {
			kept.push(m);
		} else {
			rest.push(m);
		}
	}

	// Fill remaining slots with task-completed and cascade events (most recent first)
	const remaining = maxCount - kept.length;
	if (remaining > 0) {
		kept.push(...rest.slice(-remaining));
	}

	return kept.sort((a, b) => a.atMs - b.atMs);
}
