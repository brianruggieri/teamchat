import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentHeartbeat } from '../shared/types.js';
import { generateEventId } from '../shared/parse.js';

export interface ToolActivity {
	tool: string;
	target: string; // file path or description
}

interface AgentWindow {
	activities: ToolActivity[];
	opCount: number;
}

type HeartbeatEmitter = (heartbeat: AgentHeartbeat) => void;

/**
 * Watches a directory of subagent JSONL files in real-time.
 * Tails new tool-use entries and emits compact heartbeat events every 30s per active agent.
 */
export class HeartbeatWatcher {
	private dir: string;
	private emitter: HeartbeatEmitter;
	private agentColorLookup: (name: string) => string;
	private windows: Map<string, AgentWindow> = new Map();
	private filePositions: Map<string, number> = new Map();
	private watchers: fs.FSWatcher[] = [];
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private pollId: ReturnType<typeof setInterval> | null = null;
	private flushIntervalMs: number;
	private pollIntervalMs: number;

	constructor(
		dir: string,
		emitter: HeartbeatEmitter,
		agentColorLookup: (name: string) => string,
		options?: { flushIntervalMs?: number; pollIntervalMs?: number },
	) {
		this.dir = dir;
		this.emitter = emitter;
		this.agentColorLookup = agentColorLookup;
		this.flushIntervalMs = options?.flushIntervalMs ?? 30_000;
		this.pollIntervalMs = options?.pollIntervalMs ?? 5_000;
	}

	start(): void {
		this.scanExistingFiles();
		this.watchDir();
		this.startFlushInterval();
		this.startPollFallback();
	}

	stop(): void {
		for (const w of this.watchers) w.close();
		this.watchers = [];
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		if (this.pollId) {
			clearInterval(this.pollId);
			this.pollId = null;
		}
	}

	/** Scan directory for existing JSONL files and set initial read positions. */
	private scanExistingFiles(): void {
		try {
			if (!fs.existsSync(this.dir)) return;
			const files = fs.readdirSync(this.dir);
			for (const file of files) {
				if (!file.endsWith('.jsonl')) continue;
				const filePath = path.join(this.dir, file);
				this.tailFile(filePath);
			}
		} catch {
			// Directory may not exist yet
		}
	}

	/** Watch the directory for new/changed JSONL files. */
	private watchDir(): void {
		try {
			if (!fs.existsSync(this.dir)) {
				fs.mkdirSync(this.dir, { recursive: true });
			}
			const watcher = fs.watch(this.dir, (_eventType, filename) => {
				if (filename && (filename as string).endsWith('.jsonl')) {
					const filePath = path.join(this.dir, filename as string);
					this.tailFile(filePath);
				}
			});
			this.watchers.push(watcher);
		} catch {
			// fs.watch may fail on some platforms — poll fallback covers this
		}
	}

	/** Every flushIntervalMs, emit heartbeats for agents with accumulated activity. */
	private startFlushInterval(): void {
		this.intervalId = setInterval(() => this.flush(), this.flushIntervalMs);
	}

	/** Every pollIntervalMs, re-scan all known files for new data (in case fs.watch misses). */
	private startPollFallback(): void {
		this.pollId = setInterval(() => {
			try {
				if (!fs.existsSync(this.dir)) return;
				const files = fs.readdirSync(this.dir);
				for (const file of files) {
					if (!file.endsWith('.jsonl')) continue;
					const filePath = path.join(this.dir, file);
					this.tailFile(filePath);
				}
			} catch {
				// Ignore scan errors
			}
		}, this.pollIntervalMs);
	}

	/** Read new complete lines from a file since the last tracked position. */
	private tailFile(filePath: string): void {
		try {
			if (!fs.existsSync(filePath)) return;
			const stat = fs.statSync(filePath);
			const currentSize = stat.size;
			const lastPos = this.filePositions.get(filePath) ?? 0;

			if (currentSize <= lastPos) return;

			// Cap read size to avoid large allocations on first scan
			const MAX_CHUNK_SIZE = 1024 * 1024; // 1MB
			const readEnd = Math.min(lastPos + MAX_CHUNK_SIZE, currentSize);

			const fd = fs.openSync(filePath, 'r');
			try {
				const buf = Buffer.alloc(readEnd - lastPos);
				fs.readSync(fd, buf, 0, buf.length, lastPos);

				const chunk = buf.toString('utf-8');

				// Only advance to the last newline to avoid losing partial lines
				const lastNewline = chunk.lastIndexOf('\n');
				if (lastNewline === -1) {
					// No complete line yet — don't advance position
					return;
				}
				this.filePositions.set(filePath, lastPos + Buffer.byteLength(chunk.slice(0, lastNewline + 1), 'utf-8'));

				const agentName = this.extractAgentName(filePath);
				const completeChunk = chunk.slice(0, lastNewline + 1);
				const lines = completeChunk.split('\n');

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						const entry = JSON.parse(trimmed) as Record<string, unknown>;
						const activity = this.extractActivity(entry);
						if (activity) {
							this.recordActivity(agentName, activity);
						}
					} catch {
						// Skip malformed JSON lines
					}
				}
			} finally {
				fs.closeSync(fd);
			}
		} catch {
			// File may be locked or deleted — ignore
		}
	}

	/**
	 * Extract agent name from JSONL filename.
	 * Examples: "agent-db-architect.jsonl" → "db-architect"
	 *           "schema.jsonl" → "schema"
	 */
	extractAgentName(filePath: string): string {
		const base = path.basename(filePath, '.jsonl');
		return base.replace(/^agent-/, '');
	}

	/**
	 * Extract a ToolActivity from a JSONL entry if it represents a tool use.
	 *
	 * Claude Code JSONL entries can have various structures. We look for:
	 * - type: "tool_use" with name and input fields
	 * - type: "assistant" with content array containing tool_use blocks
	 * - Direct tool fields at the top level
	 */
	extractActivity(entry: Record<string, unknown>): ToolActivity | null {
		// Direct tool_use entry
		if (entry.type === 'tool_use' || entry.type === 'tool_call') {
			const toolName = (entry.name ?? entry.tool ?? '') as string;
			const input = (entry.input ?? entry.arguments ?? {}) as Record<string, unknown>;
			return this.mapToolToActivity(toolName, input);
		}

		// Assistant message with tool_use content blocks
		if (entry.type === 'assistant' && Array.isArray(entry.content)) {
			for (const block of entry.content as Record<string, unknown>[]) {
				if (block.type === 'tool_use') {
					const toolName = (block.name ?? '') as string;
					const input = (block.input ?? {}) as Record<string, unknown>;
					return this.mapToolToActivity(toolName, input);
				}
			}
		}

		// Tool result (counts as an op but we derive the tool from the entry)
		if (entry.type === 'tool_result') {
			const toolName = (entry.name ?? entry.tool_name ?? '') as string;
			if (toolName) {
				return this.mapToolToActivity(toolName, {});
			}
		}

		return null;
	}

	/** Map a tool name + input to a human-readable activity description. */
	mapToolToActivity(toolName: string, input: Record<string, unknown>): ToolActivity | null {
		const normalizedTool = toolName.toLowerCase();

		if (normalizedTool === 'write') {
			const target = this.extractFilename(input.file_path ?? input.path);
			return { tool: 'write', target: target ? `writing ${target}` : 'writing file' };
		}

		if (normalizedTool === 'edit') {
			const target = this.extractFilename(input.file_path ?? input.path);
			return { tool: 'edit', target: target ? `editing ${target}` : 'editing file' };
		}

		if (normalizedTool === 'read') {
			const target = this.extractFilename(input.file_path ?? input.path);
			return { tool: 'read', target: target ? `reading ${target}` : 'reading file' };
		}

		if (normalizedTool === 'bash') {
			return { tool: 'bash', target: 'running command' };
		}

		if (normalizedTool === 'glob' || normalizedTool === 'grep') {
			return { tool: normalizedTool, target: 'searching' };
		}

		if (normalizedTool === 'sendmessage' || normalizedTool === 'send_message') {
			return { tool: 'message', target: 'messaging' };
		}

		// Unknown tool — still count it
		if (toolName) {
			return { tool: toolName.toLowerCase(), target: toolName.toLowerCase() };
		}

		return null;
	}

	/** Extract filename from a file path string. */
	private extractFilename(filePath: unknown): string | null {
		if (typeof filePath !== 'string' || !filePath) return null;
		return path.basename(filePath);
	}

	/** Record an activity in the current window for an agent. */
	private recordActivity(agentName: string, activity: ToolActivity): void {
		let window = this.windows.get(agentName);
		if (!window) {
			window = { activities: [], opCount: 0 };
			this.windows.set(agentName, window);
		}
		window.activities.push(activity);
		window.opCount++;
	}

	/** Flush all agent windows: emit heartbeat for each active agent, then clear. */
	flush(): void {
		for (const [agentName, window] of this.windows) {
			if (window.opCount === 0) continue;

			const summary = this.summarizeActivities(window.activities);
			const heartbeat: AgentHeartbeat = {
				type: 'heartbeat',
				id: generateEventId(),
				agentName,
				agentColor: this.agentColorLookup(agentName),
				activities: summary,
				opCount: window.opCount,
				timestamp: new Date().toISOString(),
			};

			this.emitter(heartbeat);
		}

		// Clear all windows after emission
		this.windows.clear();
	}

	/**
	 * Summarize a list of tool activities into a compact human-readable string.
	 * Deduplicates activities targeting the same file/description.
	 * Format: "writing file.tsx, editing route.ts" (most frequent first).
	 */
	summarizeActivities(activities: ToolActivity[]): string {
		// Deduplicate by target description
		const seen = new Map<string, number>();
		for (const activity of activities) {
			const count = seen.get(activity.target) ?? 0;
			seen.set(activity.target, count + 1);
		}

		// Sort by frequency (most frequent first), then alphabetically for stability
		const entries = Array.from(seen.entries()).sort((a, b) => {
			if (b[1] !== a[1]) return b[1] - a[1];
			return a[0].localeCompare(b[0]);
		});

		// Take top 3 unique activities to keep it compact
		const top = entries.slice(0, 3).map(([target]) => target);

		return top.join(', ');
	}

	/** Expose window state for testing. */
	getWindows(): Map<string, AgentWindow> {
		return this.windows;
	}
}
