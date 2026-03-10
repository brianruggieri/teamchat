import type {
	ChatEvent,
	PresenceChange,
	ReactionEvent,
	SessionState,
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

	if (event.type === 'task-update') {
		applyTaskUpdate(state, event);
		return;
	}

	if (event.type === 'presence') {
		applyPresenceChange(state, event);
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
