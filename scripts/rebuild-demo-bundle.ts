#!/usr/bin/env bun
/**
 * Rebuild the demo replay bundle from the JSONL source session.
 *
 * Reads:  fixtures/replays/teamchat-build-session/session.jsonl
 * Writes: fixtures/replays/demo/session.teamchat-replay
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '..');
const JSONL_PATH = path.join(REPO_ROOT, 'fixtures/replays/teamchat-build-session/session.jsonl');
const BUNDLE_PATH = path.join(REPO_ROOT, 'fixtures/replays/demo/session.teamchat-replay');

// ---------------------------------------------------------------------------
// Types (inlined to avoid import resolution issues during standalone run)
// ---------------------------------------------------------------------------

interface JournalEntry {
	seq: number;
	event: Record<string, unknown> & { type: string; id: string; timestamp: string };
}

interface ReplayEntry {
	seq: number;
	atMs: number;
	event: JournalEntry['event'];
}

interface AgentInfo {
	name: string;
	agentId: string;
	agentType: string;
	color: string;
}

interface TaskInfo {
	id: string;
	subject: string;
	description: string | null;
	status: string;
	owner: string | null;
	blockedBy: string[] | null;
	activeForm: string | null;
	created: string;
	updated: string;
}

interface ReplayMarker {
	id: string;
	kind: string;
	atMs: number;
	seq: number;
	label: string;
	eventId?: string;
	taskId?: string;
}

// ---------------------------------------------------------------------------
// Step 1 — Read JSONL
// ---------------------------------------------------------------------------

const rawLines = fs.readFileSync(JSONL_PATH, 'utf-8')
	.split('\n')
	.filter(l => l.trim().length > 0);

const journalEntries: JournalEntry[] = rawLines.map(line => JSON.parse(line) as JournalEntry);
console.log(`Read ${journalEntries.length} entries from JSONL`);

// ---------------------------------------------------------------------------
// Step 2 — Normalise entries: sort by seq, compute atMs relative to first ts
// ---------------------------------------------------------------------------

const sorted = [...journalEntries].sort((a, b) => a.seq - b.seq);
const baseTs = new Date(sorted[0]!.event.timestamp).getTime();
const lastTs = new Date(sorted[sorted.length - 1]!.event.timestamp).getTime();

let maxAtMs = 0;
const entries: ReplayEntry[] = sorted.map((je, index) => {
	const rawAtMs = Math.max(0, new Date(je.event.timestamp).getTime() - baseTs);
	maxAtMs = Math.max(maxAtMs, rawAtMs);
	return {
		seq: index,
		atMs: maxAtMs,
		event: je.event,
	};
});

console.log(`Normalized ${entries.length} entries — span: ${maxAtMs}ms (${(maxAtMs / 60000).toFixed(1)} min)`);

// ---------------------------------------------------------------------------
// Step 3 — Extract team members
// ---------------------------------------------------------------------------

const INFERRED_COLORS = ['blue', 'green', 'purple', 'yellow', 'red', 'cyan', 'orange', 'pink'];

function isLeadAgent(name: string): boolean {
	return name === 'team-lead' || name.endsWith('-lead') || name === 'lead';
}

const memberMap = new Map<string, { type: string; color: string }>();
let colorIdx = 0;

// First pass: collect from member-joined system events (most reliable)
for (const entry of entries) {
	const ev = entry.event;
	if (ev.type === 'system') {
		const sys = ev as { subtype?: string; agentName?: string | null; agentColor?: string | null };
		if (sys.subtype === 'member-joined' && sys.agentName) {
			if (!memberMap.has(sys.agentName)) {
				memberMap.set(sys.agentName, {
					type: isLeadAgent(sys.agentName) ? 'lead' : 'worker',
					color: sys.agentColor ?? INFERRED_COLORS[colorIdx++ % INFERRED_COLORS.length]!,
				});
			}
		}
	}
}

// Second pass: collect from message senders
for (const entry of entries) {
	const ev = entry.event;
	if (ev.type === 'message') {
		const msg = ev as { from?: string; fromColor?: string; isLead?: boolean };
		if (msg.from && !memberMap.has(msg.from)) {
			memberMap.set(msg.from, {
				type: (msg.isLead || isLeadAgent(msg.from)) ? 'lead' : 'worker',
				color: msg.fromColor ?? INFERRED_COLORS[colorIdx++ % INFERRED_COLORS.length]!,
			});
		}
	}
}

// team-lead is always present (it creates the team)
if (!memberMap.has('team-lead')) {
	memberMap.set('team-lead', { type: 'lead', color: '#FFD700' });
}

const members: AgentInfo[] = Array.from(memberMap.entries()).map(([name, info]) => ({
	name,
	agentId: `inferred-${name}`,
	agentType: info.type,
	color: info.color,
}));

console.log(`Team members: ${members.map(m => m.name).join(', ')}`);

// ---------------------------------------------------------------------------
// Step 4 — Extract final task states from task-update events
// ---------------------------------------------------------------------------

const taskMap = new Map<string, TaskInfo>();

for (const entry of entries) {
	const ev = entry.event;
	if (ev.type === 'task-update') {
		const tu = ev as { task: TaskInfo };
		taskMap.set(tu.task.id, structuredClone(tu.task));
	}
}

// Sort numerically by id
const finalTasks: TaskInfo[] = Array.from(taskMap.values()).sort((a, b) => {
	return Number(a.id) - Number(b.id);
});

console.log(`Final tasks: ${finalTasks.length} (IDs: ${finalTasks.map(t => t.id).join(', ')})`);

// ---------------------------------------------------------------------------
// Step 5 — Build markers
// ---------------------------------------------------------------------------

const markers: ReplayMarker[] = [];

// Session start
if (entries.length > 0) {
	markers.push({
		id: 'marker-session-start',
		kind: 'session-start',
		atMs: 0,
		seq: 0,
		label: 'Session start',
		eventId: entries[0]!.event.id,
	});
}

const MARKER_SYSTEM_SUBTYPES = new Set([
	'task-created',
	'task-claimed',
	'task-completed',
	'task-unblocked',
	'all-tasks-completed',
	'member-joined',
]);

for (const entry of entries) {
	const ev = entry.event;

	if (ev.type === 'system') {
		const sys = ev as {
			subtype?: string;
			agentName?: string | null;
			taskId?: string | null;
			text?: string;
		};
		if (!sys.subtype || !MARKER_SYSTEM_SUBTYPES.has(sys.subtype)) continue;

		let kind = sys.subtype;
		// Map member-joined to a recognizable kind (use task-created slot)
		// Actually the ReplayMarker kind enum doesn't include member-joined,
		// so we skip those or map them. Let's skip — they're not in the kind union.
		if (sys.subtype === 'member-joined') continue;

		let label = (sys.text as string | undefined) ?? sys.subtype;
		if (sys.taskId) {
			label = `${label} (#${sys.taskId})`;
		}

		markers.push({
			id: `marker-${kind}-${ev.id}`,
			kind,
			atMs: entry.atMs,
			seq: entry.seq,
			label,
			eventId: ev.id,
			...(sys.taskId ? { taskId: sys.taskId } : {}),
		});
	}

	if (ev.type === 'thread-marker') {
		const tm = ev as { subtype?: string; participants?: string[] };
		if (tm.subtype === 'thread-start') {
			markers.push({
				id: `marker-thread-${ev.id}`,
				kind: 'thread-start',
				atMs: entry.atMs,
				seq: entry.seq,
				label: `DM: ${(tm.participants ?? []).join(' ↔ ')}`,
				eventId: ev.id,
			});
		}
	}
}

// Sort markers by atMs then seq
markers.sort((a, b) => (a.atMs !== b.atMs ? a.atMs - b.atMs : a.seq - b.seq));

console.log(`Markers: ${markers.length}`);

// ---------------------------------------------------------------------------
// Step 6 — Build the bundle
// ---------------------------------------------------------------------------

const startedAt = new Date(baseTs).toISOString();
const endedAt = new Date(lastTs).toISOString();
const durationMs = maxAtMs;

const bundle = {
	manifest: {
		version: 1,
		sessionId: 'demo-session',
		teamName: 'teamchat-build',
		startedAt,
		endedAt,
		durationMs,
		eventCount: entries.length,
		memberCount: members.length,
		taskCount: finalTasks.length,
		hasArtifacts: false,
		source: {
			kind: 'journal',
			pathLabel: 'teamchat-build-session',
		},
	},
	team: {
		name: 'teamchat-build',
		members,
	},
	entries,
	initialTasks: [],
	finalTasks,
	artifacts: [],
	markers,
};

// ---------------------------------------------------------------------------
// Step 7 — Write output
// ---------------------------------------------------------------------------

const outDir = path.dirname(BUNDLE_PATH);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(BUNDLE_PATH, JSON.stringify(bundle, null, '\t'), 'utf-8');

const stat = fs.statSync(BUNDLE_PATH);
console.log(`\nWrote ${BUNDLE_PATH}`);
console.log(`  Size: ${(stat.size / 1024).toFixed(1)} KB`);
console.log(`  Entries: ${entries.length}`);
console.log(`  Duration: ${(durationMs / 60000).toFixed(1)} min`);
console.log(`  StartedAt: ${startedAt}`);
console.log(`  EndedAt: ${endedAt}`);
console.log(`  Tasks: ${finalTasks.length}`);
console.log(`  Markers: ${markers.length}`);
console.log(`  Members: ${members.map(m => `${m.name}(${m.agentType})`).join(', ')}`);
