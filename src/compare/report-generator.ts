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
	const events: ChatEvent[] = text
		.split('\n')
		.filter(l => l.trim())
		.map(l => (JSON.parse(l) as JournalEntry).event);
	return { events };
}

export function parseCapture(bundlePath: string): ParsedSession {
	const paths = getCapturePaths(bundlePath);
	const manifest: CaptureManifest = JSON.parse(readFileSync(paths.manifest, 'utf-8'));
	const terminal = buildTerminalTimeline(paths, manifest);
	const protocol = existsSync(paths.inboxesDir)
		? parseInboxes(paths.inboxesDir)
		: { messages: [] };
	const teamchat = loadJournal(paths.journal);

	return { manifest, terminal, protocol, teamchat };
}

export function generateReport(bundlePath: string): string {
	const session = parseCapture(bundlePath);
	const scorecard = computeScorecard(session);
	return renderReport(scorecard);
}
