import { describe, test, expect } from 'bun:test';
import { parseInboxes } from '../../src/compare/protocol-parser';
import { join } from 'path';

const INBOX_DIR = join(import.meta.dir, '../captures/test-session/inboxes');

describe('parseInboxes', () => {
	test('parses all messages from inbox files', () => {
		const timeline = parseInboxes(INBOX_DIR);
		// agent-a has 3 messages, agent-b has 2 messages = 5 total
		expect(timeline.messages.length).toBe(5);
	});

	test('detects broadcasts (same content in multiple inboxes within 1s)', () => {
		const timeline = parseInboxes(INBOX_DIR);
		const broadcasts = timeline.messages.filter(m => m.isBroadcast);
		// "Please build the login page..." appears in both inboxes at the same time
		expect(broadcasts.length).toBe(2);
	});

	test('detects DMs (message to single recipient, not broadcast)', () => {
		const timeline = parseInboxes(INBOX_DIR);
		const dms = timeline.messages.filter(m => m.isDM);
		// agent-b → agent-a: 2 DMs about auth library
		expect(dms.length).toBe(2);
	});

	test('messages are chronologically ordered', () => {
		const timeline = parseInboxes(INBOX_DIR);
		for (let i = 1; i < timeline.messages.length; i++) {
			expect(new Date(timeline.messages[i].timestamp).getTime())
				.toBeGreaterThanOrEqual(new Date(timeline.messages[i - 1].timestamp).getTime());
		}
	});

	test('sets correct from/to fields', () => {
		const timeline = parseInboxes(INBOX_DIR);
		const dms = timeline.messages.filter(m => m.isDM);
		expect(dms[0].from).toBe('agent-b');
		expect(dms[0].to).toBe('agent-a');
	});
});
