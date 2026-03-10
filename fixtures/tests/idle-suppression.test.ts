/**
 * Integration test: Idle notification suppression.
 * Verifies that idle pings are collapsed to presence state changes and
 * only surfaced as system events after the 30-second threshold.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { EventProcessor, type EventEmitter } from "../../src/server/processor.js";
import type { ChatEvent, PresenceChange, SystemEvent, RawInboxMessage } from "../../src/shared/types.js";
import { config } from "../data/config.js";

function createCollector(): { events: ChatEvent[]; emitter: EventEmitter } {
	const events: ChatEvent[] = [];
	const emitter: EventEmitter = (batch) => events.push(...batch);
	return { events, emitter };
}

function makeIdlePing(
	from: string,
	color: string,
	timestamp: string,
	reason?: string,
): RawInboxMessage {
	return {
		from,
		text: JSON.stringify({
			type: "idle_notification",
			idleReason: reason ?? "Waiting for work",
			completedTaskId: null,
			completedStatus: null,
		}),
		summary: `${from} is idle`,
		timestamp,
		color,
		read: false,
	};
}

describe("Idle Suppression", () => {
	let collector: ReturnType<typeof createCollector>;
	let processor: EventProcessor;

	beforeEach(() => {
		collector = createCollector();
		processor = new EventProcessor(collector.emitter);
		processor.processDelta({ type: "config", previous: null, current: config });
		collector.events.length = 0;
	});

	test("first idle ping changes presence to idle", () => {
		const ping = makeIdlePing("qa", "yellow", "2026-03-09T10:01:00.000Z");

		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [ping],
		});

		const presenceChanges = collector.events.filter(
			(e) => e.type === "presence",
		) as PresenceChange[];
		expect(presenceChanges).toHaveLength(1);
		expect(presenceChanges[0]!.agentName).toBe("qa");
		expect(presenceChanges[0]!.status).toBe("idle");

		expect(processor.getPresence()["qa"]).toBe("idle");
	});

	test("idle pings within 30s do NOT produce system events", () => {
		const pings: RawInboxMessage[] = [];
		const baseTime = new Date("2026-03-09T10:01:00.000Z").getTime();

		// Generate 7 pings at 4-second intervals (total 28 seconds < 30s threshold)
		for (let i = 0; i < 7; i++) {
			pings.push(
				makeIdlePing(
					"qa",
					"yellow",
					new Date(baseTime + i * 4000).toISOString(),
				),
			);
		}

		// Feed pings incrementally
		for (let i = 0; i < pings.length; i++) {
			processor.processDelta({
				type: "inbox",
				agentName: "team-lead",
				previous: pings.slice(0, i),
				current: pings.slice(0, i + 1),
			});
		}

		// Should have 1 presence change (first ping) but NO idle-surfaced system event
		const presenceChanges = collector.events.filter(
			(e) => e.type === "presence",
		) as PresenceChange[];
		expect(presenceChanges).toHaveLength(1);

		const idleSurfaced = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "idle-surfaced",
		);
		expect(idleSurfaced).toHaveLength(0);
	});

	test("idle ping after 30s threshold surfaces system event", () => {
		const baseTime = new Date("2026-03-09T10:01:00.000Z").getTime();

		// First ping
		const ping1 = makeIdlePing("qa", "yellow", new Date(baseTime).toISOString());
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [ping1],
		});

		// Ping at 31 seconds (past threshold)
		const ping2 = makeIdlePing(
			"qa",
			"yellow",
			new Date(baseTime + 31_000).toISOString(),
		);
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [ping1],
			current: [ping1, ping2],
		});

		const idleSurfaced = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "idle-surfaced",
		) as SystemEvent[];
		expect(idleSurfaced).toHaveLength(1);
		expect(idleSurfaced[0]!.agentName).toBe("qa");
		expect(idleSurfaced[0]!.text).toContain("qa is idle");
	});

	test("idle-surfaced is only emitted once per idle period", () => {
		const baseTime = new Date("2026-03-09T10:01:00.000Z").getTime();
		const pings: RawInboxMessage[] = [];

		// Generate 20 pings at 4-second intervals (80 seconds total)
		for (let i = 0; i < 20; i++) {
			pings.push(
				makeIdlePing(
					"qa",
					"yellow",
					new Date(baseTime + i * 4000).toISOString(),
				),
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

		const idleSurfaced = collector.events.filter(
			(e) => e.type === "system" && (e as SystemEvent).subtype === "idle-surfaced",
		);
		// Should surface exactly once, even though multiple pings crossed the threshold
		expect(idleSurfaced).toHaveLength(1);
	});

	test("content message after idle clears idle state and sets presence to working", () => {
		const baseTime = new Date("2026-03-09T10:01:00.000Z").getTime();

		// Idle ping
		const ping = makeIdlePing("qa", "yellow", new Date(baseTime).toISOString());
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [ping],
		});
		expect(processor.getPresence()["qa"]).toBe("idle");

		// QA sends a content message (DM to backend)
		const contentMsg: RawInboxMessage = {
			from: "qa",
			text: "Found an issue with RBAC",
			summary: "RBAC issue",
			timestamp: new Date(baseTime + 5000).toISOString(),
			color: "yellow",
			read: false,
		};
		processor.processDelta({
			type: "inbox",
			agentName: "backend",
			previous: [],
			current: [contentMsg],
		});

		// Presence should flip back to working
		const workingEvents = collector.events.filter(
			(e) =>
				e.type === "presence" &&
				(e as PresenceChange).agentName === "qa" &&
				(e as PresenceChange).status === "working",
		);
		expect(workingEvents.length).toBeGreaterThanOrEqual(1);
		expect(processor.getPresence()["qa"]).toBe("working");
	});

	test("multiple agents can be idle simultaneously", () => {
		const baseTime = new Date("2026-03-09T10:55:00.000Z").getTime();

		// Privacy goes idle
		const privacyPing = makeIdlePing("privacy", "purple", new Date(baseTime).toISOString());
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [],
			current: [privacyPing],
		});

		// Frontend goes idle
		const frontendPing = makeIdlePing(
			"frontend",
			"green",
			new Date(baseTime + 1000).toISOString(),
		);
		processor.processDelta({
			type: "inbox",
			agentName: "team-lead",
			previous: [privacyPing],
			current: [privacyPing, frontendPing],
		});

		const presence = processor.getPresence();
		expect(presence["privacy"]).toBe("idle");
		expect(presence["frontend"]).toBe("idle");
		expect(presence["backend"]).toBe("working");
	});
});
