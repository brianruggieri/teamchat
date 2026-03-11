import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { loadReplaySource } from '../../src/server/replay.js';

const replayDir = path.resolve(import.meta.dirname ?? '.', '..', 'replays', 'teamchat-build-session');
const replayFile = path.join(replayDir, 'session.jsonl');

describe('Replay Loader', () => {
	test('loads canonical replay bundle directory with manifest and artifacts', () => {
		const loaded = loadReplaySource(replayDir);

		expect(loaded.bundle.manifest.teamName).toBe('concurrent-shimmying-garden');
		expect(loaded.bundle.entries).toHaveLength(79);
		expect(loaded.bundle.markers.length).toBeGreaterThan(5);
		expect(loaded.bundle.artifacts).toHaveLength(1);
		expect(loaded.bundle.artifacts[0]?.id).toBe('build-session-summary');
		expect(loaded.bundle.entries[0]?.atMs).toBe(0);
		expect(loaded.bundle.entries.at(-1)?.atMs).toBe(5160000);
	});

	test('loads legacy journal path and still discovers adjacent sidecars', () => {
		const loaded = loadReplaySource(replayFile);

		expect(loaded.bundle.manifest.source.kind).toBe('journal');
		expect(loaded.bundle.team.members).toHaveLength(4);
		expect(loaded.bundle.finalTasks).toHaveLength(9);
		expect(loaded.bundle.artifacts[0]?.file.relativePath).toBe(
			'artifacts/build-session-summary.html',
		);
	});
});
