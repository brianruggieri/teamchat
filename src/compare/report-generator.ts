import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getCapturePaths, type CaptureManifest } from '../capture/types.js';
import { parseSessionLog } from './parser.js';
import { parseInboxes } from './protocol-parser.js';
import { computeScorecard } from './scorecard.js';
import { renderReport } from './report-template.js';
import type { ParsedSession, TerminalTimeline, TeamchatTimeline } from './types.js';
import type { ChatEvent, JournalEntry } from '../shared/types.js';

function buildTerminalTimeline(paths: ReturnType<typeof getCapturePaths>, manifest: CaptureManifest): TerminalTimeline {
	const lead = existsSync(paths.leadLog)
		? parseSessionLog(paths.leadLog, manifest.agents[0]?.name ?? 'team-lead')
		: [];

	const agents: Record<string, ReturnType<typeof parseSessionLog>> = {};
	if (existsSync(paths.subagentsDir)) {
		const files = readdirSync(paths.subagentsDir).filter(f => f.endsWith('.jsonl'));
		for (const file of files) {
			const agentId = file.replace(/\.jsonl$/, '');
			const agent = manifest.agents.find(a => a.agentId === agentId);
			const name = agent?.name ?? agentId;
			agents[name] = parseSessionLog(join(paths.subagentsDir, file), name);
		}
	}

	const allAgentEntries = Object.values(agents).flat();
	const merged = [...lead, ...allAgentEntries]
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	return { lead, agents, merged };
}

function loadJournal(journalPath: string): TeamchatTimeline {
	if (!existsSync(journalPath)) return { events: [] };
	const text = readFileSync(journalPath, 'utf-8');
	const seen = new Set<string>();
	const events: ChatEvent[] = text
		.split('\n')
		.filter(l => l.trim())
		.map(l => (JSON.parse(l) as JournalEntry).event)
		.filter(e => {
			if (seen.has(e.id)) return false;
			seen.add(e.id);
			return true;
		});
	return { events };
}

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

export function parseCapture(bundlePath: string): ParsedSession {
	const paths = getCapturePaths(bundlePath);
	const manifest: CaptureManifest = JSON.parse(readFileSync(paths.manifest, 'utf-8'));
	const terminal = buildTerminalTimeline(paths, manifest);
	const protocol = existsSync(paths.inboxesDir)
		? parseInboxes(paths.inboxesDir)
		: { messages: [] };
	const teamchat = loadJournal(paths.journal);

	// Patch taskCount from journal if manifest shows 0 (tasks may have been cleaned up)
	if (manifest.taskCount === 0 && existsSync(paths.journal)) {
		const journalText = readFileSync(paths.journal, 'utf-8');
		const taskLines = journalText.split('\n').filter(l => l.includes('"task-created"'));
		const taskIds = new Set<string>();
		for (const line of taskLines) {
			try {
				const entry = JSON.parse(line);
				const taskId = entry.event?.taskId;
				if (taskId) taskIds.add(taskId);
			} catch {}
		}
		manifest.taskCount = taskIds.size > 0 ? taskIds.size : taskLines.length;
	}

	// Patch agent colors if all subagents are gray (pre-fix captures)
	const subagents = manifest.agents.filter(a => a.agentType !== 'lead');
	if (subagents.length > 0 && subagents.every(a => a.color === 'gray')) {
		for (const agent of subagents) {
			agent.color = roleColor(agent.agentType);
		}
	}

	return { manifest, terminal, protocol, teamchat };
}

export function generateReport(bundlePath: string): string {
	const session = parseCapture(bundlePath);
	const scorecard = computeScorecard(session);
	return renderReport(scorecard);
}
