import { describe, test, expect } from 'bun:test';
import { renderReport } from '../../src/compare/report-template.js';
import type { Scorecard } from '../../src/compare/types.js';

function makeTestScorecard(): Scorecard {
	return {
		version: 1,
		session: { team: 'pulse', durationMs: 4520050, agents: 7, tasks: 11, capturedAt: '2026-03-31T18:00:00Z' },
		metrics: {
			terminalLinesLead: 47, terminalLinesAll: 131, hiddenMessages: 89,
			teamchatEvents: 343, idlePingsRaw: 630, idleEventsShown: 5,
			noiseSuppression: 126, broadcastsRaw: 21, broadcastsShown: 3,
			broadcastDedup: 7, coordinationSurfaced: 47, terminalGap: 142,
			terminalSignalRatio: 0.31, teamchatSignalRatio: 0.94,
		},
		keyMoments: [
			{
				timestamp: '2026-03-31T18:12:34Z', type: 'dm',
				description: 'DM between hooks and testing',
				terminalSummary: 'Spinner', teamchatSummary: '4-message thread',
				terminalLines: 0, teamchatEvents: 5, gapScore: 1.0,
			},
		],
		generatedAt: '2026-03-31T18:05:00Z',
	};
}

describe('renderReport', () => {
	test('produces valid HTML with doctype', () => {
		const html = renderReport(makeTestScorecard());
		expect(html).toStartWith('<!DOCTYPE html>');
		expect(html).toContain('</html>');
	});

	test('includes hero scorecard numbers', () => {
		const html = renderReport(makeTestScorecard());
		expect(html).toContain('47');
		expect(html).toContain('89');
		expect(html).toContain('343');
	});

	test('includes session metadata', () => {
		const html = renderReport(makeTestScorecard());
		expect(html).toContain('pulse');
		expect(html).toContain('7');
	});

	test('includes key moment cards', () => {
		const html = renderReport(makeTestScorecard());
		expect(html).toContain('DM between hooks and testing');
		expect(html).toContain('Spinner');
		expect(html).toContain('4-message thread');
	});

	test('includes noise suppression section', () => {
		const html = renderReport(makeTestScorecard());
		expect(html).toContain('630');
		expect(html).toContain('suppressed');
	});

	test('includes methodology footer', () => {
		const html = renderReport(makeTestScorecard());
		expect(html).toContain('Methodology');
		expect(html).toContain('.claude/projects');
	});

	test('is self-contained (no external CSS/JS)', () => {
		const html = renderReport(makeTestScorecard());
		expect(html).not.toContain('href="http');
		expect(html).not.toContain('src="http');
		expect(html).toContain('<style>');
	});
});
