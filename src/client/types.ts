import type {
	ChatEvent,
	TaskInfo,
	ContentMessage,
	SystemEvent,
	ReactionEvent,
	ThreadMarker,
	PresenceChange,
	TaskUpdate,
	TeamState,
	SessionState,
	PlanApprovalCard,
	PermissionRequestCard,
} from '../shared/types.js';

// Re-export shared types used by components
export type {
	ChatEvent,
	TaskInfo,
	ContentMessage,
	SystemEvent,
	ReactionEvent,
	ThreadMarker,
	PresenceChange,
	TaskUpdate,
	TeamState,
	SessionState,
	PlanApprovalCard,
	PermissionRequestCard,
};

// === Client-Only Types ===

export interface Reaction {
	emoji: string;
	fromAgent: string;
	fromColor: string;
	tooltip: string | null;
}

export interface ChatState {
	events: ChatEvent[];
	tasks: TaskInfo[];
	presence: Record<string, 'working' | 'idle' | 'offline'>;
	team: TeamState | null;
	sessionStart: string | null;
	reactions: Record<string, Reaction[]>; // messageId -> reactions
	connected: boolean;
	planCards: Record<string, PlanApprovalCard>;
	permissionCards: Record<string, PermissionRequestCard>;
}

export type ChatAction =
	| { type: 'HYDRATE'; state: SessionState }
	| { type: 'EVENT'; event: ChatEvent }
	| { type: 'CONNECTION_CHANGE'; connected: boolean };

export const INITIAL_STATE: ChatState = {
	events: [],
	tasks: [],
	presence: {},
	team: null,
	sessionStart: null,
	reactions: {},
	connected: false,
	planCards: {},
	permissionCards: {},
};

export interface AgentColor {
	bg: string;
	text: string;
	border: string;
	dot: string;
}

export const AGENT_COLORS: Record<string, AgentColor> = {
	blue: {
		bg: 'bg-blue-500/20',
		text: 'text-blue-400',
		border: 'border-blue-500/30',
		dot: 'bg-blue-500',
	},
	green: {
		bg: 'bg-green-500/20',
		text: 'text-green-400',
		border: 'border-green-500/30',
		dot: 'bg-green-500',
	},
	purple: {
		bg: 'bg-purple-500/20',
		text: 'text-purple-400',
		border: 'border-purple-500/30',
		dot: 'bg-purple-500',
	},
	yellow: {
		bg: 'bg-yellow-500/20',
		text: 'text-yellow-400',
		border: 'border-yellow-500/30',
		dot: 'bg-yellow-500',
	},
	red: {
		bg: 'bg-red-500/20',
		text: 'text-red-400',
		border: 'border-red-500/30',
		dot: 'bg-red-500',
	},
	orange: {
		bg: 'bg-orange-500/20',
		text: 'text-orange-400',
		border: 'border-orange-500/30',
		dot: 'bg-orange-500',
	},
	cyan: {
		bg: 'bg-cyan-500/20',
		text: 'text-cyan-400',
		border: 'border-cyan-500/30',
		dot: 'bg-cyan-500',
	},
	pink: {
		bg: 'bg-pink-500/20',
		text: 'text-pink-400',
		border: 'border-pink-500/30',
		dot: 'bg-pink-500',
	},
};

export function getAgentColor(color: string): AgentColor {
	return AGENT_COLORS[color] ?? {
		bg: 'bg-gray-500/20',
		text: 'text-gray-400',
		border: 'border-gray-500/30',
		dot: 'bg-gray-500',
	};
}
