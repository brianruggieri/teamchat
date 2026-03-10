import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RawInboxMessage, RawTaskData, TeamConfig } from '../shared/types.js';

export interface WatcherSnapshot {
	inboxes: Map<string, RawInboxMessage[]>;
	tasks: RawTaskData[];
	config: TeamConfig | null;
}

export interface WatcherDelta {
	type: 'inbox' | 'tasks' | 'config';
	agentName?: string;
	previous: RawInboxMessage[] | RawTaskData[] | TeamConfig | null;
	current: RawInboxMessage[] | RawTaskData[] | TeamConfig | null;
}

type DeltaHandler = (delta: WatcherDelta) => void;

export class FileWatcher {
	private teamDir: string;
	private tasksDir: string;
	private inboxDir: string;
	private configPath: string;
	private snapshot: WatcherSnapshot;
	private watchers: fs.FSWatcher[] = [];
	private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private handler: DeltaHandler;
	private debounceMs: number;

	constructor(teamName: string, handler: DeltaHandler, debounceMs = 100) {
		const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
		this.teamDir = path.join(homeDir, '.claude', 'teams', teamName);
		this.tasksDir = path.join(homeDir, '.claude', 'tasks', teamName);
		this.inboxDir = path.join(this.teamDir, 'inboxes');
		this.configPath = path.join(this.teamDir, 'config.json');
		this.handler = handler;
		this.debounceMs = debounceMs;
		this.snapshot = {
			inboxes: new Map(),
			tasks: [],
			config: null,
		};
	}

	/** Read current state without starting watches. Used for initial hydration. */
	readInitialState(): WatcherSnapshot {
		this.readConfig();
		this.readAllInboxes();
		this.readTasks();
		return this.snapshot;
	}

	/** Start watching filesystem for changes. */
	start(): void {
		this.readInitialState();

		// Ensure directories exist before watching
		this.ensureDir(this.inboxDir);
		this.ensureDir(this.tasksDir);

		// Watch config.json
		if (fs.existsSync(this.configPath)) {
			this.watchFile(this.configPath, () => this.handleConfigChange());
		}

		// Watch inboxes directory for new/changed files
		this.watchDir(this.inboxDir, (filename) => {
			if (filename && filename.endsWith('.json')) {
				const agentName = path.basename(filename, '.json');
				this.debouncedAction(`inbox:${agentName}`, () => this.handleInboxChange(agentName));
			}
		});

		// Watch tasks directory
		this.watchDir(this.tasksDir, (filename) => {
			if (filename && filename.endsWith('.json')) {
				this.debouncedAction('tasks', () => this.handleTasksChange());
			}
		});

		// Also watch team dir for config.json creation
		this.watchDir(this.teamDir, (filename) => {
			if (filename === 'config.json') {
				this.debouncedAction('config', () => this.handleConfigChange());
			}
		});
	}

	/** Stop all file watchers. */
	stop(): void {
		for (const watcher of this.watchers) {
			watcher.close();
		}
		this.watchers = [];
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
	}

	getSnapshot(): WatcherSnapshot {
		return this.snapshot;
	}

	private ensureDir(dirPath: string): void {
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
		}
	}

	private watchFile(filePath: string, callback: () => void): void {
		try {
			const watcher = fs.watch(filePath, () => {
				this.debouncedAction(filePath, callback);
			});
			this.watchers.push(watcher);
		} catch {
			// File may not exist yet — that's fine
		}
	}

	private watchDir(dirPath: string, callback: (filename: string | null) => void): void {
		try {
			if (!fs.existsSync(dirPath)) {
				return;
			}
			const watcher = fs.watch(dirPath, (_eventType, filename) => {
				callback(filename);
			});
			this.watchers.push(watcher);
		} catch {
			// Directory may not exist yet — that's fine
		}
	}

	private debouncedAction(key: string, action: () => void): void {
		const existing = this.debounceTimers.get(key);
		if (existing) {
			clearTimeout(existing);
		}
		this.debounceTimers.set(
			key,
			setTimeout(() => {
				this.debounceTimers.delete(key);
				action();
			}, this.debounceMs),
		);
	}

	private readConfig(): void {
		try {
			if (!fs.existsSync(this.configPath)) {
				return;
			}
			const raw = fs.readFileSync(this.configPath, 'utf-8');
			this.snapshot.config = JSON.parse(raw) as TeamConfig;
		} catch {
			// Partial write or missing file — ignore
		}
	}

	private readAllInboxes(): void {
		try {
			if (!fs.existsSync(this.inboxDir)) {
				return;
			}
			const files = fs.readdirSync(this.inboxDir);
			for (const file of files) {
				if (!file.endsWith('.json')) continue;
				const agentName = path.basename(file, '.json');
				this.readInbox(agentName);
			}
		} catch {
			// Directory may not exist yet
		}
	}

	private readInbox(agentName: string): void {
		try {
			const filePath = path.join(this.inboxDir, `${agentName}.json`);
			if (!fs.existsSync(filePath)) {
				return;
			}
			const raw = fs.readFileSync(filePath, 'utf-8');
			const messages = JSON.parse(raw) as RawInboxMessage[];
			this.snapshot.inboxes.set(agentName, messages);
		} catch {
			// Partial write — ignore, will retry on next change
		}
	}

	private readTasks(): void {
		try {
			if (!fs.existsSync(this.tasksDir)) {
				return;
			}
			// Try tasks.json (single file with all tasks)
			const tasksFile = path.join(this.tasksDir, 'tasks.json');
			if (fs.existsSync(tasksFile)) {
				const raw = fs.readFileSync(tasksFile, 'utf-8');
				this.snapshot.tasks = JSON.parse(raw) as RawTaskData[];
				return;
			}
			// Fall back to individual {id}.json files
			const files = fs.readdirSync(this.tasksDir);
			const tasks: RawTaskData[] = [];
			for (const file of files) {
				if (!file.endsWith('.json')) continue;
				try {
					const raw = fs.readFileSync(path.join(this.tasksDir, file), 'utf-8');
					tasks.push(JSON.parse(raw) as RawTaskData);
				} catch {
					// Skip corrupted task files
				}
			}
			this.snapshot.tasks = tasks;
		} catch {
			// Tasks directory may not exist
		}
	}

	private handleConfigChange(): void {
		const previous = this.snapshot.config;
		this.readConfig();
		this.handler({
			type: 'config',
			previous,
			current: this.snapshot.config,
		});
	}

	private handleInboxChange(agentName: string): void {
		const previous = this.snapshot.inboxes.get(agentName) ?? null;
		this.readInbox(agentName);
		const current = this.snapshot.inboxes.get(agentName) ?? null;
		this.handler({
			type: 'inbox',
			agentName,
			previous: previous ? [...previous] : null,
			current: current ? [...current] : null,
		});
	}

	private handleTasksChange(): void {
		const previous = [...this.snapshot.tasks];
		this.readTasks();
		this.handler({
			type: 'tasks',
			previous,
			current: [...this.snapshot.tasks],
		});
	}
}
