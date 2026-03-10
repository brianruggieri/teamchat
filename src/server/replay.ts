import type { ReplayBundle } from '../shared/replay.js';

export interface LoadedReplaySource {
	bundle: ReplayBundle;
	rootDir: string;
	artifactBaseDir: string | null;
}
