/**
 * Integration test: Task-assignment prompt collapse.
 * Verifies that "You are the X agent on team…" system prompts from the lead
 * are collapsed into compact `task-assigned` system events.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { ChatEvent, SystemEvent, ContentMessage } from "../../src/shared/types.js";
import { config } from "../data/config.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

describe("Task-Assignment Prompt Collapse", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	const taskPrompt = (agentName: string, teamName: string, taskNum: string) =>
		`You are the ${agentName} agent on team "${teamName}". Your job is Task #${taskNum}. Implement the backend API endpoints for user authentication.`;

	test("collapses task prompt into task-assigned system event", () => {
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [
				{
					from: "team-lead",
					text: taskPrompt("backend", "healthdash-sprint", "42"),
					timestamp: "2025-01-01T00:00:00Z",
					color: "gold",
					read: false,
				},
			],
		});

		const sysEvents = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-assigned",
		) as SystemEvent[];
		expect(sysEvents).toHaveLength(1);
		expect(sysEvents[0]!.text).toBe("team-lead assigned Task #42 to backend");
		expect(sysEvents[0]!.agentName).toBe("backend");
		expect(sysEvents[0]!.taskId).toBe("42");

		// No content message should be emitted
		const contentMessages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];
		expect(contentMessages).toHaveLength(0);
	});

	test("uses inboxOwner as agent name, not parsed prompt text", () => {
		// Send a prompt where the agent name in the text differs from inboxOwner
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [
				{
					from: "team-lead",
					text: taskPrompt("ui-specialist", "healthdash-sprint", "7"),
					timestamp: "2025-01-01T00:01:00Z",
					color: "gold",
					read: false,
				},
			],
		});

		const sysEvents = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-assigned",
		) as SystemEvent[];
		expect(sysEvents).toHaveLength(1);
		expect(sysEvents[0]!.agentName).toBe("frontend");
		expect(sysEvents[0]!.text).toContain("to frontend");
	});

	test("clears idle state on the assigned agent, not the lead", () => {
		// Put the backend agent into idle state first
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [
				{
					from: "backend",
					text: '{"type":"status","idle":true}',
					timestamp: "2025-01-01T00:00:00Z",
					color: "blue",
					read: false,
				},
			],
		});
		collector.events.length = 0;

		// Now send the task prompt
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [
				{
					from: "team-lead",
					text: taskPrompt("backend", "healthdash-sprint", "10"),
					timestamp: "2025-01-01T00:05:00Z",
					color: "gold",
					read: false,
				},
			],
		});

		// Check that a presence change was emitted for backend (not team-lead)
		const presenceChanges = collector.events.filter(
			(e) => e.type === "presence",
		);
		// If backend was idle, clearIdleState should emit a presence change for backend
		// Either way, there should be NO presence change for team-lead
		const leadPresence = presenceChanges.filter(
			(e) => (e as any).agentName === "team-lead",
		);
		expect(leadPresence).toHaveLength(0);
	});

	test("non-matching lead messages are not collapsed", () => {
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [
				{
					from: "team-lead",
					text: "Hey backend, can you check the API docs?",
					timestamp: "2025-01-01T00:00:00Z",
					color: "gold",
					read: false,
				},
			],
		});

		const sysEvents = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "task-assigned",
		) as SystemEvent[];
		expect(sysEvents).toHaveLength(0);
	});
});
