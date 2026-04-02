/**
 * Integration tests: Feed Dedup — 9 rules cutting redundant events.
 *
 * Each test focuses on a specific dedup rule and verifies that:
 * - Redundant events are suppressed
 * - The primary (non-redundant) event is still emitted
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type {
	ChatEvent,
	ContentMessage,
	SystemEvent,
	ReactionEvent,
	TaskUpdate,
	ThreadMarker,
} from "../../src/shared/types.js";
import { config } from "../data/config.js";
import { initialTasks, taskSnapshots } from "../data/tasks.js";
import { events as fixtureEvents } from "../data/events.js";
import type { RawInboxMessage } from "../../src/shared/types.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

// ============================================================================
// Rule 2: Suppress task-update(pending) when task-created system event exists
// ============================================================================
describe("Rule 2: suppress task-update(pending) on task creation", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
	});

	test("task creation emits system event but NOT task-update for pending tasks", () => {
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });

		const taskCreated = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-created",
		);
		expect(taskCreated).toHaveLength(8);

		// No task-update events for pending tasks (covered by task-created system events)
		const taskUpdates = collector.events.filter(
			(e) => e.type === "task-update",
		) as TaskUpdate[];
		const pendingUpdates = taskUpdates.filter((u) => u.task.status === "pending");
		expect(pendingUpdates).toHaveLength(0);
	});

	test("task-created system event carries task id and subject", () => {
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });

		const taskCreated = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-created",
		) as SystemEvent[];

		const task1 = taskCreated.find((e) => e.taskId === "1");
		expect(task1).toBeDefined();
		expect(task1!.taskSubject).toContain("schema");
	});
});

// ============================================================================
// Rule 3: Suppress task-update(in_progress) when task-claimed system event exists
// ============================================================================
describe("Rule 3: suppress task-update(in_progress) on task claim", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
		collector.events.length = 0;
	});

	test("task claim emits system event but NOT task-update for in_progress", () => {
		processor.processDelta({
			type: "tasks",
			previous: initialTasks,
			current: taskSnapshots[1]!.tasks, // backend claims #1
		});

		// task-claimed system event IS emitted
		const taskClaimed = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-claimed",
		) as SystemEvent[];
		expect(taskClaimed).toHaveLength(1);
		expect(taskClaimed[0]!.agentName).toBe("backend");
		expect(taskClaimed[0]!.taskId).toBe("1");

		// task-update for in_progress is suppressed
		const taskUpdates = collector.events.filter(
			(e) => e.type === "task-update",
		) as TaskUpdate[];
		const inProgressUpdate = taskUpdates.find(
			(u) => u.task.id === "1" && u.task.status === "in_progress",
		);
		expect(inProgressUpdate).toBeUndefined();
	});

	test("getTasks() reflects current state even without task-update events", () => {
		processor.processDelta({
			type: "tasks",
			previous: initialTasks,
			current: taskSnapshots[1]!.tasks,
		});

		const tasks = processor.getTasks();
		const task1 = tasks.find((t) => t.id === "1");
		expect(task1!.status).toBe("in_progress");
		expect(task1!.owner).toBe("backend");
	});
});

// ============================================================================
// Rule 4: Suppress task-update(completed) when task-completed system event exists
// ============================================================================
describe("Rule 4: suppress task-update(completed) on task completion", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
		// Feed snapshots up to task completion (snapshot 3: backend completes #1)
		for (let i = 1; i <= 2; i++) {
			processor.processDelta({
				type: "tasks",
				previous: taskSnapshots[i - 1]!.tasks,
				current: taskSnapshots[i]!.tasks,
			});
		}
		collector.events.length = 0;
	});

	test("task completion emits system event but NOT task-update for completed", () => {
		// Snapshot 3: backend completes #1
		processor.processDelta({
			type: "tasks",
			previous: taskSnapshots[2]!.tasks,
			current: taskSnapshots[3]!.tasks,
		});

		// task-completed system event IS emitted
		const taskCompleted = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-completed",
		) as SystemEvent[];
		expect(taskCompleted.length).toBeGreaterThanOrEqual(1);

		// task-update for completed is suppressed
		const taskUpdates = collector.events.filter(
			(e) => e.type === "task-update",
		) as TaskUpdate[];
		const completedUpdate = taskUpdates.find(
			(u) => u.task.id === "1" && u.task.status === "completed",
		);
		expect(completedUpdate).toBeUndefined();
	});
});

// ============================================================================
// Rule 7: Suppress thread-start markers — DM message signals thread start
// ============================================================================
describe("Rule 7: suppress thread-start markers from DM flow", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("DM flow does NOT emit thread-start markers", () => {
		const dmEvent = fixtureEvents.find(
			(e) => e.label === "Backend DMs schema to frontend",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dmEvent.message],
		});

		// No thread-marker events at all
		const markers = collector.events.filter(
			(e) => e.type === "thread-marker",
		) as ThreadMarker[];
		expect(markers).toHaveLength(0);

		// But the DM content message IS emitted
		const messages = collector.events.filter((e) => e.type === "message") as ContentMessage[];
		expect(messages).toHaveLength(1);
		expect(messages[0]!.isDM).toBe(true);
		expect(messages[0]!.from).toBe("backend");
	});

	test("consecutive DMs in same thread produce no thread-start markers", () => {
		const dm1 = fixtureEvents.find(
			(e) => e.label === "Frontend DMs privacy about masking",
		)!;
		const dm2 = fixtureEvents.find(
			(e) => e.label === "Privacy explains masking to frontend",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "privacy",
			previous: [],
			current: [dm1.message],
		});
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dm2.message],
		});

		const markers = collector.events.filter(
			(e) => e.type === "thread-marker",
		);
		expect(markers).toHaveLength(0);

		// Both DM messages emitted
		const messages = collector.events.filter((e) => e.type === "message");
		expect(messages).toHaveLength(2);
	});
});

// ============================================================================
// Rule 8: Suppress ✋ reaction on lead message for task-claimed
// ============================================================================
describe("Rule 8a: suppress ✋ reaction on task claim", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
	});

	test("task claim does NOT emit ✋ reaction (system event conveys same info)", async () => {
		// Feed lead broadcast so there's a lead message to react to
		const assignment = fixtureEvents.find(
			(e) => e.label === "Lead assigns work (broadcast)",
		)!;
		for (const inbox of assignment.inboxes) {
			processor.processDelta({
				type: "inbox",
				agentName: inbox,
				previous: [],
				current: [assignment.message],
			});
		}
		await new Promise((resolve) => setTimeout(resolve, 600));
		collector.events.length = 0;

		// Simulate task claim
		processor.processDelta({
			type: "tasks",
			previous: initialTasks,
			current: taskSnapshots[1]!.tasks, // backend claims #1
		});

		const reactions = collector.events.filter(
			(e) => e.type === "reaction",
		) as ReactionEvent[];
		const handRaise = reactions.find((r) => r.emoji === "✋");
		expect(handRaise).toBeUndefined();

		// task-claimed system event IS emitted
		const claimed = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-claimed",
		);
		expect(claimed).toHaveLength(1);
	});
});

// ============================================================================
// Rule 8: Suppress 👋 reaction on shutdown-requested for shutdown-approved
// ============================================================================
describe("Rule 8b: suppress 👋 reaction on shutdown approval", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("shutdown approval does NOT emit 👋 reaction (system event conveys same info)", () => {
		const shutdownReq = fixtureEvents.find(
			(e) => e.label === "Shutdown request to backend",
		)!;
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [shutdownReq.message],
		});

		const shutdownApproval = fixtureEvents.find(
			(e) => e.label === "Backend approves shutdown",
		)!;
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [shutdownApproval.message],
		});

		const reactions = collector.events.filter(
			(e) => e.type === "reaction",
		) as ReactionEvent[];
		const waveReaction = reactions.find((r) => r.emoji === "👋");
		expect(waveReaction).toBeUndefined();

		// shutdown-approved system event IS emitted
		const approved = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "shutdown-approved",
		);
		expect(approved).toHaveLength(1);
	});
});

// ============================================================================
// Rule 9: Collapse consecutive pending task-updates for same task
// ============================================================================
describe("Rule 9: collapse consecutive pending task-updates for same task", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		// Set up initial tasks (Rule 2 suppresses initial task-updates)
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
		collector.events.length = 0;
	});

	test("multiple identical pending task-updates for same task collapse to zero", () => {
		// Simulate dependency churn: task changes blockedBy twice while still pending
		const task1Variant1 = initialTasks.map((t) =>
			t.id === "2"
				? { ...t, blockedBy: ["1"], updated: "2026-03-09T10:01:00.000Z" }
				: t,
		);
		const task1Variant2 = initialTasks.map((t) =>
			t.id === "2"
				? { ...t, blockedBy: ["1"], updated: "2026-03-09T10:01:00.000Z" }
				: t,
		);

		// First change: should emit task-update (new pending key)
		processor.processDelta({
			type: "tasks",
			previous: initialTasks,
			current: task1Variant1,
		});

		const firstUpdates = collector.events.filter(
			(e) => e.type === "task-update",
		) as TaskUpdate[];
		const firstTask2Update = firstUpdates.find((u) => u.task.id === "2");
		// First time we see this pending state — may emit
		collector.events.length = 0;

		// Second identical change: should suppress (same pending fingerprint)
		processor.processDelta({
			type: "tasks",
			previous: task1Variant1,
			current: task1Variant2,
		});

		const secondUpdates = collector.events.filter(
			(e) => e.type === "task-update",
		) as TaskUpdate[];
		const secondTask2Update = secondUpdates.find((u) => u.task.id === "2");
		// Identical state — should be suppressed
		expect(secondTask2Update).toBeUndefined();
	});

	test("different pending states (different blockedBy) are each emitted once", () => {
		// First pending state: blockedBy changes
		const variant1 = initialTasks.map((t) =>
			t.id === "6"
				? { ...t, blockedBy: ["2", "3", "4"], updated: "2026-03-09T10:01:00.000Z" }
				: t,
		);
		// Second pending state: different updated timestamp + different blockedBy
		const variant2 = initialTasks.map((t) =>
			t.id === "6"
				? { ...t, blockedBy: ["2", "3"], updated: "2026-03-09T10:02:00.000Z" }
				: t,
		);

		processor.processDelta({ type: "tasks", previous: initialTasks, current: variant1 });
		collector.events.length = 0;

		processor.processDelta({ type: "tasks", previous: variant1, current: variant2 });

		const updates = collector.events.filter(
			(e) => e.type === "task-update",
		) as TaskUpdate[];
		// Different state fingerprint — should emit
		const task6Update = updates.find((u) => u.task.id === "6");
		expect(task6Update).toBeDefined();
	});
});

// ============================================================================
// Rule 6: Suppress DMs when identical broadcast exists within 1s
// ============================================================================
describe("Rule 6: suppress DMs when matching broadcast already emitted", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("DMs with unique text+timestamp are NOT suppressed by broadcast", () => {
		// Normal DM — no broadcast with same text+timestamp
		const dmEvent = fixtureEvents.find(
			(e) => e.label === "Backend DMs schema to frontend",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dmEvent.message],
		});

		const messages = collector.events.filter((e) => e.type === "message");
		expect(messages).toHaveLength(1);
	});

	test("DM matching a previously emitted broadcast is suppressed", async () => {
		// First, emit a broadcast (lead → 4 teammates = broadcast)
		const assignment = fixtureEvents.find(
			(e) => e.label === "Lead assigns work (broadcast)",
		)!;
		for (const inbox of assignment.inboxes) {
			processor.processDelta({
				type: "inbox",
				agentName: inbox,
				previous: [],
				current: [assignment.message],
			});
		}

		// Wait for broadcast finalization
		await new Promise((resolve) => setTimeout(resolve, 600));
		collector.events.length = 0;

		// Now try to emit the same message as a DM (same text+timestamp)
		// This simulates a duplicate arriving after the broadcast was already emitted
		const dupMsg: RawInboxMessage = {
			...assignment.message,
		};

		// emitDM is called when teammate→teammate, but the broadcast key check
		// uses text+timestamp. Since this has the same text+timestamp, it should be suppressed.
		// We simulate this by sending the same message to frontend inbox (teammate→teammate path).
		// Note: the lead's text won't go through emitDM for teammate inboxes directly,
		// but we can test the mechanism by calling with a teammate sender.
		// The rule prevents DMs when broadcast was already emitted with same text+timestamp.
		const sameMsgFromTeammate: RawInboxMessage = {
			from: "backend",
			text: assignment.message.text,
			timestamp: assignment.message.timestamp,
			color: "blue",
			read: false,
		};

		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [sameMsgFromTeammate],
		});

		const messages = collector.events.filter((e) => e.type === "message");
		// The DM should be suppressed since a broadcast with this text+timestamp was emitted
		expect(messages).toHaveLength(0);
	});

	test("DM sent >1s after a matching broadcast is NOT suppressed", async () => {
		// Emit a broadcast (lead → 4 teammates = broadcast)
		const assignment = fixtureEvents.find(
			(e) => e.label === "Lead assigns work (broadcast)",
		)!;
		for (const inbox of assignment.inboxes) {
			processor.processDelta({
				type: "inbox",
				agentName: inbox,
				previous: [],
				current: [assignment.message],
			});
		}

		// Wait for broadcast finalization
		await new Promise((resolve) => setTimeout(resolve, 600));
		collector.events.length = 0;

		// Same text but timestamp is >1s later — outside the suppression window
		const laterTimestamp = new Date(
			new Date(assignment.message.timestamp).getTime() + 2000,
		).toISOString();

		const laterDM: RawInboxMessage = {
			from: "backend",
			text: assignment.message.text,
			timestamp: laterTimestamp,
			color: "blue",
			read: false,
		};

		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [laterDM],
		});

		const messages = collector.events.filter((e) => e.type === "message");
		// Timestamp is >1s away from broadcast — should NOT be suppressed
		expect(messages).toHaveLength(1);
	});
});
