/**
 * Tests for thought bubble feature:
 * - wordOverlapRatio utility
 * - ThoughtItem in messageGrouping
 */
import { describe, test, expect } from 'bun:test';
import { wordOverlapRatio } from '../../src/shared/parse.js';
import { buildMessageLaneItems } from '../../src/client/components/messageGrouping.js';
import type { LeadThought } from '../../src/shared/types.js';

// ─── wordOverlapRatio ─────────────────────────────────────────────────────────

describe('wordOverlapRatio', () => {
	test('identical strings return 1', () => {
		expect(wordOverlapRatio('the quick brown fox', 'the quick brown fox')).toBe(1);
	});

	test('completely different words return 0', () => {
		expect(wordOverlapRatio('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
	});

	test('partial overlap returns correct ratio', () => {
		// "alpha", "beta", "gamma" in a — "beta" and "gamma" are in b — 2/3
		const ratio = wordOverlapRatio('alpha beta gamma', 'beta gamma delta');
		expect(ratio).toBeCloseTo(2 / 3, 5);
	});

	test('short words (2 chars or fewer) are filtered out', () => {
		// "is", "an" are ≤2 chars and should be filtered
		// Only "alpha" and "beta" count in a; only "beta" is in b → 1/2
		const ratio = wordOverlapRatio('is an alpha beta', 'an beta delta');
		expect(ratio).toBeCloseTo(1 / 2, 5);
	});

	test('empty string a returns 0', () => {
		expect(wordOverlapRatio('', 'hello world')).toBe(0);
	});

	test('empty string b returns 0', () => {
		expect(wordOverlapRatio('hello world', '')).toBe(0);
	});

	test('both empty returns 0', () => {
		expect(wordOverlapRatio('', '')).toBe(0);
	});

	test('a string of only short words returns 0', () => {
		// All words ≤2 chars → wordsA is empty → ratio is 0
		expect(wordOverlapRatio('a is to', 'is a to the')).toBe(0);
	});

	test('case insensitive matching', () => {
		expect(wordOverlapRatio('Hello World Test', 'hello world test')).toBe(1);
	});

	test('overlap above 40% threshold', () => {
		// 3 out of 5 meaningful words in a appear in b → 0.6 > 0.4
		const ratio = wordOverlapRatio('apple banana cherry date elderberry', 'apple banana cherry fig grape');
		expect(ratio).toBeGreaterThan(0.4);
	});

	test('overlap below 40% threshold', () => {
		const ratio = wordOverlapRatio('apple banana cherry date elderberry', 'fig grape melon plum');
		expect(ratio).toBeLessThan(0.4);
	});
});

// ─── ThoughtItem in buildMessageLaneItems ────────────────────────────────────

function makeThought(overrides?: Partial<LeadThought>): LeadThought {
	return {
		type: 'thought',
		id: 'thought-001',
		text: 'Thinking about the architecture...',
		timestamp: '2024-01-01T00:00:00.000Z',
		deduplicated: false,
		...overrides,
	};
}

describe('ThoughtItem in buildMessageLaneItems', () => {
	test('non-deduplicated thought appears as a thought lane item', () => {
		const thought = makeThought({ deduplicated: false });
		const result = buildMessageLaneItems([thought]);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('thought');
		if (result[0]?.kind === 'thought') {
			expect(result[0].event).toBe(thought);
		}
	});

	test('deduplicated thought is suppressed (not emitted)', () => {
		const thought = makeThought({ deduplicated: true });
		const result = buildMessageLaneItems([thought]);

		expect(result).toHaveLength(0);
	});

	test('thought appears in correct position in mixed stream', () => {
		const thought = makeThought({ id: 'th1', timestamp: '2024-01-01T00:01:00.000Z' });
		const msg: import('../../src/shared/types.js').ContentMessage = {
			type: 'message',
			id: 'msg1',
			from: 'team-lead',
			fromColor: '#6366f1',
			text: 'Hello team',
			summary: null,
			timestamp: '2024-01-01T00:02:00.000Z',
			isBroadcast: true,
			isDM: false,
			dmParticipants: null,
			isLead: true,
			replyToId: null,
		};

		const result = buildMessageLaneItems([thought, msg]);

		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe('thought');
		expect(result[1]?.kind).toBe('message-stack');
	});

	test('multiple non-deduplicated thoughts each become their own thought item', () => {
		const t1 = makeThought({ id: 'th1', deduplicated: false });
		const t2 = makeThought({ id: 'th2', deduplicated: false, text: 'Another thought' });
		const result = buildMessageLaneItems([t1, t2]);

		expect(result).toHaveLength(2);
		expect(result[0]?.kind).toBe('thought');
		expect(result[1]?.kind).toBe('thought');
	});

	test('mix of deduplicated and non-deduplicated: only non-dedup appears', () => {
		const t1 = makeThought({ id: 'th1', deduplicated: true });
		const t2 = makeThought({ id: 'th2', deduplicated: false });
		const t3 = makeThought({ id: 'th3', deduplicated: true });
		const result = buildMessageLaneItems([t1, t2, t3]);

		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe('thought');
		if (result[0]?.kind === 'thought') {
			expect(result[0].event.id).toBe('th2');
		}
	});
});
