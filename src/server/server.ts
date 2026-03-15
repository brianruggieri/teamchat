import * as path from 'node:path';
import type { ChatEvent, SessionState, TeamState } from '../shared/types.js';
import type { AppBootstrap } from '../shared/replay.js';
import type { EventProcessor } from './processor.js';
import type { FileWatcher } from './watcher.js';
import type { LoadedReplaySource } from './replay.js';

interface LiveServerOptions {
	port: number;
	teamName: string;
	mode: 'live';
	processor: EventProcessor;
	watcher: FileWatcher;
}

interface ReplayServerOptions {
	port: number;
	teamName: string;
	mode: 'replay';
	replay: LoadedReplaySource;
}

interface AutoServerOptions {
	port: number;
	mode: 'auto';
}

type ServerOptions = LiveServerOptions | ReplayServerOptions | AutoServerOptions;

export class TeamChatServer {
	private port: number;
	private teamName: string;
	private mode: 'live' | 'replay' | 'auto';
	private processor: EventProcessor | null;
	private watcher: FileWatcher | null;
	private replay: LoadedReplaySource | null;
	private clients: Set<{ send(data: string): void; readyState: number }> = new Set();
	private server: ReturnType<typeof Bun.serve> | null = null;
	private sessionStart: string;

	constructor(options: ServerOptions) {
		this.port = options.port;
		this.mode = options.mode;
		if (options.mode === 'live') {
			this.teamName = options.teamName;
			this.processor = options.processor;
			this.watcher = options.watcher;
			this.replay = null;
			this.sessionStart = new Date().toISOString();
		} else if (options.mode === 'replay') {
			this.teamName = options.teamName;
			this.processor = null;
			this.watcher = null;
			this.replay = options.replay;
			this.sessionStart = options.replay.bundle.manifest.startedAt;
		} else {
			// auto mode — no team yet, waiting for one to be created
			this.teamName = '';
			this.processor = null;
			this.watcher = null;
			this.replay = null;
			this.sessionStart = new Date().toISOString();
		}
	}

	/** Start the HTTP + WebSocket server. */
	start(): void {
		const clientDir = path.resolve(import.meta.dirname ?? '.', '..', '..', 'dist', 'client');
		const serverRef = this;
		const isDev = process.env.NODE_ENV !== 'production';
		const noCacheHeaders: Record<string, string> = isDev
			? {
				'Cache-Control': 'no-store, no-cache, must-revalidate',
				Pragma: 'no-cache',
				Expires: '0',
			}
			: {};

		const maxRetries = 10;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			const tryPort = this.port + attempt;
			try {
				this.server = Bun.serve({
					port: tryPort,
					fetch(req, server) {
						const url = new URL(req.url);

						// WebSocket upgrade
						if (url.pathname === '/ws') {
							if (serverRef.mode === 'replay') {
								return new Response('WebSocket is unavailable in replay mode', { status: 409 });
							}
							const upgraded = server.upgrade(req, { data: null });
							if (!upgraded) {
								return new Response('WebSocket upgrade failed', { status: 400 });
							}
							return undefined as unknown as Response;
						}

						if (url.pathname === '/bootstrap') {
							return Response.json(serverRef.getBootstrap(url));
						}

						if (serverRef.mode === 'replay' && url.pathname === '/replay/bundle') {
							return Response.json(serverRef.replay?.bundle ?? null);
						}

						if (serverRef.mode === 'replay' && url.pathname.startsWith('/replay/artifacts/')) {
							const artifactId = decodeURIComponent(url.pathname.slice('/replay/artifacts/'.length));
							return serverRef.serveReplayArtifact(artifactId);
						}

						if (serverRef.mode === 'replay' && url.pathname === '/replay/seek') {
							return serverRef.serveReplaySeek(url);
						}

						// REST API: session state for initial hydration
						if (url.pathname === '/state') {
							if (serverRef.mode !== 'live') {
								return new Response('State endpoint is only available in live mode', { status: 409 });
							}
							return Response.json(serverRef.getSessionState());
						}

						// Health check
						if (url.pathname === '/health') {
							return Response.json({ status: 'ok', team: serverRef.teamName });
						}

						// Static file serving for the client
						let filePath = url.pathname;
						if (filePath === '/' || filePath === '') {
							filePath = '/index.html';
						}

						const fullPath = path.join(clientDir, filePath);
						const file = Bun.file(fullPath);
						return file.exists().then((exists) => {
							if (exists) {
								return new Response(file, { headers: noCacheHeaders });
							}
							// SPA fallback
							const indexPath = path.join(clientDir, 'index.html');
							const indexFile = Bun.file(indexPath);
							return indexFile.exists().then((indexExists) => {
								if (indexExists) {
									return new Response(indexFile, { headers: noCacheHeaders });
								}
								return new Response('Not Found', { status: 404 });
							});
						});
					},
						websocket: {
							open(ws) {
								serverRef.clients.add(ws);
								if (serverRef.mode === 'live') {
									const state = serverRef.getSessionState();
									ws.send(JSON.stringify({ type: 'init', state }));
								} else if (serverRef.mode === 'auto') {
									ws.send(JSON.stringify({ type: 'auto-waiting' }));
								}
							},
						close(ws) {
							serverRef.clients.delete(ws);
						},
						message(_ws, _message) {
							// Client → server messages not used in v1
						},
					},
				});

				if (attempt > 0) {
					console.error(`Port ${this.port} in use, using ${tryPort} instead`);
				}
				this.port = tryPort;

				console.log(`teamchat server running at http://localhost:${this.port}`);
				if (this.mode === 'auto') {
					console.log('Waiting for team...');
				} else {
					console.log(`Watching team: ${this.teamName}`);
				}
				return;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				if (!lastError.message.includes('EADDRINUSE') && !lastError.message.includes('address already in use')) {
					throw lastError;
				}
			}
		}

		throw new Error(`Could not find an available port (tried ${this.port}-${this.port + maxRetries - 1})`, { cause: lastError });
	}

	/** Broadcast ChatEvents to all connected WebSocket clients. */
	broadcast(events: ChatEvent[]): void {
		if (this.mode !== 'live') return;
		if (events.length === 0) return;
		const payload = JSON.stringify({ type: 'events', events });
		for (const client of this.clients) {
			try {
				if (client.readyState === 1) {
					client.send(payload);
				}
			} catch {
				this.clients.delete(client);
			}
		}
	}

	/** Build current session state for REST endpoint and initial WS hydration. */
	private getSessionState(): SessionState {
		if (!this.watcher || !this.processor) {
			throw new Error('Session state is only available in live mode');
		}
		const snapshot = this.watcher.getSnapshot();
		const team: TeamState = {
			name: this.teamName,
			members: snapshot.config?.members ?? [],
		};

		return {
			team,
			events: this.processor.getAllEvents(),
			tasks: this.processor.getTasks(),
			presence: this.processor.getPresence(),
			sessionStart: this.sessionStart,
			threadStatuses: this.processor.getThreadStatuses(),
		};
	}

	/** Stop the server. */
	stop(): void {
		if (this.server) {
			this.server.stop();
			this.server = null;
		}
		this.clients.clear();
	}

	getPort(): number {
		return this.port;
	}

	/**
	 * Transition from auto (lobby) mode to live mode when a team is detected.
	 * Sends a 'team-ready' message to all currently connected WebSocket clients.
	 */
	activateTeam(teamName: string, processor: EventProcessor, watcher: FileWatcher): void {
		if (this.mode !== 'auto') {
			throw new Error('activateTeam can only be called in auto mode');
		}
		this.teamName = teamName;
		this.processor = processor;
		this.watcher = watcher;
		this.mode = 'live';
		this.sessionStart = new Date().toISOString();

		// Push the initial state to already-connected lobby clients
		const state = this.getSessionState();
		const payload = JSON.stringify({ type: 'team-ready', state });
		for (const client of this.clients) {
			try {
				if (client.readyState === 1) {
					client.send(payload);
				}
			} catch {
				this.clients.delete(client);
			}
		}
	}

	private getBootstrap(url: URL): AppBootstrap {
		if (this.mode === 'replay' && this.replay) {
			return {
				mode: 'replay',
				replayManifest: this.replay.bundle.manifest,
				replayBundleUrl: '/replay/bundle',
				artifactBaseUrl: '/replay/artifacts',
			};
		}

		const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

		if (this.mode === 'auto') {
			return {
				mode: 'auto',
				wsUrl: `${protocol}//${url.host}/ws`,
			};
		}

		return {
			mode: 'live',
			initialState: this.getSessionState(),
			wsUrl: `${protocol}//${url.host}/ws`,
		};
	}

	private serveReplaySeek(url: URL): Response {
		if (!this.replay) {
			return new Response('No replay loaded', { status: 404 });
		}
		const bundle = this.replay.bundle;
		const durationMs = bundle.manifest.durationMs;
		const raw = url.searchParams.get('at') ?? 'end';
		let atMs: number;
		if (raw === 'end') {
			atMs = durationMs;
		} else if (raw.endsWith('%')) {
			const pct = parseFloat(raw.slice(0, -1));
			atMs = Number.isNaN(pct) ? 0 : Math.round((pct / 100) * durationMs);
		} else {
			atMs = parseInt(raw, 10);
			if (Number.isNaN(atMs)) atMs = 0;
		}
		atMs = Math.min(Math.max(atMs, 0), durationMs);

		// Find the entry index at this position
		let entryIndex = -1;
		for (let i = bundle.entries.length - 1; i >= 0; i--) {
			if (bundle.entries[i]!.atMs <= atMs) {
				entryIndex = i;
				break;
			}
		}

		return Response.json({
			atMs,
			durationMs,
			entryIndex,
			totalEntries: bundle.entries.length,
			eventsAtPosition: entryIndex + 1,
			pct: durationMs > 0 ? Math.round((atMs / durationMs) * 100) : 0,
			hint: 'Use ?seek=end|50%|<ms> on the client URL to auto-seek on load',
		});
	}

	private serveReplayArtifact(artifactId: string): Response {
		if (!this.replay || !this.replay.artifactBaseDir) {
			return new Response('Replay artifacts unavailable', { status: 404 });
		}

		const artifact = this.replay.bundle.artifacts.find((candidate: { id: string }) => candidate.id === artifactId);
		if (!artifact) {
			return new Response('Replay artifact not found', { status: 404 });
		}

		const baseDir = path.resolve(this.replay.artifactBaseDir);
		const fullPath = path.resolve(baseDir, artifact.file.relativePath);
		if (!fullPath.startsWith(baseDir)) {
			return new Response('Invalid artifact path', { status: 400 });
		}

		const file = Bun.file(fullPath);
		return new Response(file, {
			headers: {
				'Content-Type': artifact.file.mimeType,
				'Cache-Control': 'no-store',
			},
		});
	}
}
