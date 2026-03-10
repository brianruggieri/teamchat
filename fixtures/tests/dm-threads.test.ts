/**
 * Integration test: DM thread detection.
 * Verifies that messages between teammates (not through the lead) are
 * classified as DMs and wrapped in thread markers.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { ChatEvent, ContentMessage, ThreadMarker } from "../../src/shared/types.js";
import { config } from "../data/config.js";
import { events as fixtureEvents, getDMThreads } from "../data/events.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

describe("DM Thread Detection", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("fixture data has 4 DM thread pairs", () => {
		const threads = getDMThreads();
		expect(threads).toHaveLength(4);
		// backend→frontend (schema), backend→privacy (schema),
		// frontend↔privacy (masking), qa↔backend (RBAC)
		expect(threads.sort()).toEqual([
			"backend:frontend",
			"backend:privacy",
			"backend:qa",
			"frontend:privacy",
		]);
	});

	test("classifies backend→frontend schema DM correctly", () => {
		const dmEvent = fixtureEvents.find(
			(e) => e.label === "Backend DMs schema to frontend",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dmEvent.message],
		});

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];
		expect(messages).toHaveLength(1);
		expect(messages[0]!.isDM).toBe(true);
		expect(messages[0]!.from).toBe("backend");
		expect(messages[0]!.dmParticipants).toEqual(
			expect.arrayContaining(["backend", "frontend"]),
		);
	});

	test("creates thread-start marker for first DM in a pair", () => {
		const dmEvent = fixtureEvents.find(
			(e) => e.label === "Frontend DMs privacy about masking",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "privacy",
			previous: [],
			current: [dmEvent.message],
		});

		const threadMarkers = collector.events.filter(
			(e) => e.type === "thread-marker",
		) as ThreadMarker[];
		expect(threadMarkers.length).toBeGreaterThanOrEqual(1);
		expect(threadMarkers[0]!.subtype).toBe("thread-start");
		expect(threadMarkers[0]!.participants).toEqual(
			expect.arrayContaining(["frontend", "privacy"]),
		);
	});

	test("does not create duplicate thread-start for consecutive DMs in same thread", () => {
		// First DM in the frontend↔privacy thread
		const dm1 = fixtureEvents.find(
			(e) => e.label === "Frontend DMs privacy about masking",
		)!;
		// Second DM (privacy responds)
		const dm2 = fixtureEvents.find(
			(e) => e.label === "Privacy explains masking to frontend",
		)!;

		// Feed first DM
		processor.processDelta({
			type: "inbox",
			agentName: "privacy",
			previous: [],
			current: [dm1.message],
		});

		// Feed second DM (response goes to frontend's inbox)
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dm2.message],
		});

		const threadStarts = collector.events.filter(
			(e) => e.type === "thread-marker" && (e as ThreadMarker).subtype === "thread-start",
		) as ThreadMarker[];

		// Should only have 1 thread-start for this pair
		const frontendPrivacyStarts = threadStarts.filter((t) =>
			t.participants.includes("frontend") && t.participants.includes("privacy"),
		);
		expect(frontendPrivacyStarts).toHaveLength(1);
	});

	test("classifies qa→backend RBAC bug DM correctly", () => {
		const bugReport = fixtureEvents.find(
			(e) => e.label === "QA reports RBAC bug to backend (DM)",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [bugReport.message],
		});

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];
		expect(messages).toHaveLength(1);
		expect(messages[0]!.isDM).toBe(true);
		expect(messages[0]!.from).toBe("qa");
		expect(messages[0]!.text).toContain("RBAC");
	});

	test("lead→teammate messages are NOT classified as DMs", async () => {
		const leadMsg = fixtureEvents.find(
			(e) => e.label === "Lead answers privacy encryption question",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "privacy",
			previous: [],
			current: [leadMsg.message],
		});

		await new Promise((resolve) => setTimeout(resolve, 600));

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];
		expect(messages).toHaveLength(1);
		expect(messages[0]!.isDM).toBe(false);
		expect(messages[0]!.isLead).toBe(true);
	});

	test("teammate→lead messages are NOT classified as DMs", async () => {
		const teammateMsg = fixtureEvents.find(
			(e) => e.label === "Backend claims #1 (message to lead)",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [teammateMsg.message],
		});

		await new Promise((resolve) => setTimeout(resolve, 600));

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];
		expect(messages).toHaveLength(1);
		expect(messages[0]!.isDM).toBe(false);
		expect(messages[0]!.isLead).toBe(false);
	});
});
