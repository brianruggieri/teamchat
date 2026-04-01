import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CaptureManifest } from './types.js';

const ROLE_COLORS = [
	'purple', 'cyan', 'emerald', 'amber', 'rose', 'sky',
	'lime', 'orange', 'violet', 'teal', 'pink', 'yellow',
	'fuchsia', 'blue'
];

function roleColor(agentType: string): string {
	let hash = 0;
	for (let i = 0; i < agentType.length; i++) {
		hash = ((hash << 5) - hash + agentType.charCodeAt(i)) | 0;
	}
	return ROLE_COLORS[Math.abs(hash) % ROLE_COLORS.length];
}

export interface FinalizeOptions {
	sessionId: string;
	team: string;
	projectPath: string;
	leadLogPath: string;
	subagentDir: string | null;
	inboxSnapshotsDir: string | null;
	journalPath: string | null;
	tasksDir: string | null;
	outputDir: string;
}

function countJsonlLines(filePath: string): number {
	if (!existsSync(filePath)) return 0;
	return readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim()).length;
}

function extractTimestamp(entry: Record<string, unknown>): string | null {
	if (typeof entry.timestamp === 'string') return entry.timestamp;
	if (entry.snapshot && typeof (entry.snapshot as Record<string, unknown>).timestamp === 'string') {
		return (entry.snapshot as Record<string, unknown>).timestamp as string;
	}
	return null;
}

function getTimestampRange(filePath: string): { start: string; end: string } {
	if (!existsSync(filePath)) return { start: new Date().toISOString(), end: new Date().toISOString() };
	const lines = readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
	if (lines.length === 0) return { start: new Date().toISOString(), end: new Date().toISOString() };

	// Scan forward for first valid timestamp
	let start: string | null = null;
	for (const line of lines) {
		start = extractTimestamp(JSON.parse(line));
		if (start) break;
	}

	// Scan backward for last valid timestamp
	let end: string | null = null;
	for (let i = lines.length - 1; i >= 0; i--) {
		end = extractTimestamp(JSON.parse(lines[i]));
		if (end) break;
	}

	return {
		start: start ?? new Date().toISOString(),
		end: end ?? new Date().toISOString(),
	};
}

export async function finalizeCaptureBundle(opts: FinalizeOptions): Promise<string> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const bundleName = `${opts.team}-${timestamp}.teamchat-capture`;
	const bundlePath = join(opts.outputDir, bundleName);

	mkdirSync(bundlePath, { recursive: true });
	mkdirSync(join(bundlePath, 'subagents'), { recursive: true });
	mkdirSync(join(bundlePath, 'inboxes'), { recursive: true });
	mkdirSync(join(bundlePath, 'tasks'), { recursive: true });

	// Copy lead log
	if (existsSync(opts.leadLogPath)) {
		copyFileSync(opts.leadLogPath, join(bundlePath, 'lead.jsonl'));
	}

	// Copy subagent logs
	const agents: CaptureManifest['agents'] = [];
	if (opts.subagentDir && existsSync(opts.subagentDir)) {
		const files = readdirSync(opts.subagentDir);
		for (const file of files) {
			copyFileSync(join(opts.subagentDir, file), join(bundlePath, 'subagents', file));
			if (file.endsWith('.meta.json')) {
				const meta = JSON.parse(readFileSync(join(opts.subagentDir, file), 'utf-8'));
				const agentId = file.replace('.meta.json', '');
				agents.push({
					name: agentId,
					agentId,
					agentType: meta.agentType ?? 'general-purpose',
					color: roleColor(meta.agentType ?? 'general-purpose'),
				});
			}
		}
	}

	// Copy inbox snapshots
	if (opts.inboxSnapshotsDir && existsSync(opts.inboxSnapshotsDir)) {
		for (const file of readdirSync(opts.inboxSnapshotsDir).filter(f => f.endsWith('.json'))) {
			copyFileSync(join(opts.inboxSnapshotsDir, file), join(bundlePath, 'inboxes', file));
		}
	}

	// Copy journal
	if (opts.journalPath && existsSync(opts.journalPath)) {
		copyFileSync(opts.journalPath, join(bundlePath, 'journal.jsonl'));
	}

	// Copy tasks
	if (opts.tasksDir && existsSync(opts.tasksDir)) {
		for (const file of readdirSync(opts.tasksDir).filter(f => f.endsWith('.json'))) {
			copyFileSync(join(opts.tasksDir, file), join(bundlePath, 'tasks', file));
		}
	}

	// Compute manifest
	const { start, end } = getTimestampRange(join(bundlePath, 'lead.jsonl'));
	const eventCount = existsSync(join(bundlePath, 'journal.jsonl'))
		? countJsonlLines(join(bundlePath, 'journal.jsonl'))
		: 0;

	const manifest: CaptureManifest = {
		version: 1,
		team: opts.team,
		sessionId: opts.sessionId,
		projectPath: opts.projectPath,
		durationMs: new Date(end).getTime() - new Date(start).getTime(),
		agents: [
			{ name: 'team-lead', agentId: 'lead', agentType: 'lead', color: 'indigo' },
			...agents,
		],
		taskCount: 0,
		eventCount,
		capturedAt: new Date().toISOString(),
		startedAt: start,
		endedAt: end,
	};

	// Count tasks from journal events (tasks may be cleaned up at session end)
	const journalPath = join(bundlePath, 'journal.jsonl');
	if (existsSync(journalPath)) {
		const journalText = readFileSync(journalPath, 'utf-8');
		const taskLines = journalText.split('\n').filter(l => l.includes('"task-created"'));
		let taskCount = taskLines.length;
		// Deduplicate: journal may record the same task-created event multiple times
		const taskIds = new Set<string>();
		for (const line of taskLines) {
			try {
				const entry = JSON.parse(line);
				const taskId = entry.event?.taskId;
				if (taskId) taskIds.add(taskId);
			} catch {}
		}
		manifest.taskCount = taskIds.size > 0 ? taskIds.size : taskCount;
	}

	writeFileSync(join(bundlePath, 'manifest.json'), JSON.stringify(manifest, null, '\t'));

	return bundlePath;
}
