/**
 * Integration test: Broadcast detection and deduplication.
 * Verifies that messages appearing in 3+ inboxes within the hold window
 * are classified as broadcasts and deduplicated into a single ChatEvent.
 *
 * NOTE: The processor's broadcast detection only applies to messages from
 * the lead (or non-DM paths). Messages from a teammate that land in other
 * teammates' inboxes are classified as DMs, so they bypass broadcast
 * detection. Only lead-originated broadcasts can be detected as broadcasts
 * by the processor.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { ChatEvent, ContentMessage } from "../../src/shared/types.js";
import { config } from "../data/config.js";
import { events as fixtureEvents } from "../data/events.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

describe("Broadcast Detection", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("identifies lead assignment as a broadcast (4 teammate inboxes)", async () => {
		const assignmentEvent = fixtureEvents.find(
			(e) => e.label === "Lead assigns work (broadcast)",
		)!;
		expect(assignmentEvent.inboxes).toHaveLength(4);

		// Feed the same message into all 4 inboxes
		for (const inbox of assignmentEvent.inboxes) {
			processor.processDelta({
				type: "inbox",
				agentName: inbox,
				previous: [],
				current: [assignmentEvent.message],
			});
		}

		// Wait for broadcast hold window to expire
		await new Promise((resolve) => setTimeout(resolve, 600));

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];

		// Lead→teammate messages all enter broadcast detection (not DM path)
		// 4 inboxes >= 3 → classified as broadcast, deduplicated to 1
		expect(messages).toHaveLength(1);
		expect(messages[0]!.isBroadcast).toBe(true);
		expect(messages[0]!.from).toBe("team-lead");
		expect(messages[0]!.isLead).toBe(true);
		expect(messages[0]!.text).toContain("Here's the plan");
	});

	test("lead wrap-up is classified as a broadcast (4 teammate inboxes)", async () => {
		const wrapUp = fixtureEvents.find(
			(e) => e.label === "Lead wrap-up broadcast",
		)!;
		expect(wrapUp.inboxes).toHaveLength(4);

		for (const inbox of wrapUp.inboxes) {
			processor.processDelta({
				type: "inbox",
				agentName: inbox,
				previous: [],
				current: [wrapUp.message],
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 600));

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];

		expect(messages).toHaveLength(1);
		expect(messages[0]!.isBroadcast).toBe(true);
		expect(messages[0]!.from).toBe("team-lead");
	});

	test("teammate broadcast splits into DMs + lead message", async () => {
		// When backend broadcasts API contract to [team-lead, frontend, privacy, qa]:
		// - team-lead inbox: enters broadcast detection (sender is teammate, recipient is lead)
		// - frontend/privacy/qa inboxes: classified as DMs (teammate→teammate)
		const apiEvent = fixtureEvents.find(
			(e) => e.label === "Backend broadcasts API contract",
		)!;

		for (const inbox of apiEvent.inboxes) {
			processor.processDelta({
				type: "inbox",
				agentName: inbox,
				previous: [],
				current: [apiEvent.message],
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 600));

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];

		// 3 DMs (frontend, privacy, qa) + 1 non-broadcast lead inbox message
		expect(messages).toHaveLength(4);

		const dms = messages.filter((m) => m.isDM);
		expect(dms).toHaveLength(3);
		expect(dms.every((m) => m.from === "backend")).toBe(true);

		// The lead inbox copy is not a broadcast (only 1 in broadcast detection)
		const leadCopy = messages.find((m) => !m.isDM);
		expect(leadCopy).toBeDefined();
		expect(leadCopy!.isBroadcast).toBe(false);
	});

	test("single-inbox messages are not broadcasts", async () => {
		const singleEvent = fixtureEvents.find(
			(e) => e.label === "Backend claims #1 (message to lead)",
		)!;
		expect(singleEvent.inboxes).toHaveLength(1);

		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [singleEvent.message],
		});

		await new Promise((resolve) => setTimeout(resolve, 600));

		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];

		expect(messages).toHaveLength(1);
		expect(messages[0]!.isBroadcast).toBe(false);
	});

	test("DM messages are emitted immediately (not held for broadcast window)", () => {
		const dmEvent = fixtureEvents.find(
			(e) => e.label === "Backend DMs schema to frontend",
		)!;

		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [dmEvent.message],
		});

		// DMs emit synchronously, no need to wait for timeout
		const messages = collector.events.filter(
			(e) => e.type === "message",
		) as ContentMessage[];

		expect(messages).toHaveLength(1);
		expect(messages[0]!.isDM).toBe(true);
		expect(messages[0]!.isBroadcast).toBe(false);
	});

	test("lead message to single teammate is not a broadcast", async () => {
		const leadMsg = fixtureEvents.find(
			(e) => e.label === "Lead answers privacy encryption question",
		)!;
		expect(leadMsg.inboxes).toHaveLength(1);

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
		expect(messages[0]!.isBroadcast).toBe(false);
		expect(messages[0]!.isLead).toBe(true);
	});
});
