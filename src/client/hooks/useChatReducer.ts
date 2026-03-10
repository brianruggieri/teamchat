import { useReducer } from 'react';
import type {
	ChatState,
	ChatAction,
	Reaction,
} from '../types.js';
import { INITIAL_STATE } from '../types.js';
import type {
	ChatEvent,
	ReactionEvent,
	TaskUpdate,
	PresenceChange,
	SessionState,
} from '../../shared/types.js';

function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case 'HYDRATE': {
			const s = action.state;
			const reactions: Record<string, Reaction[]> = {};
			const nonReactionEvents: ChatEvent[] = [];

			for (const event of s.events) {
				if (event.type === 'reaction') {
					const re = event as ReactionEvent;
					if (!reactions[re.targetMessageId]) {
						reactions[re.targetMessageId] = [];
					}
					reactions[re.targetMessageId].push({
						emoji: re.emoji,
						fromAgent: re.fromAgent,
						fromColor: re.fromColor,
						tooltip: re.tooltip,
					});
				}
				// Keep all events (including reactions) in the event stream
				// Reactions are rendered via the reactions map, but kept in events
				// for correct ordering and session stats
				nonReactionEvents.push(event);
			}

			return {
				...state,
				events: nonReactionEvents,
				tasks: s.tasks,
				presence: s.presence,
				team: s.team,
				sessionStart: s.sessionStart,
				reactions,
				connected: true,
				planCards: {},
				permissionCards: {},
			};
		}

		case 'EVENT': {
			const event = action.event;

			if (event.type === 'reaction') {
				const re = event as ReactionEvent;
				const existing = state.reactions[re.targetMessageId] ?? [];
				return {
					...state,
					events: [...state.events, event],
					reactions: {
						...state.reactions,
						[re.targetMessageId]: [
							...existing,
							{
								emoji: re.emoji,
								fromAgent: re.fromAgent,
								fromColor: re.fromColor,
								tooltip: re.tooltip,
							},
						],
					},
				};
			}

			if (event.type === 'task-update') {
				const tu = event as TaskUpdate;
				const updatedTasks = state.tasks.map((t) =>
					t.id === tu.task.id ? tu.task : t
				);
				const taskExists = state.tasks.some((t) => t.id === tu.task.id);
				if (!taskExists) {
					updatedTasks.push(tu.task);
				}
				return {
					...state,
					events: [...state.events, event],
					tasks: updatedTasks,
				};
			}

			if (event.type === 'presence') {
				const pc = event as PresenceChange;
				return {
					...state,
					events: [...state.events, event],
					presence: {
						...state.presence,
						[pc.agentName]: pc.status,
					},
				};
			}

			return {
				...state,
				events: [...state.events, event],
			};
		}

		case 'CONNECTION_CHANGE':
			return {
				...state,
				connected: action.connected,
			};

		default:
			return state;
	}
}

export function useChatReducer() {
	return useReducer(chatReducer, INITIAL_STATE);
}
