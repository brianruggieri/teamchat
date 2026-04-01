import { describe, test, expect } from 'bun:test';
import {
	compareBenchmarks,
	formatStandaloneOutput,
	formatComparisonOutput,
} from '../../src/compare/benchmark.js';
import type { BenchmarkResult, BenchmarkComparison, Scorecard } from '../../src/compare/types.js';

function makeScorecard(overrides: Partial<Scorecard['session']> = {}, metricsOverrides: Partial<Scorecard['metrics']> = {}): Scorecard {
	return {
		version: 1,
		session: {
			team: 'discord-build',
			durationMs: 4520050,
			agents: 7,
			tasks: 11,
			capturedAt: '2026-03-31T18:00:00Z',
			...overrides,
		},
		metrics: {
			terminalLinesLead: 47,
			terminalLinesAll: 131,
			hiddenMessages: 89,
			teamchatEvents: 343,
			idlePingsRaw: 630,
			idleEventsShown: 5,
			noiseSuppression: 126,
			broadcastsRaw: 21,
			broadcastsShown: 3,
			broadcastDedup: 7,
			coordinationSurfaced: 47,
			terminalGap: 142,
			terminalSignalRatio: 0.31,
			teamchatSignalRatio: 0.94,
			...metricsOverrides,
		},
		keyMoments: [],
		generatedAt: '2026-03-31T18:05:00Z',
	};
}

function makeResult(viewportOverrides: Partial<BenchmarkResult['viewport']> = {}, scorecardOverrides?: Scorecard): BenchmarkResult {
	return {
		scorecard: scorecardOverrides ?? makeScorecard(),
		viewport: {
			eventsPerScreen: [12, 15, 10, 14],
			scrollDepth: 18.2,
			renderCompleteness: 1.0,
			whitespaceRatio: 0.42,
			...viewportOverrides,
		},
		generatedAt: '2026-03-31T18:10:00Z',
	};
}

describe('benchmark metrics', () => {
	test('computes scroll depth as ratio', () => {
		const result = makeResult({ scrollDepth: 14.7 });
		expect(result.viewport.scrollDepth).toBe(14.7);
		// Scroll depth is scrollHeight / viewportHeight
		expect(result.viewport.scrollDepth).toBeGreaterThan(1);
	});

	test('computes render completeness as fraction', () => {
		const scorecard = makeScorecard({}, { teamchatEvents: 343 });
		const result = makeResult(
			{ renderCompleteness: 341 / 343 },
			scorecard,
		);
		expect(result.viewport.renderCompleteness).toBeCloseTo(0.994, 2);
		expect(result.viewport.renderCompleteness).toBeLessThanOrEqual(1);
		expect(result.viewport.renderCompleteness).toBeGreaterThan(0);
	});

	test('renderCompleteness of 1.0 means all events rendered', () => {
		const result = makeResult({ renderCompleteness: 1.0 });
		expect(result.viewport.renderCompleteness).toBe(1);
	});

	test('eventsPerScreen tracks density at each screen position', () => {
		const result = makeResult({ eventsPerScreen: [12, 15, 10, 14, 8] });
		expect(result.viewport.eventsPerScreen).toHaveLength(5);
		const avg = result.viewport.eventsPerScreen.reduce((a, b) => a + b, 0) / result.viewport.eventsPerScreen.length;
		expect(avg).toBeCloseTo(11.8, 1);
	});
});

describe('compareBenchmarks', () => {
	test('detects improvement when scroll depth decreases', () => {
		const baseline = makeResult({ scrollDepth: 18.2 });
		const current = makeResult({ scrollDepth: 14.7 });
		const comparisons = compareBenchmarks(current, baseline);

		const scrollComp = comparisons.find(c => c.metric === 'Scroll depth')!;
		expect(scrollComp.improved).toBe(true);
		expect(scrollComp.regressed).toBe(false);
		expect(scrollComp.delta).toBeCloseTo(-3.5, 1);
	});

	test('detects regression when scroll depth increases', () => {
		const baseline = makeResult({ scrollDepth: 14.7 });
		const current = makeResult({ scrollDepth: 18.2 });
		const comparisons = compareBenchmarks(current, baseline);

		const scrollComp = comparisons.find(c => c.metric === 'Scroll depth')!;
		expect(scrollComp.improved).toBe(false);
		expect(scrollComp.regressed).toBe(true);
	});

	test('detects improvement when viewport density increases', () => {
		const baseline = makeResult({ eventsPerScreen: [12, 12, 12] });
		const current = makeResult({ eventsPerScreen: [15, 15, 15] });
		const comparisons = compareBenchmarks(current, baseline);

		const densityComp = comparisons.find(c => c.metric === 'Viewport density')!;
		expect(densityComp.improved).toBe(true);
		expect(densityComp.regressed).toBe(false);
		expect(densityComp.deltaPercent).toBe(25);
	});

	test('detects regression when render completeness drops', () => {
		const baseScorecard = makeScorecard({}, { teamchatEvents: 343 });
		const baseline = makeResult({ renderCompleteness: 1.0 }, baseScorecard);
		const current = makeResult({ renderCompleteness: 341 / 343 }, baseScorecard);
		const comparisons = compareBenchmarks(current, baseline);

		const renderComp = comparisons.find(c => c.metric === 'Render completeness')!;
		expect(renderComp.regressed).toBe(true);
		expect(renderComp.improved).toBe(false);
	});

	test('detects improvement when whitespace ratio decreases', () => {
		const baseline = makeResult({ whitespaceRatio: 0.42 });
		const current = makeResult({ whitespaceRatio: 0.38 });
		const comparisons = compareBenchmarks(current, baseline);

		const wsComp = comparisons.find(c => c.metric === 'Whitespace ratio')!;
		expect(wsComp.improved).toBe(true);
		expect(wsComp.regressed).toBe(false);
	});

	test('no change results in no improvements or regressions', () => {
		const result = makeResult();
		const comparisons = compareBenchmarks(result, result);

		for (const c of comparisons) {
			expect(c.improved).toBe(false);
			expect(c.regressed).toBe(false);
			expect(c.delta).toBe(0);
		}
	});

	test('returns exactly 4 comparison metrics', () => {
		const result = makeResult();
		const comparisons = compareBenchmarks(result, result);
		expect(comparisons).toHaveLength(4);
		const names = comparisons.map(c => c.metric);
		expect(names).toContain('Scroll depth');
		expect(names).toContain('Viewport density');
		expect(names).toContain('Render completeness');
		expect(names).toContain('Whitespace ratio');
	});

	test('computes correct deltaPercent', () => {
		const baseline = makeResult({ scrollDepth: 20.0 });
		const current = makeResult({ scrollDepth: 15.0 });
		const comparisons = compareBenchmarks(current, baseline);

		const scrollComp = comparisons.find(c => c.metric === 'Scroll depth')!;
		expect(scrollComp.deltaPercent).toBe(-25);
	});

	test('handles zero baseline gracefully', () => {
		const baseline = makeResult({ eventsPerScreen: [], scrollDepth: 0 });
		const current = makeResult({ eventsPerScreen: [10], scrollDepth: 5 });
		const comparisons = compareBenchmarks(current, baseline);

		// Should not throw, deltaPercent should be 0 when baseline is 0
		const scrollComp = comparisons.find(c => c.metric === 'Scroll depth')!;
		expect(scrollComp.deltaPercent).toBe(0);
	});
});

describe('formatStandaloneOutput', () => {
	test('includes team name in header', () => {
		const result = makeResult();
		const output = formatStandaloneOutput(result);
		expect(output).toContain('discord-build');
	});

	test('includes scroll depth with unit', () => {
		const result = makeResult({ scrollDepth: 14.7 });
		const output = formatStandaloneOutput(result);
		expect(output).toContain('14.7 screens');
	});

	test('includes viewport density', () => {
		const result = makeResult({ eventsPerScreen: [12, 15, 10, 14] });
		const output = formatStandaloneOutput(result);
		expect(output).toContain('events/screen (avg)');
	});

	test('includes render completeness with counts', () => {
		const scorecard = makeScorecard({}, { teamchatEvents: 343 });
		const result = makeResult({ renderCompleteness: 341 / 343 }, scorecard);
		const output = formatStandaloneOutput(result);
		expect(output).toContain('341 / 343 events');
	});

	test('includes whitespace ratio', () => {
		const result = makeResult({ whitespaceRatio: 0.38 });
		const output = formatStandaloneOutput(result);
		expect(output).toContain('0.38');
	});

	test('includes save path when provided', () => {
		const result = makeResult();
		const output = formatStandaloneOutput(result, '/some/path/benchmark.json');
		expect(output).toContain('Saved to: /some/path/benchmark.json');
	});

	test('omits save path when not provided', () => {
		const result = makeResult();
		const output = formatStandaloneOutput(result);
		expect(output).not.toContain('Saved to');
	});
});

describe('formatComparisonOutput', () => {
	test('shows improvement and regression icons', () => {
		const baseline = makeResult({ scrollDepth: 18.2, whitespaceRatio: 0.42 });
		const current = makeResult({ scrollDepth: 14.7, whitespaceRatio: 0.45 });
		const comparisons = compareBenchmarks(current, baseline);
		const output = formatComparisonOutput(current, comparisons);

		// Scroll depth improved (decreased)
		expect(output).toContain('\u2713 Scroll depth');
		// Whitespace regressed (increased)
		expect(output).toContain('\u2717 Whitespace ratio');
	});

	test('shows overall summary counts', () => {
		const baseline = makeResult({
			scrollDepth: 18.2,
			eventsPerScreen: [12, 12],
			whitespaceRatio: 0.42,
		});
		const current = makeResult({
			scrollDepth: 14.7,
			eventsPerScreen: [15, 15],
			whitespaceRatio: 0.38,
		});
		const comparisons = compareBenchmarks(current, baseline);
		const output = formatComparisonOutput(current, comparisons);

		expect(output).toContain('improved');
		expect(output).toContain('regressed');
	});

	test('includes team name in header', () => {
		const result = makeResult();
		const comparisons = compareBenchmarks(result, result);
		const output = formatComparisonOutput(result, comparisons);
		expect(output).toContain('discord-build');
	});

	test('marks regressions with arrow label', () => {
		const scorecard = makeScorecard({}, { teamchatEvents: 343 });
		const baseline = makeResult({ renderCompleteness: 1.0 }, scorecard);
		const current = makeResult({ renderCompleteness: 0.99 }, scorecard);
		const comparisons = compareBenchmarks(current, baseline);
		const output = formatComparisonOutput(current, comparisons);

		expect(output).toContain('REGRESSION');
	});

	test('shows delta percentages', () => {
		const baseline = makeResult({ scrollDepth: 20.0 });
		const current = makeResult({ scrollDepth: 15.0 });
		const comparisons = compareBenchmarks(current, baseline);
		const output = formatComparisonOutput(current, comparisons);

		expect(output).toContain('-25%');
	});
});
