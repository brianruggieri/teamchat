import { scanForSecrets } from './secret-scanner.js';
import type { ReplayBundle, ReplayEntry } from '../shared/replay.js';
import type { ChatEvent, ContentMessage, TaskInfo, TeamState } from '../shared/types.js';

export interface SanitizationOptions {
	sanitize: boolean;
	stripContent: boolean;
}

export interface SanitizationReport {
	secretsRedacted: number;
	agentsAnonymized: number;
	pathsStripped: number;
	eventsTotal: number;
	durationMs: number;
	pseudonymMap: Record<string, string>;
}

const PSEUDONYMS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

// --- Individual transform functions ---

/**
 * Redact any message whose text contains a secret. Returns cloned bundle with
 * a count of how many messages were redacted.
 */
export function redactSecrets(bundle: ReplayBundle): { bundle: ReplayBundle; count: number } {
	const cloned = deepClone(bundle);
	let count = 0;

	for (const entry of cloned.entries) {
		const ev = entry.event;
		if (ev.type === 'message') {
			const msg = ev as ContentMessage;
			if (scanForSecrets(msg.text).length > 0) {
				msg.text = '[content redacted — potential secret detected]';
				count++;
			}
		}
	}

	return { bundle: cloned, count };
}

/**
 * Replace agent names with Lead / Alpha / Bravo / … pseudonyms. Updates
 * ContentMessage.from, SystemEvent.agentName, ReactionEvent.fromAgent,
 * ThreadMarker.participants, PresenceChange.agentName, TaskUpdate task owner,
 * TeamState members, initialTasks/finalTasks owners.
 * Returns the new bundle, a count of unique agents anonymized, and the map.
 */
export function anonymizeAgentNames(bundle: ReplayBundle): {
	bundle: ReplayBundle;
	count: number;
	pseudonymMap: Record<string, string>;
} {
	const cloned = deepClone(bundle);
	const nameMap: Record<string, string> = {};

	// Build map: lead first, then rest in member order
	const members = cloned.team.members;
	const leadMember = members.find((m) => m.agentType === 'lead') ?? members[0] ?? null;

	if (leadMember) {
		nameMap[leadMember.name] = 'Lead';
	}

	let pseudoIdx = 0;
	for (const member of members) {
		if (nameMap[member.name] === undefined) {
			nameMap[member.name] = PSEUDONYMS[pseudoIdx] ?? `Agent${pseudoIdx + 1}`;
			pseudoIdx++;
		}
	}

	// Also pick up any names that appear in entries but not in team members
	const collectName = (name: string | null | undefined) => {
		if (name && nameMap[name] === undefined) {
			nameMap[name] = PSEUDONYMS[pseudoIdx] ?? `Agent${pseudoIdx + 1}`;
			pseudoIdx++;
		}
	};

	for (const entry of cloned.entries) {
		const ev = entry.event;
		if (ev.type === 'message') collectName((ev as ContentMessage).from);
		else if (ev.type === 'system') collectName((ev as { agentName: string | null }).agentName);
		else if (ev.type === 'reaction') collectName((ev as { fromAgent: string }).fromAgent);
		else if (ev.type === 'presence') collectName((ev as { agentName: string }).agentName);
	}

	const rename = (name: string | null | undefined): string | null => {
		if (!name) return name ?? null;
		return nameMap[name] ?? name;
	};

	// Rewrite team members
	for (const member of cloned.team.members) {
		member.name = nameMap[member.name] ?? member.name;
	}

	// Rewrite entries
	for (const entry of cloned.entries) {
		const ev = entry.event;
		if (ev.type === 'message') {
			const msg = ev as ContentMessage;
			msg.from = rename(msg.from) ?? msg.from;
			if (msg.dmParticipants) {
				msg.dmParticipants = msg.dmParticipants.map((p) => rename(p) ?? p);
			}
		} else if (ev.type === 'system') {
			const sev = ev as { agentName: string | null; taskSubject?: string | null };
			sev.agentName = rename(sev.agentName);
		} else if (ev.type === 'reaction') {
			const rev = ev as { fromAgent: string };
			rev.fromAgent = rename(rev.fromAgent) ?? rev.fromAgent;
		} else if (ev.type === 'thread-marker') {
			const tev = ev as { participants: string[] };
			tev.participants = tev.participants.map((p) => rename(p) ?? p);
		} else if (ev.type === 'presence') {
			const pev = ev as { agentName: string };
			pev.agentName = rename(pev.agentName) ?? pev.agentName;
		} else if (ev.type === 'task-update') {
			const tuev = ev as { task: TaskInfo };
			if (tuev.task.owner) {
				tuev.task.owner = rename(tuev.task.owner);
			}
		}
	}

	// Rewrite tasks
	const renameTask = (task: TaskInfo) => {
		if (task.owner) task.owner = rename(task.owner);
	};
	cloned.initialTasks.forEach(renameTask);
	cloned.finalTasks.forEach(renameTask);

	return { bundle: cloned, count: Object.keys(nameMap).length, pseudonymMap: nameMap };
}

/**
 * Replace absolute paths in message text and task descriptions with ./project/ stubs.
 */
export function stripPaths(bundle: ReplayBundle): { bundle: ReplayBundle; count: number } {
	const cloned = deepClone(bundle);
	let count = 0;

	const pathRegexes = [
		/\/Users\/[^/\s]+\/[^\s]*/g,
		/\/home\/[^/\s]+\/[^\s]*/g,
		/C:\\Users\\[^\s]+/g,
	];

	const replacePath = (text: string): { result: string; replaced: number } => {
		let replaced = 0;
		let result = text;
		for (const re of pathRegexes) {
			result = result.replace(re, (match) => {
				replaced++;
				// Preserve the final filename component
				const parts = match.replace(/\\/g, '/').split('/');
				const filename = parts[parts.length - 1];
				return filename ? `./project/${filename}` : './project/';
			});
		}
		return { result, replaced };
	};

	for (const entry of cloned.entries) {
		const ev = entry.event;
		if (ev.type === 'message') {
			const msg = ev as ContentMessage;
			const { result, replaced } = replacePath(msg.text);
			msg.text = result;
			count += replaced;
		}
	}

	// Also strip paths from task descriptions
	const stripTaskPaths = (task: TaskInfo) => {
		if (task.description) {
			const { result, replaced } = replacePath(task.description);
			task.description = result;
			count += replaced;
		}
	};
	cloned.initialTasks.forEach(stripTaskPaths);
	cloned.finalTasks.forEach(stripTaskPaths);

	return { bundle: cloned, count };
}

/**
 * Replace team name with "demo-team", assign a random session ID, sanitize
 * source pathLabel, and shift all timestamps so the earliest entry lands at
 * epoch (1970-01-01T00:00:00.000Z).
 */
export function cleanMetadata(bundle: ReplayBundle): ReplayBundle {
	const cloned = deepClone(bundle);

	// Replace team name
	cloned.team.name = 'demo-team';
	cloned.manifest.teamName = 'demo-team';
	const randomSuffix = Math.random().toString(36).slice(2, 10);
	cloned.manifest.sessionId = `demo-session-${randomSuffix}`;

	// Sanitize source path label
	cloned.manifest.source.pathLabel = 'sanitized-source';

	// Collect all timestamps to find minimum
	const allTimestamps: number[] = [];

	for (const entry of cloned.entries) {
		allTimestamps.push(entry.atMs);
	}
	for (const marker of cloned.markers) {
		allTimestamps.push(marker.atMs);
	}

	if (allTimestamps.length === 0) return cloned;

	const minMs = Math.min(...allTimestamps);

	// Shift entries
	for (const entry of cloned.entries) {
		const shiftedMs = entry.atMs - minMs;
		entry.atMs = shiftedMs;
		const ev = entry.event;
		// Update event timestamp if it has one
		if ('timestamp' in ev && typeof ev.timestamp === 'string') {
			(ev as { timestamp: string }).timestamp = new Date(shiftedMs).toISOString();
		}
	}

	// Shift markers
	for (const marker of cloned.markers) {
		marker.atMs = marker.atMs - minMs;
	}

	// Update manifest timestamps
	const startMs = new Date(cloned.manifest.startedAt).getTime();
	const endMs = new Date(cloned.manifest.endedAt).getTime();
	cloned.manifest.startedAt = new Date(0).toISOString();
	cloned.manifest.endedAt = new Date(Math.max(0, endMs - startMs)).toISOString();

	return cloned;
}

/**
 * Replace all message text with word-count placeholders and task descriptions
 * with null.
 */
export function stripContent(bundle: ReplayBundle): ReplayBundle {
	const cloned = deepClone(bundle);

	let taskIdx = 1;
	const taskSubjectMap: Record<string, string> = {};

	// Build task subject map from initialTasks
	for (const task of cloned.initialTasks) {
		taskSubjectMap[task.id] = `Task #${taskIdx++}`;
	}
	for (const task of cloned.finalTasks) {
		if (!taskSubjectMap[task.id]) {
			taskSubjectMap[task.id] = `Task #${taskIdx++}`;
		}
	}

	// Strip content from entries
	for (const entry of cloned.entries) {
		const ev = entry.event;
		if (ev.type === 'message') {
			const msg = ev as ContentMessage;
			const wordCount = msg.text.trim() === '' ? 0 : msg.text.trim().split(/\s+/).length;
			msg.text = `[message: ${wordCount} words]`;
		} else if (ev.type === 'task-update') {
			const tuev = ev as { task: TaskInfo };
			tuev.task.description = null;
			if (taskSubjectMap[tuev.task.id]) {
				tuev.task.subject = taskSubjectMap[tuev.task.id];
			} else {
				tuev.task.subject = `Task #${taskIdx++}`;
				taskSubjectMap[tuev.task.id] = tuev.task.subject;
			}
		}
	}

	// Strip tasks
	const stripTask = (task: TaskInfo) => {
		task.description = null;
		if (taskSubjectMap[task.id]) {
			task.subject = taskSubjectMap[task.id];
		} else {
			task.subject = `Task #${taskIdx++}`;
			taskSubjectMap[task.id] = task.subject;
		}
	};
	cloned.initialTasks.forEach(stripTask);
	cloned.finalTasks.forEach(stripTask);

	return cloned;
}

/**
 * Full sanitization pipeline.
 *
 * Pipeline order:
 *   1. Redact secrets in message text
 *   2. Anonymize agent names
 *   3. Strip absolute paths
 *   4. Clean metadata (team name, session ID, timestamps)
 *   5. (optional) Strip content
 */
export function sanitizeBundle(
	bundle: ReplayBundle,
	options: SanitizationOptions,
): { bundle: ReplayBundle; report: SanitizationReport } {
	const startedAt = Date.now();

	if (!options.sanitize) {
		return {
			bundle,
			report: {
				secretsRedacted: 0,
				agentsAnonymized: 0,
				pathsStripped: 0,
				eventsTotal: bundle.entries.length,
				durationMs: Date.now() - startedAt,
				pseudonymMap: {},
			},
		};
	}

	let current = bundle;

	// Step 1: redact secrets
	const { bundle: afterSecrets, count: secretsRedacted } = redactSecrets(current);
	current = afterSecrets;

	// Step 2: anonymize agents
	const {
		bundle: afterAnon,
		count: agentsAnonymized,
		pseudonymMap,
	} = anonymizeAgentNames(current);
	current = afterAnon;

	// Step 3: strip paths
	const { bundle: afterPaths, count: pathsStripped } = stripPaths(current);
	current = afterPaths;

	// Step 4: clean metadata
	current = cleanMetadata(current);

	// Step 5: optionally strip content
	if (options.stripContent) {
		current = stripContent(current);
	}

	return {
		bundle: current,
		report: {
			secretsRedacted,
			agentsAnonymized,
			pathsStripped,
			eventsTotal: current.entries.length,
			durationMs: Date.now() - startedAt,
			pseudonymMap,
		},
	};
}
