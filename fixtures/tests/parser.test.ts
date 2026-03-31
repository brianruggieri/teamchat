import { describe, test, expect } from 'bun:test';
import { parseSessionLog, parseSubagentLog } from '../../src/compare/parser.js';
import { join } from 'path';

const FIXTURE_DIR = join(import.meta.dir, '../captures/test-session');

describe('parseSessionLog', () => {
	const leadLog = join(FIXTURE_DIR, 'lead.jsonl');

	test('parses user prompts', () => {
		const entries = parseSessionLog(leadLog, 'team-lead');
		const prompts = entries.filter(e => e.type === 'user-prompt');
		expect(prompts.length).toBe(1);
		expect(prompts[0].content).toContain('Build the login page');
		expect(prompts[0].agent).toBe('team-lead');
	});

	test('parses assistant text blocks', () => {
		const entries = parseSessionLog(leadLog, 'team-lead');
		const texts = entries.filter(e => e.type === 'assistant-text');
		expect(texts.length).toBe(2);
		expect(texts[0].content).toContain('dispatch two agents');
	});

	test('parses thinking blocks', () => {
		const entries = parseSessionLog(leadLog, 'team-lead');
		const thinking = entries.filter(e => e.type === 'thinking');
		expect(thinking.length).toBe(1);
		expect(thinking[0].content).toContain('dispatch');
	});

	test('parses tool calls', () => {
		const entries = parseSessionLog(leadLog, 'team-lead');
		const tools = entries.filter(e => e.type === 'tool-call');
		expect(tools.length).toBe(1);
		expect(tools[0].toolName).toBe('Agent');
	});

	test('parses tool results', () => {
		const entries = parseSessionLog(leadLog, 'team-lead');
		const results = entries.filter(e => e.type === 'tool-result');
		expect(results.length).toBe(1);
		expect(results[0].content).toContain('Login page built');
	});

	test('entries are chronologically ordered', () => {
		const entries = parseSessionLog(leadLog, 'team-lead');
		for (let i = 1; i < entries.length; i++) {
			expect(new Date(entries[i].timestamp).getTime())
				.toBeGreaterThanOrEqual(new Date(entries[i - 1].timestamp).getTime());
		}
	});
});

describe('parseSubagentLog', () => {
	const subLog = join(FIXTURE_DIR, 'subagents/agent-test-001.jsonl');

	test('parses subagent entries with correct agent name', () => {
		const entries = parseSubagentLog(subLog, 'agent-a');
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every(e => e.agent === 'agent-a')).toBe(true);
	});

	test('includes tool calls from subagent', () => {
		const entries = parseSubagentLog(subLog, 'agent-a');
		const tools = entries.filter(e => e.type === 'tool-call');
		expect(tools.length).toBe(1);
		expect(tools[0].toolName).toBe('Write');
	});
});
