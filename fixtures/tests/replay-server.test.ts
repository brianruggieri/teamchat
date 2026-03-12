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

	test('serves auto bootstrap contract (lobby mode)', async () => {
		const port = randomPort();
		const server = new TeamChatServer({ port, mode: 'auto' });

		server.start();
		try {
			const response = await fetch(`http://127.0.0.1:${port}/bootstrap`);
			const payload = await response.json();
			expect(payload.mode).toBe('auto');
			expect(payload.wsUrl).toContain('/ws');
		} finally {
			server.stop();
		}
	});

	test('sends auto-waiting on WebSocket connect in auto mode', async () => {
		const port = randomPort();
		const server = new TeamChatServer({ port, mode: 'auto' });

		server.start();
		try {
			const msg = await new Promise<{ type: string }>((resolve, reject) => {
				const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
				ws.onmessage = (e) => {
					resolve(JSON.parse(e.data as string));
					ws.close();
				};
				ws.onerror = () => {
					reject(new Error('WebSocket error'));
					ws.close();
				};
				setTimeout(() => {
					reject(new Error('Timed out waiting for auto-waiting message'));
					ws.close();
				}, 2000);
			});
			expect(msg.type).toBe('auto-waiting');
		} finally {
			server.stop();
		}
	});

	test('activateTeam sends team-ready to connected lobby clients', async () => {
		const port = randomPort();
		const server = new TeamChatServer({ port, mode: 'auto' });

		server.start();
		try {
			// Connect a WebSocket client while in auto/lobby mode
			const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

			// Wait for the auto-waiting message first
			await new Promise<void>((resolve) => {
				ws.onmessage = (e) => {
					const msg = JSON.parse(e.data as string) as { type: string };
					if (msg.type === 'auto-waiting') resolve();
				};
			});

			// Set up listener for team-ready before calling activateTeam
			const teamReadyPromise = new Promise<{ type: string; state: { team: { name: string }; events: unknown[] } }>((resolve, reject) => {
				ws.onmessage = (e) => {
					resolve(JSON.parse(e.data as string));
				};
				setTimeout(() => reject(new Error('Timed out waiting for team-ready')), 2000);
			});

			// Create mock processor and watcher for activation
			const watcher = {
				getSnapshot() {
					return {
						config: {
							members: [
								{ name: 'team-lead', agentId: 'lead-1', agentType: 'lead', color: '#FFD700' },
								{ name: 'worker', agentId: 'agent-1', agentType: 'teammate', color: '#3B82F6' },
							],
						},
						inboxes: new Map(),
						tasks: [],
					};
				},
			} as unknown as FileWatcher;

			const processor = {
				getAllEvents() { return []; },
				getTasks() { return []; },
				getPresence() { return { worker: 'working' as const }; },
				getThreadStatuses() { return []; },
			} as unknown as EventProcessor;

			// Activate the team — should transition to live mode
			server.activateTeam('test-auto-team', processor, watcher);

			const readyMsg = await teamReadyPromise;
			expect(readyMsg.type).toBe('team-ready');
			expect(readyMsg.state.team.name).toBe('test-auto-team');
			expect(Array.isArray(readyMsg.state.events)).toBe(true);

			// Verify bootstrap now returns live mode
			const response = await fetch(`http://127.0.0.1:${port}/bootstrap`);
			const bootstrap = await response.json();
			expect(bootstrap.mode).toBe('live');
			expect(bootstrap.initialState.team.name).toBe('test-auto-team');

			ws.close();
		} finally {
			server.stop();
		}
	});

	test('broadcasts events to clients after activateTeam', async () => {
		const port = randomPort();
		const server = new TeamChatServer({ port, mode: 'auto' });

		server.start();
		try {
			const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

			// Wait for auto-waiting
			await new Promise<void>((resolve) => {
				ws.onmessage = () => resolve();
			});

			const watcher = {
				getSnapshot() {
					return {
						config: { members: [{ name: 'team-lead', agentId: 'lead-1', agentType: 'lead', color: '#FFD700' }] },
						inboxes: new Map(),
						tasks: [],
					};
				},
			} as unknown as FileWatcher;

			const processor = {
				getAllEvents() { return []; },
				getTasks() { return []; },
				getPresence() { return {}; },
				getThreadStatuses() { return []; },
			} as unknown as EventProcessor;

			server.activateTeam('broadcast-team', processor, watcher);

			// Wait for team-ready
			await new Promise<void>((resolve) => {
				ws.onmessage = (e) => {
					const msg = JSON.parse(e.data as string) as { type: string };
					if (msg.type === 'team-ready') resolve();
				};
			});

			// Now broadcast events — should reach the connected client
			const broadcastPromise = new Promise<{ type: string; events: { type: string; id: string }[] }>((resolve, reject) => {
				ws.onmessage = (e) => {
					resolve(JSON.parse(e.data as string));
				};
				setTimeout(() => reject(new Error('Timed out waiting for broadcast')), 2000);
			});

			server.broadcast([{ type: 'message', id: 'test-1', timestamp: new Date().toISOString(), agentName: 'worker', content: 'hello' } as import('../../src/shared/types.js').ChatEvent]);

			const broadcastMsg = await broadcastPromise;
			expect(broadcastMsg.type).toBe('events');
			expect(broadcastMsg.events).toHaveLength(1);
			expect(broadcastMsg.events[0]!.id).toBe('test-1');

			ws.close();
		} finally {
			server.stop();
		}
	});

	test('rejects WebSocket upgrade in replay mode', async () => {
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
			const response = await fetch(`http://127.0.0.1:${port}/ws`);
			expect(response.status).toBe(409);
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
