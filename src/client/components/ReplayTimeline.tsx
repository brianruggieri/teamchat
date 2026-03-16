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

export function enforceMinGap(markers: ReplayMarker[], durationMs: number, trackWidthPx = 800): Map<string, number> {
	const MIN_GAP_PX = 24;
	const positions = new Map<string, number>();
	let lastPx = -Infinity;
	for (const marker of markers) {
		let pct = durationMs > 0 ? (marker.atMs / durationMs) * 100 : 0;
		let px = (pct / 100) * trackWidthPx;
		if (px - lastPx < MIN_GAP_PX) {
			px = lastPx + MIN_GAP_PX;
			pct = (px / trackWidthPx) * 100;
		}
		positions.set(marker.id, pct);
		lastPx = px;
	}
	return positions;
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
	const markerPositions = useMemo(() => enforceMinGap(markers, durationMs), [markers, durationMs]);

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
					{markers.map((marker) => {
						const mc = getMarkerContent(marker);
						const isAgent = mc.type === 'agent';
						const classes = [
							'tc-replay-marker',
							isAgent ? 'is-agent' : '',
							mc.isFinale ? 'is-all-tasks-completed' : '',
						].filter(Boolean).join(' ');

						return (
							<button
								key={marker.id}
								type="button"
								className={classes}
								style={{ left: `${markerPositions.get(marker.id) ?? 0}%` }}
								onClick={() => onMarkerJump(marker)}
								title={`${marker.label} · ${formatMs(marker.atMs)}`}
								aria-label={`${marker.label} at ${formatMs(marker.atMs)}`}
							>
								{mc.content}
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
