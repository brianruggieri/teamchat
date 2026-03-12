import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { normalizeEntries, loadReplaySource } from '../../src/server/replay.js';
import type { JournalEntry } from '../../src/shared/types.js';

function makeEntry(seq: number, timestamp: string): JournalEntry {
	return {
		seq,
		event: {
			type: 'message',
			id: `msg-${seq}`,
			from: 'agent',
			fromColor: 'blue',
			text: `message ${seq}`,
			summary: null,
			timestamp,
			isBroadcast: false,
			isDM: false,
			dmParticipants: null,
			isLead: false,
			replyToId: null,
		},
	};
}

describe('Replay Ordering', () => {
	test('seq ordering is preserved even when seq=0 has a later timestamp than seq=1', () => {
		// seq=0 has a later timestamp (backdated event scenario)
		// seq=1 has an earlier timestamp
		const entries: JournalEntry[] = [
			makeEntry(0, '2026-03-11T10:00:30.000Z'), // recorded first, later timestamp
			makeEntry(1, '2026-03-11T10:00:00.000Z'), // recorded second, earlier timestamp
		];

		const result = normalizeEntries(entries);

		expect(result).toHaveLength(2);
		// seq=0 entry should come first (recording order preserved)
		expect(result[0]!.event.id).toBe('msg-0');
		expect(result[1]!.event.id).toBe('msg-1');
	});

	test('atMs values are monotonically non-decreasing despite backdated timestamps', () => {
		const entries: JournalEntry[] = [
			makeEntry(0, '2026-03-11T10:00:30.000Z'), // seq 0: later timestamp, atMs=0 (base)
			makeEntry(1, '2026-03-11T10:00:00.000Z'), // seq 1: earlier timestamp, would be negative → clamped
			makeEntry(2, '2026-03-11T10:01:00.000Z'), // seq 2: later timestamp, atMs > seq 0
		];

		const result = normalizeEntries(entries);

		expect(result).toHaveLength(3);
		for (let i = 1; i < result.length; i++) {
			expect(result[i]!.atMs).toBeGreaterThanOrEqual(result[i - 1]!.atMs);
		}
	});

	test('atMs is 0 for the first entry', () => {
		const entries: JournalEntry[] = [
			makeEntry(0, '2026-03-11T10:00:00.000Z'),
			makeEntry(1, '2026-03-11T10:01:00.000Z'),
		];

		const result = normalizeEntries(entries);

		expect(result[0]!.atMs).toBe(0);
		expect(result[1]!.atMs).toBe(60000);
	});

	test('returns empty array for empty input', () => {
		expect(normalizeEntries([])).toEqual([]);
	});

	test('loadBundleFile sets artifactBaseDir when bundle has artifacts', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamchat-test-'));
		const bundlePath = path.join(tmpDir, 'session.teamchat-replay');

		const bundle = {
			manifest: {
				version: 1,
				sessionId: 'test-session',
				teamName: 'test-team',
				startedAt: '2026-03-11T10:00:00.000Z',
				endedAt: '2026-03-11T10:01:00.000Z',
				durationMs: 60000,
				eventCount: 0,
				memberCount: 1,
				taskCount: 0,
				hasArtifacts: true,
				source: { kind: 'bundle', pathLabel: 'session.teamchat-replay' },
			},
			team: { name: 'test-team', members: [] },
			entries: [],
			initialTasks: [],
			finalTasks: [],
			artifacts: [
				{
					id: 'artifact-1',
					title: 'Test Artifact',
					createdAtMs: 1000,
					file: { relativePath: 'artifacts/test.html', mimeType: 'text/html' },
				},
			],
			markers: [],
		};

		fs.writeFileSync(bundlePath, JSON.stringify(bundle), 'utf-8');

		try {
			const loaded = loadReplaySource(bundlePath);
			expect(loaded.artifactBaseDir).not.toBeNull();
			expect(loaded.artifactBaseDir).toBe(tmpDir);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test('loadBundleFile sets artifactBaseDir to null when bundle has no artifacts', () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamchat-test-'));
		const bundlePath = path.join(tmpDir, 'session.teamchat-replay');

		const bundle = {
			manifest: {
				version: 1,
				sessionId: 'test-session',
				teamName: 'test-team',
				startedAt: '2026-03-11T10:00:00.000Z',
				endedAt: '2026-03-11T10:01:00.000Z',
				durationMs: 60000,
				eventCount: 0,
				memberCount: 1,
				taskCount: 0,
				hasArtifacts: false,
				source: { kind: 'bundle', pathLabel: 'session.teamchat-replay' },
			},
			team: { name: 'test-team', members: [] },
			entries: [],
			initialTasks: [],
			finalTasks: [],
			artifacts: [],
			markers: [],
		};

		fs.writeFileSync(bundlePath, JSON.stringify(bundle), 'utf-8');

		try {
			const loaded = loadReplaySource(bundlePath);
			expect(loaded.artifactBaseDir).toBeNull();
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
