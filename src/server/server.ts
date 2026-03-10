import * as path from 'node:path';
import type { ChatEvent, SessionState, TeamState } from '../shared/types.js';
import type { EventProcessor } from './processor.js';
import type { FileWatcher } from './watcher.js';

interface ServerOptions {
	port: number;
	teamName: string;
	processor: EventProcessor;
	watcher: FileWatcher;
}

export class TeamChatServer {
	private port: number;
	private teamName: string;
	private processor: EventProcessor;
	private watcher: FileWatcher;
	private clients: Set<{ send(data: string): void; readyState: number }> = new Set();
	private server: ReturnType<typeof Bun.serve> | null = null;
	private sessionStart: string;

	constructor(options: ServerOptions) {
		this.port = options.port;
		this.teamName = options.teamName;
		this.processor = options.processor;
		this.watcher = options.watcher;
		this.sessionStart = new Date().toISOString();
	}

	/** Start the HTTP + WebSocket server. */
	start(): void {
		const clientDir = path.resolve(import.meta.dirname ?? '.', '..', '..', 'dist', 'client');
		const serverRef = this;

		this.server = Bun.serve({
			port: this.port,
			fetch(req, server) {
				const url = new URL(req.url);

				// WebSocket upgrade
				if (url.pathname === '/ws') {
					const upgraded = server.upgrade(req, { data: null });
					if (!upgraded) {
						return new Response('WebSocket upgrade failed', { status: 400 });
					}
					return undefined as unknown as Response;
				}

				// REST API: session state for initial hydration
				if (url.pathname === '/state') {
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
						return new Response(file);
					}
					// SPA fallback
					const indexPath = path.join(clientDir, 'index.html');
					const indexFile = Bun.file(indexPath);
					return indexFile.exists().then((indexExists) => {
						if (indexExists) {
							return new Response(indexFile);
						}
						return new Response('Not Found', { status: 404 });
					});
				});
			},
			websocket: {
				open(ws) {
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
}
