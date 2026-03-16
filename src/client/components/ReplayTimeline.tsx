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

/* --- Visual clustering types and helpers --- */

export interface VisualCluster {
	id: string;
	markers: ReplayMarker[];
	atMs: number;
	positionPct: number;
}

const KIND_PRIORITY: Record<string, number> = {
	'all-tasks-completed': 10,
	'task-completed': 8,
	'thread-start': 7,
	'task-claimed': 6,
	'task-unblocked': 5,
	'permission': 4,
	'plan': 3,
	'task-created': 2,
	'artifact': 2,
	'session-start': 1,
};

export function pickRepresentative(markers: ReplayMarker[]): ReplayMarker {
	return markers.reduce((best, m) =>
		(KIND_PRIORITY[m.kind] ?? 0) > (KIND_PRIORITY[best.kind] ?? 0) ? m : best
	);
}

/**
 * Cluster markers that are too close together in pixel-space into
 * a single visual dot with a count badge.
 */
export function clusterMarkers(markers: ReplayMarker[], durationMs: number, trackWidthPx = 600): VisualCluster[] {
	const MIN_GAP_PX = 28;
	const clusters: VisualCluster[] = [];

	for (const marker of markers) {
		const px = durationMs > 0 ? (marker.atMs / durationMs) * trackWidthPx : 0;
		const lastCluster = clusters[clusters.length - 1];
		const lastPx = lastCluster
			? (lastCluster.atMs / durationMs) * trackWidthPx
			: -Infinity;

		if (lastCluster && px - lastPx < MIN_GAP_PX) {
			lastCluster.markers.push(marker);
			lastCluster.atMs =
				lastCluster.markers.reduce((sum, m) => sum + m.atMs, 0) /
				lastCluster.markers.length;
		} else {
			clusters.push({
				id: `cluster-${marker.id}`,
				markers: [marker],
				atMs: marker.atMs,
				positionPct: durationMs > 0 ? (marker.atMs / durationMs) * 100 : 0,
			});
		}
	}

	for (const cluster of clusters) {
		cluster.positionPct = durationMs > 0 ? (cluster.atMs / durationMs) * 100 : 0;
	}

	return clusters;
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
	const clusters = useMemo(() => clusterMarkers(markers, durationMs), [markers, durationMs]);

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
					{clusters.map((cluster) => {
						const rep = cluster.markers.length === 1
							? cluster.markers[0]!
							: pickRepresentative(cluster.markers);
						const mc = getMarkerContent(rep);
						const isAgent = mc.type === 'agent';
						const isCluster = cluster.markers.length > 1;
						const classes = [
							'tc-replay-marker',
							isAgent ? 'is-agent' : '',
							mc.isFinale ? 'is-all-tasks-completed' : '',
							isCluster ? 'is-cluster' : '',
						].filter(Boolean).join(' ');

						const title = isCluster
							? `${cluster.markers.length} events near ${formatMs(cluster.atMs)}`
							: `${rep.label} · ${formatMs(rep.atMs)}`;
						const ariaLabel = isCluster
							? `${cluster.markers.length} events at ${formatMs(cluster.atMs)}`
							: `${rep.label} at ${formatMs(rep.atMs)}`;

						return (
							<button
								key={cluster.id}
								type="button"
								className={classes}
								style={{ left: `${cluster.positionPct}%` }}
								onClick={() => onMarkerJump(rep)}
								title={title}
								aria-label={ariaLabel}
							>
								{mc.content}
								{isCluster && (
									<span className="tc-marker-count">
										{cluster.markers.length}
									</span>
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
