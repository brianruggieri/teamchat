/**
 * Tests for thread re-surfacing (WhatsApp-style) and communication graph data.
 *
 * Part A: When a DM thread accumulates 3+ messages, it re-surfaces at the
 * position of the latest DM with a "continued below" placeholder at the
 * original position.
 *
 * Part B: The buildGraphData function computes nodes and edges from team
 * members and thread statuses for the CommGraph component.
 */
import { describe, test, expect } from 'bun:test';
import type { ContentMessage, ChatEvent, SystemEvent } from '../../src/shared/types.js';
import {
	createBaseChatState,
	applyChatEventInPlace,
} from '../../src/client/state.js';

// ─── Factories ──────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(): string {
	return `resurface-${++_seq}`;
}

function makeDM(from: string, to: string, overrides?: Partial<ContentMessage>): ContentMessage {
	return {
		type: 'message',
		id: nextId(),
		from,
		fromColor: 'blue',
		text: `DM from ${from} to ${to}`,
		summary: null,
		timestamp: '2024-01-01T00:00:00Z',
		isBroadcast: false,
		isDM: true,
		dmParticipants: [from, to],
		isLead: false,
		replyToId: null,
		...overrides,
	};
}

function makeBroadcast(from: string, overrides?: Partial<ContentMessage>): ContentMessage {
	return {
		type: 'message',
		id: nextId(),
		from,
		fromColor: 'blue',
		text: `Broadcast from ${from}`,
		summary: null,
		timestamp: '2024-01-01T00:01:00Z',
		isBroadcast: true,
		isDM: false,
		dmParticipants: null,
		isLead: false,
		replyToId: null,
		...overrides,
	};
}

// ─── Part A: Thread re-surfacing state ──────────────────────────────────────

describe('Thread re-surfacing state', () => {
	test('resurfacedThreadKeys is empty for 1-message thread', () => {
		const state = createBaseChatState();
		applyChatEventInPlace(state, makeDM('alpha', 'beta'));
		expect(state.resurfacedThreadKeys.size).toBe(0);
	});

	test('resurfacedThreadKeys is empty for 2-message thread', () => {
		const state = createBaseChatState();
		applyChatEventInPlace(state, makeDM('alpha', 'beta'));
		applyChatEventInPlace(state, makeDM('beta', 'alpha'));
		expect(state.resurfacedThreadKeys.size).toBe(0);
	});

	test('resurfacedThreadKeys is populated at 3rd message', () => {
		const state = createBaseChatState();
		applyChatEventInPlace(state, makeDM('alpha', 'beta'));
		applyChatEventInPlace(state, makeDM('beta', 'alpha'));
		applyChatEventInPlace(state, makeDM('alpha', 'beta'));
		expect(state.resurfacedThreadKeys.has('alpha:beta')).toBe(true);
	});

	test('resurfacedThreadKeys tracks multiple threads independently', () => {
		const state = createBaseChatState();
		// Thread alpha:beta — 3 messages
		applyChatEventInPlace(state, makeDM('alpha', 'beta'));
		applyChatEventInPlace(state, makeDM('beta', 'alpha'));
		applyChatEventInPlace(state, makeDM('alpha', 'beta'));
		// Thread alpha:gamma — only 2 messages
		applyChatEventInPlace(state, makeDM('alpha', 'gamma'));
		applyChatEventInPlace(state, makeDM('gamma', 'alpha'));

		expect(state.resurfacedThreadKeys.has('alpha:beta')).toBe(true);
		expect(state.resurfacedThreadKeys.has('alpha:gamma')).toBe(false);
	});

	test('thread key is sorted regardless of message direction', () => {
		const state = createBaseChatState();
		applyChatEventInPlace(state, makeDM('beta', 'alpha'));
		applyChatEventInPlace(state, makeDM('alpha', 'beta'));
		applyChatEventInPlace(state, makeDM('beta', 'alpha'));
		// Key should be alpha:beta (sorted) even though first message was from beta
		expect(state.resurfacedThreadKeys.has('alpha:beta')).toBe(true);
	});

	test('threadFilter defaults to null', () => {
		const state = createBaseChatState();
		expect(state.threadFilter).toBeNull();
	});
});

// ─── Part B: Communication graph data ───────────────────────────────────────

import { buildGraphData } from '../../src/client/components/CommGraph.jsx';
import type { AgentInfo, ThreadStatus } from '../../src/shared/types.js';

function makeAgent(name: string, color = 'blue'): AgentInfo {
	return { name, agentId: `${name}@team`, agentType: 'agent', color };
}

function makeThreadStatus(a: string, b: string, count: number, status: 'new' | 'active' | 'resolved' = 'active'): ThreadStatus {
	const sorted = [a, b].sort();
	return {
		threadKey: sorted.join(':'),
		participants: sorted,
		topic: `Discussion between ${a} and ${b}`,
		messageCount: count,
		status,
		firstMessageTimestamp: '2024-01-01T00:00:00Z',
		lastMessageTimestamp: '2024-01-01T00:10:00Z',
		beats: [],
	};
}

describe('buildGraphData', () => {
	test('returns empty when no threads', () => {
		const members = [makeAgent('alpha'), makeAgent('beta')];
		const { nodes, edges } = buildGraphData(members, {});
		expect(nodes).toHaveLength(0);
		expect(edges).toHaveLength(0);
	});

	test('creates nodes for thread participants', () => {
		const members = [makeAgent('alpha'), makeAgent('beta'), makeAgent('gamma')];
		const ts = makeThreadStatus('alpha', 'beta', 5);
		const { nodes, edges } = buildGraphData(members, { [ts.threadKey]: ts });
		expect(nodes).toHaveLength(2); // Only alpha and beta, not gamma
		expect(nodes.map((n) => n.name).sort()).toEqual(['alpha', 'beta']);
		expect(edges).toHaveLength(1);
	});

	test('edge weight reflects message count', () => {
		const members = [makeAgent('alpha'), makeAgent('beta')];
		const ts = makeThreadStatus('alpha', 'beta', 12);
		const { edges } = buildGraphData(members, { [ts.threadKey]: ts });
		expect(edges[0]!.weight).toBe(12);
	});

	test('resolved thread edge is marked inactive', () => {
		const members = [makeAgent('alpha'), makeAgent('beta')];
		const ts = makeThreadStatus('alpha', 'beta', 5, 'resolved');
		const { edges } = buildGraphData(members, { [ts.threadKey]: ts });
		expect(edges[0]!.active).toBe(false);
	});

	test('active thread edge is marked active', () => {
		const members = [makeAgent('alpha'), makeAgent('beta')];
		const ts = makeThreadStatus('alpha', 'beta', 5, 'active');
		const { edges } = buildGraphData(members, { [ts.threadKey]: ts });
		expect(edges[0]!.active).toBe(true);
	});

	test('multiple threads create multiple edges', () => {
		const members = [makeAgent('alpha'), makeAgent('beta'), makeAgent('gamma')];
		const ts1 = makeThreadStatus('alpha', 'beta', 3);
		const ts2 = makeThreadStatus('alpha', 'gamma', 7);
		const { nodes, edges } = buildGraphData(members, { [ts1.threadKey]: ts1, [ts2.threadKey]: ts2 });
		expect(nodes).toHaveLength(3);
		expect(edges).toHaveLength(2);
	});

	test('handles thread participants not in members list', () => {
		const members: AgentInfo[] = []; // No members provided
		const ts = makeThreadStatus('alpha', 'beta', 3);
		const { nodes, edges } = buildGraphData(members, { [ts.threadKey]: ts });
		// Should still create nodes with default color
		expect(nodes).toHaveLength(2);
		expect(edges).toHaveLength(1);
	});

	test('node positions are within canvas bounds', () => {
		const members = [makeAgent('alpha'), makeAgent('beta'), makeAgent('gamma'), makeAgent('delta')];
		const ts1 = makeThreadStatus('alpha', 'beta', 3);
		const ts2 = makeThreadStatus('gamma', 'delta', 5);
		const ts3 = makeThreadStatus('alpha', 'gamma', 2);
		const { nodes } = buildGraphData(members, { [ts1.threadKey]: ts1, [ts2.threadKey]: ts2, [ts3.threadKey]: ts3 });
		for (const node of nodes) {
			expect(node.x).toBeGreaterThan(0);
			expect(node.x).toBeLessThan(200);
			expect(node.y).toBeGreaterThan(0);
			expect(node.y).toBeLessThan(200);
		}
	});

	test('preserves agent colors from members', () => {
		const members = [makeAgent('alpha', 'purple'), makeAgent('beta', 'green')];
		const ts = makeThreadStatus('alpha', 'beta', 3);
		const { nodes } = buildGraphData(members, { [ts.threadKey]: ts });
		const alphaNode = nodes.find((n) => n.name === 'alpha');
		const betaNode = nodes.find((n) => n.name === 'beta');
		expect(alphaNode!.color).toBe('purple');
		expect(betaNode!.color).toBe('green');
	});
});
