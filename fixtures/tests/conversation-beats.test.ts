/**
 * Integration test: Conversational beat detection.
 * Verifies that DM messages trigger structural beat reactions
 * (proposal, agreement, counter-proposal, etc.) based on message content.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { ChatEvent, ContentMessage, ReactionEvent, ThreadMarker } from "../../src/shared/types.js";
import { config } from "../data/config.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

function makeDM(from: string, to: string, text: string, timestamp = new Date().toISOString()) {
	return {
		from,
		text,
		timestamp,
		color: "blue",
		read: false,
	};
}

describe("Conversational Beat Detection", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("first DM in a thread emits a proposal beat reaction", () => {
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Hey, I need to discuss the schema approach with you")],
		});

		const reactions = collector.events.filter((e) => e.type === "reaction") as ReactionEvent[];
		const proposalReaction = reactions.find((r) => r.emoji === "📋");
		expect(proposalReaction).toBeDefined();
		expect(proposalReaction!.tooltip).toContain("proposal");
	});

	test("agreement phrase emits agreement beat reaction", () => {
		// First message (proposal)
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Let's use tenant_id columns on every table")],
		});
		collector.events.length = 0;

		// Response with agreement
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [makeDM("frontend", "backend", "Agreed, that approach makes sense for our use case")],
		});

		const reactions = collector.events.filter((e) => e.type === "reaction") as ReactionEvent[];
		const agreementReaction = reactions.find((r) => r.emoji === "✅");
		expect(agreementReaction).toBeDefined();
		expect(agreementReaction!.tooltip).toContain("agreement");
	});

	test("counter-proposal phrase emits counter beat reaction", () => {
		// First message
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "I think we should use schema-per-tenant")],
		});
		collector.events.length = 0;

		// Counter-proposal
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [makeDM("frontend", "backend", "What about using a tenant_id column instead? It's simpler for SQLite")],
		});

		const reactions = collector.events.filter((e) => e.type === "reaction") as ReactionEvent[];
		const counterReaction = reactions.find((r) => r.emoji === "🔄");
		expect(counterReaction).toBeDefined();
	});

	test("resolution phrase emits resolution beat reaction", () => {
		// Setup thread
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Proposal for rate limiting")],
		});
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [makeDM("frontend", "backend", "Agreed on the approach")],
		});
		collector.events.length = 0;

		// Resolution
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Confirmed — implementation matches what we discussed, we're aligned")],
		});

		const reactions = collector.events.filter((e) => e.type === "reaction") as ReactionEvent[];
		const resolutionReaction = reactions.find((r) => r.emoji === "🤝");
		expect(resolutionReaction).toBeDefined();
	});

	test("acknowledgement phrase emits ack beat reaction", () => {
		// Setup thread
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Here are the types you need for JWT claims")],
		});
		collector.events.length = 0;

		// Acknowledgement
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [makeDM("frontend", "backend", "Got it, I'll update my implementation to match")],
		});

		const reactions = collector.events.filter((e) => e.type === "reaction") as ReactionEvent[];
		const ackReaction = reactions.find((r) => r.emoji === "👍");
		expect(ackReaction).toBeDefined();
	});
});

describe("Thread Status Tracking", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("getThreadStatuses returns tracked threads", () => {
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Hey, let's discuss the schema")],
		});

		const statuses = processor.getThreadStatuses();
		expect(statuses).toHaveLength(1);
		expect(statuses[0]!.participants).toEqual(["backend", "frontend"]);
		expect(statuses[0]!.status).toBe("new");
		expect(statuses[0]!.messageCount).toBe(1);
		expect(statuses[0]!.topic).toContain("schema");
	});

	test("thread status updates as messages accumulate", () => {
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Let's discuss tenant isolation")],
		});
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [makeDM("frontend", "backend", "Sounds good, I prefer column-per-table")],
		});
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Agreed, let's go with that")],
		});

		const statuses = processor.getThreadStatuses();
		expect(statuses).toHaveLength(1);
		expect(statuses[0]!.messageCount).toBe(3);
		expect(statuses[0]!.status).toBe("active");
		expect(statuses[0]!.beats).toContain("proposal");
		expect(statuses[0]!.beats).toContain("agreement");
	});

	test("thread marked resolved after resolution beat", () => {
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Proposal for rate limiting")],
		});
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [makeDM("frontend", "backend", "Confirmed, we're aligned on this approach")],
		});

		const statuses = processor.getThreadStatuses();
		expect(statuses[0]!.status).toBe("resolved");
	});

	test("multiple threads tracked independently", () => {
		processor.processDelta({
			type: "inbox",
			agentName: "frontend",
			previous: [],
			current: [makeDM("backend", "frontend", "Schema discussion")],
		});
		processor.processDelta({
			type: "inbox",
			agentName: "privacy",
			previous: [],
			current: [makeDM("qa", "privacy", "Found a tenant isolation bug")],
		});

		const statuses = processor.getThreadStatuses();
		expect(statuses).toHaveLength(2);
	});
});
