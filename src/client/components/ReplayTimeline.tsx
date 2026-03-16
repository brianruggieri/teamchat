import React, { useMemo } from 'react';
import type { ReplayMarker } from '../../shared/replay.js';
import { formatMs } from './ReplayControls.jsx';
import {
	buildReplayTimelineChips,
	getVisibleReplayTimelineChips,
} from '../replayTimeline.js';

interface ReplayTimelineProps {
	elapsedMs: number;
	durationMs: number;
	markers: ReplayMarker[];
	onSeek: (ms: number) => void;
	onMarkerJump: (marker: ReplayMarker) => void;
}

function getMarkerContent(marker: ReplayMarker): {
	type: 'emoji' | 'agent';
	content: string;
	isFinale?: boolean;
} {
	switch (marker.kind) {
		case 'session-start': return { type: 'emoji', content: '▶️' };
		case 'task-created': return { type: 'emoji', content: '📋' };
		case 'task-completed': return { type: 'emoji', content: '✅' };
		case 'task-claimed': {
			// Shows first agent's letter; count badge indicates total agents
			const agentName = marker.label.split(' ')[0] ?? '';
			return { type: 'agent', content: agentName.charAt(0).toUpperCase() };
		}
		case 'thread-start': return { type: 'emoji', content: '💬' };
		case 'permission': return { type: 'emoji', content: '🔐' };
		case 'plan': return { type: 'emoji', content: '📋' };
		case 'artifact': return { type: 'emoji', content: '📦' };
		case 'all-tasks-completed': return { type: 'emoji', content: '🎉', isFinale: true };
		case 'task-unblocked': return { type: 'emoji', content: '🔓' };
		default: return { type: 'emoji', content: '•' };
	}
}

/* --- Visual clustering types and helpers --- */

/** A rendered dot on the timeline — one per unique kind within a proximity group. */
export interface TimelineDot {
	id: string;
	/** The representative marker for this dot (first of this kind in the group). */
	marker: ReplayMarker;
	/** All markers of this kind in the group. */
	markers: ReplayMarker[];
	/** Average time of markers in this sub-group (for positioning). */
	atMs: number;
	positionPct: number;
}

/**
 * Build timeline dots by:
 * 1. Grouping markers that are too close together in pixel-space.
 * 2. Within each group, emitting one dot per unique event kind,
 *    positioned at that sub-group's average time.
 *
 * This keeps density manageable while showing the composition of
 * what happened (📋 + S + 💬 instead of a single icon with "33").
 */
export function buildTimelineDots(markers: ReplayMarker[], durationMs: number, trackWidthPx = 600): TimelineDot[] {
	const MIN_GAP_PX = 28;

	// Step 1: group markers by proximity
	const groups: ReplayMarker[][] = [];
	let currentGroup: ReplayMarker[] = [];

	for (const marker of markers) {
		const px = durationMs > 0 ? (marker.atMs / durationMs) * trackWidthPx : 0;

		if (currentGroup.length === 0) {
			currentGroup.push(marker);
			continue;
		}

		// Compare against the first marker in the group (anchor) to keep the group window bounded
		const anchorPx = durationMs > 0 ? (currentGroup[0]!.atMs / durationMs) * trackWidthPx : 0;
		if (px - anchorPx < MIN_GAP_PX * 3) {
			currentGroup.push(marker);
		} else {
			groups.push(currentGroup);
			currentGroup = [marker];
		}
	}
	if (currentGroup.length > 0) groups.push(currentGroup);

	// Step 2: within each group, emit one dot per unique kind
	const dots: TimelineDot[] = [];

	for (const group of groups) {
		// Collect markers by kind — use a display kind that merges task-claimed agents into one
		const byKind = new Map<string, ReplayMarker[]>();
		for (const m of group) {
			const key = m.kind;
			if (!byKind.has(key)) byKind.set(key, []);
			byKind.get(key)!.push(m);
		}

		for (const [kind, kindMarkers] of byKind) {
			const avgMs = kindMarkers.reduce((sum, m) => sum + m.atMs, 0) / kindMarkers.length;
			const pct = durationMs > 0 ? Math.min((avgMs / durationMs) * 100, 100) : 0;
			dots.push({
				id: `dot-${kind}-${kindMarkers[0]!.id}`,
				marker: kindMarkers[0]!,
				markers: kindMarkers,
				atMs: avgMs,
				positionPct: pct,
			});
		}
	}

	return dots;
}

export function ReplayTimeline({
	elapsedMs,
	durationMs,
	markers,
	onSeek,
	onMarkerJump,
}: ReplayTimelineProps) {
	const chips = useMemo(() => buildReplayTimelineChips(markers), [markers]);
	const { activeChipId, visibleChips } = useMemo(
		() => getVisibleReplayTimelineChips(chips, elapsedMs),
		[chips, elapsedMs],
	);
	const dots = useMemo(() => buildTimelineDots(markers, durationMs), [markers, durationMs]);

	return (
		<section className="tc-replay-timeline">
			<div className="tc-replay-scrubber-shell">
				<input
					type="range"
					min={0}
					max={Math.max(durationMs, 1)}
					value={Math.min(elapsedMs, durationMs)}
					onChange={(event) => onSeek(Number(event.target.value))}
					className="tc-replay-scrubber"
					aria-label="Replay scrubber"
				/>
				<div className="tc-replay-marker-track" aria-hidden="true">
					{dots.map((dot) => {
						const mc = getMarkerContent(dot.marker);
						const isAgent = mc.type === 'agent';
						const count = dot.markers.length;
						const classes = [
							'tc-replay-marker',
							isAgent ? 'is-agent' : '',
							mc.isFinale ? 'is-all-tasks-completed' : '',
							count > 1 ? 'is-cluster' : '',
						].filter(Boolean).join(' ');

						const kindLabel = count > 1
							? `${count} ${dot.marker.kind.replace(/-/g, ' ')} events · ${formatMs(dot.atMs)}`
							: `${dot.marker.label} · ${formatMs(dot.marker.atMs)}`;

						return (
							<button
								key={dot.id}
								type="button"
								className={classes}
								style={{ left: `${dot.positionPct}%` }}
								onClick={() => onMarkerJump(dot.marker)}
								title={kindLabel}
								aria-label={kindLabel}
							>
								{mc.content}
								{count > 1 && (
									<span className="tc-marker-count">{count}</span>
								)}
							</button>
						);
					})}
				</div>
			</div>
			<div className="tc-replay-marker-list">
				{visibleChips.map((chip) => (
					<button
						key={chip.id}
						type="button"
						className={`tc-replay-chip ${chip.id === activeChipId ? 'is-active' : ''}`}
						onClick={() => onMarkerJump(chip.marker)}
						title={`${chip.detailLabel} · ${formatMs(chip.atMs)}`}
					>
						<span>{chip.label}</span>
						<span>{formatMs(chip.atMs)}</span>
					</button>
				))}
			</div>
		</section>
	);
}
