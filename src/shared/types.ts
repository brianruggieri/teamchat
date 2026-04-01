// === Raw Inbox Message (from ~/.claude/teams/{name}/inboxes/*.json) ===
export interface RawInboxMessage {
	from: string;
	text: string;
	summary?: string;
	timestamp: string;
	color: string;
	read: boolean;
}

// === Raw Task Data (from ~/.claude/tasks/{name}/*.json) ===
export type RawTaskData = TaskInfo;

// === Agent & Team ===
export interface AgentInfo {
	name: string;
	agentId: string;
	agentType: string;
	color: string;
	model?: string;
	joinedAt?: number;
}

export interface TeamConfig {
	createdAt?: number;
	members: AgentInfo[];
}

export interface TeamState {
	name: string;
	members: AgentInfo[];
}

// === Tasks ===
export interface TaskInfo {
	id: string;
	subject: string;
	description: string | null;
	status: 'pending' | 'in_progress' | 'completed' | 'failed';
	owner: string | null;
	blockedBy: string[] | null;
	activeForm: string | null;
	created: string;
	updated: string;
}

// === Chat Events (server → client via WebSocket) ===
export type ChatEvent =
	| ContentMessage
	| SystemEvent
	| ReactionEvent
	| ThreadMarker
	| PresenceChange
	| TaskUpdate
	| AgentHeartbeat
	| LeadThought;

export interface ContentMessage {
	type: 'message';
	id: string;
	from: string;
	fromColor: string;
	text: string;
	summary: string | null;
	timestamp: string;
	isBroadcast: boolean;
	isDM: boolean;
	dmParticipants: string[] | null;
	isLead: boolean;
	replyToId: string | null;
}

export interface SystemEvent {
	type: 'system';
	id: string;
	subtype: SystemEventType;
	text: string;
	timestamp: string;
	agentName: string | null;
	agentColor: string | null;
	agentModel: string | null;
	taskId: string | null;
	taskSubject: string | null;
}

export type SystemEventType =
	| 'member-joined'
	| 'member-left'
	| 'task-created'
	| 'task-claimed'
	| 'task-completed'
	| 'task-failed'
	| 'task-unblocked'
	| 'all-tasks-completed'
	| 'shutdown-requested'
	| 'shutdown-approved'
	| 'shutdown-rejected'
	| 'team-created'
	| 'team-deleted'
	| 'idle-surfaced'
	| 'nudge'
	| 'task-assigned'
	| 'bottleneck'
	| 'session-summary';

export interface ReactionEvent {
	type: 'reaction';
	id: string;
	targetMessageId: string;
	emoji: string;
	fromAgent: string;
	fromColor: string;
	timestamp: string;
	tooltip: string | null;
}

export interface ThreadMarker {
	type: 'thread-marker';
	id: string;
	subtype: 'thread-start' | 'thread-end';
	participants: string[];
	timestamp: string;
}

export interface PresenceChange {
	type: 'presence';
	id: string;
	agentName: string;
	status: 'working' | 'idle' | 'offline';
	timestamp: string;
}

export interface TaskUpdate {
	type: 'task-update';
	id: string;
	task: TaskInfo;
	timestamp: string;
}

export interface AgentHeartbeat {
	type: 'heartbeat';
	id: string;
	agentName: string;
	agentColor: string;
	activities: string; // compacted summary, e.g. "writing file.tsx, editing route.ts"
	opCount: number;
	timestamp: string;
}

export interface LeadThought {
	type: 'thought';
	id: string;
	text: string;
	timestamp: string;
	deduplicated: boolean; // true if >40% overlap with following text was suppressed
}

// === Beat Detection (conversational structure) ===
export type BeatType =
	| 'proposal'
	| 'agreement'
	| 'counter-proposal'
	| 'acknowledgement'
	| 'resolution'
	| 'question'
	| 'sharing'
	| 'blocker'
	| 'completion';

export interface ThreadStatus {
	threadKey: string; // sorted participant pair, e.g. "auth:gateway"
	participants: string[];
	topic: string; // first ~60 chars of first message
	messageCount: number;
	status: 'new' | 'active' | 'resolved';
	firstMessageTimestamp: string;
	lastMessageTimestamp: string;
	beats: BeatType[];
}

// === Initial State (REST endpoint GET /state) ===
export interface SessionState {
	team: TeamState;
	events: ChatEvent[];
	tasks: TaskInfo[];
	presence: Record<string, 'working' | 'idle' | 'offline'>;
	sessionStart: string;
	threadStatuses: ThreadStatus[];
}

// === Plan Approval Card Data ===
export interface PlanApprovalCard {
	type: 'plan-approval';
	requestId: string;
	from: string;
	planContent: string;
	status: 'pending' | 'approved' | 'rejected';
	feedback: string | null;
}

// === Permission Request Card Data ===
export interface PermissionRequestCard {
	type: 'permission-request';
	requestId: string;
	agentName: string;
	toolName: string;
	command: string;
	status: 'pending' | 'approved' | 'denied';
}

// === Journal Entry (JSONL format) ===
export interface JournalEntry {
	seq: number;
	event: ChatEvent;
}

// === Parsed System Event (from JSON.parse of inbox message text field) ===
export interface ParsedSystemEvent {
	type: string;
	requestId?: string;
	reason?: string;
	taskId?: string;
	taskSubject?: string;
	completedTaskId?: string;
	completedStatus?: string;
	idleReason?: string;
	planContent?: string;
	approved?: boolean;
	feedback?: string;
	paneId?: string;
	backendType?: string;
	proposedName?: string;
	capabilities?: string[];
	workerId?: string;
	workerName?: string;
	workerColor?: string;
	toolName?: string;
	description?: string;
	input?: Record<string, unknown>;
	permissionSuggestions?: string[];
}
