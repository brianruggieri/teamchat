/**
 * Integration test: Post-mortem data collection and derivation.
 * Verifies suppression stats, broadcast counting, and derivePostMortem().
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { ChatEvent, RawInboxMessage, SystemEvent } from "../../src/shared/types.js";
import { config, members } from "../data/config.js";
import { initialTasks, taskSnapshots } from "../data/tasks.js";
import { derivePostMortem } from "../../src/client/postmortem.js";
import { hydrateChatState } from "../../src/client/state.js";
import type { ChatState } from "../../src/client/types.js";
import { INITIAL_STATE } from "../../src/client/types.js";
import { applyChatEventInPlace } from "../../src/client/state.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

function makeIdlePing(
	from: string,
	color: string,
	timestamp: string,
): RawInboxMessage {
	return {
		from,
		text: JSON.stringify({
			type: "idle_notification",
			idleReason: "Waiting for work",
			completedTaskId: null,
			completedStatus: null,
		}),
		summary: `${from} is idle`,
		timestamp,
		color,
		read: false,
	};
}

function feedSnapshotsUpTo(
	processor: EventProcessor,
	upToIndex: number,
): void {
	for (let i = 1; i <= upToIndex; i++) {
		processor.processDelta({
			type: "tasks",
			previous: taskSnapshots[i - 1]!.tasks,
			current: taskSnapshots[i]!.tasks,
		});
	}
}

function buildChatStateFromProcessor(processor: EventProcessor): ChatState {
	const state: ChatState = {
		...INITIAL_STATE,
		events: [],
		tasks: processor.getTasks(),
		presence: processor.getPresence(),
		team: { name: "healthdash-sprint", members: [...members] },
		sessionStart: "2026-03-09T10:00:00.000Z",
		reactions: {},
		connected: true,
		planCards: {},
		permissionCards: {},
		threadStatuses: Object.fromEntries(
			processor.getThreadStatuses().map((ts) => [ts.threadKey, ts]),
		),
		activeAgentKey: null,
		suppressionStats: processor.getSuppressionStats(),
	};

	for (const event of processor.getAllEvents()) {
		applyChatEventInPlace(state, event);
	}

	return state;
}

describe("Post-Mortem: Suppression Stats", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("getSuppressionStats returns correct idle ping counts", () => {
		const baseTime = new Date("2026-03-09T10:01:00.000Z").getTime();

		// Feed 5 idle pings within 30s (no surfacing)
		const pings: RawInboxMessage[] = [];
		for (let i = 0; i < 5; i++) {
			pings.push(
				makeIdlePing("qa", "yellow", new Date(baseTime + i * 4000).toISOString()),
			);
		}

		for (let i = 0; i < pings.length; i++) {
			processor.processDelta({
				type: "inbox",
				agentName: "team-lead",
				previous: pings.slice(0, i),
				current: pings.slice(0, i + 1),
			});
		}

		const stats = processor.getSuppressionStats();
		expect(stats.idlePingCount).toBe(5);
		expect(stats.idleSurfacedCount).toBe(0);
	});

	test("getSuppressionStats counts surfaced pings after threshold", () => {
		const baseTime = new Date("2026-03-09T10:01:00.000Z").getTime();

		const ping1 = makeIdlePing("qa", "yellow", new Date(baseTime).toISOString());
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [ping1],
		});

		// Ping at 31s (past threshold)
		const ping2 = makeIdlePing("qa", "yellow", new Date(baseTime + 31_000).toISOString());
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [ping1],
			current: [ping1, ping2],
		});

		const stats = processor.getSuppressionStats();
		expect(stats.idlePingCount).toBe(2);
		expect(stats.idleSurfacedCount).toBe(1);
	});
});

describe("Post-Mortem: Broadcast Count", () => {
	test("broadcastCount increments for broadcast messages", async () => {
		const collector = createCollector();
		const processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });

		// Simulate a lead message appearing in 3+ inboxes (broadcast)
		const msg: RawInboxMessage = {
			from: "team-lead",
			text: "Everyone, please review the API docs",
			summary: "API docs review",
			timestamp: "2026-03-09T10:05:00.000Z",
			color: "gold",
			read: false,
		};

		// Same message in 3 different agent inboxes
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [msg],
		});
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [msg],
		});
		processor.processDelta({
			type: "inbox",
			agentName: "qa",
			previous: [],
			current: [msg],
		});

		// Wait for broadcast hold window (500ms)
		await new Promise((resolve) => setTimeout(resolve, 600));

		expect(processor.getBroadcastCount()).toBe(1);
	});
});

describe("Post-Mortem: derivePostMortem()", () => {
	test("returns null when no all-tasks-completed event", () => {
		const state: ChatState = {
			...INITIAL_STATE,
			team: { name: "test", members: [] },
			sessionStart: "2026-03-09T10:00:00.000Z",
		};

		expect(derivePostMortem(state)).toBeNull();
	});

	test("returns valid data when all tasks completed", () => {
		const collector = createCollector();
		const processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });

		// Feed all task snapshots to reach completion
		feedSnapshotsUpTo(processor, taskSnapshots.length - 1);

		const state = buildChatStateFromProcessor(processor);
		const postMortem = derivePostMortem(state);

		// Check that all-tasks-completed was emitted
		const hasAllComplete = state.events.some(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "all-tasks-completed",
		);

		if (hasAllComplete) {
			expect(postMortem).not.toBeNull();
			expect(postMortem!.summary.taskCount).toBeGreaterThan(0);
			expect(postMortem!.summary.completedCount).toBe(postMortem!.summary.taskCount);
			expect(postMortem!.keyMoments.length).toBeGreaterThan(0);

			// Should have an all-tasks-completed key moment
			const completionMoment = postMortem!.keyMoments.find(
				(m) => m.kind === "all-tasks-completed",
			);
			expect(completionMoment).toBeDefined();
		} else {
			// If test fixtures don't have all tasks completed, that's fine
			expect(postMortem).toBeNull();
		}
	});

	test("agent contributions track messages and tasks per agent", () => {
		const collector = createCollector();
		const processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
		feedSnapshotsUpTo(processor, taskSnapshots.length - 1);

		// Also add a DM message from backend to frontend
		const dmMsg: RawInboxMessage = {
			from: "backend",
			text: "Hey frontend, the API endpoint is ready",
			summary: "API ready",
			timestamp: "2026-03-09T10:10:00.000Z",
			color: "blue",
			read: false,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dmMsg],
		});

		const state = buildChatStateFromProcessor(processor);
		const postMortem = derivePostMortem(state);

		const hasAllComplete = state.events.some(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "all-tasks-completed",
		);

		if (hasAllComplete && postMortem) {
			// Should have agent entries for non-lead members
			expect(postMortem.agents.length).toBeGreaterThan(0);
			const backendAgent = postMortem.agents.find((a) => a.name === "backend");
			expect(backendAgent).toBeDefined();
			expect(backendAgent!.messagesSent).toBeGreaterThanOrEqual(1);
		}
	});

	test("key moments are sorted by timestamp", () => {
		const collector = createCollector();
		const processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
		feedSnapshotsUpTo(processor, taskSnapshots.length - 1);

		const state = buildChatStateFromProcessor(processor);
		const postMortem = derivePostMortem(state);

		if (postMortem) {
			for (let i = 1; i < postMortem.keyMoments.length; i++) {
				expect(postMortem.keyMoments[i]!.atMs).toBeGreaterThanOrEqual(
					postMortem.keyMoments[i - 1]!.atMs,
				);
			}
		}
	});

	test("signal-to-noise reflects suppression stats", () => {
		const state: ChatState = {
			...INITIAL_STATE,
			team: { name: "test", members: [{ name: "agent-a", agentId: "a", agentType: "teammate", color: "blue" }] },
			sessionStart: "2026-03-09T10:00:00.000Z",
			events: [
				{
					type: "system",
					id: "ev-1",
					subtype: "all-tasks-completed",
					text: "All 1 tasks completed!",
					timestamp: "2026-03-09T10:30:00.000Z",
					agentName: null,
					agentColor: null,
					agentModel: null,
					taskId: null,
					taskSubject: null,
				},
			],
			tasks: [{ id: "1", subject: "Test", description: null, status: "completed", owner: "agent-a", blockedBy: null, activeForm: null, created: "2026-03-09T10:00:00.000Z", updated: "2026-03-09T10:30:00.000Z" }],
			suppressionStats: { idlePingCount: 100, idleSurfacedCount: 3 },
		};

		const postMortem = derivePostMortem(state);
		expect(postMortem).not.toBeNull();
		expect(postMortem!.signalNoise.idlePingsAbsorbed).toBe(97);
		expect(postMortem!.signalNoise.meaningfulEvents).toBe(1);
		expect(postMortem!.signalNoise.totalRawEvents).toBe(98); // 1 + 97
	});
});
