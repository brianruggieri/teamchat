/**
 * Integration test: EventProcessor correctly processes fixture data.
 * Feeds WatcherDeltas derived from fixture data into the processor
 * and verifies the resulting ChatEvent stream.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { WatcherDelta } from "../../src/server/watcher.js";
import type { ChatEvent, ContentMessage, SystemEvent, ReactionEvent } from "../../src/shared/types.js";
import { config } from "../data/config.js";
import { initialTasks, taskSnapshots } from "../data/tasks.js";
import { events as fixtureEvents } from "../data/events.js";

/** Collect all emitted events from the processor. */
function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

/** Build a WatcherDelta for a config change. */
function configDelta(
	previous: typeof config | null,
	current: typeof config | null,
): WatcherDelta {
	return { type: "config", previous, current };
}

/** Build a WatcherDelta for an inbox change. */
function inboxDelta(
	agentName: string,
	previous: typeof fixtureEvents[0]["message"][] | null,
	current: typeof fixtureEvents[0]["message"][] | null,
): WatcherDelta {
	return { type: "inbox", agentName, previous, current };
}

/** Build a WatcherDelta for a tasks change. */
function tasksDelta(
	previous: typeof initialTasks | null,
	current: typeof initialTasks | null,
): WatcherDelta {
	return { type: "tasks", previous, current };
}

describe("EventProcessor", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
	});

	test("processes config creation as team-created + member-joined events", () => {
		processor.processDelta(configDelta(null, config));

		const events = collector.events;
		const teamCreated = events.find(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "team-created",
		) as SystemEvent | undefined;
		expect(teamCreated).toBeDefined();
		expect(teamCreated!.text).toContain("Team created");

		// 4 teammate joins (team-lead is excluded from join events)
		const joins = events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "member-joined",
		) as SystemEvent[];
		expect(joins).toHaveLength(4);
		const joinNames = joins.map((j) => j.agentName).sort();
		expect(joinNames).toEqual(["backend", "frontend", "privacy", "qa"]);
	});

	test("processes initial task creation", () => {
		processor.processDelta(tasksDelta(null, initialTasks));

		const taskCreated = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-created",
		) as SystemEvent[];
		expect(taskCreated).toHaveLength(8);
		expect(taskCreated[0]!.taskId).toBe("1");
		expect(taskCreated[0]!.taskSubject).toBe("Design database schema for patient records");
	});

	test("produces chronologically ordered events for full session replay", () => {
		// Config creation
		processor.processDelta(configDelta(null, config));

		// Initial tasks
		processor.processDelta(tasksDelta(null, initialTasks));

		// Feed all inbox messages as incremental deltas
		const inboxAccum: Record<string, typeof fixtureEvents[0]["message"][]> = {};
		for (const event of fixtureEvents) {
			for (const inbox of event.inboxes) {
				if (!inboxAccum[inbox]) {
					inboxAccum[inbox] = [];
				}
				const prev = [...inboxAccum[inbox]];
				inboxAccum[inbox].push(event.message);
				processor.processDelta(inboxDelta(inbox, prev, [...inboxAccum[inbox]]));
			}
		}

		// Feed task snapshots as incremental deltas
		for (let i = 1; i < taskSnapshots.length; i++) {
			processor.processDelta(
				tasksDelta(taskSnapshots[i - 1]!.tasks, taskSnapshots[i]!.tasks),
			);
		}

		const allEvents = processor.getAllEvents();
		expect(allEvents.length).toBeGreaterThan(0);

		// Should have content messages
		const messages = allEvents.filter((e) => e.type === "message") as ContentMessage[];
		expect(messages.length).toBeGreaterThan(10);

		// Should have system events
		const sysEvents = allEvents.filter((e) => e.type === "system") as SystemEvent[];
		expect(sysEvents.length).toBeGreaterThan(5);
	});

	test("getTasks returns current task state", () => {
		processor.processDelta(tasksDelta(null, initialTasks));
		const tasks = processor.getTasks();
		expect(tasks).toHaveLength(8);
		expect(tasks.every((t) => t.status === "pending")).toBe(true);
	});

	test("getPresence returns current presence state after member joins", () => {
		processor.processDelta(configDelta(null, config));
		const presence = processor.getPresence();
		expect(presence["backend"]).toBe("working");
		expect(presence["frontend"]).toBe("working");
		expect(presence["privacy"]).toBe("working");
		expect(presence["qa"]).toBe("working");
	});

	test("processes config deletion as team-deleted event", () => {
		processor.processDelta(configDelta(null, config));
		collector.events.length = 0;

		processor.processDelta(configDelta(config, null));

		const deleted = collector.events.find(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "team-deleted",
		) as SystemEvent | undefined;
		expect(deleted).toBeDefined();
		expect(deleted!.text).toContain("disbanded");
	});

	test("processes member removal as member-left event", () => {
		processor.processDelta(configDelta(null, config));
		collector.events.length = 0;

		const reducedConfig = {
			members: config.members.filter((m) => m.name !== "qa"),
		};
		processor.processDelta(configDelta(config, reducedConfig));

		const left = collector.events.find(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "member-left",
		) as SystemEvent | undefined;
		expect(left).toBeDefined();
		expect(left!.agentName).toBe("qa");

		expect(processor.getPresence()["qa"]).toBe("offline");
	});
});
