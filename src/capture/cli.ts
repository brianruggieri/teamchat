import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { finalizeCaptureBundle } from './finalizer';

export async function runCapture(sessionId: string): Promise<void> {
	const homeDir = process.env.HOME ?? '~';
	const projectsDir = `${homeDir}/.claude/projects`;

	if (!existsSync(projectsDir)) {
		console.error('Claude Code projects directory not found at ~/.claude/projects/');
		process.exit(1);
	}

	// Find the session JSONL by scanning project directories
	let sessionPath: string | null = null;
	let projectPath: string | null = null;

	for (const project of readdirSync(projectsDir)) {
		const candidate = join(projectsDir, project, `${sessionId}.jsonl`);
		if (existsSync(candidate)) {
			sessionPath = candidate;
			projectPath = join(projectsDir, project);
			break;
		}
	}

	if (!sessionPath || !projectPath) {
		console.error(`Session ${sessionId} not found in ~/.claude/projects/`);
		process.exit(1);
	}

	console.log(`Found session at ${sessionPath}`);

	// Discover team name from session log
	const firstLines = readFileSync(sessionPath, 'utf-8').split('\n').slice(0, 50);
	let teamName = sessionId.slice(0, 8);
	for (const line of firstLines) {
		if (!line.trim()) continue;
		const obj = JSON.parse(line);
		if (obj.type === 'assistant') {
			for (const block of obj.message?.content ?? []) {
				if (block.type === 'tool_use' && block.name === 'TeamCreate') {
					teamName = block.input?.team_name ?? teamName;
				}
			}
		}
	}

	const subagentDir = join(projectPath, sessionId, 'subagents');
	const teamsDir = `${homeDir}/.claude/teams`;
	const inboxDir = existsSync(join(teamsDir, sessionId, 'inboxes'))
		? join(teamsDir, sessionId, 'inboxes')
		: null;

	// Check for teamchat journal
	const journalDir = `${homeDir}/.teamchat/sessions`;
	const journalPath = existsSync(join(journalDir, `${teamName}.jsonl`))
		? join(journalDir, `${teamName}.jsonl`)
		: null;

	const outputDir = `${homeDir}/.teamchat/captures`;

	const bundlePath = await finalizeCaptureBundle({
		sessionId,
		team: teamName,
		projectPath: projectPath,
		leadLogPath: sessionPath,
		subagentDir: existsSync(subagentDir) ? subagentDir : null,
		inboxSnapshotsDir: inboxDir,
		journalPath,
		tasksDir: null,
		outputDir,
	});

	console.log(`Capture bundle created at ${bundlePath}`);
}
