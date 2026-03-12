import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChatEvent, JournalEntry, TaskInfo, TeamConfig } from '../shared/types.js';

export interface SessionMetadata {
	teamName: string;
	startedAt: string;
	endedAt: string;
	durationMs: number;
	eventCount: number;
	messageCount: number;
	presence: Record<string, 'working' | 'idle' | 'offline'>;
}

export class Journal {
	private filePath: string;
	private sessionsDir: string;
	private teamName: string;
	private seq: number = 0;
	private enabled: boolean;

	constructor(teamName: string, enabled = true) {
		this.enabled = enabled;
		this.teamName = teamName;
		const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
		this.sessionsDir = path.join(homeDir, '.teamchat', 'sessions');
		if (enabled) {
			fs.mkdirSync(this.sessionsDir, { recursive: true });
		}
		this.filePath = path.join(this.sessionsDir, `${teamName}.jsonl`);
	}

	/** Append a ChatEvent to the journal file. */
	append(event: ChatEvent): void {
		if (!this.enabled) return;
		const entry: JournalEntry = {
			seq: this.seq++,
			event,
		};
		fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
	}

	/** Save a config snapshot alongside the journal (called on startup + config changes). */
	saveConfig(config: TeamConfig): void {
		if (!this.enabled) return;
		const configPath = path.join(this.sessionsDir, `${this.teamName}.config.json`);
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
	}

	/** Save final task state alongside the journal (called on shutdown). */
	saveTasks(tasks: TaskInfo[]): void {
		if (!this.enabled) return;
		const tasksPath = path.join(this.sessionsDir, `${this.teamName}.tasks.json`);
		fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
	}

	/** Save session metadata alongside the journal (called on shutdown). */
	saveMetadata(metadata: SessionMetadata): void {
		if (!this.enabled) return;
		const metaPath = path.join(this.sessionsDir, `${this.teamName}.meta.json`);
		fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
	}

	/** Read all journal entries from the file. */
	readAll(): JournalEntry[] {
		if (!fs.existsSync(this.filePath)) {
			return [];
		}
		const content = fs.readFileSync(this.filePath, 'utf-8');
		const lines = content.trim().split('\n').filter(Boolean);
		const entries: JournalEntry[] = [];
		for (const line of lines) {
			try {
				entries.push(JSON.parse(line) as JournalEntry);
			} catch {
				// Skip corrupted lines
			}
		}
		return entries;
	}

	/** Read journal entries from a specific file path (for replay mode). */
	static readFrom(filePath: string): JournalEntry[] {
		if (!fs.existsSync(filePath)) {
			return [];
		}
		const content = fs.readFileSync(filePath, 'utf-8');
		const lines = content.trim().split('\n').filter(Boolean);
		const entries: JournalEntry[] = [];
		for (const line of lines) {
			try {
				entries.push(JSON.parse(line) as JournalEntry);
			} catch {
				// Skip corrupted lines
			}
		}
		return entries;
	}

	getFilePath(): string {
		return this.filePath;
	}
}
