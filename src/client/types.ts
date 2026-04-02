import type {
	ChatEvent,
	TaskInfo,
	ContentMessage,
	SystemEvent,
	ReactionEvent,
	ThreadMarker,
	PresenceChange,
	TaskUpdate,
	AgentHeartbeat,
	LeadThought,
	TeamState,
	SessionState,
	PlanApprovalCard,
	PermissionRequestCard,
	ThreadStatus,
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
	AgentHeartbeat,
	LeadThought,
	TeamState,
	SessionState,
	PlanApprovalCard,
	PermissionRequestCard,
	ThreadStatus,
};

// === Client-Only Types ===

export interface Reaction {
	emoji: string;
	fromAgent: string;
	fromColor: string;
	tooltip: string | null;
}

export interface TypingState {
	agentName: string;
	agentColor: string;
	isLead: boolean;
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
	threadStatuses: Record<string, ThreadStatus>;
	activeAgentKey: string | null; // agent name for sidebar drill-in
	resurfacedThreadKeys: Set<string>; // threads that should re-surface at latest position
	threadFilter: string | null; // threadKey to filter feed to, null = show all
	typing: TypingState | null; // currently "typing" agent for stagger animation
}

export type ChatAction =
	| { type: 'HYDRATE'; state: SessionState }
	| { type: 'EVENT'; event: ChatEvent }
	| { type: 'CONNECTION_CHANGE'; connected: boolean }
	| { type: 'SELECT_AGENT'; agentName: string | null }
	| { type: 'SET_THREAD_FILTER'; threadKey: string | null }
	| { type: 'TYPING_START'; event: ChatEvent }
	| { type: 'TYPING_STOP' };

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
	threadStatuses: {},
	activeAgentKey: null,
	resurfacedThreadKeys: new Set(),
	threadFilter: null,
	typing: null,
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
	gold: {
		bg: 'bg-yellow-500/20',
		text: 'text-yellow-300',
		border: 'border-yellow-500/30',
		dot: 'bg-yellow-500',
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

// Raw hex values for SVG rendering (avatar marks)
export const AGENT_COLOR_VALUES: Record<string, { fill: string; dark: string; light: string }> = {
	blue:   { fill: '#3b82f6', dark: '#1e4faa', light: '#60a5fa' },
	green:  { fill: '#22c55e', dark: '#15793a', light: '#4ade80' },
	purple: { fill: '#a855f7', dark: '#6d28b8', light: '#c084fc' },
	yellow: { fill: '#eab308', dark: '#a07806', light: '#facc15' },
	red:    { fill: '#ef4444', dark: '#b32020', light: '#f87171' },
	orange: { fill: '#f97316', dark: '#b84d0d', light: '#fb923c' },
	cyan:   { fill: '#06b6d4', dark: '#047a8f', light: '#22d3ee' },
	pink:   { fill: '#ec4899', dark: '#a8246b', light: '#f472b6' },
	gold:   { fill: '#d4a017', dark: '#8a6b0f', light: '#e0b83a' },
};

export function getAgentColorValues(color: string) {
	return AGENT_COLOR_VALUES[color] ?? { fill: '#6b7280', dark: '#4b5563', light: '#9ca3af' };
}
