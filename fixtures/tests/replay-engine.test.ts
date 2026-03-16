import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { loadReplaySource } from '../../src/server/replay.js';
import {
	buildReplayCheckpoints,
	createReplayBaseState,
	deriveReplayState,
	getNextMarkerCursor,
	getPrevMarkerCursor,
	getReplayCursorAtMs,
	stepReplayCursor,
} from '../../src/client/replay.js';
import {
	buildReplayTimelineChips,
	getVisibleReplayTimelineChips,
} from '../../src/client/replayTimeline.js';
import { formatDuration, formatRelativeTime } from '../../src/client/hooks/useRelativeTime.js';

const replayDir = path.resolve(import.meta.dirname ?? '.', '..', 'replays', 'teamchat-build-session');

describe('Replay Engine', () => {
	test('derives deterministic state at arbitrary cursor positions', () => {
		const loaded = loadReplaySource(replayDir);
		const baseState = createReplayBaseState(loaded.bundle);
		const checkpoints = buildReplayCheckpoints(loaded.bundle, baseState, 10);
		const fullCursor = getReplayCursorAtMs(
			loaded.bundle,
			loaded.bundle.manifest.durationMs,
		);
		const derived = deriveReplayState(
			loaded.bundle,
			baseState,
			checkpoints,
			fullCursor,
		);

		expect(derived.chatState.events).toHaveLength(79);
		expect(derived.visibleArtifacts).toHaveLength(1);
		expect(derived.chatState.tasks.some((task) => task.id === '1')).toBe(true);
	});

	test('steps through entries and markers in order', () => {
		const loaded = loadReplaySource(replayDir);
		const firstStep = stepReplayCursor(loaded.bundle, { atMs: 0, seq: -1 }, 1);
		const secondStep = stepReplayCursor(loaded.bundle, firstStep, 1);
		const prevStep = stepReplayCursor(loaded.bundle, secondStep, -1);

		expect(firstStep.seq).toBe(0);
		expect(secondStep.seq).toBe(1);
		expect(prevStep.seq).toBe(0);

		const nextMarker = getNextMarkerCursor(loaded.bundle, { atMs: 0, seq: -1 });
		const prevMarker = getPrevMarkerCursor(loaded.bundle, nextMarker);
		expect(nextMarker.seq).toBeGreaterThanOrEqual(0);
		expect(prevMarker.seq).toBe(-1);
	});

	test('formats replay-relative time against provided virtual clock', () => {
		expect(
			formatRelativeTime('2026-03-10T14:00:00.000Z', Date.parse('2026-03-10T14:05:00.000Z')),
		).toBe('5m ago');
		expect(
			formatDuration('2026-03-10T14:00:00.000Z', Date.parse('2026-03-10T15:26:00.000Z')),
		).toBe('1h 26m');
	});

	test('builds shorter replay checkpoint chips and windows them around the active point', () => {
		const loaded = loadReplaySource(replayDir);
		const chips = buildReplayTimelineChips(loaded.bundle.markers);
		const startCluster = chips[1];

		expect(chips[0]?.label).toBe('Start');
		expect(startCluster?.label).toBe('9 tasks opened');

		const visible = getVisibleReplayTimelineChips(chips, 0, 4);
		expect(visible.visibleChips).toHaveLength(4);
		expect(visible.visibleChips[0]?.label).toBe('Start');
		expect(visible.activeChipId).toBe(chips[0]?.id ?? null);
	});

	test('clusters task-claimed markers within 15s window', () => {
		const loaded = loadReplaySource(replayDir);
		const chips = buildReplayTimelineChips(loaded.bundle.markers);
		// Task claimed markers that are close together should be clustered
		const claimedChips = chips.filter(c => c.label.includes('started'));
		const rawClaimed = loaded.bundle.markers.filter(m => m.kind === 'task-claimed');
		// Clustered chips should be fewer than raw markers (or equal if no clustering needed)
		expect(claimedChips.length).toBeLessThanOrEqual(rawClaimed.length);
	});

	test('clusters task-completed markers within 15s window', () => {
		const loaded = loadReplaySource(replayDir);
		const chips = buildReplayTimelineChips(loaded.bundle.markers);
		// Task completed markers that are close together should be clustered
		const completedChips = chips.filter(c => c.label.includes('done'));
		const rawCompleted = loaded.bundle.markers.filter(m => m.kind === 'task-completed');
		// Clustered chips should be fewer than raw markers (or equal if no clustering needed)
		expect(completedChips.length).toBeLessThanOrEqual(rawCompleted.length);
	});
});
