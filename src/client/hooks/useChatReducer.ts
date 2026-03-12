import { useReducer } from 'react';
import type {
	ChatState,
	ChatAction,
} from '../types.js';
import { INITIAL_STATE } from '../types.js';
import { applyChatEvent, cloneChatState, hydrateChatState } from '../state.js';

function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case 'HYDRATE':
			return hydrateChatState(action.state, true);

		case 'EVENT':
			return applyChatEvent(state, action.event);

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

		default:
			return state;
	}
}

export function useChatReducer() {
	return useReducer(chatReducer, INITIAL_STATE);
}
