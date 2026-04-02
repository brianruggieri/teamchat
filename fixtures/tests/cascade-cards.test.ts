import { describe, test, expect } from 'bun:test';
import { buildMessageLaneItems } from '../../src/client/components/messageGrouping.js';
import type { SystemEvent } from '../../src/client/types.js';
import type { ChatEvent } from '../../src/client/types.js';

// ─── Factories ────────────────────────────────────────────────────────────────

const BASE_MS = new Date('2024-01-01T12:00:00.000Z').getTime();
function tsAt(offsetMs: number): string {
	return new Date(BASE_MS + offsetMs).toISOString();
}

// Session start far in the past so events are never inside the setup window
const FAR_PAST = BASE_MS - 120_000;

let idCounter = 0;
function makeSystemEvent(overrides: Partial<SystemEvent> & { subtype: SystemEvent['subtype'] }): SystemEvent {
	const id = `sys-${++idCounter}`;
	const base: SystemEvent = {
		type: 'system',
		id,
		subtype: 'member-joined',
		text: `event ${id}`,
		timestamp: tsAt(0),
		agentName: null,
		agentColor: null,
		agentModel: null,
		taskId: null,
		taskSubject: null,
	};
	return { ...base, ...overrides };
}

// ─── Cascade detection ────────────────────────────────────────────────────────

describe('cascade detection', () => {
	test('task-completed followed by task-unblocked produces a CascadeItem', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({
				id: 'c1',
				subtype: 'task-completed',
				agentName: 'builder',
				taskId: '1',
				taskSubject: 'Build auth module',
				timestamp: tsAt(0),
			}),
			makeSystemEvent({
				id: 'u1',
				subtype: 'task-unblocked',
				taskId: '2',
				taskSubject: 'Write auth tests',
				timestamp: tsAt(1000),
			}),
		];

		const result = buildMessageLaneItems(events, FAR_PAST);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('cascade');
		if (result[0]?.kind === 'cascade') {
			expect(result[0].completion.id).toBe('c1');
			expect(result[0].unblocks).toHaveLength(1);
			expect(result[0].unblocks[0]?.id).toBe('u1');
			expect(result[0].claims).toHaveLength(0);
		}
	});

	test('cascade with multiple unblocked tasks', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({
				id: 'c1',
				subtype: 'task-completed',
				agentName: 'lead',
				taskId: '1',
				timestamp: tsAt(0),
			}),
			makeSystemEvent({
				id: 'u1',
				subtype: 'task-unblocked',
				taskId: '2',
				timestamp: tsAt(500),
			}),
			makeSystemEvent({
				id: 'u2',
				subtype: 'task-unblocked',
				taskId: '3',
				timestamp: tsAt(600),
			}),
			makeSystemEvent({
				id: 'u3',
				subtype: 'task-unblocked',
				taskId: '4',
				timestamp: tsAt(700),
			}),
		];

		const result = buildMessageLaneItems(events, FAR_PAST);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('cascade');
		if (result[0]?.kind === 'cascade') {
			expect(result[0].unblocks).toHaveLength(3);
			expect(result[0].claims).toHaveLength(0);
		}
	});

	test('cascade with claims: completed + unblocked + claimed → CascadeItem with all three sections', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({
				id: 'c1',
				subtype: 'task-completed',
				agentName: 'infra-lead',
				taskId: '5',
				taskSubject: 'Deploy infra',
				timestamp: tsAt(0),
			}),
			makeSystemEvent({
				id: 'u1',
				subtype: 'task-unblocked',
				taskId: '6',
				taskSubject: 'Configure DNS',
				timestamp: tsAt(500),
			}),
			makeSystemEvent({
				id: 'u2',
				subtype: 'task-unblocked',
				taskId: '7',
				taskSubject: 'Set up SSL',
				timestamp: tsAt(600),
			}),
			makeSystemEvent({
				id: 'cl1',
				subtype: 'task-claimed',
				agentName: 'dns-agent',
				agentColor: '#22c55e',
				taskId: '6',
				taskSubject: 'Configure DNS',
				timestamp: tsAt(1000),
			}),
			makeSystemEvent({
				id: 'cl2',
				subtype: 'task-claimed',
				agentName: 'ssl-agent',
				agentColor: '#3b82f6',
				taskId: '7',
				taskSubject: 'Set up SSL',
				timestamp: tsAt(1200),
			}),
		];

		const result = buildMessageLaneItems(events, FAR_PAST);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('cascade');
		if (result[0]?.kind === 'cascade') {
			expect(result[0].completion.id).toBe('c1');
			expect(result[0].unblocks).toHaveLength(2);
			expect(result[0].unblocks.map(u => u.id)).toEqual(['u1', 'u2']);
			expect(result[0].claims).toHaveLength(2);
			// Claims for unblocked task IDs are captured
			const claimTaskIds = result[0].claims.map(c => c.taskId);
			expect(claimTaskIds).toContain('6');
			expect(claimTaskIds).toContain('7');
		}
	});

	test('cascade claims only captures claims for the unblocked task IDs (not unrelated claims)', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({
				id: 'c1',
				subtype: 'task-completed',
				agentName: 'worker',
				taskId: '10',
				timestamp: tsAt(0),
			}),
			makeSystemEvent({
				id: 'u1',
				subtype: 'task-unblocked',
				taskId: '11',
				timestamp: tsAt(500),
			}),
			makeSystemEvent({
				id: 'cl-unrelated',
				subtype: 'task-claimed',
				agentName: 'other-agent',
				taskId: '99', // unrelated task
				timestamp: tsAt(800),
			}),
			makeSystemEvent({
				id: 'cl-related',
				subtype: 'task-claimed',
				agentName: 'target-agent',
				taskId: '11', // matches unblocked task
				timestamp: tsAt(1000),
			}),
		];

		const result = buildMessageLaneItems(events, FAR_PAST);

		expect(result[0]?.kind).toBe('cascade');
		if (result[0]?.kind === 'cascade') {
			expect(result[0].claims).toHaveLength(1);
			expect(result[0].claims[0]?.id).toBe('cl-related');
		}
	});

	test('task-completed without unblocks falls through to normal SystemRowItem', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({
				id: 'c1',
				subtype: 'task-completed',
				agentName: 'worker',
				taskId: '20',
				timestamp: tsAt(0),
			}),
		];

		const result = buildMessageLaneItems(events, FAR_PAST);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('system');
	});

	test('task-completed followed only by non-unblock system events produces system item, not cascade', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({
				id: 'c1',
				subtype: 'task-completed',
				agentName: 'worker',
				taskId: '30',
				timestamp: tsAt(0),
			}),
			makeSystemEvent({
				id: 's1',
				subtype: 'member-joined',
				agentName: 'latecomer',
				timestamp: tsAt(500),
			}),
		];

		const result = buildMessageLaneItems(events, FAR_PAST);

		// task-completed → system, member-joined → system-group (single item)
		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe('system');
		if (result[0]?.kind === 'system') {
			expect(result[0].event.id).toBe('c1');
		}
	});

	test('events after a cascade are rendered normally', () => {
		const events: ChatEvent[] = [
			makeSystemEvent({
				id: 'c1',
				subtype: 'task-completed',
				agentName: 'worker',
				taskId: '40',
				timestamp: tsAt(0),
			}),
			makeSystemEvent({
				id: 'u1',
				subtype: 'task-unblocked',
				taskId: '41',
				timestamp: tsAt(500),
			}),
			// This completed event is NOT part of the cascade above and has no unblocks
			makeSystemEvent({
				id: 'c2',
				subtype: 'task-completed',
				agentName: 'other-worker',
				taskId: '42',
				timestamp: tsAt(2000),
			}),
		];

		const result = buildMessageLaneItems(events, FAR_PAST);

		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe('cascade');
		expect(result[1]?.kind).toBe('system');
		if (result[1]?.kind === 'system') {
			expect(result[1].event.id).toBe('c2');
		}
	});

	test('cascade does not consume task-claimed events for different task IDs', () => {
		// claimed task ID '99' is not in the unblocked set
		const events: ChatEvent[] = [
			makeSystemEvent({
				id: 'c1',
				subtype: 'task-completed',
				taskId: '50',
				timestamp: tsAt(0),
			}),
			makeSystemEvent({
				id: 'u1',
				subtype: 'task-unblocked',
				taskId: '51',
				timestamp: tsAt(300),
			}),
			makeSystemEvent({
				id: 'cl-other',
				subtype: 'task-claimed',
				taskId: '99',
				timestamp: tsAt(500),
			}),
		];

		const result = buildMessageLaneItems(events, FAR_PAST);

		// cascade (c1 + u1), then the unrelated claimed event should not be swallowed
		// The unrelated task-claimed (id 99) is NOT in unblocked set, so it should be
		// consumed by cascade lookahead scan but only added to claims if taskId matches.
		// Since it stops at non-system events only, the cl-other IS within lookahead range
		// but task-claimed for id 99 is not in unblockedTaskIds → not added to claims.
		// However, the index advancement: cascade advances past cl-other because it's
		// within the lookahead range but we need to verify it's not swallowed.
		// The cascade nextIndex logic takes max of consumed indices — cl-other is NOT
		// consumed (not added to consumedIndices), so nextIndex = max(0, 1) = 2 (after u1).
		// cl-other at index 2 should still be rendered.
		expect(result.length).toBeGreaterThanOrEqual(2);
		expect(result[0]?.kind).toBe('cascade');
		// The unrelated claim should still appear
		const remaining = result.slice(1);
		const hasClaimedItem = remaining.some(
			r => r.kind === 'system' && r.event.id === 'cl-other'
				|| r.kind === 'system-group'
		);
		expect(hasClaimedItem).toBe(true);
	});
});

// ─── Compact system events ─────────────────────────────────────────────────────

describe('compact system events', () => {
	test('individual non-collapsible system events produce SystemRowItem (kind: system)', () => {
		const nonCollapsible: Array<SystemEvent['subtype']> = [
			'task-completed',
			'task-failed',
			'task-unblocked',
			'all-tasks-completed',
			'shutdown-requested',
			'shutdown-approved',
			'member-left',
			'idle-surfaced',
		];

		for (const subtype of nonCollapsible) {
			const events: ChatEvent[] = [
				makeSystemEvent({ subtype, timestamp: tsAt(0) }),
			];
			const result = buildMessageLaneItems(events, FAR_PAST);
			expect(result).toHaveLength(1);
			expect(result[0]?.kind).toBe('system');
		}
	});

	test('individual collapsible system events produce SystemGroupItem with one event', () => {
		const collapsible: Array<SystemEvent['subtype']> = [
			'member-joined',
			'task-created',
			'task-claimed',
		];

		for (const subtype of collapsible) {
			const events: ChatEvent[] = [
				makeSystemEvent({ subtype, timestamp: tsAt(0) }),
			];
			const result = buildMessageLaneItems(events, FAR_PAST);
			expect(result).toHaveLength(1);
			expect(result[0]?.kind).toBe('system-group');
			if (result[0]?.kind === 'system-group') {
				expect(result[0].events).toHaveLength(1);
			}
		}
	});
});
