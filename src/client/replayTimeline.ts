import type { ReplayMarker } from '../shared/replay.js';

export interface ReplayTimelineChip {
	id: string;
	atMs: number;
	label: string;
	detailLabel: string;
	marker: ReplayMarker;
}

const TASK_CREATED_CLUSTER_WINDOW_MS = 15_000;

export function buildReplayTimelineChips(markers: ReplayMarker[]): ReplayTimelineChip[] {
	const chips: ReplayTimelineChip[] = [];

	for (let index = 0; index < markers.length; index++) {
		const marker = markers[index]!;

		if (marker.kind === 'task-created') {
			const cluster = [marker];
			let nextIndex = index + 1;

			while (nextIndex < markers.length) {
				const candidate = markers[nextIndex]!;
				if (candidate.kind !== 'task-created') {
					break;
				}
				if (candidate.atMs - cluster[0]!.atMs > TASK_CREATED_CLUSTER_WINDOW_MS) {
					break;
				}
				cluster.push(candidate);
				nextIndex += 1;
			}

			chips.push(cluster.length === 1 ? buildTaskCreatedChip(marker) : buildTaskCreatedClusterChip(cluster));
			index = nextIndex - 1;
			continue;
		}

		const label = getShortMarkerLabel(marker);
		if (!label) {
			continue;
		}

		chips.push({
			id: marker.id,
			atMs: marker.atMs,
			label,
			detailLabel: marker.label,
			marker,
		});
	}

	return chips;
}

export function getVisibleReplayTimelineChips(
	chips: ReplayTimelineChip[],
	elapsedMs: number,
	maxVisible = 6,
): {
	activeChipId: string | null;
	visibleChips: ReplayTimelineChip[];
} {
	if (chips.length <= maxVisible) {
		return {
			activeChipId: chips[findActiveChipIndex(chips, elapsedMs)]?.id ?? null,
			visibleChips: chips,
		};
	}

	const activeIndex = findActiveChipIndex(chips, elapsedMs);
	const windowSize = Math.max(1, maxVisible);
	const start = clamp(activeIndex - 2, 0, Math.max(0, chips.length - windowSize));
	const end = Math.min(chips.length, start + windowSize);

	return {
		activeChipId: chips[activeIndex]?.id ?? null,
		visibleChips: chips.slice(start, end),
	};
}

function buildTaskCreatedChip(marker: ReplayMarker): ReplayTimelineChip {
	return {
		id: marker.id,
		atMs: marker.atMs,
		label: marker.taskId ? `#${marker.taskId} opened` : 'Task opened',
		detailLabel: marker.label,
		marker,
	};
}

function buildTaskCreatedClusterChip(cluster: ReplayMarker[]): ReplayTimelineChip {
	const firstMarker = cluster[0]!;
	return {
		id: `cluster-${firstMarker.id}`,
		atMs: firstMarker.atMs,
		label: `${cluster.length} tasks opened`,
		detailLabel: `${cluster.length} tasks created`,
		marker: firstMarker,
	};
}

function getShortMarkerLabel(marker: ReplayMarker): string | null {
	switch (marker.kind) {
		case 'session-start':
			return 'Start';
		case 'task-claimed':
			return marker.taskId ? `#${marker.taskId} started` : 'Task started';
		case 'task-completed':
			return marker.taskId ? `#${marker.taskId} done` : 'Task done';
		case 'task-unblocked':
			return marker.taskId ? `#${marker.taskId} ready` : 'Task ready';
		case 'thread-start':
			return marker.label.replace('DM: ', 'DM ').replace(' ↔ ', '/');
		case 'plan':
			return 'Plan';
		case 'permission':
			return 'Permission';
		case 'artifact':
			return marker.label.length > 28 ? 'Artifact ready' : marker.label;
		case 'all-tasks-completed':
			return '🎉 All done';
		default:
			return null;
	}
}

function findActiveChipIndex(chips: ReplayTimelineChip[], elapsedMs: number): number {
	for (let index = chips.length - 1; index >= 0; index--) {
		if (chips[index]!.atMs <= elapsedMs) {
			return index;
		}
	}
	return 0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
