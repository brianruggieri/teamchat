import { useReducer } from 'react';
import type {
	ChatState,
	ChatAction,
	ContentMessage,
} from '../types.js';
import { INITIAL_STATE } from '../types.js';
import { applyChatEvent, cloneChatState, hydrateChatState } from '../state.js';

function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case 'HYDRATE':
			return hydrateChatState(action.state, true);

		case 'EVENT': {
			const next = applyChatEvent(state, action.event);
			next.typing = null; // clear typing when real event arrives
			return next;
		}

		case 'CONNECTION_CHANGE':
			return {
				...state,
				connected: action.connected,
			};

		case 'SELECT_AGENT': {
			const next = cloneChatState(state);
			next.activeAgentKey = action.agentName;
			return next;
		}

		case 'SET_THREAD_FILTER': {
			const next = cloneChatState(state);
			next.threadFilter = action.threadKey;
			return next;
		}

		case 'TYPING_START': {
			const msg = action.event as ContentMessage;
			return {
				...state,
				typing: {
					agentName: msg.from ?? 'agent',
					agentColor: msg.fromColor ?? 'blue',
					isLead: msg.isLead ?? false,
				},
			};
		}

		case 'TYPING_STOP':
			return { ...state, typing: null };

		default:
			return state;
	}
}

export function useChatReducer() {
	return useReducer(chatReducer, INITIAL_STATE);
}
