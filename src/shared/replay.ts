import type { SessionState, TaskInfo, TeamState, ChatEvent } from './types.js';

export interface ReplayManifest {
	version: 1;
	sessionId: string;
	teamName: string;
	startedAt: string;
	endedAt: string;
	durationMs: number;
	eventCount: number;
	memberCount: number;
	taskCount: number;
	hasArtifacts: boolean;
	source: {
		kind: 'journal' | 'bundle';
		pathLabel: string;
	};
}

export interface ReplayEntry {
	seq: number;
	atMs: number;
	event: ChatEvent;
}

export interface ReplayArtifact {
	id: string;
	kind: 'report';
	title: string;
	createdAtMs: number;
	createdBy?: string | null;
	sourceEventIds: string[];
	summary?: string | null;
	file: {
		relativePath: string;
		mimeType: string;
	};
}

export interface ReplayMarker {
	id: string;
	kind:
		| 'session-start'
		| 'task-created'
		| 'task-claimed'
		| 'task-completed'
		| 'task-unblocked'
		| 'thread-start'
		| 'plan'
		| 'permission'
		| 'artifact'
		| 'all-tasks-completed';
	atMs: number;
	seq: number;
	label: string;
	eventId?: string;
	taskId?: string;
	artifactId?: string;
}

export interface ReplayCursor {
	atMs: number;
	seq: number;
}

export interface ReplayBundle {
	manifest: ReplayManifest;
	team: TeamState;
	entries: ReplayEntry[];
	initialTasks: TaskInfo[];
	finalTasks: TaskInfo[];
	artifacts: ReplayArtifact[];
	markers: ReplayMarker[];
}

export interface LiveAppBootstrap {
	mode: 'live';
	initialState: SessionState;
	wsUrl: string;
}

export interface ReplayAppBootstrap {
	mode: 'replay';
	replayManifest: ReplayManifest;
	replayBundleUrl: string;
	artifactBaseUrl: string;
	isDemo?: boolean;
}

export type AppBootstrap = LiveAppBootstrap | ReplayAppBootstrap;
