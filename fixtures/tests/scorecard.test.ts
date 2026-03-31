import { describe, test, expect } from 'bun:test';
import { computeScorecard, detectKeyMoments } from '../../src/compare/scorecard';
import { parseSessionLog } from '../../src/compare/parser';
import { parseInboxes } from '../../src/compare/protocol-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CaptureManifest } from '../../src/capture/types';
import type { ParsedSession } from '../../src/compare/types';
import type { ChatEvent, JournalEntry } from '../../src/shared/types';

const FIXTURE_DIR = join(import.meta.dir, '../captures/test-session');

function loadTestSession(): ParsedSession {
	const manifest: CaptureManifest = JSON.parse(readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf-8'));
	const terminal = {
		lead: parseSessionLog(join(FIXTURE_DIR, 'lead.jsonl'), 'team-lead'),
		agents: {
			'agent-a': parseSessionLog(join(FIXTURE_DIR, 'subagents/agent-test-001.jsonl'), 'agent-a'),
		},
		merged: [] as any[],
	};
	terminal.merged = [...terminal.lead, ...terminal.agents['agent-a']]
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	const protocol = parseInboxes(join(FIXTURE_DIR, 'inboxes'));

	const journalText = readFileSync(join(FIXTURE_DIR, 'journal.jsonl'), 'utf-8');
	const events: ChatEvent[] = journalText
		.split('\n')
		.filter(l => l.trim())
		.map(l => (JSON.parse(l) as JournalEntry).event);

	return { manifest, terminal, protocol, teamchat: { events } };
}

describe('computeScorecard', () => {
	test('counts terminal lines for lead', () => {
		const session = loadTestSession();
		const scorecard = computeScorecard(session);
		expect(scorecard.metrics.terminalLinesLead).toBe(session.terminal.lead.length);
	});

	test('counts terminal lines for all agents', () => {
		const session = loadTestSession();
		const scorecard = computeScorecard(session);
		expect(scorecard.metrics.terminalLinesAll).toBe(session.terminal.merged.length);
	});

	test('counts teamchat events', () => {
		const session = loadTestSession();
		const scorecard = computeScorecard(session);
		expect(scorecard.metrics.teamchatEvents).toBe(18);
	});

	test('counts hidden messages (protocol messages not in any terminal)', () => {
		const session = loadTestSession();
		const scorecard = computeScorecard(session);
		expect(scorecard.metrics.hiddenMessages).toBeGreaterThan(0);
	});

	test('counts coordination events (reactions, thread markers)', () => {
		const session = loadTestSession();
		const scorecard = computeScorecard(session);
		expect(scorecard.metrics.coordinationSurfaced).toBeGreaterThanOrEqual(2);
	});

	test('computes signal ratios between 0 and 1', () => {
		const session = loadTestSession();
		const scorecard = computeScorecard(session);
		expect(scorecard.metrics.terminalSignalRatio).toBeGreaterThan(0);
		expect(scorecard.metrics.terminalSignalRatio).toBeLessThanOrEqual(1);
		expect(scorecard.metrics.teamchatSignalRatio).toBeGreaterThan(0);
		expect(scorecard.metrics.teamchatSignalRatio).toBeLessThanOrEqual(1);
	});

	test('includes session metadata', () => {
		const session = loadTestSession();
		const scorecard = computeScorecard(session);
		expect(scorecard.session.team).toBe('test-team');
		expect(scorecard.session.agents).toBe(3);
		expect(scorecard.session.tasks).toBe(2);
	});
});

describe('detectKeyMoments', () => {
	test('detects DM negotiation as a key moment', () => {
		const session = loadTestSession();
		const moments = detectKeyMoments(session);
		const dms = moments.filter(m => m.type === 'dm');
		expect(dms.length).toBeGreaterThanOrEqual(1);
	});

	test('detects broadcast as a key moment', () => {
		const session = loadTestSession();
		const moments = detectKeyMoments(session);
		const broadcasts = moments.filter(m => m.type === 'broadcast');
		expect(broadcasts.length).toBeGreaterThanOrEqual(1);
	});

	test('moments have gap scores > 0', () => {
		const session = loadTestSession();
		const moments = detectKeyMoments(session);
		expect(moments.length).toBeGreaterThan(0);
		for (const m of moments) {
			expect(m.gapScore).toBeGreaterThan(0);
		}
	});

	test('moments are sorted by gap score descending', () => {
		const session = loadTestSession();
		const moments = detectKeyMoments(session);
		for (let i = 1; i < moments.length; i++) {
			expect(moments[i].gapScore).toBeLessThanOrEqual(moments[i - 1].gapScore);
		}
	});
});
