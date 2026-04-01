import type { ParsedSession, Scorecard, ScorecardMetrics, KeyMoment } from './types.js';
import type { ChatEvent } from '../shared/types.js';

function countByType(events: ChatEvent[], type: string): number {
	return events.filter(e => e.type === type).length;
}

function countBySubtype(events: ChatEvent[], subtype: string): number {
	return events.filter(e => e.type === 'system' && e.subtype === subtype).length;
}

export function computeScorecard(session: ParsedSession): Scorecard {
	const { terminal, protocol, teamchat, manifest } = session;
	const events = teamchat.events;

	const terminalLinesLead = terminal.lead.length;
	const terminalLinesAll = terminal.merged.length;
	const teamchatEvents = events.length;
	const hiddenMessages = protocol.messages.filter(m => m.isDM).length;

	// Idle metrics
	const idlePingsRaw = protocol.messages.filter(m => {
		try {
			const parsed = JSON.parse(m.content);
			return parsed.type === 'idle' || parsed.idleReason;
		} catch {
			return m.content.includes('"idle"');
		}
	}).length;
	const idleEventsShown = countBySubtype(events, 'idle-surfaced');
	const noiseSuppression = idleEventsShown > 0 ? Math.round(idlePingsRaw / idleEventsShown) : 0;

	// Broadcast metrics
	const broadcastsRaw = protocol.messages.filter(m => m.isBroadcast).length;
	const broadcastsShown = events.filter(e => e.type === 'message' && e.isBroadcast).length;
	const broadcastDedup = broadcastsShown > 0 ? Math.round(broadcastsRaw / broadcastsShown) : 0;

	// Coordination events: reactions, thread markers, bottlenecks, cascades
	const coordinationSurfaced =
		countByType(events, 'reaction') +
		countByType(events, 'thread-marker') +
		countBySubtype(events, 'bottleneck') +
		countBySubtype(events, 'task-unblocked');

	// Terminal gap: teamchat events with no terminal equivalent
	const terminalContentSet = new Set(terminal.merged.map(e => e.content.slice(0, 100)));
	const terminalGap = events.filter(e => {
		if (e.type === 'message') return !terminalContentSet.has(e.text.slice(0, 100));
		if (e.type === 'reaction' || e.type === 'thread-marker') return true;
		if (e.type === 'presence') return true;
		return false;
	}).length;

	// Signal ratios
	const uniqueTerminalContent = new Set(terminal.merged.map(e => e.content.slice(0, 100)));
	const terminalSignalRatio = terminalLinesAll > 0
		? Math.round((uniqueTerminalContent.size / terminalLinesAll) * 100) / 100
		: 0;

	const uniqueTeamchatContent = new Set(events.map(e => {
		if (e.type === 'message') return e.text.slice(0, 100);
		if (e.type === 'system') return `${e.subtype}:${e.text.slice(0, 50)}`;
		if (e.type === 'reaction') return `${e.emoji}:${e.targetMessageId}`;
		return e.id;
	}));
	const teamchatSignalRatio = teamchatEvents > 0
		? Math.round((uniqueTeamchatContent.size / teamchatEvents) * 100) / 100
		: 0;

	const metrics: ScorecardMetrics = {
		terminalLinesLead,
		terminalLinesAll,
		hiddenMessages,
		teamchatEvents,
		idlePingsRaw,
		idleEventsShown,
		noiseSuppression,
		broadcastsRaw,
		broadcastsShown,
		broadcastDedup,
		coordinationSurfaced,
		terminalGap,
		terminalSignalRatio,
		teamchatSignalRatio,
	};

	const keyMoments = detectKeyMoments(session);

	return {
		version: 1,
		session: {
			team: manifest.team,
			durationMs: manifest.durationMs,
			agents: manifest.agents.length,
			tasks: manifest.taskCount,
			capturedAt: manifest.capturedAt,
		},
		metrics,
		keyMoments,
		generatedAt: new Date().toISOString(),
	};
}

export function detectKeyMoments(session: ParsedSession): KeyMoment[] {
	const moments: KeyMoment[] = [];
	const { protocol, teamchat } = session;

	// Detect DM negotiations: 2+ DM messages between same pair
	const dmPairs = new Map<string, typeof protocol.messages>();
	for (const msg of protocol.messages.filter(m => m.isDM)) {
		const key = [msg.from, msg.to].sort().join(':');
		const group = dmPairs.get(key) ?? [];
		group.push(msg);
		dmPairs.set(key, group);
	}
	for (const [pair, msgs] of dmPairs) {
		if (msgs.length >= 2) {
			const [a, b] = pair.split(':');
			const preview = msgs[0].content.slice(0, 80).replace(/\n/g, ' ');
			moments.push({
				timestamp: msgs[0].timestamp,
				type: 'dm',
				description: `DM thread between ${a} and ${b}: ${msgs.length} messages`,
				terminalSummary: 'No terminal output — DMs are invisible to all terminals.',
				teamchatSummary: `${msgs.length}-message DM thread. Preview: "${preview}${msgs[0].content.length > 80 ? '…' : ''}"`,
				terminalLines: 0,
				teamchatEvents: msgs.length + 1,
				gapScore: 1.0,
			});
		}
	}

	// Detect broadcasts
	const broadcastGroups = new Map<string, typeof protocol.messages>();
	for (const msg of protocol.messages.filter(m => m.isBroadcast)) {
		const key = `${msg.from}:${msg.content.slice(0, 50)}`;
		const group = broadcastGroups.get(key) ?? [];
		group.push(msg);
		broadcastGroups.set(key, group);
	}
	for (const [, msgs] of broadcastGroups) {
		if (msgs.length >= 2) {
			moments.push({
				timestamp: msgs[0].timestamp,
				type: 'broadcast',
				description: `Broadcast from ${msgs[0].from} to ${msgs.length} agents`,
				terminalSummary: `${msgs.length} repetitive tool calls sending the same message.`,
				teamchatSummary: `One broadcast card with ${msgs.length}-agent acknowledgement.`,
				terminalLines: msgs.length,
				teamchatEvents: 1,
				gapScore: 1 - (1 / msgs.length),
			});
		}
	}

	// Detect task cascades: task-completed followed by 2+ task-unblocked within 30s
	const completions = teamchat.events.filter(
		e => e.type === 'system' && e.subtype === 'task-completed'
	);
	for (const completion of completions) {
		const completionTime = new Date(completion.timestamp).getTime();
		const unblocks = teamchat.events.filter(e =>
			e.type === 'system' && e.subtype === 'task-unblocked' &&
			new Date(e.timestamp).getTime() - completionTime > 0 &&
			new Date(e.timestamp).getTime() - completionTime < 30000
		);
		if (unblocks.length >= 2) {
			moments.push({
				timestamp: completion.timestamp,
				type: 'cascade',
				description: `Task completion unblocked ${unblocks.length} downstream tasks`,
				terminalSummary: '1 line: task completed.',
				teamchatSummary: `Cascade alert: completion → ${unblocks.length} unblocks → simultaneous claims.`,
				terminalLines: 1,
				teamchatEvents: 1 + unblocks.length + unblocks.length,
				gapScore: 1 - (1 / (1 + unblocks.length * 2)),
			});
		}
	}

	// Detect idle gaps
	const idleEvents = teamchat.events.filter(
		e => e.type === 'system' && e.subtype === 'idle-surfaced'
	);
	for (const idle of idleEvents) {
		moments.push({
			timestamp: idle.timestamp,
			type: 'idle',
			description: 'Extended idle period with noise suppression',
			terminalSummary: 'Spinner — no actionable output.',
			teamchatSummary: 'One suppressed-idle indicator. Presence roster updates.',
			terminalLines: 0,
			teamchatEvents: 1,
			gapScore: 0.95,
		});
	}

	// Detect bottlenecks
	const bottlenecks = teamchat.events.filter(
		(e): e is import('../shared/types.js').SystemEvent => e.type === 'system' && e.subtype === 'bottleneck'
	);
	for (const bn of bottlenecks) {
		moments.push({
			timestamp: bn.timestamp,
			type: 'bottleneck',
			description: `Bottleneck detected: ${bn.text}`,
			terminalSummary: 'Spinner — agent appeared to be working.',
			teamchatSummary: 'Bottleneck alert with blocked agent identification.',
			terminalLines: 0,
			teamchatEvents: 2,
			gapScore: 1.0,
		});
	}

	// Type-diversity selection: ensure representation across moment types
	const MAX_MOMENTS = 10;
	const MAX_PER_TYPE = 4;

	// Group by type, each group sorted by gapScore descending
	const byType = new Map<string, KeyMoment[]>();
	for (const m of moments) {
		const group = byType.get(m.type) ?? [];
		group.push(m);
		byType.set(m.type, group);
	}
	for (const group of byType.values()) {
		group.sort((a, b) => b.gapScore - a.gapScore);
	}

	const selected = new Set<KeyMoment>();
	const typeCount = new Map<string, number>();

	// Round 1: take the best moment from each type that has candidates
	for (const [type, group] of byType) {
		if (group.length > 0 && selected.size < MAX_MOMENTS) {
			selected.add(group[0]);
			typeCount.set(type, 1);
		}
	}

	// Round 2: fill remaining slots by gapScore, capping each type at MAX_PER_TYPE
	const remaining = moments
		.filter(m => !selected.has(m))
		.sort((a, b) => b.gapScore - a.gapScore);
	for (const m of remaining) {
		if (selected.size >= MAX_MOMENTS) break;
		const count = typeCount.get(m.type) ?? 0;
		if (count >= MAX_PER_TYPE) continue;
		selected.add(m);
		typeCount.set(m.type, count + 1);
	}

	// Sort final list chronologically for readable output
	const result = [...selected].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
	);
	return result;
}
