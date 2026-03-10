import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChatEvent, JournalEntry } from '../shared/types.js';

export class Journal {
	private filePath: string;
	private seq: number = 0;
	private enabled: boolean;

	constructor(teamName: string, enabled = true) {
		this.enabled = enabled;
		const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
		const sessionsDir = path.join(homeDir, '.teamchat', 'sessions');
		if (enabled) {
			fs.mkdirSync(sessionsDir, { recursive: true });
		}
		this.filePath = path.join(sessionsDir, `${teamName}.jsonl`);
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
