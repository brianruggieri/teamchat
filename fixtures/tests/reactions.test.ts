/**
 * Integration test: Reaction correlation.
 * Verifies that protocol events (task claims, plan approvals, permission
 * requests, shutdown approvals) produce the correct reactions on the
 * correct target messages.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { ChatEvent, ContentMessage, ReactionEvent, SystemEvent } from "../../src/shared/types.js";
import { config } from "../data/config.js";
import { initialTasks, taskSnapshots } from "../data/tasks.js";
import { events as fixtureEvents } from "../data/events.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

describe("Reactions", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
		collector.events.length = 0;
	});

	test("plan_approval_request renders as a plan message", () => {
		const planRequest = fixtureEvents.find(
			(e) => e.label === "Privacy submits encryption plan",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [planRequest.message],
		});

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];

		expect(messages).toHaveLength(1);
		expect(messages[0]!.from).toBe("privacy");
		expect(messages[0]!.text).toContain("PLAN");
		expect(messages[0]!.text).toContain("Encryption Strategy");
	});

	test("plan_approval_response produces thumbs-up reaction on plan message", () => {
		// First, feed the plan request so the processor knows about the plan message
		const planRequest = fixtureEvents.find(
			(e) => e.label === "Privacy submits encryption plan",
		)!;
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [planRequest.message],
		});

		// Now feed the approval response
		const planApproval = fixtureEvents.find(
			(e) => e.label === "Lead approves privacy plan",
		)!;
		processor.processDelta({
			type: "inbox",
			agentName: "privacy",
			previous: [],
			current: [planApproval.message],
		});

		const reactions = collector.events.filter(
			(e) => e.type === "reaction",
		) as ReactionEvent[];

		const thumbsUp = reactions.find((r) => r.emoji === "\uD83D\uDC4D");
		expect(thumbsUp).toBeDefined();
		expect(thumbsUp!.fromAgent).toBe("team-lead");
	});

	test("permission_request renders as a permission card message", () => {
		const permRequest = fixtureEvents.find(
			(e) => e.label === "QA requests permission for Playwright install",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [permRequest.message],
		});

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];

		expect(messages).toHaveLength(1);
		expect(messages[0]!.text).toContain("wants to run");
		expect(messages[0]!.text).toContain("Bash");
	});

	test("shutdown_request emits shutdown-requested system event", () => {
		const shutdownReq = fixtureEvents.find(
			(e) => e.label === "Shutdown request to backend",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [shutdownReq.message],
		});

		const shutdownEvents = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "shutdown-requested",
		) as SystemEvent[];

		expect(shutdownEvents).toHaveLength(1);
		expect(shutdownEvents[0]!.text).toContain("backend");
		expect(shutdownEvents[0]!.text).toContain("leave");
	});

	test("shutdown_approved emits shutdown-approved and sets agent offline", () => {
		const shutdownApproval = fixtureEvents.find(
			(e) => e.label === "Backend approves shutdown",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [shutdownApproval.message],
		});

		const shutdownEvents = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "shutdown-approved",
		) as SystemEvent[];

		expect(shutdownEvents).toHaveLength(1);
		expect(shutdownEvents[0]!.text).toContain("backend");
		expect(shutdownEvents[0]!.text).toContain("left");

		expect(processor.getPresence()["backend"]).toBe("offline");
	});

	test("task claim correlates with lead assignment for hand-raise reaction", async () => {
		// Feed lead's broadcast assignment first
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

		// Wait for broadcast hold window
		await new Promise((resolve) => setTimeout(resolve, 600));

		// Now simulate a task claim
		collector.events.length = 0;

		processor.processDelta({
			type: "tasks",
			previous: initialTasks,
			current: taskSnapshots[1]!.tasks, // backend claims #1
		});

		const reactions = collector.events.filter(
			(e) => e.type === "reaction",
		) as ReactionEvent[];

		// The assignment message mentions #1 and backend, so it should get a hand-raise
		const handRaise = reactions.find((r) => r.emoji === "\u270B");
		expect(handRaise).toBeDefined();
		expect(handRaise!.fromAgent).toBe("backend");
	});

	test("compact mode converts short acks into reactions", () => {
		const compactCollector = createCollector();
		const compactProcessor = new EventProcessor(compactCollector.emitter, true);
		compactProcessor.processDelta({ type: "config", previous: null, current: config });

		// First, send a message from backend to frontend
		const backendMsg = {
			from: "backend" as const,
			text: "Schema draft is ready with PHI columns marked",
			summary: "Schema ready",
			timestamp: "2026-03-09T10:05:42.000Z",
			color: "blue",
			read: false as const,
		};
		compactProcessor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [backendMsg],
		});

		// Frontend sends a short ack within 30s
		const ackMsg = {
			from: "frontend" as const,
			text: "Got it",
			summary: "Got it",
			timestamp: "2026-03-09T10:05:50.000Z",
			color: "green",
			read: false as const,
		};
		compactProcessor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [ackMsg],
		});

		// In compact mode, "Got it" should become a reaction, not a message
		const allEvents = compactCollector.events;
		const reactions = allEvents.filter((e) => e.type === "reaction") as ReactionEvent[];
		const gotItReaction = reactions.find(
			(r) => r.fromAgent === "frontend" && r.emoji === "\uD83D\uDC4D",
		);
		expect(gotItReaction).toBeDefined();
	});

	test("non-compact mode renders short acks as normal messages", () => {
		// Default processor (compact mode off)
		const backendMsg = {
			from: "backend" as const,
			text: "Schema draft is ready",
			summary: "Schema ready",
			timestamp: "2026-03-09T10:05:42.000Z",
			color: "blue",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [backendMsg],
		});

		const ackMsg = {
			from: "frontend" as const,
			text: "Got it",
			summary: "Got it",
			timestamp: "2026-03-09T10:05:50.000Z",
			color: "green",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [ackMsg],
		});

		// "Got it" should be a regular message, not a reaction
		const messages = collector.events.filter(
			(e) => e.type === "message" && (e as ContentMessage).from === "frontend",
		) as ContentMessage[];
		expect(messages.length).toBeGreaterThanOrEqual(1);
		const gotItMsg = messages.find((m) => m.text === "Got it");
		expect(gotItMsg).toBeDefined();
	});
});

describe("DM beat detection — new patterns", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("detects question pattern in DM", () => {
		// First message establishes the thread
		const dm1 = {
			from: "backend" as const,
			text: "Let me check the schema",
			summary: "Checking schema",
			timestamp: "2026-03-09T10:06:00.000Z",
			color: "blue",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dm1],
		});
		collector.events.length = 0;

		// Second message triggers question detection
		const dm2 = {
			from: "frontend" as const,
			text: "What columns should be PHI?",
			summary: "PHI question",
			timestamp: "2026-03-09T10:06:10.000Z",
			color: "green",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [dm2],
		});
		const reactions = collector.events.filter(e => e.type === "reaction") as ReactionEvent[];
		const questionReaction = reactions.find(r => r.emoji === "❓");
		expect(questionReaction).toBeDefined();
	});

	test("detects code/schema sharing in DM", () => {
		// First message establishes the thread
		const dm1 = {
			from: "frontend" as const,
			text: "Can you send me the data model?",
			summary: "Requesting data model",
			timestamp: "2026-03-09T10:07:00.000Z",
			color: "green",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [dm1],
		});
		collector.events.length = 0;

		// Second message triggers sharing detection
		const dm2 = {
			from: "backend" as const,
			text: "Here's the schema with PHI columns marked",
			summary: "Schema sharing",
			timestamp: "2026-03-09T10:07:10.000Z",
			color: "blue",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dm2],
		});
		const reactions = collector.events.filter(e => e.type === "reaction") as ReactionEvent[];
		const shareReaction = reactions.find(r => r.emoji === "📎");
		expect(shareReaction).toBeDefined();
	});

	test("detects blocker/dependency in DM", () => {
		// First message establishes the thread
		const dm1 = {
			from: "privacy" as const,
			text: "How's the API endpoint coming along?",
			summary: "API status check",
			timestamp: "2026-03-09T10:08:00.000Z",
			color: "purple",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dm1],
		});
		collector.events.length = 0;

		// Second message triggers blocker detection
		const dm2 = {
			from: "frontend" as const,
			text: "I'm blocked on the API endpoint, waiting on backend",
			summary: "Blocked",
			timestamp: "2026-03-09T10:08:10.000Z",
			color: "green",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "privacy",
			previous: [],
			current: [dm2],
		});
		const reactions = collector.events.filter(e => e.type === "reaction") as ReactionEvent[];
		const blockerReaction = reactions.find(r => r.emoji === "🚧");
		expect(blockerReaction).toBeDefined();
	});

	test("detects completion report in DM", () => {
		// First message establishes the thread
		const dm1 = {
			from: "qa" as const,
			text: "How's the RBAC implementation going?",
			summary: "RBAC status",
			timestamp: "2026-03-09T10:09:00.000Z",
			color: "yellow",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [dm1],
		});
		collector.events.length = 0;

		// Second message triggers completion detection
		const dm2 = {
			from: "backend" as const,
			text: "All passing, RBAC implementation is done",
			summary: "Done",
			timestamp: "2026-03-09T10:09:10.000Z",
			color: "blue",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "qa",
			previous: [],
			current: [dm2],
		});
		const reactions = collector.events.filter(e => e.type === "reaction") as ReactionEvent[];
		const completionReaction = reactions.find(r => r.emoji === "✅");
		expect(completionReaction).toBeDefined();
	});
});

describe("General chat reaction inference", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		processor.processDelta({ type: "tasks", previous: null, current: initialTasks });
		collector.events.length = 0;
	});

	test("shutdown-approved produces 👋 on shutdown-requested event", () => {
		// Feed shutdown request
		const shutdownReq = fixtureEvents.find(e => e.label === "Shutdown request to backend")!;
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [shutdownReq.message],
		});

		const shutdownRequestEvents = collector.events.filter(
			e => e.type === "system" && (e as SystemEvent).subtype === "shutdown-requested"
		) as SystemEvent[];
		expect(shutdownRequestEvents).toHaveLength(1);
		const requestEventId = shutdownRequestEvents[0]!.id;

		// Now feed shutdown approval
		const shutdownApproval = fixtureEvents.find(e => e.label === "Backend approves shutdown")!;
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [shutdownApproval.message],
		});

		const reactions = collector.events.filter(e => e.type === "reaction") as ReactionEvent[];
		const waveReaction = reactions.find(r => r.emoji === "👋" && r.targetMessageId === requestEventId);
		expect(waveReaction).toBeDefined();
	});

	test("broadcast ack: short message after broadcast triggers 👍 on broadcast", async () => {
		// Feed lead's broadcast
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

		// Wait for broadcast hold window to finalize the broadcast
		await new Promise((resolve) => setTimeout(resolve, 600));
		collector.events.length = 0;

		// Backend sends a short acknowledgment to the lead within 60s
		const ackMsg = {
			from: "backend" as const,
			text: "Claimed #1. On it.",
			summary: "Claimed #1",
			timestamp: "2026-03-09T10:00:48.000Z",
			color: "blue",
			read: false as const,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [ackMsg],
		});

		// Wait for hold window
		await new Promise((resolve) => setTimeout(resolve, 600));

		const reactions = collector.events.filter(e => e.type === "reaction") as ReactionEvent[];
		const broadcastAck = reactions.find(r => r.emoji === "👍" && r.fromAgent === "backend");
		expect(broadcastAck).toBeDefined();
	});

	test("nudge ack: nudged agent responds within 60s triggers 👍 on nudge event", async () => {
		// First, make privacy idle
		const idleNotification = fixtureEvents.find(e => e.label === "Privacy idle after completing #5")!;
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [idleNotification.message],
		});

		// Lead sends a message to privacy (nudge since privacy is idle)
		const nudgeMsg = fixtureEvents.find(e => e.label === "Lead to privacy: cross-review")!;
		for (const inbox of nudgeMsg.inboxes) {
			processor.processDelta({
				type: "inbox",
				agentName: inbox,
				previous: [],
				current: [nudgeMsg.message],
			});
		}

		// Wait for broadcast hold window
		await new Promise((resolve) => setTimeout(resolve, 600));

		// Check that a nudge event was emitted
		const nudgeEvents = collector.events.filter(
			e => e.type === "system" && (e as SystemEvent).subtype === "nudge"
		) as SystemEvent[];
		expect(nudgeEvents.length).toBeGreaterThanOrEqual(1);
		const privacyNudge = nudgeEvents.find(e => e.agentName === "privacy");
		expect(privacyNudge).toBeDefined();

		collector.events.length = 0;

		// Privacy responds within 60s
		const privacyResponse = fixtureEvents.find(e => e.label === "Privacy accepts cross-review")!;
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [privacyResponse.message],
		});

		// Wait for broadcast hold window
		await new Promise((resolve) => setTimeout(resolve, 600));

		const reactions = collector.events.filter(e => e.type === "reaction") as ReactionEvent[];
		const nudgeAck = reactions.find(r => r.emoji === "👍" && r.fromAgent === "privacy");
		expect(nudgeAck).toBeDefined();
		expect(nudgeAck!.targetMessageId).toBe(privacyNudge!.id);
	});
});
