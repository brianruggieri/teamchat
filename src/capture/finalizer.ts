import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CaptureManifest } from './types';

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

function getTimestampRange(filePath: string): { start: string; end: string } {
	if (!existsSync(filePath)) return { start: new Date().toISOString(), end: new Date().toISOString() };
	const lines = readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
	const first = JSON.parse(lines[0]);
	const last = JSON.parse(lines[lines.length - 1]);
	return {
		start: first.timestamp ?? new Date().toISOString(),
		end: last.timestamp ?? new Date().toISOString(),
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
				const agentId = file.replace('.meta.json', '').replace('agent-', '');
				agents.push({
					name: agentId,
					agentId,
					agentType: meta.agentType ?? 'general-purpose',
					color: 'gray',
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

	// Count tasks from final.json if available
	const finalTasksPath = join(bundlePath, 'tasks', 'final.json');
	if (existsSync(finalTasksPath)) {
		const tasks = JSON.parse(readFileSync(finalTasksPath, 'utf-8'));
		manifest.taskCount = Array.isArray(tasks) ? tasks.length : 0;
	}

	writeFileSync(join(bundlePath, 'manifest.json'), JSON.stringify(manifest, null, '\t'));

	return bundlePath;
}
