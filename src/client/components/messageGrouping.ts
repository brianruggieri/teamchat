import type {
	ChatEvent,
	ContentMessage,
	SystemEvent,
	AgentHeartbeat,
	LeadThought,
} from '../types.js';

export interface MessageStackItem {
	kind: 'message-stack';
	messages: ContentMessage[];
}

export interface PlanCardItem {
	kind: 'plan-card';
	message: ContentMessage;
	planContent: string;
}

export interface PermissionCardItem {
	kind: 'permission-card';
	message: ContentMessage;
	toolName: string;
	command: string;
}

export interface SystemRowItem {
	kind: 'system';
	event: SystemEvent;
}

export interface SystemGroupItem {
	kind: 'system-group';
	subtype: 'member-joined' | 'task-created' | 'task-claimed';
	events: SystemEvent[];
}

export interface SetupCardItem {
	kind: 'setup-card';
	events: SystemEvent[];
}

export interface HeartbeatItem {
	kind: 'heartbeat';
	event: AgentHeartbeat;
}

export interface ThoughtItem {
	kind: 'thought';
	event: LeadThought;
}

export interface CascadeItem {
	kind: 'cascade';
	completion: SystemEvent;
	unblocks: SystemEvent[];
	claims: SystemEvent[];
}

export type MessageLaneItem =
	| MessageStackItem
	| PlanCardItem
	| PermissionCardItem
	| SystemRowItem
	| SystemGroupItem
	| SetupCardItem
	| HeartbeatItem
	| ThoughtItem
	| CascadeItem;

export function buildMessageLaneItems(events: ChatEvent[], sessionStartOverride?: number): MessageLaneItem[] {
	const items: MessageLaneItem[] = [];

	// Determine session start for setup phase detection.
	// When called on a slice of events, the caller can provide the true session start
	// to avoid misdetecting setup phase in later event groups.
	const sessionStartMs = sessionStartOverride
		?? (events.length > 0 ? new Date(events[0]!.timestamp).getTime() : NaN);
	const SETUP_WINDOW_MS = 60_000;
	let setupCard: SetupCardItem | null = null;

	// Index-based loop to allow look-ahead for cascade detection
	let i = 0;
	while (i < events.length) {
		const event = events[i]!;

		if (
			event.type === 'presence'
			|| event.type === 'task-update'
			|| event.type === 'reaction'
			|| event.type === 'thread-marker'
		) {
			i++;
			continue;
		}

		if (event.type === 'heartbeat') {
			items.push({ kind: 'heartbeat', event: event as AgentHeartbeat });
			i++;
			continue;
		}

		if (event.type === 'thought') {
			const thought = event as LeadThought;
			if (!thought.deduplicated) {
				items.push({ kind: 'thought', event: thought });
			}
			i++;
			continue;
		}

		// Setup phase grouping: team-created, task-created/claimed, member-joined within first 60s
		if (
			event.type === 'system'
			&& isSetupPhaseEvent(event)
			&& !Number.isNaN(sessionStartMs)
			&& (new Date(event.timestamp).getTime() - sessionStartMs) < SETUP_WINDOW_MS
		) {
			if (!setupCard) {
				setupCard = { kind: 'setup-card', events: [] };
				items.push(setupCard);
			}
			setupCard.events.push(event);
			i++;
			continue;
		}

		if (event.type === 'system') {
			// Cascade detection: task-completed followed by task-unblocked events
			if (event.subtype === 'task-completed') {
				const cascade = tryBuildCascade(events, i);
				if (cascade !== null) {
					items.push(cascade.item);
					i = cascade.nextIndex;
					continue;
				}
			}

			if (isCollapsibleSystemEvent(event)) {
				const lastItem = items.at(-1);
				if (
					lastItem?.kind === 'system-group'
					&& lastItem.subtype === event.subtype
				) {
					lastItem.events.push(event);
					i++;
					continue;
				}

				items.push({
					kind: 'system-group',
					subtype: event.subtype,
					events: [event],
				});
				i++;
				continue;
			}

			items.push({
				kind: 'system',
				event,
			});
			i++;
			continue;
		}

		if (isPlanApproval(event)) {
			items.push({
				kind: 'plan-card',
				message: event,
				planContent: extractPlanContent(event.text),
			});
			i++;
			continue;
		}

		if (isPermissionRequest(event)) {
			const { toolName, command } = extractPermissionInfo(event.text);
			items.push({
				kind: 'permission-card',
				message: event,
				toolName,
				command,
			});
			i++;
			continue;
		}

		const lastItem = items.at(-1);
		if (
			lastItem?.kind === 'message-stack'
			&& canGroupMessages(lastItem.messages[lastItem.messages.length - 1], event)
		) {
			lastItem.messages.push(event);
			i++;
			continue;
		}

		items.push({
			kind: 'message-stack',
			messages: [event],
		});
		i++;
	}

	return items;
}

/**
 * Look-ahead cascade detector. Starting at a task-completed event at `startIndex`,
 * scans up to LOOKAHEAD_LIMIT subsequent system events for task-unblocked events
 * and task-claimed events for those unblocked task IDs.
 *
 * Returns null if no unblocks found (fall through to normal rendering).
 * Returns { item, nextIndex } where nextIndex is past the last consumed event.
 */
const CASCADE_LOOKAHEAD = 10;
/** Hard cap on how far ahead (in total events) cascade detection scans. */
const CASCADE_MAX_DISTANCE = 30;

function tryBuildCascade(
	events: ChatEvent[],
	startIndex: number,
): { item: CascadeItem; nextIndex: number } | null {
	const completion = events[startIndex] as SystemEvent;
	const unblocks: SystemEvent[] = [];
	const claims: SystemEvent[] = [];
	const consumedIndices = new Set<number>();

	const maxIndex = Math.min(events.length, startIndex + 1 + CASCADE_MAX_DISTANCE);

	// Scan ahead for task-unblocked events
	let lookahead = 0;
	for (let j = startIndex + 1; j < maxIndex && lookahead < CASCADE_LOOKAHEAD; j++) {
		const next = events[j]!;
		// Skip non-system events and filtered types in lookahead count
		if (
			next.type === 'presence'
			|| next.type === 'task-update'
			|| next.type === 'reaction'
			|| next.type === 'thread-marker'
		) {
			continue; // don't count toward lookahead
		}
		if (next.type !== 'system') break; // stop at non-system content events
		if (next.subtype === 'task-unblocked') {
			unblocks.push(next);
			consumedIndices.add(j);
		}
		lookahead++;
	}

	if (unblocks.length === 0) return null;

	// Collect taskIds from unblocked tasks
	const unblockedTaskIds = new Set(unblocks.map(u => u.taskId).filter(Boolean));

	// Scan a second pass for task-claimed events for those task IDs
	// (they may appear interleaved or after the unblocked events)
	for (let j = startIndex + 1; j < maxIndex; j++) {
		const next = events[j]!;
		if (
			next.type === 'presence'
			|| next.type === 'task-update'
			|| next.type === 'reaction'
			|| next.type === 'thread-marker'
		) {
			continue;
		}
		if (next.type !== 'system') break;
		if (
			next.subtype === 'task-claimed'
			&& next.taskId !== null
			&& unblockedTaskIds.has(next.taskId)
		) {
			claims.push(next);
			consumedIndices.add(j);
		}
	}

	// nextIndex: the index after all consumed events (completion + unblocks + claims)
	const maxConsumed = Math.max(startIndex, ...consumedIndices);
	const nextIndex = maxConsumed + 1;

	return {
		item: {
			kind: 'cascade',
			completion,
			unblocks,
			claims,
		},
		nextIndex,
	};
}

function canGroupMessages(a: ContentMessage, b: ContentMessage): boolean {
	return a.from === b.from
		&& a.isLead === b.isLead
		&& a.isDM === b.isDM
		&& a.fromColor === b.fromColor;
}

function isCollapsibleSystemEvent(
	event: SystemEvent
): event is SystemEvent & { subtype: 'member-joined' | 'task-created' | 'task-claimed' } {
	return event.subtype === 'member-joined' || event.subtype === 'task-created' || event.subtype === 'task-claimed';
}

function isSetupPhaseEvent(event: SystemEvent): boolean {
	return event.subtype === 'team-created'
		|| event.subtype === 'task-created'
		|| event.subtype === 'task-claimed'
		|| event.subtype === 'member-joined';
}

export function isPlanApproval(message: ContentMessage): boolean {
	return message.text.startsWith('📋 PLAN:');
}

export function isPermissionRequest(message: ContentMessage): boolean {
	return message.text.startsWith('🔐 ')
		&& message.text.includes(' wants to run:');
}

export function extractPlanContent(text: string): string {
	return text.replace(/^📋 PLAN:\s*/, '').trim();
}

export function extractPermissionInfo(
	text: string
): { toolName: string; command: string } {
	const toolMatch = text.match(/`([^`]+)`/);
	const descriptionMatch = text.match(/—\s*(.+)$/);
	return {
		toolName: toolMatch?.[1] ?? '',
		command: descriptionMatch?.[1] ?? text,
	};
}
