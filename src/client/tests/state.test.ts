/**
 * Unit tests for the client state reducer (src/client/state.ts).
 * Covers all 6 exported functions with >80% branch coverage.
 */
import { describe, test, expect } from 'bun:test';
import type {
	ContentMessage,
	SystemEvent,
	ReactionEvent,
	ThreadMarker,
	PresenceChange,
	TaskUpdate,
	TeamState,
	TaskInfo,
	SessionState,
	ThreadStatus,
} from '../../shared/types.js';
import { INITIAL_STATE } from '../types.js';
import type { ChatState } from '../types.js';
import {
	createBaseChatState,
	cloneChatState,
	hydrateChatState,
	applyChatEventInPlace,
	applyChatEvent,
	reduceChatEvents,
} from '../state.js';

// ─── Factory helpers ──────────────────────────────────────────────────────────

let _seq = 0;
function nextId(): string {
	return `msg-${++_seq}`;
}

function makeMessage(overrides?: Partial<ContentMessage>): ContentMessage {
	return {
		type: 'message',
		id: nextId(),
		from: 'alpha',
		fromColor: 'blue',
		text: 'Hello team',
		summary: null,
		timestamp: '2024-01-01T00:00:00Z',
		isBroadcast: false,
		isDM: false,
		dmParticipants: null,
		isLead: false,
		replyToId: null,
		...overrides,
	};
}

function makeSystemEvent(overrides?: Partial<SystemEvent>): SystemEvent {
	return {
		type: 'system',
		id: nextId(),
		subtype: 'member-joined',
		text: 'alpha joined',
		timestamp: '2024-01-01T00:00:00Z',
		agentName: 'alpha',
		agentColor: 'blue',
		agentModel: 'claude-3-5-sonnet',
		taskId: null,
		taskSubject: null,
		...overrides,
	};
}

function makeReaction(overrides?: Partial<ReactionEvent>): ReactionEvent {
	return {
		type: 'reaction',
		id: nextId(),
		targetMessageId: 'target-1',
		emoji: '✅',
		fromAgent: 'alpha',
		fromColor: 'blue',
		timestamp: '2024-01-01T00:00:00Z',
		tooltip: null,
		...overrides,
	};
}

function makeTaskUpdate(overrides?: Partial<TaskUpdate>): TaskUpdate {
	return {
		type: 'task-update',
		id: nextId(),
		timestamp: '2024-01-01T00:00:00Z',
		task: {
			id: 'task-1',
			subject: 'Build auth',
			description: null,
			status: 'pending',
			owner: null,
			blockedBy: null,
			activeForm: null,
			created: '2024-01-01T00:00:00Z',
			updated: '2024-01-01T00:00:00Z',
		},
		...overrides,
	};
}

function makePresence(overrides?: Partial<PresenceChange>): PresenceChange {
	return {
		type: 'presence',
		id: nextId(),
		agentName: 'alpha',
		status: 'working',
		timestamp: '2024-01-01T00:00:00Z',
		...overrides,
	};
}

function makeThreadMarker(overrides?: Partial<ThreadMarker>): ThreadMarker {
	return {
		type: 'thread-marker',
		id: nextId(),
		subtype: 'thread-start',
		participants: ['alpha', 'beta'],
		timestamp: '2024-01-01T00:00:00Z',
		...overrides,
	};
}

function makeTeam(overrides?: Partial<TeamState>): TeamState {
	return {
		name: 'my-team',
		members: [
			{ name: 'alpha', agentId: 'alpha@my-team', agentType: 'agent', color: 'blue' },
		],
		...overrides,
	};
}

/**
 * Returns a truly fresh ChatState with all-new arrays/objects — no shared
 * references to INITIAL_STATE. Use this in any test that calls
 * applyChatEventInPlace (which mutates state in place).
 */
function freshState(overrides: Partial<ChatState> = {}): ChatState {
	return {
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
		...overrides,
	};
}

function makeTask(overrides?: Partial<TaskInfo>): TaskInfo {
	return {
		id: 'task-1',
		subject: 'Build auth',
		description: null,
		status: 'pending',
		owner: null,
		blockedBy: null,
		activeForm: null,
		created: '2024-01-01T00:00:00Z',
		updated: '2024-01-01T00:00:00Z',
		...overrides,
	};
}

function makeSession(overrides?: Partial<SessionState>): SessionState {
	return {
		team: makeTeam(),
		events: [],
		tasks: [],
		presence: {},
		sessionStart: '2024-01-01T00:00:00Z',
		threadStatuses: [],
		...overrides,
	};
}

function makeThreadStatus(overrides?: Partial<ThreadStatus>): ThreadStatus {
	return {
		threadKey: 'alpha:beta',
		participants: ['alpha', 'beta'],
		topic: 'Schema discussion',
		messageCount: 1,
		status: 'new',
		firstMessageTimestamp: '2024-01-01T00:00:00Z',
		lastMessageTimestamp: '2024-01-01T00:00:00Z',
		beats: [],
		...overrides,
	};
}

// ─── Test isolation ───────────────────────────────────────────────────────────
//
// createBaseChatState() always produces fresh mutable containers (events, tasks,
// presence, etc.) so there is no shared reference to INITIAL_STATE. No beforeEach
// reset is needed.

// ─── createBaseChatState ──────────────────────────────────────────────────────

describe('createBaseChatState', () => {
	test('returns a state matching INITIAL_STATE when called with no args', () => {
		const state = createBaseChatState();
		expect(state).toEqual(INITIAL_STATE);
	});

	test('merges overrides into base state', () => {
		const team = makeTeam();
		const state = createBaseChatState({ team, connected: true });
		expect(state.team).toEqual(team);
		expect(state.connected).toBe(true);
		// Other fields unchanged
		expect(state.events).toEqual([]);
		expect(state.tasks).toEqual([]);
	});

	test('does not mutate INITIAL_STATE', () => {
		const before = { ...INITIAL_STATE };
		createBaseChatState({ connected: true });
		expect(INITIAL_STATE.connected).toBe(before.connected);
		expect(INITIAL_STATE.team).toBe(before.team);
	});

	test('allows overriding events array', () => {
		const msg = makeMessage();
		const state = createBaseChatState({ events: [msg] });
		expect(state.events).toHaveLength(1);
		expect(state.events[0]).toBe(msg);
	});
});

// ─── cloneChatState ───────────────────────────────────────────────────────────

describe('cloneChatState', () => {
	test('returns a new object (not the same reference)', () => {
		const state = createBaseChatState();
		const clone = cloneChatState(state);
		expect(clone).not.toBe(state);
	});

	test('events array is a new reference', () => {
		const msg = makeMessage();
		const state = createBaseChatState({ events: [msg] });
		const clone = cloneChatState(state);
		expect(clone.events).not.toBe(state.events);
		expect(clone.events).toEqual(state.events);
	});

	test('presence is a new reference', () => {
		const state = createBaseChatState({ presence: { alpha: 'working' } });
		const clone = cloneChatState(state);
		expect(clone.presence).not.toBe(state.presence);
		expect(clone.presence).toEqual(state.presence);
	});

	test('reactions map is a new reference with new inner arrays', () => {
		const state = createBaseChatState({
			reactions: {
				'msg-1': [{ emoji: '✅', fromAgent: 'alpha', fromColor: 'blue', tooltip: null }],
			},
		});
		const clone = cloneChatState(state);
		expect(clone.reactions).not.toBe(state.reactions);
		expect(clone.reactions['msg-1']).not.toBe(state.reactions['msg-1']);
		expect(clone.reactions['msg-1']).toEqual(state.reactions['msg-1']);
	});

	test('threadStatuses is a new reference with new inner objects', () => {
		const ts = makeThreadStatus();
		const state = createBaseChatState({ threadStatuses: { 'alpha:beta': ts } });
		const clone = cloneChatState(state);
		expect(clone.threadStatuses).not.toBe(state.threadStatuses);
		expect(clone.threadStatuses['alpha:beta']).not.toBe(state.threadStatuses['alpha:beta']);
		expect(clone.threadStatuses['alpha:beta']!.beats).not.toBe(state.threadStatuses['alpha:beta']!.beats);
	});

	test('planCards is a new reference', () => {
		const state = createBaseChatState({
			planCards: { 'req-1': { type: 'plan-approval', requestId: 'req-1', from: 'alpha', planContent: 'Plan', status: 'pending', feedback: null } },
		});
		const clone = cloneChatState(state);
		expect(clone.planCards).not.toBe(state.planCards);
		expect(clone.planCards).toEqual(state.planCards);
	});

	test('permissionCards is a new reference', () => {
		const state = createBaseChatState({
			permissionCards: { 'req-2': { type: 'permission-request', requestId: 'req-2', agentName: 'alpha', toolName: 'bash', command: 'rm -rf', status: 'pending' } },
		});
		const clone = cloneChatState(state);
		expect(clone.permissionCards).not.toBe(state.permissionCards);
		expect(clone.permissionCards).toEqual(state.permissionCards);
	});

	test('team members are cloned (new inner objects)', () => {
		const state = createBaseChatState({ team: makeTeam() });
		const clone = cloneChatState(state);
		expect(clone.team).not.toBe(state.team);
		expect(clone.team!.members[0]).not.toBe(state.team!.members[0]);
		expect(clone.team!.members[0]).toEqual(state.team!.members[0]);
	});

	test('handles null team', () => {
		const state = createBaseChatState({ team: null });
		const clone = cloneChatState(state);
		expect(clone.team).toBeNull();
	});

	test('mutating clone events does not affect original', () => {
		const msg = makeMessage();
		const state = createBaseChatState({ events: [msg] });
		const clone = cloneChatState(state);
		clone.events.push(makeMessage());
		expect(state.events).toHaveLength(1);
	});

	test('mutating clone presence does not affect original', () => {
		const state = createBaseChatState({ presence: { alpha: 'working' } });
		const clone = cloneChatState(state);
		(clone.presence as Record<string, string>)['beta'] = 'idle';
		expect(state.presence['beta']).toBeUndefined();
	});

	test('handles empty state (INITIAL_STATE)', () => {
		const state = createBaseChatState();
		const clone = cloneChatState(state);
		expect(clone).toEqual(INITIAL_STATE);
	});
});

// ─── hydrateChatState ─────────────────────────────────────────────────────────

describe('hydrateChatState', () => {
	test('hydrates team, tasks, presence, and sessionStart from session', () => {
		const session = makeSession({
			team: makeTeam(),
			tasks: [makeTask()],
			presence: { alpha: 'working' },
			sessionStart: '2024-06-01T12:00:00Z',
		});
		const state = hydrateChatState(session);
		expect(state.team).toEqual(session.team);
		expect(state.tasks).toHaveLength(1);
		expect(state.presence).toEqual({ alpha: 'working' });
		expect(state.sessionStart).toBe('2024-06-01T12:00:00Z');
	});

	test('defaults connected to true', () => {
		const state = hydrateChatState(makeSession());
		expect(state.connected).toBe(true);
	});

	test('accepts explicit connected = false', () => {
		const state = hydrateChatState(makeSession(), false);
		expect(state.connected).toBe(false);
	});

	test('applies session events via applyChatEventInPlace', () => {
		const msg = makeMessage();
		const session = makeSession({ events: [msg] });
		const state = hydrateChatState(session);
		expect(state.events).toHaveLength(1);
		expect(state.events[0]).toEqual(msg);
	});

	test('hydrates threadStatuses from session array', () => {
		const ts = makeThreadStatus({ threadKey: 'alpha:beta' });
		const session = makeSession({ threadStatuses: [ts] });
		const state = hydrateChatState(session);
		expect(state.threadStatuses['alpha:beta']).toEqual(ts);
	});

	test('handles missing threadStatuses (empty array)', () => {
		const session = makeSession({ threadStatuses: [] });
		const state = hydrateChatState(session);
		expect(state.threadStatuses).toEqual({});
	});

	test('handles undefined threadStatuses by defaulting to empty', () => {
		// Cast to test the ?? [] branch in hydrateChatState
		const session = { ...makeSession(), threadStatuses: undefined } as unknown as SessionState;
		const state = hydrateChatState(session);
		expect(state.threadStatuses).toEqual({});
	});

	test('multiple events are applied in order', () => {
		const msg1 = makeMessage({ text: 'First' });
		const msg2 = makeMessage({ text: 'Second' });
		const session = makeSession({ events: [msg1, msg2] });
		const state = hydrateChatState(session);
		expect(state.events).toHaveLength(2);
		expect((state.events[0] as ContentMessage).text).toBe('First');
		expect((state.events[1] as ContentMessage).text).toBe('Second');
	});
});

// ─── applyChatEventInPlace ────────────────────────────────────────────────────

describe('applyChatEventInPlace', () => {
	// ContentMessage – broadcast
	describe('ContentMessage (broadcast)', () => {
		test('pushes broadcast message to events', () => {
			const state = freshState();
			const msg = makeMessage({ isBroadcast: true, isDM: false });
			applyChatEventInPlace(state, msg);
			expect(state.events).toHaveLength(1);
			expect(state.events[0]).toBe(msg);
		});

		test('does not create a threadStatus for broadcast messages', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeMessage({ isBroadcast: true, isDM: false }));
			expect(Object.keys(state.threadStatuses)).toHaveLength(0);
		});
	});

	// ContentMessage – DM
	describe('ContentMessage (DM)', () => {
		test('pushes DM message to events', () => {
			const state = freshState();
			const dm = makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'], isBroadcast: false });
			applyChatEventInPlace(state, dm);
			expect(state.events).toHaveLength(1);
		});

		test('first DM creates a threadStatus with status "new" and messageCount 1', () => {
			const state = freshState();
			const dm = makeMessage({
				isDM: true,
				dmParticipants: ['alpha', 'beta'],
				text: 'Hey, got a minute?',
				timestamp: '2024-01-01T10:00:00Z',
			});
			applyChatEventInPlace(state, dm);
			const ts = state.threadStatuses['alpha:beta'];
			expect(ts).toBeDefined();
			expect(ts!.status).toBe('new');
			expect(ts!.messageCount).toBe(1);
			expect(ts!.firstMessageTimestamp).toBe('2024-01-01T10:00:00Z');
			expect(ts!.lastMessageTimestamp).toBe('2024-01-01T10:00:00Z');
			expect(ts!.participants).toEqual(['alpha', 'beta']);
		});

		test('thread key is sorted regardless of dmParticipants order', () => {
			const state = freshState();
			const dm = makeMessage({ isDM: true, dmParticipants: ['beta', 'alpha'] });
			applyChatEventInPlace(state, dm);
			expect(state.threadStatuses['alpha:beta']).toBeDefined();
		});

		test('topic is first 60 chars of message text with newlines replaced', () => {
			const state = freshState();
			const longText = 'A'.repeat(80);
			const dm = makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'], text: longText });
			applyChatEventInPlace(state, dm);
			expect(state.threadStatuses['alpha:beta']!.topic).toBe('A'.repeat(60));
		});

		test('topic replaces newlines with spaces', () => {
			const state = freshState();
			const dm = makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'], text: 'Line1\nLine2' });
			applyChatEventInPlace(state, dm);
			expect(state.threadStatuses['alpha:beta']!.topic).toBe('Line1 Line2');
		});

		test('second DM to same participants increments messageCount', () => {
			const state = freshState();
			const dm1 = makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'], timestamp: 'T1' });
			const dm2 = makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'], timestamp: 'T2' });
			applyChatEventInPlace(state, dm1);
			applyChatEventInPlace(state, dm2);
			expect(state.threadStatuses['alpha:beta']!.messageCount).toBe(2);
		});

		test('second DM updates lastMessageTimestamp', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'], timestamp: 'T1' }));
			applyChatEventInPlace(state, makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'], timestamp: 'T2' }));
			expect(state.threadStatuses['alpha:beta']!.lastMessageTimestamp).toBe('T2');
		});

		test('second DM changes status from "new" to "active"', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'] }));
			expect(state.threadStatuses['alpha:beta']!.status).toBe('new');
			applyChatEventInPlace(state, makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'] }));
			expect(state.threadStatuses['alpha:beta']!.status).toBe('active');
		});

		test('third+ DMs keep status "active" (not reset)', () => {
			const state = freshState();
			for (let i = 0; i < 4; i++) {
				applyChatEventInPlace(state, makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'] }));
			}
			expect(state.threadStatuses['alpha:beta']!.status).toBe('active');
			expect(state.threadStatuses['alpha:beta']!.messageCount).toBe(4);
		});

		test('DM without dmParticipants does not create threadStatus', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeMessage({ isDM: true, dmParticipants: null }));
			expect(Object.keys(state.threadStatuses)).toHaveLength(0);
		});
	});

	// ReactionEvent
	describe('ReactionEvent', () => {
		test('adds reaction to reactions map and pushes to events', () => {
			const state = freshState();
			const reaction = makeReaction({ targetMessageId: 'msg-x', emoji: '👍' });
			applyChatEventInPlace(state, reaction);
			expect(state.events).toHaveLength(1);
			expect(state.reactions['msg-x']).toHaveLength(1);
			expect(state.reactions['msg-x']![0]!.emoji).toBe('👍');
		});

		test('accumulates multiple reactions on same target message', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeReaction({ targetMessageId: 'msg-x', emoji: '✅' }));
			applyChatEventInPlace(state, makeReaction({ targetMessageId: 'msg-x', emoji: '👍', fromAgent: 'beta' }));
			expect(state.reactions['msg-x']).toHaveLength(2);
		});

		test('reactions on different target messages are tracked separately', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeReaction({ targetMessageId: 'msg-r1' }));
			applyChatEventInPlace(state, makeReaction({ targetMessageId: 'msg-r2' }));
			expect(state.reactions['msg-r1']).toHaveLength(1);
			expect(state.reactions['msg-r2']).toHaveLength(1);
		});

		test('non-beat reaction does not update threadStatus', () => {
			const state = freshState();
			const dm = makeMessage({ id: 'dm-nb-1', isDM: true, dmParticipants: ['alpha', 'beta'] });
			applyChatEventInPlace(state, dm);
			applyChatEventInPlace(state, makeReaction({ targetMessageId: 'dm-nb-1', tooltip: null }));
			expect(state.threadStatuses['alpha:beta']!.beats).toHaveLength(0);
		});

		test('beat reaction updates thread beats array', () => {
			const state = freshState();
			const dm = makeMessage({ id: 'dm-beat-1', isDM: true, dmParticipants: ['alpha', 'beta'] });
			applyChatEventInPlace(state, dm);
			applyChatEventInPlace(state, makeReaction({
				targetMessageId: 'dm-beat-1',
				tooltip: 'beat:proposal',
			}));
			expect(state.threadStatuses['alpha:beta']!.beats).toContain('proposal');
		});

		test('resolution beat sets thread status to "resolved"', () => {
			const state = freshState();
			const dm = makeMessage({ id: 'dm-res-1', isDM: true, dmParticipants: ['alpha', 'beta'] });
			applyChatEventInPlace(state, dm);
			applyChatEventInPlace(state, makeReaction({
				targetMessageId: 'dm-res-1',
				tooltip: 'beat:resolution',
			}));
			expect(state.threadStatuses['alpha:beta']!.status).toBe('resolved');
			expect(state.threadStatuses['alpha:beta']!.beats).toContain('resolution');
		});

		test('beat on non-existent target message does not crash', () => {
			const state = freshState();
			expect(() => {
				applyChatEventInPlace(state, makeReaction({ targetMessageId: 'does-not-exist', tooltip: 'beat:proposal' }));
			}).not.toThrow();
		});

		test('beat on broadcast message (not DM) does not update threadStatuses', () => {
			const state = freshState();
			const msg = makeMessage({ id: 'bc-beat-1', isDM: false, isBroadcast: true });
			applyChatEventInPlace(state, msg);
			applyChatEventInPlace(state, makeReaction({ targetMessageId: 'bc-beat-1', tooltip: 'beat:proposal' }));
			expect(Object.keys(state.threadStatuses)).toHaveLength(0);
		});

		test('reaction tooltip that does not start with "beat:" is ignored for beat tracking', () => {
			const state = freshState();
			const dm = makeMessage({ id: 'dm-nob-1', isDM: true, dmParticipants: ['alpha', 'beta'] });
			applyChatEventInPlace(state, dm);
			applyChatEventInPlace(state, makeReaction({ targetMessageId: 'dm-nob-1', tooltip: 'some-other-tooltip' }));
			expect(state.threadStatuses['alpha:beta']!.beats).toHaveLength(0);
		});
	});

	// TaskUpdate
	describe('TaskUpdate', () => {
		test('adds a new task when task id does not exist', () => {
			const state = freshState();
			const update = makeTaskUpdate({ task: makeTask({ id: 'task-new', subject: 'New task' }) });
			applyChatEventInPlace(state, update);
			expect(state.tasks).toHaveLength(1);
			expect(state.tasks[0]!.id).toBe('task-new');
		});

		test('updates existing task when id matches', () => {
			const state = freshState({ tasks: [makeTask({ id: 'task-1', status: 'pending' })] });
			const update = makeTaskUpdate({ task: makeTask({ id: 'task-1', status: 'completed' }) });
			applyChatEventInPlace(state, update);
			expect(state.tasks).toHaveLength(1);
			expect(state.tasks[0]!.status).toBe('completed');
		});

		test('task-update event is pushed to the events array', () => {
			// event is pushed to state.events (line 87) before the early return after applyTaskUpdate
			const state = freshState();
			applyChatEventInPlace(state, makeTaskUpdate());
			expect(state.events).toHaveLength(1);
		});

		test('preserves other tasks when updating one', () => {
			const task1 = makeTask({ id: 'task-1', subject: 'First' });
			const task2 = makeTask({ id: 'task-2', subject: 'Second' });
			const state = freshState({ tasks: [task1, task2] });
			const update = makeTaskUpdate({ task: makeTask({ id: 'task-1', status: 'in_progress' }) });
			applyChatEventInPlace(state, update);
			expect(state.tasks).toHaveLength(2);
			expect(state.tasks.find(t => t.id === 'task-2')!.subject).toBe('Second');
		});
	});

	// PresenceChange
	describe('PresenceChange', () => {
		test('updates presence map for an agent', () => {
			const state = freshState();
			applyChatEventInPlace(state, makePresence({ agentName: 'alpha', status: 'working' }));
			expect(state.presence['alpha']).toBe('working');
		});

		test('updates presence from working to idle', () => {
			const state = freshState({ presence: { alpha: 'working' } });
			applyChatEventInPlace(state, makePresence({ agentName: 'alpha', status: 'idle' }));
			expect(state.presence['alpha']).toBe('idle');
		});

		test('pushes presence event to events array', () => {
			const state = freshState();
			applyChatEventInPlace(state, makePresence());
			expect(state.events).toHaveLength(1);
		});

		test('can set multiple agents independently', () => {
			const state = freshState();
			applyChatEventInPlace(state, makePresence({ agentName: 'alpha', status: 'working' }));
			applyChatEventInPlace(state, makePresence({ agentName: 'beta', status: 'idle' }));
			expect(state.presence['alpha']).toBe('working');
			expect(state.presence['beta']).toBe('idle');
		});
	});

	// SystemEvent – member-joined
	describe('SystemEvent (member-joined)', () => {
		test('adds new member to team.members', () => {
			const state = freshState({ team: makeTeam({ members: [] }) });
			applyChatEventInPlace(state, makeSystemEvent({
				subtype: 'member-joined',
				agentName: 'gamma',
				agentColor: 'green',
				agentModel: 'claude-3-5-haiku',
			}));
			expect(state.team!.members).toHaveLength(1);
			expect(state.team!.members[0]!.name).toBe('gamma');
			expect(state.team!.members[0]!.color).toBe('green');
			expect(state.team!.members[0]!.model).toBe('claude-3-5-haiku');
		});

		test('sets presence to "working" on member-joined', () => {
			const state = freshState({ team: makeTeam({ members: [] }) });
			applyChatEventInPlace(state, makeSystemEvent({ subtype: 'member-joined', agentName: 'gamma' }));
			expect(state.presence['gamma']).toBe('working');
		});

		test('skips adding member if already exists', () => {
			const existingMember = { name: 'alpha', agentId: 'alpha@my-team', agentType: 'agent', color: 'blue' };
			const state = freshState({ team: makeTeam({ members: [existingMember] }) });
			applyChatEventInPlace(state, makeSystemEvent({ subtype: 'member-joined', agentName: 'alpha' }));
			expect(state.team!.members).toHaveLength(1);
		});

		test('backfills model if member exists but model is undefined', () => {
			const memberNoModel = { name: 'alpha', agentId: 'alpha@my-team', agentType: 'agent', color: 'blue' };
			const state = freshState({ team: makeTeam({ members: [memberNoModel] }) });
			applyChatEventInPlace(state, makeSystemEvent({
				subtype: 'member-joined',
				agentName: 'alpha',
				agentModel: 'claude-3-5-sonnet',
			}));
			expect(state.team!.members[0]!.model).toBe('claude-3-5-sonnet');
		});

		test('does not overwrite existing model during backfill', () => {
			const memberWithModel = { name: 'alpha', agentId: 'alpha@my-team', agentType: 'agent', color: 'blue', model: 'claude-3-opus' };
			const state = freshState({ team: makeTeam({ members: [memberWithModel] }) });
			applyChatEventInPlace(state, makeSystemEvent({
				subtype: 'member-joined',
				agentName: 'alpha',
				agentModel: 'claude-3-5-sonnet',
			}));
			expect(state.team!.members[0]!.model).toBe('claude-3-opus');
		});

		test('does nothing to team if team is null', () => {
			const state = freshState({ team: null });
			expect(() => {
				applyChatEventInPlace(state, makeSystemEvent({ subtype: 'member-joined', agentName: 'alpha' }));
			}).not.toThrow();
		});

		test('uses "gray" as default color when agentColor is null', () => {
			const state = freshState({ team: makeTeam({ members: [] }) });
			applyChatEventInPlace(state, makeSystemEvent({
				subtype: 'member-joined',
				agentName: 'ghost',
				agentColor: null,
			}));
			expect(state.team!.members[0]!.color).toBe('gray');
		});

		test('agentId is formatted as "name@teamName"', () => {
			const state = freshState({ team: makeTeam({ name: 'my-team', members: [] }) });
			applyChatEventInPlace(state, makeSystemEvent({ subtype: 'member-joined', agentName: 'delta' }));
			expect(state.team!.members[0]!.agentId).toBe('delta@my-team');
		});
	});

	// SystemEvent – other subtypes
	describe('SystemEvent (other subtypes)', () => {
		const nonJoinSubtypes: SystemEvent['subtype'][] = [
			'member-left', 'task-created', 'task-claimed', 'task-completed',
			'task-failed', 'task-unblocked', 'all-tasks-completed',
			'shutdown-requested', 'session-summary',
		];

		for (const subtype of nonJoinSubtypes) {
			test(`pushes "${subtype}" system event to events`, () => {
				const state = freshState();
				applyChatEventInPlace(state, makeSystemEvent({ subtype }));
				expect(state.events).toHaveLength(1);
				expect((state.events[0] as SystemEvent).subtype).toBe(subtype);
			});
		}

		test('member-left does not modify team members', () => {
			const state = freshState({ team: makeTeam() });
			const originalMemberCount = state.team!.members.length;
			applyChatEventInPlace(state, makeSystemEvent({ subtype: 'member-left', agentName: 'alpha' }));
			expect(state.team!.members).toHaveLength(originalMemberCount);
		});
	});

	// ThreadMarker
	describe('ThreadMarker', () => {
		test('pushes thread-start marker to events', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeThreadMarker({ subtype: 'thread-start' }));
			expect(state.events).toHaveLength(1);
			expect((state.events[0] as ThreadMarker).subtype).toBe('thread-start');
		});

		test('pushes thread-end marker to events', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeThreadMarker({ subtype: 'thread-end' }));
			expect(state.events).toHaveLength(1);
			expect((state.events[0] as ThreadMarker).subtype).toBe('thread-end');
		});

		test('does not modify threadStatuses', () => {
			const state = freshState();
			applyChatEventInPlace(state, makeThreadMarker());
			expect(Object.keys(state.threadStatuses)).toHaveLength(0);
		});
	});
});

// ─── applyChatEvent ───────────────────────────────────────────────────────────

describe('applyChatEvent', () => {
	test('returns a new state object (not the same reference)', () => {
		const state = freshState();
		const next = applyChatEvent(state, makeMessage());
		expect(next).not.toBe(state);
	});

	test('original state events array is unmodified', () => {
		const state = freshState();
		applyChatEvent(state, makeMessage());
		expect(state.events).toHaveLength(0);
	});

	test('new state has the event applied', () => {
		const state = freshState();
		const msg = makeMessage({ text: 'Applied!' });
		const next = applyChatEvent(state, msg);
		expect(next.events).toHaveLength(1);
		expect((next.events[0] as ContentMessage).text).toBe('Applied!');
	});

	test('does not mutate original state presence', () => {
		const state = freshState();
		applyChatEvent(state, makePresence({ agentName: 'alpha', status: 'working' }));
		expect(state.presence['alpha']).toBeUndefined();
	});

	test('does not mutate original state tasks', () => {
		const state = freshState();
		applyChatEvent(state, makeTaskUpdate({ task: makeTask({ id: 'task-99' }) }));
		expect(state.tasks).toHaveLength(0);
	});

	test('does not mutate original threadStatuses', () => {
		const state = freshState();
		const dm = makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'] });
		applyChatEvent(state, dm);
		expect(Object.keys(state.threadStatuses)).toHaveLength(0);
	});
});

// ─── reduceChatEvents ─────────────────────────────────────────────────────────

describe('reduceChatEvents', () => {
	test('returns a new state (not the same reference)', () => {
		const base = freshState();
		const next = reduceChatEvents(base, []);
		expect(next).not.toBe(base);
	});

	test('empty events array returns a clone of base state', () => {
		const base = freshState({ sessionStart: '2024-01-01T00:00:00Z' });
		const next = reduceChatEvents(base, []);
		expect(next).toEqual(base);
		expect(next.events).not.toBe(base.events);
	});

	test('applies multiple events in order', () => {
		const base = freshState();
		const events = [
			makeMessage({ text: 'First' }),
			makeMessage({ text: 'Second' }),
			makeMessage({ text: 'Third' }),
		];
		const next = reduceChatEvents(base, events);
		expect(next.events).toHaveLength(3);
		expect((next.events[0] as ContentMessage).text).toBe('First');
		expect((next.events[2] as ContentMessage).text).toBe('Third');
	});

	test('original base state is unmodified after reducing', () => {
		const base = freshState();
		reduceChatEvents(base, [makeMessage(), makeMessage()]);
		expect(base.events).toHaveLength(0);
	});

	test('accumulates tasks from multiple task-update events', () => {
		const base = freshState();
		const events = [
			makeTaskUpdate({ task: makeTask({ id: 'task-a' }) }),
			makeTaskUpdate({ task: makeTask({ id: 'task-b' }) }),
			makeTaskUpdate({ task: makeTask({ id: 'task-a', status: 'completed' }) }),
		];
		const next = reduceChatEvents(base, events);
		expect(next.tasks).toHaveLength(2);
		expect(next.tasks.find(t => t.id === 'task-a')!.status).toBe('completed');
		expect(next.tasks.find(t => t.id === 'task-b')).toBeDefined();
	});

	test('accumulates DM thread statuses across events', () => {
		const base = freshState();
		const events = [
			makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'] }),
			makeMessage({ isDM: true, dmParticipants: ['alpha', 'beta'] }),
			makeMessage({ isDM: true, dmParticipants: ['alpha', 'gamma'] }),
		];
		const next = reduceChatEvents(base, events);
		expect(next.threadStatuses['alpha:beta']!.messageCount).toBe(2);
		expect(next.threadStatuses['alpha:beta']!.status).toBe('active');
		expect(next.threadStatuses['alpha:gamma']!.messageCount).toBe(1);
	});

	test('presence changes are reflected in final state', () => {
		const base = freshState();
		const events = [
			makePresence({ agentName: 'alpha', status: 'working' }),
			makePresence({ agentName: 'alpha', status: 'idle' }),
		];
		const next = reduceChatEvents(base, events);
		expect(next.presence['alpha']).toBe('idle');
	});
});
