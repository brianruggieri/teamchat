import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { TeamChatServer } from '../../src/server/server.js';
import { loadReplaySource } from '../../src/server/replay.js';
import type { EventProcessor } from '../../src/server/processor.js';
import type { FileWatcher } from '../../src/server/watcher.js';

const replayDir = path.resolve(import.meta.dirname ?? '.', '..', 'replays', 'teamchat-build-session');

function randomPort(): number {
	return 47000 + Math.floor(Math.random() * 1000);
}

describe('Replay Server', () => {
	test('serves live bootstrap contract', async () => {
		const port = randomPort();
		const watcher = {
			getSnapshot() {
				return {
					config: {
						members: [
							{ name: 'team-lead', agentId: 'lead-1', agentType: 'lead', color: '#FFD700' },
							{ name: 'server', agentId: 'agent-1', agentType: 'teammate', color: '#3B82F6' },
						],
					},
					inboxes: new Map(),
					tasks: [],
				};
			},
		} as unknown as FileWatcher;

		const processor = {
			getAllEvents() {
				return [];
			},
			getTasks() {
				return [];
			},
			getPresence() {
				return { server: 'working' as const };
			},
			getThreadStatuses() {
				return [];
			},
		} as unknown as EventProcessor;

		const server = new TeamChatServer({
			port,
			teamName: 'live-team',
			mode: 'live',
			processor,
			watcher,
		});

		server.start();
		try {
			const response = await fetch(`http://127.0.0.1:${port}/bootstrap`);
			const payload = await response.json();
			expect(payload.mode).toBe('live');
			expect(payload.initialState.team.name).toBe('live-team');
			expect(payload.wsUrl).toContain(`/ws`);
		} finally {
			server.stop();
		}
	});

	test('serves replay bootstrap, bundle, and artifact bytes', async () => {
		const port = randomPort();
		const replay = loadReplaySource(replayDir);
		const server = new TeamChatServer({
			port,
			teamName: replay.bundle.manifest.teamName,
			mode: 'replay',
			replay,
		});

		server.start();
		try {
			const bootstrapResponse = await fetch(`http://127.0.0.1:${port}/bootstrap`);
			const bootstrap = await bootstrapResponse.json();
			expect(bootstrap.mode).toBe('replay');
			expect(bootstrap.replayBundleUrl).toBe('/replay/bundle');

			const bundleResponse = await fetch(`http://127.0.0.1:${port}/replay/bundle`);
			const bundle = await bundleResponse.json();
			expect(bundle.entries).toHaveLength(79);
			expect(bundle.artifacts).toHaveLength(1);

			const artifactResponse = await fetch(`http://127.0.0.1:${port}/replay/artifacts/build-session-summary`);
			const artifactHtml = await artifactResponse.text();
			expect(artifactResponse.headers.get('content-type')).toContain('text/html');
			expect(artifactHtml).toContain('Build Session Summary');
		} finally {
			server.stop();
		}
	});
});
