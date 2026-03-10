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

type ServerOptions = LiveServerOptions | ReplayServerOptions;

export class TeamChatServer {
	private port: number;
	private teamName: string;
	private mode: 'live' | 'replay';
	private processor: EventProcessor | null;
	private watcher: FileWatcher | null;
	private replay: LoadedReplaySource | null;
	private clients: Set<{ send(data: string): void; readyState: number }> = new Set();
	private server: ReturnType<typeof Bun.serve> | null = null;
	private sessionStart: string;

	constructor(options: ServerOptions) {
		this.port = options.port;
		this.teamName = options.teamName;
		this.mode = options.mode;
		if (options.mode === 'live') {
			this.processor = options.processor;
			this.watcher = options.watcher;
			this.replay = null;
			this.sessionStart = new Date().toISOString();
		} else {
			this.processor = null;
			this.watcher = null;
			this.replay = options.replay;
			this.sessionStart = options.replay.bundle.manifest.startedAt;
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

		this.server = Bun.serve({
			port: this.port,
			fetch(req, server) {
				const url = new URL(req.url);

				// WebSocket upgrade
				if (url.pathname === '/ws') {
					if (serverRef.mode !== 'live') {
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
						if (serverRef.mode !== 'live') {
							return;
						}
						serverRef.clients.add(ws);
						const state = serverRef.getSessionState();
						ws.send(JSON.stringify({ type: 'init', state }));
					},
				close(ws) {
					serverRef.clients.delete(ws);
				},
				message(_ws, _message) {
					// Client → server messages not used in v1
				},
			},
		});

		console.log(`teamchat server running at http://localhost:${this.port}`);
		console.log(`Watching team: ${this.teamName}`);
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
		return {
			mode: 'live',
			initialState: this.getSessionState(),
			wsUrl: `${protocol}//${url.host}/ws`,
		};
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
