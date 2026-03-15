import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentInfo, JournalEntry, TaskInfo, TeamConfig, TeamState } from '../shared/types.js';
import type {
	ReplayArtifact,
	ReplayBundle,
	ReplayEntry,
	ReplayManifest,
	ReplayMarker,
} from '../shared/replay.js';
import { Journal } from './journal.js';
import { isLeadAgent } from '../shared/parse.js';

interface ReplayConfigFile extends TeamConfig {
	name?: string;
}

interface SessionMetadataFile {
	teamName: string;
	startedAt: string;
	endedAt: string;
	durationMs: number;
	eventCount: number;
	messageCount: number;
	presence: Record<string, 'working' | 'idle' | 'offline'>;
}

export interface LoadedReplaySource {
	bundle: ReplayBundle;
	rootDir: string;
	artifactBaseDir: string | null;
}

export function loadReplaySource(inputPath: string): LoadedReplaySource {
	const resolvedInput = path.resolve(inputPath);
	if (!fs.existsSync(resolvedInput)) {
		throw new Error(`Replay source not found: ${resolvedInput}`);
	}

	const stat = fs.statSync(resolvedInput);
	if (stat.isDirectory()) {
		return loadReplayDirectory(resolvedInput);
	}

	if (stat.isFile() && resolvedInput.endsWith('.jsonl')) {
		return loadLegacyReplayFile(resolvedInput);
	}

	if (stat.isFile() && resolvedInput.endsWith('.teamchat-replay')) {
		return loadBundleFile(resolvedInput);
	}

	throw new Error(`Unsupported replay source: ${resolvedInput}`);
}

function loadReplayDirectory(rootDir: string): LoadedReplaySource {
	const manifestPath = path.join(rootDir, 'manifest.json');
	const manifest = readJsonFile<ReplayManifest>(manifestPath);
	const eventsPath = resolveFirstExistingPath([
		path.join(rootDir, 'events.jsonl'),
		path.join(rootDir, 'session.jsonl'),
	]);
	if (!eventsPath) {
		throw new Error(`Replay bundle missing events.jsonl or session.jsonl: ${rootDir}`);
	}

	return buildReplaySource({
		rootDir,
		sourceKind: 'bundle',
		pathLabel: path.basename(rootDir),
		entries: readEntries(eventsPath),
		manifest,
		configPath: resolveFirstExistingPath([path.join(rootDir, 'config.json')]),
		initialTasksPath: resolveFirstExistingPath([
			path.join(rootDir, 'tasks.initial.json'),
			path.join(rootDir, 'tasks-initial.json'),
		]),
		finalTasksPath: resolveFirstExistingPath([
			path.join(rootDir, 'tasks.final.json'),
			path.join(rootDir, 'tasks.json'),
		]),
		artifactsPath: resolveFirstExistingPath([path.join(rootDir, 'artifacts.json')]),
		metadataPath: resolveFirstExistingPath([path.join(rootDir, 'meta.json')]),
	});
}

function loadBundleFile(filePath: string): LoadedReplaySource {
	const raw = fs.readFileSync(filePath, 'utf-8');
	const bundle = JSON.parse(raw) as ReplayBundle;
	const dir = path.dirname(filePath);
	return {
		bundle,
		rootDir: dir,
		artifactBaseDir: bundle.artifacts.length > 0 ? dir : null,
	};
}

function loadLegacyReplayFile(filePath: string): LoadedReplaySource {
	const rootDir = path.dirname(filePath);
	const baseName = path.basename(filePath, '.jsonl');
	return buildReplaySource({
		rootDir,
		sourceKind: 'journal',
		pathLabel: path.basename(filePath),
		entries: readEntries(filePath),
		manifest: null,
		// Check team-prefixed sibling first (e.g. taskboard.config.json), then generic
		configPath: resolveFirstExistingPath([
			path.join(rootDir, `${baseName}.config.json`),
			path.join(rootDir, 'config.json'),
		]),
		initialTasksPath: resolveFirstExistingPath([
			path.join(rootDir, `${baseName}.tasks.initial.json`),
			path.join(rootDir, 'tasks.initial.json'),
			path.join(rootDir, 'tasks-initial.json'),
		]),
		finalTasksPath: resolveFirstExistingPath([
			path.join(rootDir, `${baseName}.tasks.json`),
			path.join(rootDir, 'tasks.final.json'),
			path.join(rootDir, 'tasks.json'),
		]),
		artifactsPath: resolveFirstExistingPath([
			path.join(rootDir, `${baseName}.artifacts.json`),
			path.join(rootDir, 'artifacts.json'),
		]),
		metadataPath: resolveFirstExistingPath([
			path.join(rootDir, `${baseName}.meta.json`),
		]),
		fileName: baseName,
	});
}

function buildReplaySource({
	rootDir,
	sourceKind,
	pathLabel,
	entries,
	manifest,
	configPath,
	initialTasksPath,
	finalTasksPath,
	artifactsPath,
	metadataPath,
	fileName,
}: {
	rootDir: string;
	sourceKind: 'journal' | 'bundle';
	pathLabel: string;
	entries: JournalEntry[];
	manifest: ReplayManifest | null;
	configPath: string | null;
	initialTasksPath: string | null;
	finalTasksPath: string | null;
	artifactsPath: string | null;
	metadataPath?: string | null;
	fileName?: string;
}): LoadedReplaySource {
	const normalizedEntries = normalizeEntries(entries);
	const config = configPath ? readJsonFile<ReplayConfigFile>(configPath) : null;
	const metadata = metadataPath ? readJsonFile<SessionMetadataFile>(metadataPath) : null;
	const derivedTasks = deriveTasksFromEntries(normalizedEntries);
	const initialTasks = initialTasksPath
		? readJsonFile<TaskInfo[]>(initialTasksPath) ?? derivedTasks.initial
		: derivedTasks.initial;
	const finalTasks = finalTasksPath
		? readJsonFile<TaskInfo[]>(finalTasksPath) ?? derivedTasks.final
		: derivedTasks.final;
	const artifacts = artifactsPath ? readJsonFile<ReplayArtifact[]>(artifactsPath) ?? [] : [];

	const teamName = manifest?.teamName
		?? config?.name
		?? metadata?.teamName
		?? fileName
		?? path.basename(rootDir);
	const configMembers = config?.members ?? [];
	// If no config, infer members from event 'from' fields
	const members = configMembers.length > 0
		? configMembers
		: inferMembersFromEntries(normalizedEntries);
	const team: TeamState = {
		name: teamName,
		members,
	};

	const computedManifest = buildManifest({
		manifest,
		team,
		entries: normalizedEntries,
		finalTasks,
		artifacts,
		sourceKind,
		pathLabel,
		rootDir,
		metadata,
	});
	const markers = buildMarkers(normalizedEntries, artifacts);

	return {
		bundle: {
			manifest: computedManifest,
			team,
			entries: normalizedEntries,
			initialTasks,
			finalTasks,
			artifacts,
			markers,
		},
		rootDir,
		artifactBaseDir: artifacts.length > 0 ? rootDir : null,
	};
}

const INFERRED_COLORS = ['blue', 'green', 'purple', 'yellow', 'red', 'cyan', 'orange', 'pink'];

/**
 * Infer team members from replay entries when no config file is available.
 *
 * NOTE: Lead agents are inferred with `name: 'team-lead'`. The PresenceRoster
 * component filters on `member.name === 'team-lead'` to render the lead row
 * specially — keep these in sync if renaming.
 */
function inferMembersFromEntries(entries: ReplayEntry[]): AgentInfo[] {
	const seen = new Map<string, { firstType: string; color: string; model?: string }>();
	let colorIdx = 0;

	for (const entry of entries) {
		const ev = entry.event;

		if (ev.type === 'message') {
			const msg = ev as { from: string; fromColor?: string; isLead?: boolean };
			const name = msg.from;
			if (name && !seen.has(name)) {
				const isLead = msg.isLead || isLeadAgent(name);
				seen.set(name, {
					firstType: isLead ? 'lead' : 'worker',
					color: msg.fromColor ?? INFERRED_COLORS[colorIdx++ % INFERRED_COLORS.length]!,
				});
			}
		} else if (ev.type === 'system') {
			const sys = ev as { subtype?: string; agentName?: string | null; agentColor?: string | null; agentModel?: string | null };
			if (sys.agentName && !isLeadAgent(sys.agentName)) {
				if (!seen.has(sys.agentName)) {
					seen.set(sys.agentName, {
						firstType: 'worker',
						color: sys.agentColor ?? INFERRED_COLORS[colorIdx++ % INFERRED_COLORS.length]!,
					});
				}
				// Enrich with model from member-joined events
				if (sys.subtype === 'member-joined' && sys.agentModel) {
					const existing = seen.get(sys.agentName)!;
					existing.model = sys.agentModel;
				}
			}
		} else if (ev.type === 'presence') {
			const pres = ev as { agentName: string };
			if (pres.agentName && !seen.has(pres.agentName) && !isLeadAgent(pres.agentName)) {
				seen.set(pres.agentName, {
					firstType: 'worker',
					color: INFERRED_COLORS[colorIdx++ % INFERRED_COLORS.length]!,
				});
			}
		}
	}

	return Array.from(seen.entries()).map(([name, info]) => ({
		name,
		agentId: `inferred-${name}`,
		agentType: info.firstType,
		color: info.color,
		model: info.model,
	}));
}

function readEntries(filePath: string): JournalEntry[] {
	return Journal.readFrom(filePath);
}

export function normalizeEntries(entries: JournalEntry[]): ReplayEntry[] {
	if (entries.length === 0) {
		return [];
	}

	// Sort by seq (recording order) — this is the authoritative ordering.
	// Timestamps may be backdated for config/task events.
	const sorted = [...entries].sort((a, b) => a.seq - b.seq);
	const baseTs = new Date(sorted[0]!.event.timestamp).getTime();

	let maxAtMs = 0;
	return sorted.map((entry, index) => {
		const rawAtMs = Math.max(0, new Date(entry.event.timestamp).getTime() - baseTs);
		// Ensure atMs is monotonically non-decreasing despite backdated timestamps
		maxAtMs = Math.max(maxAtMs, rawAtMs);
		return {
			seq: index,
			atMs: maxAtMs,
			event: entry.event,
		};
	});
}

function deriveTasksFromEntries(entries: ReplayEntry[]): { initial: TaskInfo[]; final: TaskInfo[] } {
	const firstSeen = new Map<string, TaskInfo>();
	const lastSeen = new Map<string, TaskInfo>();

	for (const entry of entries) {
		if (entry.event.type !== 'task-update') {
			continue;
		}
		const task = entry.event.task;
		if (!firstSeen.has(task.id)) {
			firstSeen.set(task.id, structuredClone(task));
		}
		lastSeen.set(task.id, structuredClone(task));
	}

	return {
		initial: sortTasks(Array.from(firstSeen.values())),
		final: sortTasks(Array.from(lastSeen.values())),
	};
}

function sortTasks(tasks: TaskInfo[]): TaskInfo[] {
	return [...tasks].sort((a, b) => Number(a.id) - Number(b.id));
}

function buildManifest({
	manifest,
	team,
	entries,
	finalTasks,
	artifacts,
	sourceKind,
	pathLabel,
	rootDir,
	metadata,
}: {
	manifest: ReplayManifest | null;
	team: TeamState;
	entries: ReplayEntry[];
	finalTasks: TaskInfo[];
	artifacts: ReplayArtifact[];
	sourceKind: 'journal' | 'bundle';
	pathLabel: string;
	rootDir: string;
	metadata?: SessionMetadataFile | null;
}): ReplayManifest {
	if (entries.length === 0) {
		const now = new Date().toISOString();
		return {
			version: 1,
			sessionId: manifest?.sessionId ?? path.basename(rootDir),
			teamName: manifest?.teamName ?? metadata?.teamName ?? team.name,
			startedAt: manifest?.startedAt ?? metadata?.startedAt ?? now,
			endedAt: manifest?.endedAt ?? metadata?.endedAt ?? now,
			durationMs: metadata?.durationMs ?? 0,
			eventCount: metadata?.eventCount ?? 0,
			memberCount: team.members.length,
			taskCount: finalTasks.length,
			hasArtifacts: artifacts.length > 0,
			source: {
				kind: sourceKind,
				pathLabel,
			},
		};
	}

	const startedAt = manifest?.startedAt ?? metadata?.startedAt ?? entries[0]!.event.timestamp;
	const endedAt = manifest?.endedAt ?? metadata?.endedAt ?? entries[entries.length - 1]!.event.timestamp;
	const durationMs = manifest?.durationMs
		?? metadata?.durationMs
		?? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());

	return {
		version: 1,
		sessionId: manifest?.sessionId ?? path.basename(rootDir),
		teamName: manifest?.teamName ?? metadata?.teamName ?? team.name,
		startedAt,
		endedAt,
		durationMs,
		eventCount: manifest?.eventCount ?? metadata?.eventCount ?? entries.length,
		memberCount: manifest?.memberCount ?? team.members.length,
		taskCount: manifest?.taskCount ?? finalTasks.length,
		hasArtifacts: manifest?.hasArtifacts ?? artifacts.length > 0,
		source: {
			kind: sourceKind,
			pathLabel,
		},
	};
}

function buildMarkers(entries: ReplayEntry[], artifacts: ReplayArtifact[]): ReplayMarker[] {
	const markers: ReplayMarker[] = [];

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

	for (const entry of entries) {
		const marker = buildMarkerFromEvent(entry);
		if (marker) {
			markers.push(marker);
		}
	}

	for (const artifact of artifacts) {
		markers.push({
			id: `marker-artifact-${artifact.id}`,
			kind: 'artifact',
			atMs: artifact.createdAtMs,
			seq: findClosestSeqForMs(entries, artifact.createdAtMs),
			label: artifact.title,
			artifactId: artifact.id,
		});
	}

	return markers.sort((a, b) => {
		if (a.atMs !== b.atMs) {
			return a.atMs - b.atMs;
		}
		return a.seq - b.seq;
	});
}

function buildMarkerFromEvent(entry: ReplayEntry): ReplayMarker | null {
	const event = entry.event;
	if (event.type === 'system') {
		const markerKind = systemSubtypeToMarkerKind(event.subtype);
		if (!markerKind) {
			return null;
		}
		return {
			id: `marker-${markerKind}-${event.id}`,
			kind: markerKind,
			atMs: entry.atMs,
			seq: entry.seq,
			label: event.taskId ? `${event.text} (#${event.taskId})` : event.text,
			eventId: event.id,
			taskId: event.taskId ?? undefined,
		};
	}

	if (event.type === 'thread-marker' && event.subtype === 'thread-start') {
		return {
			id: `marker-thread-${event.id}`,
			kind: 'thread-start',
			atMs: entry.atMs,
			seq: entry.seq,
			label: `DM: ${event.participants.join(' ↔ ')}`,
			eventId: event.id,
		};
	}

	if (event.type === 'message' && event.text.startsWith('📋 PLAN:')) {
		return {
			id: `marker-plan-${event.id}`,
			kind: 'plan',
			atMs: entry.atMs,
			seq: entry.seq,
			label: `Plan from ${event.from}`,
			eventId: event.id,
		};
	}

	if (
		event.type === 'message'
		&& event.text.startsWith('🔐 ')
		&& event.text.includes(' wants to run:')
	) {
		return {
			id: `marker-permission-${event.id}`,
			kind: 'permission',
			atMs: entry.atMs,
			seq: entry.seq,
			label: `Permission: ${event.from}`,
			eventId: event.id,
		};
	}

	return null;
}

function systemSubtypeToMarkerKind(subtype: string): ReplayMarker['kind'] | null {
	switch (subtype) {
		case 'task-created':
			return 'task-created';
		case 'task-claimed':
			return 'task-claimed';
		case 'task-completed':
			return 'task-completed';
		case 'task-unblocked':
			return 'task-unblocked';
		case 'all-tasks-completed':
			return 'all-tasks-completed';
		default:
			return null;
	}
}

function findClosestSeqForMs(entries: ReplayEntry[], atMs: number): number {
	let seq = 0;
	for (const entry of entries) {
		if (entry.atMs > atMs) {
			break;
		}
		seq = entry.seq;
	}
	return seq;
}

function resolveFirstExistingPath(paths: string[]): string | null {
	for (const candidate of paths) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

function readJsonFile<T>(filePath: string): T | null {
	if (!fs.existsSync(filePath)) {
		return null;
	}
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
	} catch {
		return null;
	}
}
