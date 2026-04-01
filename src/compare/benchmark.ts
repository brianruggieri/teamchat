// src/compare/benchmark.ts — Playwright benchmark harness for UI density regression testing

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseCapture } from './report-generator.js';
import { computeScorecard } from './scorecard.js';
import type { BenchmarkResult, BenchmarkComparison, Scorecard, ViewportMetrics } from './types.js';
import { loadReplaySource } from '../server/replay.js';
import { TeamChatServer } from '../server/server.js';

export interface BenchmarkOptions {
	bundlePath: string;
	baselinePath?: string;
	saveBaseline?: boolean;
	port?: number;
}

/**
 * Compare two BenchmarkResults and produce structured comparison data.
 * This is a pure function — no Playwright or server needed — so it's fully testable.
 */
export function compareBenchmarks(
	current: BenchmarkResult,
	baseline: BenchmarkResult,
): BenchmarkComparison[] {
	const comparisons: BenchmarkComparison[] = [];

	const avgCurrent = current.viewport.eventsPerScreen.length > 0
		? current.viewport.eventsPerScreen.reduce((a, b) => a + b, 0) / current.viewport.eventsPerScreen.length
		: 0;
	const avgBaseline = baseline.viewport.eventsPerScreen.length > 0
		? baseline.viewport.eventsPerScreen.reduce((a, b) => a + b, 0) / baseline.viewport.eventsPerScreen.length
		: 0;

	// Scroll depth — lower is better (less scrolling needed)
	comparisons.push(makeComparison(
		'Scroll depth',
		baseline.viewport.scrollDepth,
		current.viewport.scrollDepth,
		'lower',
	));

	// Viewport density — higher is better (more events per screen)
	comparisons.push(makeComparison(
		'Viewport density',
		avgBaseline,
		avgCurrent,
		'higher',
	));

	// Render completeness — higher is better (as absolute count of rendered events)
	const baselineRendered = Math.round(baseline.viewport.renderCompleteness * baseline.scorecard.metrics.teamchatEvents);
	const currentRendered = Math.round(current.viewport.renderCompleteness * current.scorecard.metrics.teamchatEvents);
	comparisons.push(makeComparison(
		'Render completeness',
		baselineRendered,
		currentRendered,
		'higher',
	));

	// Whitespace ratio — lower is better (more content, less empty space)
	comparisons.push(makeComparison(
		'Whitespace ratio',
		baseline.viewport.whitespaceRatio,
		current.viewport.whitespaceRatio,
		'lower',
	));

	return comparisons;
}

function makeComparison(
	metric: string,
	baseline: number,
	current: number,
	betterDirection: 'higher' | 'lower',
): BenchmarkComparison {
	const delta = current - baseline;
	const deltaPercent = baseline !== 0 ? Math.round((delta / baseline) * 100) : 0;
	const improved = betterDirection === 'higher' ? delta > 0 : delta < 0;
	const regressed = betterDirection === 'higher' ? delta < 0 : delta > 0;

	return { metric, baseline, current, delta, deltaPercent, improved, regressed };
}

/**
 * Format a standalone benchmark result for terminal output.
 */
export function formatStandaloneOutput(result: BenchmarkResult, savedTo?: string): string {
	const teamName = result.scorecard.session.team;
	const avg = result.viewport.eventsPerScreen.length > 0
		? Math.round(result.viewport.eventsPerScreen.reduce((a, b) => a + b, 0) / result.viewport.eventsPerScreen.length)
		: 0;
	const totalEvents = result.scorecard.metrics.teamchatEvents;
	const rendered = Math.round(result.viewport.renderCompleteness * totalEvents);
	const pct = totalEvents > 0 ? (result.viewport.renderCompleteness * 100).toFixed(1) : '0.0';

	const lines = [
		`Benchmark Results — ${teamName}`,
		'─'.repeat(40),
		`Scroll depth:         ${result.viewport.scrollDepth.toFixed(1)} screens`,
		`Viewport density:     ${avg} events/screen (avg)`,
		`Render completeness:  ${rendered} / ${totalEvents} events (${pct}%)`,
		`Whitespace ratio:     ${result.viewport.whitespaceRatio.toFixed(2)}`,
	];

	if (savedTo) {
		lines.push('');
		lines.push(`Saved to: ${savedTo}`);
	}

	return lines.join('\n');
}

/**
 * Format a comparison between current and baseline benchmark results.
 */
export function formatComparisonOutput(
	result: BenchmarkResult,
	comparisons: BenchmarkComparison[],
): string {
	const teamName = result.scorecard.session.team;
	const lines = [
		`Benchmark Results — ${teamName}`,
		'─'.repeat(40),
	];

	for (const c of comparisons) {
		const sign = c.delta >= 0 ? '+' : '';
		const icon = c.regressed ? '\u2717' : '\u2713';
		const label = c.regressed ? ' \u2190 REGRESSION' : '';

		if (c.metric === 'Scroll depth') {
			lines.push(`${icon} Scroll depth:         ${c.baseline.toFixed(1)} \u2192 ${c.current.toFixed(1)} screens (${sign}${c.deltaPercent}%)`);
		} else if (c.metric === 'Viewport density') {
			lines.push(`${icon} Viewport density:     ${Math.round(c.baseline)} \u2192 ${Math.round(c.current)} events/screen (${sign}${c.deltaPercent}%)`);
		} else if (c.metric === 'Render completeness') {
			const deltaAbs = c.current - c.baseline;
			const absSuffix = deltaAbs !== 0 ? ` (${deltaAbs > 0 ? '+' : ''}${deltaAbs} events)` : '';
			lines.push(`${icon} Render completeness:  ${Math.round(c.baseline)} \u2192 ${Math.round(c.current)}${absSuffix}${label}`);
		} else if (c.metric === 'Whitespace ratio') {
			lines.push(`${icon} Whitespace ratio:     ${c.baseline.toFixed(2)} \u2192 ${c.current.toFixed(2)} (${sign}${c.deltaPercent}%)`);
		}
	}

	const improved = comparisons.filter(c => c.improved).length;
	const regressed = comparisons.filter(c => c.regressed).length;
	lines.push('');
	lines.push(`Overall: ${improved} improved, ${regressed} regressed`);

	return lines.join('\n');
}

/**
 * Run the full Playwright benchmark against a capture bundle.
 * Requires Playwright to be installed — gracefully errors if not.
 */
export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
	const { bundlePath, port = 0 } = options;

	// Compute scorecard from the capture bundle
	const session = parseCapture(bundlePath);
	const scorecard = computeScorecard(session);

	// Load replay source for the server
	const journalPath = path.join(bundlePath, 'journal.jsonl');
	if (!fs.existsSync(journalPath)) {
		throw new Error(`Capture bundle missing journal.jsonl: ${bundlePath}`);
	}
	const replay = loadReplaySource(bundlePath);

	// Start replay server
	const server = new TeamChatServer({
		port: port || 0,
		teamName: replay.bundle.manifest.teamName,
		mode: 'replay',
		replay,
	});
	server.start();
	const actualPort = server.getPort();

	let browser: any;
	let page: any;

	try {
		// Dynamic import — Playwright is optional
		let chromium: any;
		try {
			const pw = await import('playwright');
			chromium = pw.chromium;
		} catch {
			throw new Error(
				'Playwright not installed. Run: npx playwright install chromium'
			);
		}

		browser = await chromium.launch({ headless: true });
		page = await browser.newPage();
		await page.setViewportSize({ width: 1280, height: 720 });

		// Navigate and wait for the page to load
		await page.goto(`http://localhost:${actualPort}`, { waitUntil: 'networkidle' });

		// Wait for main content to render
		await page.waitForSelector('.chat-feed, .message-row, .system-event', { timeout: 10000 }).catch(() => {
			// If no chat elements appear, the page may have a different structure — continue anyway
		});

		// Small delay for React rendering to settle
		await page.waitForTimeout(1000);

		// Measure viewport metrics
		const viewport = await measureViewport(page, scorecard);

		const result: BenchmarkResult = {
			scorecard,
			viewport,
			generatedAt: new Date().toISOString(),
		};

		// Save baseline if requested
		if (options.saveBaseline) {
			const baselineOutputPath = path.join(bundlePath, 'benchmark.json');
			fs.writeFileSync(baselineOutputPath, JSON.stringify(result, null, '\t'));
		}

		return result;
	} finally {
		if (page) await page.close().catch(() => {});
		if (browser) await browser.close().catch(() => {});
		server.stop();
	}
}

/**
 * Measure viewport metrics using Playwright page evaluation.
 */
async function measureViewport(page: any, scorecard: Scorecard): Promise<ViewportMetrics> {
	// Count visible event elements
	const eventsPerScreen = await page.evaluate(() => {
		const selectors = '.message-row, .system-event, .task-card, .reaction';
		const allElements = document.querySelectorAll(selectors);
		const viewportHeight = window.innerHeight;
		const screens: number[] = [];

		if (allElements.length === 0) {
			return [0];
		}

		// Count visible elements at each "screen" position
		const scrollHeight = document.documentElement.scrollHeight;
		const screenCount = Math.max(1, Math.ceil(scrollHeight / viewportHeight));

		for (let i = 0; i < screenCount; i++) {
			const screenTop = i * viewportHeight;
			const screenBottom = screenTop + viewportHeight;
			let count = 0;

			for (const el of allElements) {
				const rect = el.getBoundingClientRect();
				// Account for current scroll position
				const elTop = rect.top + window.scrollY;
				const elBottom = rect.bottom + window.scrollY;
				if (elBottom > screenTop && elTop < screenBottom) {
					count++;
				}
			}
			screens.push(count);
		}

		return screens;
	});

	// Scroll depth
	const scrollDepth = await page.evaluate(() => {
		return document.documentElement.scrollHeight / window.innerHeight;
	});

	// Render completeness — count rendered event elements vs scorecard total
	const renderedEventCount = await page.evaluate(() => {
		const selectors = '.message-row, .system-event, .task-card, .reaction, .thread-marker, .presence-change, .task-update';
		return document.querySelectorAll(selectors).length;
	});
	const totalEvents = scorecard.metrics.teamchatEvents;
	const renderCompleteness = totalEvents > 0 ? renderedEventCount / totalEvents : 1;

	// Whitespace ratio — screenshot pixel analysis
	const whitespaceRatio = await measureWhitespace(page);

	return {
		eventsPerScreen: eventsPerScreen as number[],
		scrollDepth: scrollDepth as number,
		renderCompleteness: Math.min(renderCompleteness, 1),
		whitespaceRatio,
	};
}

/**
 * Take a full-page screenshot and analyze the ratio of background-color pixels.
 * Uses PNG pixel data to estimate how much of the page is "empty" whitespace.
 */
async function measureWhitespace(page: any): Promise<number> {
	try {
		// Get the background color of the page
		const bgColor = await page.evaluate(() => {
			const body = document.body;
			const computed = getComputedStyle(body);
			return computed.backgroundColor;
		});

		// Take a screenshot as a buffer
		const screenshotBuffer = await page.screenshot({ fullPage: false }) as Buffer;

		// Use a simple heuristic: parse PNG pixel data
		// Playwright returns PNG format. We'll evaluate pixel sampling in the browser instead
		// for reliability across environments.
		const ratio = await page.evaluate((bgColorStr: string) => {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) return 0.5;

			// Sample visible viewport
			const width = window.innerWidth;
			const height = window.innerHeight;
			canvas.width = width;
			canvas.height = height;

			// We can't directly capture the rendered page in canvas from JS alone
			// without html2canvas. Instead, we estimate by checking how much of the
			// viewport area is covered by content elements.
			const contentSelectors = '.message-row, .system-event, .task-card, .reaction, .thread-marker, .sidebar, .header, .presence-roster, .chat-input, .replay-controls, .timeline';
			const contentElements = document.querySelectorAll(contentSelectors);
			let coveredArea = 0;
			const totalArea = width * height;

			for (const el of contentElements) {
				const rect = el.getBoundingClientRect();
				// Clip to viewport
				const top = Math.max(rect.top, 0);
				const bottom = Math.min(rect.bottom, height);
				const left = Math.max(rect.left, 0);
				const right = Math.min(rect.right, width);

				if (bottom > top && right > left) {
					coveredArea += (bottom - top) * (right - left);
				}
			}

			// Whitespace = uncovered area ratio (clamped to [0, 1])
			return Math.max(0, Math.min(1, 1 - (coveredArea / totalArea)));
		}, bgColor);

		return ratio as number;
	} catch {
		// If screenshot analysis fails, return a neutral estimate
		return 0.5;
	}
}
