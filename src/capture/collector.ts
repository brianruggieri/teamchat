import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join } from 'path';

export class CaptureCollector {
	private snapshotDir: string;
	private inboxesDir: string;
	private tasksDir: string;
	private _sourceInboxDir: string;
	private _sourceTaskDir: string | null;

	constructor(sessionId: string, inboxSourceDir: string, taskSourceDir: string | null) {
		const homeDir = process.env.HOME ?? '~';
		this.snapshotDir = join(homeDir, '.teamchat', 'captures', sessionId);
		this.inboxesDir = join(this.snapshotDir, 'inboxes');
		this.tasksDir = join(this.snapshotDir, 'tasks');

		mkdirSync(this.inboxesDir, { recursive: true });
		mkdirSync(this.tasksDir, { recursive: true });

		this._sourceInboxDir = inboxSourceDir;
		this._sourceTaskDir = taskSourceDir;
	}

	snapshotInboxes(): void {
		if (!existsSync(this._sourceInboxDir)) return;
		for (const file of readdirSync(this._sourceInboxDir).filter(f => f.endsWith('.json'))) {
			copyFileSync(join(this._sourceInboxDir, file), join(this.inboxesDir, file));
		}
	}

	snapshotTasks(): void {
		if (!this._sourceTaskDir || !existsSync(this._sourceTaskDir)) return;
		for (const file of readdirSync(this._sourceTaskDir).filter(f => f.endsWith('.json'))) {
			copyFileSync(join(this._sourceTaskDir, file), join(this.tasksDir, file));
		}
	}

	getSnapshotDir(): string {
		return this.snapshotDir;
	}

	getInboxSnapshotsDir(): string {
		return this.inboxesDir;
	}

	getTaskSnapshotsDir(): string {
		return this.tasksDir;
	}
}
