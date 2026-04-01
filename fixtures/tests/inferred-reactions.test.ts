/**
 * Integration tests: Inferred reactions from observable agent behavior (Decision 4).
 *
 * Each pattern traces to a concrete inter-agent event — nothing is fabricated.
 *
 * Patterns:
 *  1. 👀 Seen & acting — DM recipient responds within 15s
 *  2. ⚡ Chain reaction — task claimed within 30s of a blocker completing
 *  3. ⚠️ Edit conflict — two agents write/edit the same file within 60s
 *  4. 📢 Completion broadcast — teammate broadcast containing completion keywords
 *  5. 🔍 Research phase — first heartbeat with only reads/searches (no writes)
 *  6. 📝 Build phase — first heartbeat with writes after a read-only phase
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { EventProcessor, type EventEmitter } from '../../src/server/processor.js';
import type {
	AgentHeartbeat,
	ChatEvent,
	ReactionEvent,
	RawTaskData,
} from '../../src/shared/types.js';
import { generateEventId } from '../../src/shared/parse.js';
import { config } from '../data/config.js';
import { initialTasks } from '../data/tasks.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

function reactions(events: ChatEvent[]): ReactionEvent[] {
	return events.filter((e) => e.type === 'reaction') as ReactionEvent[];
}

function makeHeartbeat(
	agentName: string,
	agentColor: string,
	activities: string,
	timestamp: string,
): AgentHeartbeat {
	return {
		type: 'heartbeat',
		id: generateEventId(),
		agentName,
		agentColor,
		activities,
		opCount: 1,
		timestamp,
	};
}

// ─── Pattern 1: 👀 Seen & acting ────────────────────────────────────────────

describe('Pattern 1: 👀 Seen & acting', () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: 'config', previous: null, current: config });
		collector.events.length = 0;
	});

	test('👀 emitted on DM when recipient responds within 15s', () => {
		// backend sends a DM to frontend
		const dm = {
			from: 'backend' as const,
			text: 'Can you check the endpoint schema?',
			summary: 'Schema check',
			timestamp: '2026-03-09T10:05:00.000Z',
			color: 'blue',
			read: false as const,
		};
		processor.processDelta({ type: 'inbox', agentName: 'frontend', previous: [], current: [dm] });

		const dmMessages = collector.events.filter((e) => e.type === 'message');
		expect(dmMessages).toHaveLength(1);
		const dmId = dmMessages[0]!.id;
		collector.events.length = 0;

		// frontend replies within 15s
		const reply = {
			from: 'frontend' as const,
			text: 'Looking at it now',
			summary: 'On it',
			timestamp: '2026-03-09T10:05:12.000Z', // 12s later
			color: 'green',
			read: false as const,
		};
		processor.processDelta({ type: 'inbox', agentName: 'backend', previous: [], current: [reply] });

		const reacts = reactions(collector.events);
		const seenReaction = reacts.find((r) => r.emoji === '👀');
		expect(seenReaction).toBeDefined();
		expect(seenReaction!.targetMessageId).toBe(dmId);
		expect(seenReaction!.fromAgent).toBe('frontend');
	});

	test('👀 NOT emitted if recipient responds after 15s window', () => {
		const dm = {
			from: 'backend' as const,
			text: 'Can you check the endpoint schema?',
			summary: 'Schema check',
			timestamp: '2026-03-09T10:05:00.000Z',
			color: 'blue',
			read: false as const,
		};
		processor.processDelta({ type: 'inbox', agentName: 'frontend', previous: [], current: [dm] });
		collector.events.length = 0;

		// frontend replies after 20s — outside window
		const reply = {
			from: 'frontend' as const,
			text: 'Looking at it now',
			summary: 'On it',
			timestamp: '2026-03-09T10:05:20.000Z', // 20s later
			color: 'green',
			read: false as const,
		};
		processor.processDelta({ type: 'inbox', agentName: 'backend', previous: [], current: [reply] });

		const reacts = reactions(collector.events);
		const seenReaction = reacts.find((r) => r.emoji === '👀');
		expect(seenReaction).toBeUndefined();
	});

	test('👀 NOT emitted when lead sends DM to agent (nudge path, not tracked)', () => {
		// Lead DMs frontend — this goes through nudge path, not DM seen tracking
		const dm = {
			from: 'team-lead' as const,
			text: 'Status update please',
			summary: 'Status',
			timestamp: '2026-03-09T10:05:00.000Z',
			color: 'gold',
			read: false as const,
		};
		processor.processDelta({ type: 'inbox', agentName: 'frontend', previous: [], current: [dm] });
		collector.events.length = 0;

		// frontend replies quickly
		const reply = {
			from: 'frontend' as const,
			text: 'Working on the dashboard',
			summary: 'Dashboard',
			timestamp: '2026-03-09T10:05:05.000Z',
			color: 'green',
			read: false as const,
		};
		processor.processDelta({ type: 'inbox', agentName: 'team-lead', previous: [], current: [reply] });

		// Wait for broadcast hold
		const reacts = reactions(collector.events);
		const seenReaction = reacts.find((r) => r.emoji === '👀');
		expect(seenReaction).toBeUndefined();
	});
});

// ─── Pattern 2: ⚡ Chain reaction ─────────────────────────────────────────

describe('Pattern 2: ⚡ Chain reaction', () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	const BASE_TASKS: RawTaskData[] = [
		{
			id: 'A',
			subject: 'Design schema',
			description: null,
			status: 'in_progress',
			owner: 'backend',
			blockedBy: null,
			activeForm: null,
			created: '2026-03-09T10:00:00.000Z',
			updated: '2026-03-09T10:00:00.000Z',
		},
		{
			id: 'B',
			subject: 'Build endpoints',
			description: null,
			status: 'pending',
			owner: null,
			blockedBy: ['A'],
			activeForm: null,
			created: '2026-03-09T10:00:00.000Z',
			updated: '2026-03-09T10:00:00.000Z',
		},
	];

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: 'config', previous: null, current: config });
		processor.processDelta({ type: 'tasks', previous: [], current: BASE_TASKS });
		collector.events.length = 0;
	});

	test('⚡ emitted on task-completed when blocked task is claimed within 30s', () => {
		// Task A completes
		const tasksAfterComplete: RawTaskData[] = BASE_TASKS.map((t) =>
			t.id === 'A'
				? { ...t, status: 'completed' as const, updated: '2026-03-09T10:10:00.000Z' }
				: t,
		);
		processor.processDelta({ type: 'tasks', previous: BASE_TASKS, current: tasksAfterComplete });

		// Find the task-completed system event ID
		const completedEvents = collector.events.filter(
			(e) => e.type === 'system' && (e as import('../../src/shared/types.js').SystemEvent).subtype === 'task-completed',
		);
		expect(completedEvents).toHaveLength(1);
		const completedEventId = completedEvents[0]!.id;
		collector.events.length = 0;

		// Task B gets claimed within 30s
		const tasksAfterClaim: RawTaskData[] = tasksAfterComplete.map((t) =>
			t.id === 'B'
				? {
						...t,
						status: 'in_progress' as const,
						owner: 'frontend',
						updated: '2026-03-09T10:10:20.000Z', // 20s later
					}
				: t,
		);
		processor.processDelta({ type: 'tasks', previous: tasksAfterComplete, current: tasksAfterClaim });

		const reacts = reactions(collector.events);
		const chainReaction = reacts.find((r) => r.emoji === '⚡');
		expect(chainReaction).toBeDefined();
		expect(chainReaction!.targetMessageId).toBe(completedEventId);
		expect(chainReaction!.fromAgent).toBe('frontend');
	});

	test('⚡ NOT emitted if claim happens more than 30s after completion', () => {
		const tasksAfterComplete: RawTaskData[] = BASE_TASKS.map((t) =>
			t.id === 'A'
				? { ...t, status: 'completed' as const, updated: '2026-03-09T10:10:00.000Z' }
				: t,
		);
		processor.processDelta({ type: 'tasks', previous: BASE_TASKS, current: tasksAfterComplete });
		collector.events.length = 0;

		// Task B claimed 60s after completion — outside window
		const tasksAfterClaim: RawTaskData[] = tasksAfterComplete.map((t) =>
			t.id === 'B'
				? {
						...t,
						status: 'in_progress' as const,
						owner: 'frontend',
						updated: '2026-03-09T10:11:00.000Z', // 60s later
					}
				: t,
		);
		processor.processDelta({ type: 'tasks', previous: tasksAfterComplete, current: tasksAfterClaim });

		const reacts = reactions(collector.events);
		const chainReaction = reacts.find((r) => r.emoji === '⚡');
		expect(chainReaction).toBeUndefined();
	});

	test('⚡ NOT emitted for tasks with no blockers', () => {
		// Add a task with no dependencies
		const tasksWithFree: RawTaskData[] = [
			...BASE_TASKS,
			{
				id: 'C',
				subject: 'Write docs',
				description: null,
				status: 'pending',
				owner: null,
				blockedBy: null,
				activeForm: null,
				created: '2026-03-09T10:00:00.000Z',
				updated: '2026-03-09T10:00:00.000Z',
			},
		];
		// Mark A completed
		const tasksAfterComplete: RawTaskData[] = tasksWithFree.map((t) =>
			t.id === 'A'
				? { ...t, status: 'completed' as const, updated: '2026-03-09T10:10:00.000Z' }
				: t,
		);
		processor.processDelta({ type: 'tasks', previous: tasksWithFree, current: tasksAfterComplete });
		collector.events.length = 0;

		// Claim C (no blockers) quickly
		const tasksAfterClaim: RawTaskData[] = tasksAfterComplete.map((t) =>
			t.id === 'C'
				? {
						...t,
						status: 'in_progress' as const,
						owner: 'qa',
						updated: '2026-03-09T10:10:05.000Z',
					}
				: t,
		);
		processor.processDelta({ type: 'tasks', previous: tasksAfterComplete, current: tasksAfterClaim });

		const reacts = reactions(collector.events);
		const chainReaction = reacts.find((r) => r.emoji === '⚡');
		expect(chainReaction).toBeUndefined();
	});
});

// ─── Pattern 3: ⚠️ Edit conflict ─────────────────────────────────────────

describe('Pattern 3: ⚠️ Edit conflict', () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: 'config', previous: null, current: config });
		collector.events.length = 0;
	});

	test('⚠️ emitted when two agents edit the same file within 60s', () => {
		const hb1 = makeHeartbeat('backend', 'blue', 'editing schema.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb1);
		collector.events.length = 0;

		const hb2 = makeHeartbeat('frontend', 'green', 'editing schema.ts', '2026-03-09T10:05:45.000Z'); // 45s later
		processor.injectEvent(hb2);

		const reacts = reactions(collector.events);
		const conflictReaction = reacts.find((r) => r.emoji === '⚠️');
		expect(conflictReaction).toBeDefined();
		expect(conflictReaction!.targetMessageId).toBe(hb2.id);
		expect(conflictReaction!.fromAgent).toBe('frontend');
		expect(conflictReaction!.tooltip).toContain('schema.ts');
	});

	test('⚠️ NOT emitted for same agent editing the same file', () => {
		const hb1 = makeHeartbeat('backend', 'blue', 'editing schema.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb1);
		collector.events.length = 0;

		// Same agent edits the file again
		const hb2 = makeHeartbeat('backend', 'blue', 'editing schema.ts', '2026-03-09T10:05:30.000Z');
		processor.injectEvent(hb2);

		const reacts = reactions(collector.events);
		const conflictReaction = reacts.find((r) => r.emoji === '⚠️');
		expect(conflictReaction).toBeUndefined();
	});

	test('⚠️ NOT emitted when two agents edit different files', () => {
		const hb1 = makeHeartbeat('backend', 'blue', 'editing schema.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb1);
		collector.events.length = 0;

		const hb2 = makeHeartbeat('frontend', 'green', 'editing routes.ts', '2026-03-09T10:05:20.000Z');
		processor.injectEvent(hb2);

		const reacts = reactions(collector.events);
		const conflictReaction = reacts.find((r) => r.emoji === '⚠️');
		expect(conflictReaction).toBeUndefined();
	});

	test('⚠️ NOT emitted when edits are more than 60s apart', () => {
		const hb1 = makeHeartbeat('backend', 'blue', 'editing schema.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb1);
		collector.events.length = 0;

		// 90s later — outside window
		const hb2 = makeHeartbeat('frontend', 'green', 'editing schema.ts', '2026-03-09T10:06:30.000Z');
		processor.injectEvent(hb2);

		const reacts = reactions(collector.events);
		const conflictReaction = reacts.find((r) => r.emoji === '⚠️');
		expect(conflictReaction).toBeUndefined();
	});
});

// ─── Pattern 4: 📢 Completion broadcast ─────────────────────────────────

describe('Pattern 4: 📢 Completion broadcast', () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: 'config', previous: null, current: config });
		processor.processDelta({ type: 'tasks', previous: [], current: initialTasks });
		collector.events.length = 0;
	});

	test('📢 emitted when lead sends a broadcast containing completion keywords', async () => {
		// Lead sends to all 4 teammate inboxes (broadcast threshold = 3+ via hold window)
		// Lead→teammate messages go through the broadcast accumulator path.
		const broadcastMsg = {
			from: 'team-lead' as const,
			text: 'All tasks are complete and all tests passing — great work',
			summary: 'All done',
			timestamp: '2026-03-09T10:15:00.000Z',
			color: 'gold',
			read: false as const,
		};
		for (const inbox of ['backend', 'frontend', 'privacy', 'qa']) {
			processor.processDelta({
				type: 'inbox',
				agentName: inbox,
				previous: [],
				current: [broadcastMsg],
			});
		}

		// Wait for broadcast hold window
		await new Promise((resolve) => setTimeout(resolve, 600));

		const reacts = reactions(collector.events);
		const completionBroadcast = reacts.find((r) => r.emoji === '📢');
		expect(completionBroadcast).toBeDefined();
		expect(completionBroadcast!.fromAgent).toBe('team-lead');
	});

	test('📢 NOT emitted for a lead broadcast without completion keywords', async () => {
		const broadcastMsg = {
			from: 'team-lead' as const,
			text: 'Please proceed with the implementation',
			summary: 'In progress',
			timestamp: '2026-03-09T10:15:00.000Z',
			color: 'gold',
			read: false as const,
		};
		for (const inbox of ['backend', 'frontend', 'privacy', 'qa']) {
			processor.processDelta({
				type: 'inbox',
				agentName: inbox,
				previous: [],
				current: [broadcastMsg],
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 600));

		const reacts = reactions(collector.events);
		const completionBroadcast = reacts.find((r) => r.emoji === '📢');
		expect(completionBroadcast).toBeUndefined();
	});

	test('📢 NOT emitted for a non-broadcast message (single recipient)', async () => {
		// A lead→single teammate message appears in only 1 inbox → not a broadcast
		const singleMsg = {
			from: 'team-lead' as const,
			text: 'Great work, all tasks are done and tests passing',
			summary: 'Done',
			timestamp: '2026-03-09T10:15:00.000Z',
			color: 'gold',
			read: false as const,
		};
		processor.processDelta({
			type: 'inbox',
			agentName: 'backend',
			previous: [],
			current: [singleMsg],
		});

		// Wait for hold window
		await new Promise((resolve) => setTimeout(resolve, 600));

		const reacts = reactions(collector.events);
		const completionBroadcast = reacts.find((r) => r.emoji === '📢');
		expect(completionBroadcast).toBeUndefined();
	});
});

// ─── Pattern 5: 🔍 Research phase ─────────────────────────────────────────

describe('Pattern 5: 🔍 Research phase', () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: 'config', previous: null, current: config });
		collector.events.length = 0;
	});

	test('🔍 emitted on first read-only heartbeat before any writes', () => {
		const hb = makeHeartbeat('backend', 'blue', 'reading schema.ts, searching', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb);

		const reacts = reactions(collector.events);
		const researchReaction = reacts.find((r) => r.emoji === '🔍');
		expect(researchReaction).toBeDefined();
		expect(researchReaction!.targetMessageId).toBe(hb.id);
		expect(researchReaction!.fromAgent).toBe('backend');
	});

	test('🔍 emitted only once per agent (not on subsequent read-only heartbeats)', () => {
		const hb1 = makeHeartbeat('backend', 'blue', 'reading schema.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb1);

		const hb2 = makeHeartbeat('backend', 'blue', 'searching patterns', '2026-03-09T10:05:30.000Z');
		processor.injectEvent(hb2);

		const allReacts = reactions(collector.events);
		const researchReactions = allReacts.filter((r) => r.emoji === '🔍');
		expect(researchReactions).toHaveLength(1);
		expect(researchReactions[0]!.targetMessageId).toBe(hb1.id);
	});

	test('🔍 NOT emitted when first heartbeat already has writes', () => {
		const hb = makeHeartbeat('backend', 'blue', 'writing schema.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb);

		const reacts = reactions(collector.events);
		const researchReaction = reacts.find((r) => r.emoji === '🔍');
		expect(researchReaction).toBeUndefined();
	});

	test('🔍 NOT emitted when heartbeat has both reads and writes', () => {
		const hb = makeHeartbeat('backend', 'blue', 'reading config.ts, writing schema.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb);

		const reacts = reactions(collector.events);
		const researchReaction = reacts.find((r) => r.emoji === '🔍');
		expect(researchReaction).toBeUndefined();
	});
});

// ─── Pattern 6: 📝 Build phase ───────────────────────────────────────────

describe('Pattern 6: 📝 Build phase', () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: 'config', previous: null, current: config });
		collector.events.length = 0;
	});

	test('📝 emitted on first write heartbeat after a research phase', () => {
		// First: research heartbeat
		const hb1 = makeHeartbeat('frontend', 'green', 'reading components.tsx, searching', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb1);

		// Verify 🔍 was emitted
		const researchReacts = reactions(collector.events).filter((r) => r.emoji === '🔍');
		expect(researchReacts).toHaveLength(1);
		collector.events.length = 0;

		// Then: write heartbeat — triggers 📝
		const hb2 = makeHeartbeat('frontend', 'green', 'writing Dashboard.tsx', '2026-03-09T10:06:00.000Z');
		processor.injectEvent(hb2);

		const reacts = reactions(collector.events);
		const buildReaction = reacts.find((r) => r.emoji === '📝');
		expect(buildReaction).toBeDefined();
		expect(buildReaction!.targetMessageId).toBe(hb2.id);
		expect(buildReaction!.fromAgent).toBe('frontend');
	});

	test('📝 emitted only once per agent (not on subsequent write heartbeats)', () => {
		// Research phase first
		const hb1 = makeHeartbeat('frontend', 'green', 'reading components.tsx', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb1);

		// First write — should emit 📝
		const hb2 = makeHeartbeat('frontend', 'green', 'writing Dashboard.tsx', '2026-03-09T10:06:00.000Z');
		processor.injectEvent(hb2);

		// Second write — should NOT emit 📝 again
		const hb3 = makeHeartbeat('frontend', 'green', 'editing Dashboard.tsx', '2026-03-09T10:07:00.000Z');
		processor.injectEvent(hb3);

		const allReacts = reactions(collector.events);
		const buildReactions = allReacts.filter((r) => r.emoji === '📝');
		expect(buildReactions).toHaveLength(1);
		expect(buildReactions[0]!.targetMessageId).toBe(hb2.id);
	});

	test('📝 NOT emitted when agent starts writing without a research phase', () => {
		// Agent jumps straight to writing — no prior 🔍
		const hb = makeHeartbeat('qa', 'yellow', 'writing test.spec.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(hb);

		const reacts = reactions(collector.events);
		const buildReaction = reacts.find((r) => r.emoji === '📝');
		expect(buildReaction).toBeUndefined();
	});

	test('different agents have independent research/build phase tracking', () => {
		// backend does research
		const bkHb1 = makeHeartbeat('backend', 'blue', 'reading schema.ts', '2026-03-09T10:05:00.000Z');
		processor.injectEvent(bkHb1);

		// frontend starts writing (no research phase)
		const feHb1 = makeHeartbeat('frontend', 'green', 'writing App.tsx', '2026-03-09T10:05:05.000Z');
		processor.injectEvent(feHb1);

		// backend starts writing (after research phase)
		const bkHb2 = makeHeartbeat('backend', 'blue', 'writing migration.ts', '2026-03-09T10:06:00.000Z');
		processor.injectEvent(bkHb2);

		const allReacts = reactions(collector.events);

		// 🔍 only for backend
		const researchReactions = allReacts.filter((r) => r.emoji === '🔍');
		expect(researchReactions).toHaveLength(1);
		expect(researchReactions[0]!.fromAgent).toBe('backend');

		// 📝 only for backend (frontend had no research phase)
		const buildReactions = allReacts.filter((r) => r.emoji === '📝');
		expect(buildReactions).toHaveLength(1);
		expect(buildReactions[0]!.fromAgent).toBe('backend');
		expect(buildReactions[0]!.targetMessageId).toBe(bkHb2.id);
	});
});
