import type {
	ChatEvent,
	ContentMessage,
	PresenceChange,
	ReactionEvent,
	SessionState,
	SystemEvent,
	TaskUpdate,
} from '../shared/types.js';
import type { ChatState, Reaction } from './types.js';
import { INITIAL_STATE } from './types.js';

export function cloneChatState(state: ChatState): ChatState {
	return {
		...state,
		events: [...state.events],
		tasks: state.tasks.map((task) => ({ ...task })),
		presence: { ...state.presence },
		team: state.team
			? {
				...state.team,
				members: state.team.members.map((member) => ({ ...member })),
			}
			: null,
		reactions: Object.fromEntries(
			Object.entries(state.reactions).map(([targetMessageId, reactions]) => [
				targetMessageId,
				reactions.map((reaction) => ({ ...reaction })),
			]),
		),
		planCards: { ...state.planCards },
		permissionCards: { ...state.permissionCards },
		threadStatuses: Object.fromEntries(
			Object.entries(state.threadStatuses).map(([k, v]) => [k, { ...v, beats: [...v.beats], participants: [...v.participants] }]),
		),
		activeAgentKey: state.activeAgentKey,
	};
}

export function createBaseChatState(overrides: Partial<ChatState> = {}): ChatState {
	return {
		...INITIAL_STATE,
		...overrides,
	};
}

export function hydrateChatState(session: SessionState, connected = true): ChatState {
	const state = createBaseChatState({
		team: session.team,
		tasks: session.tasks.map((task) => ({ ...task })),
		presence: { ...session.presence },
		sessionStart: session.sessionStart,
		connected,
		threadStatuses: Object.fromEntries(
			(session.threadStatuses ?? []).map((ts) => [ts.threadKey, ts]),
		),
	});

	for (const event of session.events) {
		applyChatEventInPlace(state, event);
	}

	return state;
}

export function applyChatEvent(state: ChatState, event: ChatEvent): ChatState {
	const next = cloneChatState(state);
	applyChatEventInPlace(next, event);
	return next;
}

export function reduceChatEvents(baseState: ChatState, events: ChatEvent[]): ChatState {
	const next = cloneChatState(baseState);
	for (const event of events) {
		applyChatEventInPlace(next, event);
	}
	return next;
}

export function applyChatEventInPlace(state: ChatState, event: ChatEvent): void {
	if (event.type === 'reaction') {
		applyReaction(state, event);
		return;
	}

	state.events.push(event);

	// Track DM thread statuses client-side
	if (event.type === 'message') {
		const msg = event as ContentMessage;
		if (msg.isDM && msg.dmParticipants) {
			const key = [...msg.dmParticipants].sort().join(':');
			const existing = state.threadStatuses[key];
			if (existing) {
				existing.messageCount++;
				existing.lastMessageTimestamp = msg.timestamp;
				if (existing.status === 'new') existing.status = 'active';
			} else {
				state.threadStatuses[key] = {
					threadKey: key,
					participants: [...msg.dmParticipants].sort(),
					topic: msg.text.slice(0, 60).replace(/\n/g, ' '),
					messageCount: 1,
					status: 'new',
					firstMessageTimestamp: msg.timestamp,
					lastMessageTimestamp: msg.timestamp,
					beats: [],
				};
			}
		}
	}

	if (event.type === 'task-update') {
		applyTaskUpdate(state, event);
		return;
	}

	if (event.type === 'presence') {
		applyPresenceChange(state, event);
	}

	if (event.type === 'system') {
		const sysEvent = event as SystemEvent;
		if (sysEvent.subtype === 'member-joined' && sysEvent.agentName && state.team) {
			const exists = state.team.members.some((m) => m.name === sysEvent.agentName);
			if (!exists) {
				state.team.members.push({
					name: sysEvent.agentName,
					agentId: `${sysEvent.agentName}@${state.team.name}`,
					agentType: 'agent',
					color: sysEvent.agentColor ?? 'gray',
					model: sysEvent.agentModel ?? undefined,
				});
			} else if (sysEvent.agentModel) {
				// Backfill model if member was added before model data was available
				const member = state.team.members.find((m) => m.name === sysEvent.agentName);
				if (member && !member.model) {
					member.model = sysEvent.agentModel;
				}
			}
			state.presence[sysEvent.agentName] = 'working';
		}
	}
}

function applyReaction(state: ChatState, event: ReactionEvent): void {
	const existing = state.reactions[event.targetMessageId] ?? [];
	const reaction: Reaction = {
		emoji: event.emoji,
		fromAgent: event.fromAgent,
		fromColor: event.fromColor,
		tooltip: event.tooltip,
	};
	state.events.push(event);
	state.reactions[event.targetMessageId] = [...existing, reaction];
}

function applyTaskUpdate(state: ChatState, event: TaskUpdate): void {
	const updatedTasks = state.tasks.map((task) =>
		task.id === event.task.id ? { ...event.task } : task,
	);
	const taskExists = state.tasks.some((task) => task.id === event.task.id);
	if (!taskExists) {
		updatedTasks.push({ ...event.task });
	}
	state.tasks = updatedTasks;
}

function applyPresenceChange(state: ChatState, event: PresenceChange): void {
	state.presence[event.agentName] = event.status;
}
