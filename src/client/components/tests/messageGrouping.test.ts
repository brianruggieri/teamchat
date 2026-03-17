import { describe, test, expect } from 'bun:test';
import {
	buildMessageLaneItems,
	isPlanApproval,
	isPermissionRequest,
	extractPlanContent,
	extractPermissionInfo,
} from '../messageGrouping.js';
import type { ContentMessage, SystemEvent, ChatEvent } from '../../types.js';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeMessage(overrides?: Partial<ContentMessage>): ContentMessage {
	return {
		type: 'message',
		id: 'msg-001',
		from: 'agent-alpha',
		fromColor: '#6366f1',
		text: 'Hello team!',
		summary: null,
		timestamp: '2024-01-01T00:00:00.000Z',
		isBroadcast: true,
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
		id: 'sys-001',
		subtype: 'member-joined',
		text: 'agent-alpha joined the team',
		timestamp: '2024-01-01T00:00:00.000Z',
		agentName: 'agent-alpha',
		agentColor: '#6366f1',
		agentModel: 'claude-3-5-sonnet',
		taskId: null,
		taskSubject: null,
		...overrides,
	};
}

// Timestamp helpers — base is Jan 1 2024 00:00:00 UTC (ms)
const BASE_MS = new Date('2024-01-01T00:00:00.000Z').getTime();
function tsAt(offsetMs: number): string {
	return new Date(BASE_MS + offsetMs).toISOString();
}

// ─── buildMessageLaneItems ────────────────────────────────────────────────────

describe('buildMessageLaneItems', () => {
	test('returns empty array for empty events', () => {
		expect(buildMessageLaneItems([])).toEqual([]);
	});

	// ── Filtered event types ──────────────────────────────────────────────────

	test('filters out presence events', () => {
		const events: ChatEvent[] = [
			{
				type: 'presence',
				id: 'p1',
				agentName: 'alpha',
				status: 'working',
				timestamp: tsAt(0),
			},
		];
		expect(buildMessageLaneItems(events)).toEqual([]);
	});

	test('filters out task-update events', () => {
		const events: ChatEvent[] = [
			{
				type: 'task-update',
				id: 'tu1',
				task: {
					id: 't1',
					subject: 'Build API',
					description: null,
					status: 'pending',
					owner: null,
					blockedBy: null,
					activeForm: null,
					created: tsAt(0),
					updated: tsAt(0),
				},
				timestamp: tsAt(0),
			},
		];
		expect(buildMessageLaneItems(events)).toEqual([]);
	});

	test('filters out reaction events', () => {
		const events: ChatEvent[] = [
			{
				type: 'reaction',
				id: 'r1',
				targetMessageId: 'msg-1',
				emoji: '👍',
				fromAgent: 'alpha',
				fromColor: '#6366f1',
				timestamp: tsAt(0),
				tooltip: null,
			},
		];
		expect(buildMessageLaneItems(events)).toEqual([]);
	});

	test('filters out thread-marker events', () => {
		const events: ChatEvent[] = [
			{
				type: 'thread-marker',
				id: 'tm1',
				subtype: 'thread-start',
				participants: ['alpha', 'beta'],
				timestamp: tsAt(0),
			},
		];
		expect(buildMessageLaneItems(events)).toEqual([]);
	});

	test('filters all skipped types together, leaving only messages', () => {
		const msg = makeMessage({ id: 'msg-1', timestamp: tsAt(5000) });
		const events: ChatEvent[] = [
			{
				type: 'presence',
				id: 'p1',
				agentName: 'alpha',
				status: 'working',
				timestamp: tsAt(0),
			},
			msg,
			{
				type: 'reaction',
				id: 'r1',
				targetMessageId: 'msg-1',
				emoji: '✅',
				fromAgent: 'beta',
				fromColor: '#ec4899',
				timestamp: tsAt(6000),
				tooltip: null,
			},
		];
		const result = buildMessageLaneItems(events);
		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('message-stack');
	});

	// ── Message stacking ──────────────────────────────────────────────────────

	test('consecutive messages from same agent are grouped into one message-stack', () => {
		const m1 = makeMessage({ id: 'msg-1', timestamp: tsAt(0) });
		const m2 = makeMessage({ id: 'msg-2', text: 'Second message', timestamp: tsAt(1000) });
		const result = buildMessageLaneItems([m1, m2]);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('message-stack');
		if (result[0]?.kind === 'message-stack') {
			expect(result[0].messages).toHaveLength(2);
			expect(result[0].messages[0]?.id).toBe('msg-1');
			expect(result[0].messages[1]?.id).toBe('msg-2');
		}
	});

	test('single message produces a message-stack with one message', () => {
		const msg = makeMessage();
		const result = buildMessageLaneItems([msg]);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('message-stack');
		if (result[0]?.kind === 'message-stack') {
			expect(result[0].messages).toHaveLength(1);
		}
	});

	test('different `from` breaks the message stack', () => {
		const m1 = makeMessage({ id: 'msg-1', from: 'agent-alpha', timestamp: tsAt(0) });
		const m2 = makeMessage({ id: 'msg-2', from: 'agent-beta', timestamp: tsAt(1000) });
		const result = buildMessageLaneItems([m1, m2]);

		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe('message-stack');
		expect(result[1]?.kind).toBe('message-stack');
	});

	test('different `isLead` breaks the message stack', () => {
		const m1 = makeMessage({ id: 'msg-1', isLead: false, timestamp: tsAt(0) });
		const m2 = makeMessage({ id: 'msg-2', isLead: true, timestamp: tsAt(1000) });
		const result = buildMessageLaneItems([m1, m2]);

		expect(result).toHaveLength(2);
	});

	test('different `isDM` breaks the message stack', () => {
		const m1 = makeMessage({ id: 'msg-1', isDM: false, timestamp: tsAt(0) });
		const m2 = makeMessage({ id: 'msg-2', isDM: true, timestamp: tsAt(1000) });
		const result = buildMessageLaneItems([m1, m2]);

		expect(result).toHaveLength(2);
	});

	test('different `fromColor` breaks the message stack', () => {
		const m1 = makeMessage({ id: 'msg-1', fromColor: '#6366f1', timestamp: tsAt(0) });
		const m2 = makeMessage({ id: 'msg-2', fromColor: '#ec4899', timestamp: tsAt(1000) });
		const result = buildMessageLaneItems([m1, m2]);

		expect(result).toHaveLength(2);
	});

	test('messages from same agent can resume stacking after an interruption', () => {
		const m1 = makeMessage({ id: 'msg-1', from: 'alpha', timestamp: tsAt(0) });
		const m2 = makeMessage({ id: 'msg-2', from: 'beta', timestamp: tsAt(1000) });
		const m3 = makeMessage({ id: 'msg-3', from: 'alpha', timestamp: tsAt(2000) });
		const result = buildMessageLaneItems([m1, m2, m3]);

		expect(result).toHaveLength(3);
		// All three are separate stacks because alpha-beta-alpha pattern breaks grouping
		expect(result[0]?.kind).toBe('message-stack');
		expect(result[1]?.kind).toBe('message-stack');
		expect(result[2]?.kind).toBe('message-stack');
	});

	// ── System event grouping ─────────────────────────────────────────────────

	test('consecutive collapsible system events with same subtype are grouped into system-group', () => {
		// Use sessionStartOverride far in the past so these events are outside the 60s setup window
		const FAR_PAST = BASE_MS - 120_000;
		const s1 = makeSystemEvent({ id: 's1', subtype: 'member-joined', agentName: 'alpha', timestamp: tsAt(0) });
		const s2 = makeSystemEvent({ id: 's2', subtype: 'member-joined', agentName: 'beta', timestamp: tsAt(1_000) });
		const result = buildMessageLaneItems([s1, s2], FAR_PAST);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('system-group');
		if (result[0]?.kind === 'system-group') {
			expect(result[0].subtype).toBe('member-joined');
			expect(result[0].events).toHaveLength(2);
		}
	});

	test('collapsible system events: task-created groups correctly', () => {
		const FAR_PAST = BASE_MS - 120_000;
		const s1 = makeSystemEvent({ id: 's1', subtype: 'task-created', timestamp: tsAt(0) });
		const s2 = makeSystemEvent({ id: 's2', subtype: 'task-created', timestamp: tsAt(1_000) });
		const result = buildMessageLaneItems([s1, s2], FAR_PAST);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('system-group');
	});

	test('collapsible system events: task-claimed groups correctly', () => {
		const FAR_PAST = BASE_MS - 120_000;
		const s1 = makeSystemEvent({ id: 's1', subtype: 'task-claimed', timestamp: tsAt(0) });
		const s2 = makeSystemEvent({ id: 's2', subtype: 'task-claimed', timestamp: tsAt(1_000) });
		const result = buildMessageLaneItems([s1, s2], FAR_PAST);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('system-group');
	});

	test('different subtype starts a new system-group', () => {
		const FAR_PAST = BASE_MS - 120_000;
		const s1 = makeSystemEvent({ id: 's1', subtype: 'member-joined', timestamp: tsAt(0) });
		const s2 = makeSystemEvent({ id: 's2', subtype: 'task-created', timestamp: tsAt(1_000) });
		const result = buildMessageLaneItems([s1, s2], FAR_PAST);

		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe('system-group');
		expect(result[1]?.kind).toBe('system-group');
		if (result[0]?.kind === 'system-group') {
			expect(result[0].subtype).toBe('member-joined');
		}
		if (result[1]?.kind === 'system-group') {
			expect(result[1].subtype).toBe('task-created');
		}
	});

	test('non-collapsible system events render as individual system items', () => {
		// These subtypes are never collapsible and also never setup-phase,
		// so the setup window doesn't matter. Use a far-past override for clarity.
		const FAR_PAST = BASE_MS - 120_000;
		const nonCollapsible: Array<SystemEvent['subtype']> = [
			'task-completed',
			'task-failed',
			'task-unblocked',
			'all-tasks-completed',
			'shutdown-requested',
			'shutdown-approved',
			'shutdown-rejected',
			'team-deleted',
			'idle-surfaced',
			'nudge',
			'bottleneck',
			'session-summary',
			'member-left',
		];

		for (const subtype of nonCollapsible) {
			const s1 = makeSystemEvent({ id: 's1', subtype, timestamp: tsAt(0) });
			const s2 = makeSystemEvent({ id: 's2', subtype, timestamp: tsAt(1_000) });
			const result = buildMessageLaneItems([s1, s2], FAR_PAST);

			// Each produces a separate 'system' item, not a group
			expect(result).toHaveLength(2);
			for (const item of result) {
				expect(item.kind).toBe('system');
			}
		}
	});

	test('single non-collapsible system event becomes a system row item', () => {
		const FAR_PAST = BASE_MS - 120_000;
		const s = makeSystemEvent({ id: 's1', subtype: 'task-completed', timestamp: tsAt(0) });
		const result = buildMessageLaneItems([s], FAR_PAST);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('system');
		if (result[0]?.kind === 'system') {
			expect(result[0].event.id).toBe('s1');
		}
	});

	// ── Setup card ────────────────────────────────────────────────────────────

	test('setup-phase events within first 60s are grouped into a setup-card', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({ id: 's1', subtype: 'team-created', timestamp: tsAt(0) }),
			makeSystemEvent({ id: 's2', subtype: 'member-joined', timestamp: tsAt(1000) }),
			makeSystemEvent({ id: 's3', subtype: 'task-created', timestamp: tsAt(2000) }),
			makeSystemEvent({ id: 's4', subtype: 'task-claimed', timestamp: tsAt(3000) }),
		];
		const result = buildMessageLaneItems(events);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('setup-card');
		if (result[0]?.kind === 'setup-card') {
			expect(result[0].events).toHaveLength(4);
		}
	});

	test('setup-phase events exactly at 59999ms are included in setup-card', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({ id: 's1', subtype: 'team-created', timestamp: tsAt(0) }),
			makeSystemEvent({ id: 's2', subtype: 'member-joined', timestamp: tsAt(59_999) }),
		];
		const result = buildMessageLaneItems(events);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('setup-card');
		if (result[0]?.kind === 'setup-card') {
			expect(result[0].events).toHaveLength(2);
		}
	});

	test('setup-phase events at exactly 60000ms are NOT included in setup-card', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({ id: 's1', subtype: 'team-created', timestamp: tsAt(0) }),
			makeSystemEvent({ id: 's2', subtype: 'member-joined', timestamp: tsAt(60_000) }),
		];
		const result = buildMessageLaneItems(events);

		// s1 goes into setup-card, s2 falls through to system-group
		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe('setup-card');
		expect(result[1]?.kind).toBe('system-group');
	});

	test('setup-phase events after 60s are NOT put in setup card', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({ id: 's1', subtype: 'team-created', timestamp: tsAt(0) }),
			makeSystemEvent({ id: 's2', subtype: 'member-joined', timestamp: tsAt(90_000) }),
		];
		const result = buildMessageLaneItems(events);

		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe('setup-card');
		expect(result[1]?.kind).toBe('system-group');
	});

	test('sessionStartOverride controls the 60s window reference', () => {
		// Events timestamps: 70s and 80s after BASE_MS.
		// Without override, first event at 70s is used as session start → 80s is 10s later → both in setup card.
		// With override set to BASE_MS (0s), 70s is 70000ms after session start → outside window.
		const events: ChatEvent[] = [
			makeSystemEvent({ id: 's1', subtype: 'team-created', timestamp: tsAt(70_000) }),
			makeSystemEvent({ id: 's2', subtype: 'member-joined', timestamp: tsAt(80_000) }),
		];

		// Without override: first event timestamp is used → both within 10s of each other → setup card
		const withoutOverride = buildMessageLaneItems(events);
		expect(withoutOverride).toHaveLength(1);
		expect(withoutOverride[0]?.kind).toBe('setup-card');

		// With override at BASE_MS: events are 70s and 80s after session start → outside 60s window.
		// team-created is a setup-phase event but NOT a collapsible event. When it misses the setup
		// window it falls through to the non-collapsible system path → kind: 'system'.
		// member-joined IS collapsible → kind: 'system-group'.
		const withOverride = buildMessageLaneItems(events, BASE_MS);
		expect(withOverride).toHaveLength(2);
		expect(withOverride[0]?.kind).toBe('system');
		expect(withOverride[1]?.kind).toBe('system-group');
	});

	test('sessionStartOverride within 60s window correctly includes events', () => {
		// Events at 50s and 55s after BASE_MS, override at BASE_MS → both within 60s window
		const events: ChatEvent[] = [
			makeSystemEvent({ id: 's1', subtype: 'team-created', timestamp: tsAt(50_000) }),
			makeSystemEvent({ id: 's2', subtype: 'member-joined', timestamp: tsAt(55_000) }),
		];

		const result = buildMessageLaneItems(events, BASE_MS);
		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('setup-card');
		if (result[0]?.kind === 'setup-card') {
			expect(result[0].events).toHaveLength(2);
		}
	});

	// ── Plan cards ────────────────────────────────────────────────────────────

	test('message starting with "📋 PLAN:" becomes a plan-card item', () => {
		const msg = makeMessage({ text: '📋 PLAN: Step 1\nStep 2\nStep 3' });
		const result = buildMessageLaneItems([msg]);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('plan-card');
		if (result[0]?.kind === 'plan-card') {
			expect(result[0].planContent).toBe('Step 1\nStep 2\nStep 3');
			expect(result[0].message).toBe(msg);
		}
	});

	// ── Permission cards ──────────────────────────────────────────────────────

	test('permission request message becomes a permission-card item', () => {
		const msg = makeMessage({
			text: '🔐 agent-alpha wants to run: `Bash` — rm -rf /tmp/build',
		});
		const result = buildMessageLaneItems([msg]);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('permission-card');
		if (result[0]?.kind === 'permission-card') {
			expect(result[0].toolName).toBe('Bash');
			expect(result[0].command).toBe('rm -rf /tmp/build');
			expect(result[0].message).toBe(msg);
		}
	});

	// ── Mixed event stream ────────────────────────────────────────────────────

	test('realistic mixed event stream produces correct lane items in order', () => {
		const events: ChatEvent[] = [
			// Setup phase
			makeSystemEvent({ id: 's1', subtype: 'team-created', timestamp: tsAt(0) }),
			makeSystemEvent({ id: 's2', subtype: 'member-joined', agentName: 'alpha', timestamp: tsAt(500) }),
			makeSystemEvent({ id: 's3', subtype: 'member-joined', agentName: 'beta', timestamp: tsAt(1000) }),
			makeSystemEvent({ id: 's4', subtype: 'task-created', timestamp: tsAt(2000) }),
			// After setup window: a message group, then system events, then special cards
			makeMessage({ id: 'm1', from: 'alpha', text: 'Starting now', timestamp: tsAt(65_000) }),
			makeMessage({ id: 'm2', from: 'alpha', text: 'On it!', timestamp: tsAt(66_000) }),
			makeMessage({ id: 'm3', from: 'beta', text: 'Ready', timestamp: tsAt(67_000) }),
			makeSystemEvent({ id: 's5', subtype: 'task-claimed', timestamp: tsAt(68_000) }),
			makeSystemEvent({ id: 's6', subtype: 'task-claimed', timestamp: tsAt(69_000) }),
			makeSystemEvent({ id: 's7', subtype: 'task-completed', timestamp: tsAt(70_000) }),
			makeMessage({
				id: 'm4',
				from: 'alpha',
				text: '📋 PLAN: 1. Audit\n2. Fix\n3. Test',
				timestamp: tsAt(71_000),
			}),
			makeMessage({
				id: 'm5',
				from: 'alpha',
				text: '🔐 alpha wants to run: `Bash` — echo hello',
				timestamp: tsAt(72_000),
			}),
			makeMessage({ id: 'm6', from: 'alpha', text: 'All done', timestamp: tsAt(73_000) }),
		];

		const result = buildMessageLaneItems(events);

		// Expected order:
		// 0: setup-card (s1, s2, s3, s4)
		// 1: message-stack (m1, m2 — same agent alpha)
		// 2: message-stack (m3 — beta)
		// 3: system-group task-claimed (s5, s6)
		// 4: system (s7 — task-completed, not collapsible)
		// 5: plan-card (m4)
		// 6: permission-card (m5)
		// 7: message-stack (m6 — alpha, but plan/permission cards break the stack)
		expect(result).toHaveLength(8);

		expect(result[0]?.kind).toBe('setup-card');
		if (result[0]?.kind === 'setup-card') {
			expect(result[0].events).toHaveLength(4);
		}

		expect(result[1]?.kind).toBe('message-stack');
		if (result[1]?.kind === 'message-stack') {
			expect(result[1].messages).toHaveLength(2);
			expect(result[1].messages[0]?.id).toBe('m1');
			expect(result[1].messages[1]?.id).toBe('m2');
		}

		expect(result[2]?.kind).toBe('message-stack');
		if (result[2]?.kind === 'message-stack') {
			expect(result[2].messages).toHaveLength(1);
			expect(result[2].messages[0]?.id).toBe('m3');
		}

		expect(result[3]?.kind).toBe('system-group');
		if (result[3]?.kind === 'system-group') {
			expect(result[3].subtype).toBe('task-claimed');
			expect(result[3].events).toHaveLength(2);
		}

		expect(result[4]?.kind).toBe('system');
		if (result[4]?.kind === 'system') {
			expect(result[4].event.id).toBe('s7');
		}

		expect(result[5]?.kind).toBe('plan-card');
		expect(result[6]?.kind).toBe('permission-card');

		expect(result[7]?.kind).toBe('message-stack');
		if (result[7]?.kind === 'message-stack') {
			expect(result[7].messages).toHaveLength(1);
			expect(result[7].messages[0]?.id).toBe('m6');
		}
	});
});

// ─── isPlanApproval ───────────────────────────────────────────────────────────

describe('isPlanApproval', () => {
	test('returns true for message starting with "📋 PLAN:"', () => {
		expect(isPlanApproval(makeMessage({ text: '📋 PLAN: Do the thing' }))).toBe(true);
	});

	test('returns true for message starting with "📋 PLAN:" with no trailing content', () => {
		expect(isPlanApproval(makeMessage({ text: '📋 PLAN:' }))).toBe(true);
	});

	test('returns false for regular message text', () => {
		expect(isPlanApproval(makeMessage({ text: 'Hello team!' }))).toBe(false);
	});

	test('returns false for empty text', () => {
		expect(isPlanApproval(makeMessage({ text: '' }))).toBe(false);
	});

	test('returns false when "📋 PLAN:" appears mid-string (not at start)', () => {
		expect(isPlanApproval(makeMessage({ text: 'Here is the 📋 PLAN: details' }))).toBe(false);
	});

	test('returns false for partial prefix without colon', () => {
		expect(isPlanApproval(makeMessage({ text: '📋 PLAN details' }))).toBe(false);
	});
});

// ─── isPermissionRequest ──────────────────────────────────────────────────────

describe('isPermissionRequest', () => {
	test('returns true for well-formed permission request', () => {
		expect(
			isPermissionRequest(makeMessage({ text: '🔐 agent-alpha wants to run: `Bash` — echo hello' }))
		).toBe(true);
	});

	test('returns true with different agent names', () => {
		expect(
			isPermissionRequest(makeMessage({ text: '🔐 My Agent wants to run: `Read` — /etc/passwd' }))
		).toBe(true);
	});

	test('returns false for message with "🔐 " prefix but no "wants to run:"', () => {
		expect(
			isPermissionRequest(makeMessage({ text: '🔐 This is just a secure note' }))
		).toBe(false);
	});

	test('returns false for message with "wants to run:" but no "🔐 " prefix', () => {
		expect(
			isPermissionRequest(makeMessage({ text: 'agent wants to run: something' }))
		).toBe(false);
	});

	test('returns false for empty text', () => {
		expect(isPermissionRequest(makeMessage({ text: '' }))).toBe(false);
	});

	test('returns false for regular message text', () => {
		expect(isPermissionRequest(makeMessage({ text: 'Hello team!' }))).toBe(false);
	});

	test('returns false when lock emoji appears mid-string', () => {
		expect(
			isPermissionRequest(makeMessage({ text: 'Note: 🔐 agent wants to run: something' }))
		).toBe(false);
	});
});

// ─── extractPlanContent ───────────────────────────────────────────────────────

describe('extractPlanContent', () => {
	test('strips "📋 PLAN:" prefix and trims', () => {
		expect(extractPlanContent('📋 PLAN: Step 1')).toBe('Step 1');
	});

	test('handles extra whitespace after prefix', () => {
		expect(extractPlanContent('📋 PLAN:   Step 1')).toBe('Step 1');
	});

	test('handles no space after colon', () => {
		expect(extractPlanContent('📋 PLAN:Step 1')).toBe('Step 1');
	});

	test('returns empty string for just the prefix', () => {
		expect(extractPlanContent('📋 PLAN:')).toBe('');
	});

	test('preserves multiline content after prefix', () => {
		const input = '📋 PLAN: Step 1\nStep 2\nStep 3';
		expect(extractPlanContent(input)).toBe('Step 1\nStep 2\nStep 3');
	});

	test('trims leading/trailing whitespace from result', () => {
		expect(extractPlanContent('📋 PLAN:   content   ')).toBe('content');
	});
});

// ─── extractPermissionInfo ────────────────────────────────────────────────────

describe('extractPermissionInfo', () => {
	test('extracts toolName from backtick-wrapped segment', () => {
		const result = extractPermissionInfo('🔐 alpha wants to run: `Bash` — echo hello');
		expect(result.toolName).toBe('Bash');
	});

	test('extracts command from after em-dash', () => {
		const result = extractPermissionInfo('🔐 alpha wants to run: `Bash` — echo hello');
		expect(result.command).toBe('echo hello');
	});

	test('handles multi-word command after em-dash', () => {
		const result = extractPermissionInfo('🔐 alpha wants to run: `Read` — /Users/me/project/src/index.ts');
		expect(result.toolName).toBe('Read');
		expect(result.command).toBe('/Users/me/project/src/index.ts');
	});

	test('returns empty string for toolName if no backticks found', () => {
		const result = extractPermissionInfo('🔐 alpha wants to run: Bash — echo hello');
		expect(result.toolName).toBe('');
	});

	test('returns full text as command if no em-dash found', () => {
		const text = '🔐 alpha wants to run: `Bash`';
		const result = extractPermissionInfo(text);
		expect(result.command).toBe(text);
	});

	test('returns empty toolName and full text as command when neither backticks nor dash', () => {
		const text = 'no special markers here';
		const result = extractPermissionInfo(text);
		expect(result.toolName).toBe('');
		expect(result.command).toBe(text);
	});

	test('handles command with spaces after em-dash', () => {
		const result = extractPermissionInfo('🔐 agent wants to run: `Write` —   some spaced content');
		expect(result.command).toBe('some spaced content');
	});

	test('extracts first backtick-wrapped segment when multiple backtick groups exist', () => {
		const result = extractPermissionInfo('🔐 alpha wants to run: `Bash` with `flag` — cmd');
		expect(result.toolName).toBe('Bash');
	});
});
