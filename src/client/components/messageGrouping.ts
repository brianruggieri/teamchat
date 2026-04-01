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

export type MessageLaneItem =
	| MessageStackItem
	| PlanCardItem
	| PermissionCardItem
	| SystemRowItem
	| SystemGroupItem
	| SetupCardItem
	| HeartbeatItem
	| ThoughtItem;

export function buildMessageLaneItems(events: ChatEvent[], sessionStartOverride?: number): MessageLaneItem[] {
	const items: MessageLaneItem[] = [];

	// Determine session start for setup phase detection.
	// When called on a slice of events, the caller can provide the true session start
	// to avoid misdetecting setup phase in later event groups.
	const sessionStartMs = sessionStartOverride
		?? (events.length > 0 ? new Date(events[0]!.timestamp).getTime() : NaN);
	const SETUP_WINDOW_MS = 60_000;
	let setupCard: SetupCardItem | null = null;

	for (const event of events) {
		if (
			event.type === 'presence'
			|| event.type === 'task-update'
			|| event.type === 'reaction'
			|| event.type === 'thread-marker'
		) {
			continue;
		}

		if (event.type === 'heartbeat') {
			items.push({ kind: 'heartbeat', event: event as AgentHeartbeat });
			continue;
		}

		if (event.type === 'thought') {
			const thought = event as LeadThought;
			if (!thought.deduplicated) {
				items.push({ kind: 'thought', event: thought });
			}
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
			continue;
		}

		if (event.type === 'system') {
			if (isCollapsibleSystemEvent(event)) {
				const lastItem = items.at(-1);
				if (
					lastItem?.kind === 'system-group'
					&& lastItem.subtype === event.subtype
				) {
					lastItem.events.push(event);
					continue;
				}

				items.push({
					kind: 'system-group',
					subtype: event.subtype,
					events: [event],
				});
				continue;
			}

			items.push({
				kind: 'system',
				event,
			});
			continue;
		}

		if (isPlanApproval(event)) {
			items.push({
				kind: 'plan-card',
				message: event,
				planContent: extractPlanContent(event.text),
			});
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
			continue;
		}

		const lastItem = items.at(-1);
		if (
			lastItem?.kind === 'message-stack'
			&& canGroupMessages(lastItem.messages[lastItem.messages.length - 1], event)
		) {
			lastItem.messages.push(event);
			continue;
		}

		items.push({
			kind: 'message-stack',
			messages: [event],
		});
	}

	return items;
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
