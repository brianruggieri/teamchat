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
					{markers.map((marker) => (
						<button
							key={marker.id}
							type="button"
							className={`tc-replay-marker is-${marker.kind}`}
							style={{ left: `${durationMs > 0 ? (marker.atMs / durationMs) * 100 : 0}%` }}
							onClick={() => onMarkerJump(marker)}
							title={`${marker.label} · ${formatMs(marker.atMs)}`}
							aria-label={`${marker.label} at ${formatMs(marker.atMs)}`}
						/>
					))}
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
