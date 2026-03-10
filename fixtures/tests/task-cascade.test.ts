/**
 * Integration test: Task state changes, dependency tracking, and unblock cascades.
 * Verifies task claims, completions, all-tasks-completed, task updates,
 * and dependency unblock cascade events.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { ChatEvent, SystemEvent, TaskUpdate as TaskUpdateEvent } from "../../src/shared/types.js";
import { config } from "../data/config.js";
import { initialTasks, taskSnapshots } from "../data/tasks.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

/** Feed snapshots sequentially into the processor. */
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

describe("Task Cascade", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
		collector.events.length = 0;
	});

	test("task claim emits task-claimed system event", () => {
		feedSnapshotsUpTo(processor, 1);

		const claimed = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-claimed",
		) as SystemEvent[];

		expect(claimed).toHaveLength(1);
		expect(claimed[0]!.agentName).toBe("backend");
		expect(claimed[0]!.taskId).toBe("1");
		expect(claimed[0]!.text).toContain("backend claimed #1");
	});

	test("task completion emits task-completed system event", () => {
		feedSnapshotsUpTo(processor, 3);

		const completed = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-completed",
		) as SystemEvent[];

		const task1Completed = completed.find((c) => c.taskId === "1");
		expect(task1Completed).toBeDefined();
		expect(task1Completed!.text).toContain("completed #1");
	});

	test("multiple task claims across snapshots", () => {
		feedSnapshotsUpTo(processor, 4);

		const claimed = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-claimed",
		) as SystemEvent[];

		const claimedIds = claimed.map((c) => c.taskId).sort();
		// backend claims #1 (snap 1), privacy claims #4 (snap 2),
		// frontend claims #3 (snap 3), backend claims #2 (snap 4)
		expect(claimedIds).toEqual(["1", "2", "3", "4"]);
	});

	test("all-tasks-completed fires when last task completes", () => {
		feedSnapshotsUpTo(processor, 15);

		const allComplete = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "all-tasks-completed",
		) as SystemEvent[];

		expect(allComplete).toHaveLength(1);
		expect(allComplete[0]!.text).toContain("All 8 tasks completed");
	});

	test("all-tasks-completed includes celebration reaction", () => {
		feedSnapshotsUpTo(processor, 15);

		const reactions = collector.events.filter((e) => e.type === "reaction");
		const celebrationReaction = reactions.find(
			(r) => (r as { emoji: string }).emoji === "\uD83C\uDF89",
		);
		expect(celebrationReaction).toBeDefined();
	});

	test("task-update events include full task state", () => {
		feedSnapshotsUpTo(processor, 1);

		const taskUpdates = collector.events.filter(
			(e) => e.type === "task-update",
		) as TaskUpdateEvent[];

		expect(taskUpdates.length).toBeGreaterThanOrEqual(1);
		const task1Update = taskUpdates.find((u) => u.task.id === "1");
		expect(task1Update).toBeDefined();
		expect(task1Update!.task.status).toBe("in_progress");
		expect(task1Update!.task.owner).toBe("backend");
	});

	test("task-update emitted for each changed task", () => {
		// Snapshot 3: #1 completes AND #3 claimed — two changes
		feedSnapshotsUpTo(processor, 3);

		const taskUpdates = collector.events.filter(
			(e) => e.type === "task-update",
		) as TaskUpdateEvent[];

		// Should have updates for all tasks that changed across snapshots 1-3
		const updatedIds = new Set(taskUpdates.map((u) => u.task.id));
		expect(updatedIds.has("1")).toBe(true); // claimed then completed
		expect(updatedIds.has("3")).toBe(true); // claimed
		expect(updatedIds.has("4")).toBe(true); // claimed by privacy
	});

	test("getTasks returns current state after processing", () => {
		feedSnapshotsUpTo(processor, 5);

		const tasks = processor.getTasks();
		expect(tasks).toHaveLength(8);

		const task2 = tasks.find((t) => t.id === "2");
		expect(task2!.status).toBe("completed");
		expect(task2!.owner).toBe("backend");

		const task6 = tasks.find((t) => t.id === "6");
		expect(task6!.status).toBe("pending");
	});

	test("all tasks show completed after full session", () => {
		feedSnapshotsUpTo(processor, 15);

		const tasks = processor.getTasks();
		expect(tasks).toHaveLength(8);
		expect(tasks.every((t) => t.status === "completed")).toBe(true);
	});

	test("completing #1 unblocks #2, #3, #4", () => {
		// Feed snapshots through #1 completion (snapshot 3)
		feedSnapshotsUpTo(processor, 3);

		const unblocked = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-unblocked",
		) as SystemEvent[];

		// Tasks #2, #4 are blocked only by #1 and still pending at the moment of completion
		// #3 gets claimed in the same snapshot so it transitions to in_progress
		const unblockedIds = unblocked.map((u) => u.taskId).sort();
		expect(unblockedIds).toContain("2");
		expect(unblockedIds).toContain("4");
	});

	test("completing #4 unblocks #5", () => {
		// Feed through snapshot 6 (privacy completes #4)
		feedSnapshotsUpTo(processor, 6);

		const unblocked = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-unblocked",
		) as SystemEvent[];

		const task5Unblocked = unblocked.find((u) => u.taskId === "5");
		expect(task5Unblocked).toBeDefined();
		expect(task5Unblocked!.text).toContain("#5 unblocked");
	});

	test("completing last blocker fully unblocks dependent task", () => {
		// Feed through snapshot 8 (frontend completes #3)
		// #6 blocked by #2, #3, #4 — all complete by snapshot 8
		// #7 blocked by #3 — complete by snapshot 8
		feedSnapshotsUpTo(processor, 8);

		const unblocked = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-unblocked",
		) as SystemEvent[];

		const task6Unblocked = unblocked.find((u) => u.taskId === "6");
		expect(task6Unblocked).toBeDefined();

		const task7Unblocked = unblocked.find((u) => u.taskId === "7");
		expect(task7Unblocked).toBeDefined();
	});

	test("partial unblock does not emit task-unblocked", () => {
		// Feed through snapshot 5 (#2 completed, but #3 and #4 not yet done)
		feedSnapshotsUpTo(processor, 5);

		const unblocked = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-unblocked",
		) as SystemEvent[];

		// #6 should NOT be unblocked (still needs #3, #4)
		const task6Unblocked = unblocked.find((u) => u.taskId === "6");
		expect(task6Unblocked).toBeUndefined();

		// #8 should NOT be unblocked (needs #4, #5, #6)
		const task8Unblocked = unblocked.find((u) => u.taskId === "8");
		expect(task8Unblocked).toBeUndefined();
	});
});
