import type { ChatState } from './types.js';
import { createBaseChatState, cloneChatState, reduceChatEvents } from './state.js';
import type {
	ReplayArtifact,
	ReplayBundle,
	ReplayCursor,
	ReplayEntry,
	ReplayMarker,
} from '../shared/replay.js';

export interface ReplayCheckpoint {
	seq: number;
	atMs: number;
	state: ChatState;
}

export interface ReplayDerivedState {
	chatState: ChatState;
	visibleArtifacts: ReplayArtifact[];
	activeMarker: ReplayMarker | null;
}

export function createReplayBaseState(bundle: ReplayBundle): ChatState {
	return createBaseChatState({
		team: bundle.team,
		tasks: bundle.initialTasks.map((task) => ({ ...task })),
		sessionStart: bundle.manifest.startedAt,
		connected: true,
	});
}

export function buildReplayCheckpoints(
	bundle: ReplayBundle,
	baseState: ChatState,
	interval = 50,
): ReplayCheckpoint[] {
	const checkpoints: ReplayCheckpoint[] = [
		{ seq: -1, atMs: 0, state: cloneChatState(baseState) },
	];

	let workingState = cloneChatState(baseState);
	for (let index = 0; index < bundle.entries.length; index++) {
		const entry = bundle.entries[index]!;
		workingState = reduceChatEvents(workingState, [entry.event]);
		if ((index + 1) % interval === 0) {
			checkpoints.push({
				seq: entry.seq,
				atMs: entry.atMs,
				state: cloneChatState(workingState),
			});
		}
	}

	return checkpoints;
}

export function getReplayDurationMs(bundle: ReplayBundle): number {
	return bundle.manifest.durationMs;
}

export function getReplayCursorAtMs(bundle: ReplayBundle, atMs: number): ReplayCursor {
	const durationMs = getReplayDurationMs(bundle);
	const clampedMs = clamp(atMs, 0, durationMs);
	let low = 0;
	let high = bundle.entries.length - 1;
	let bestIndex = -1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const entry = bundle.entries[mid]!;
		if (entry.atMs <= clampedMs) {
			bestIndex = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return {
		atMs: clampedMs,
		seq: bestIndex >= 0 ? bundle.entries[bestIndex]!.seq : -1,
	};
}

export function stepReplayCursor(
	bundle: ReplayBundle,
	cursor: ReplayCursor,
	direction: -1 | 1,
): ReplayCursor {
	if (bundle.entries.length === 0) {
		return { atMs: 0, seq: -1 };
	}

	const currentIndex = getEntryIndexForCursor(bundle, cursor);
	const targetIndex = clamp(
		currentIndex + direction,
		-1,
		bundle.entries.length - 1,
	);
	if (targetIndex < 0) {
		return { atMs: 0, seq: -1 };
	}
	const target = bundle.entries[targetIndex]!;
	return { atMs: target.atMs, seq: target.seq };
}

export function getNextMarkerCursor(bundle: ReplayBundle, cursor: ReplayCursor): ReplayCursor {
	const next = bundle.markers.find((marker) =>
		marker.atMs > cursor.atMs
		|| (marker.atMs === cursor.atMs && marker.seq > cursor.seq)
	);
	if (!next) {
		return getReplayCursorAtMs(bundle, getReplayDurationMs(bundle));
	}
	return { atMs: next.atMs, seq: next.seq };
}

export function getPrevMarkerCursor(bundle: ReplayBundle, cursor: ReplayCursor): ReplayCursor {
	for (let index = bundle.markers.length - 1; index >= 0; index--) {
		const marker = bundle.markers[index]!;
		if (marker.atMs < cursor.atMs || (marker.atMs === cursor.atMs && marker.seq < cursor.seq)) {
			return { atMs: marker.atMs, seq: marker.seq };
		}
	}
	return { atMs: 0, seq: -1 };
}

export function deriveReplayState(
	bundle: ReplayBundle,
	baseState: ChatState,
	checkpoints: ReplayCheckpoint[],
	cursor: ReplayCursor,
): ReplayDerivedState {
	const entryIndex = getEntryIndexForCursor(bundle, cursor);
	const checkpoint = findNearestCheckpoint(checkpoints, cursor.seq);
	let state = cloneChatState(checkpoint.state);
	const startIndex = checkpoint.seq + 1;
	const endIndex = entryIndex + 1;
	if (startIndex < endIndex) {
		state = reduceChatEvents(state, bundle.entries.slice(startIndex, endIndex).map((entry) => entry.event));
	}

	return {
		chatState: state,
		visibleArtifacts: bundle.artifacts.filter((artifact) => artifact.createdAtMs <= cursor.atMs),
		activeMarker: findActiveMarker(bundle, cursor),
	};
}

const seqIndexCache = new WeakMap<readonly ReplayEntry[], Map<number, number>>();

function getSeqIndexMap(entries: readonly ReplayEntry[]): Map<number, number> {
	let map = seqIndexCache.get(entries);
	if (!map) {
		map = new Map();
		for (let i = 0; i < entries.length; i++) {
			map.set(entries[i]!.seq, i);
		}
		seqIndexCache.set(entries, map);
	}
	return map;
}

function getEntryIndexForCursor(bundle: ReplayBundle, cursor: ReplayCursor): number {
	if (cursor.seq < 0) {
		return -1;
	}
	return getSeqIndexMap(bundle.entries).get(cursor.seq) ?? -1;
}

function findNearestCheckpoint(checkpoints: ReplayCheckpoint[], seq: number): ReplayCheckpoint {
	let best = checkpoints[0]!;
	for (const checkpoint of checkpoints) {
		if (checkpoint.seq > seq) {
			break;
		}
		best = checkpoint;
	}
	return best;
}

function findActiveMarker(bundle: ReplayBundle, cursor: ReplayCursor): ReplayMarker | null {
	for (let index = bundle.markers.length - 1; index >= 0; index--) {
		const marker = bundle.markers[index]!;
		if (marker.atMs < cursor.atMs || (marker.atMs === cursor.atMs && marker.seq <= cursor.seq)) {
			return marker;
		}
	}
	return null;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
