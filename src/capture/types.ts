// src/capture/types.ts
import type { AgentInfo } from '../shared/types';

export interface CaptureManifest {
	version: 1;
	team: string;
	sessionId: string;
	projectPath: string;
	durationMs: number;
	agents: AgentInfo[];
	taskCount: number;
	eventCount: number;
	capturedAt: string;
	startedAt: string;
	endedAt: string;
}

export interface CapturePaths {
	root: string;
	manifest: string;
	leadLog: string;
	subagentsDir: string;
	inboxesDir: string;
	journal: string;
	tasksDir: string;
}

export function getCapturePaths(bundleRoot: string): CapturePaths {
	return {
		root: bundleRoot,
		manifest: `${bundleRoot}/manifest.json`,
		leadLog: `${bundleRoot}/lead.jsonl`,
		subagentsDir: `${bundleRoot}/subagents`,
		inboxesDir: `${bundleRoot}/inboxes`,
		journal: `${bundleRoot}/journal.jsonl`,
		tasksDir: `${bundleRoot}/tasks`,
	};
}
