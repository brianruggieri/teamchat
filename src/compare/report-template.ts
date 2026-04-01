import type { Scorecard, KeyMoment, ParsedSession, TerminalEntry, ProtocolMessage } from './types.js';
import type { ChatEvent, SystemEvent } from '../shared/types.js';

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function formatDuration(ms: number): string {
	const min = Math.round(ms / 60000);
	if (min < 60) return `${min} min`;
	const h = Math.floor(min / 60);
	const m = min % 60;
	return `${h}h ${m}m`;
}

function formatTime(timestamp: string): string {
	try {
		const d = new Date(timestamp);
		if (isNaN(d.getTime())) return timestamp.slice(0, 8);
		return d.toTimeString().slice(0, 8);
	} catch {
		return timestamp.slice(0, 8);
	}
}

function truncate(text: string, max: number): string {
	const clean = text.replace(/\n/g, ' ').trim();
	if (clean.length <= max) return clean;
	return clean.slice(0, max) + '...';
}

// --- Data extraction helpers ---

function getTerminalEntriesAround(entries: TerminalEntry[], timestamp: string, windowMs: number = 30000): TerminalEntry[] {
	const ts = new Date(timestamp).getTime();
	if (isNaN(ts)) return [];
	return entries.filter(e => {
		const t = new Date(e.timestamp).getTime();
		return !isNaN(t) && Math.abs(t - ts) <= windowMs;
	});
}

function getProtocolMessagesAround(messages: ProtocolMessage[], timestamp: string, windowMs: number = 30000): ProtocolMessage[] {
	const ts = new Date(timestamp).getTime();
	if (isNaN(ts)) return [];
	return messages.filter(m => {
		const t = new Date(m.timestamp).getTime();
		return !isNaN(t) && Math.abs(t - ts) <= windowMs;
	});
}

function getEventsAround(events: ChatEvent[], timestamp: string, windowMs: number = 30000): ChatEvent[] {
	const ts = new Date(timestamp).getTime();
	if (isNaN(ts)) return [];
	return events.filter(e => {
		const t = new Date(e.timestamp).getTime();
		return !isNaN(t) && Math.abs(t - ts) <= windowMs;
	});
}

function renderTerminalLines(entries: TerminalEntry[], maxLines: number = 5): string {
	if (entries.length === 0) return '<span class="empty-indicator">No terminal output in this window.</span>';
	const lines = entries.slice(0, maxLines).map(e => {
		const time = formatTime(e.timestamp);
		const agent = escapeHtml(e.agent);
		const typeTag = e.type === 'tool-call' ? `<span class="term-tool">[${escapeHtml(e.toolName ?? 'tool')}]</span> ` : '';
		const content = escapeHtml(truncate(e.content, 120));
		return `<span class="term-time">[${time}]</span> <span class="term-agent">${agent}:</span> ${typeTag}${content}`;
	}).join('\n');
	const suffix = entries.length > maxLines ? `\n<span class="term-more">... ${entries.length - maxLines} more lines</span>` : '';
	return lines + suffix;
}

function renderTeamchatEvents(events: ChatEvent[], maxEvents: number = 5): string {
	if (events.length === 0) return '<span class="empty-indicator">No teamchat events in this window.</span>';
	const items = events.slice(0, maxEvents).map(e => {
		switch (e.type) {
			case 'message': {
				const dmBadge = e.isDM ? '<span class="tc-badge dm">DM</span> ' : '';
				const bcBadge = e.isBroadcast ? '<span class="tc-badge broadcast">Broadcast</span> ' : '';
				const from = escapeHtml(e.from);
				const text = escapeHtml(truncate(e.text, 100));
				const targets = e.isDM && e.dmParticipants ? ` <span class="tc-participants">${escapeHtml(e.dmParticipants.join(', '))}</span>` : '';
				return `<div class="tc-event">${dmBadge}${bcBadge}<strong>${from}</strong>${targets}: ${text}</div>`;
			}
			case 'system': {
				const badge = `<span class="tc-badge system">${escapeHtml(e.subtype)}</span>`;
				return `<div class="tc-event">${badge} ${escapeHtml(truncate(e.text, 100))}</div>`;
			}
			case 'reaction': {
				return `<div class="tc-event"><span class="tc-badge reaction">${escapeHtml(e.emoji)}</span> ${escapeHtml(e.fromAgent)} reacted</div>`;
			}
			case 'thread-marker': {
				const label = e.subtype === 'thread-start' ? 'Thread started' : 'Thread ended';
				return `<div class="tc-event"><span class="tc-badge thread">${label}</span> ${escapeHtml(e.participants.join(', '))}</div>`;
			}
			case 'presence': {
				return `<div class="tc-event"><span class="tc-badge presence">${escapeHtml(e.status)}</span> ${escapeHtml(e.agentName)}</div>`;
			}
			case 'task-update': {
				return `<div class="tc-event"><span class="tc-badge task">${escapeHtml(e.task.status)}</span> ${escapeHtml(truncate(e.task.subject, 80))}</div>`;
			}
			default:
				return '';
		}
	}).join('\n');
	const suffix = events.length > maxEvents ? `\n<div class="tc-more">${events.length - maxEvents} more events</div>` : '';
	return items + suffix;
}

// --- Moment card with real data ---

function renderMomentCard(moment: KeyMoment, index: number, session: ParsedSession | null): string {
	const typeLabel = {
		dm: 'DM Thread', cascade: 'Task Cascade', broadcast: 'Broadcast',
		idle: 'Idle Gap', bottleneck: 'Bottleneck', coordination: 'Coordination',
	}[moment.type];

	let terminalContent: string;
	let teamchatContent: string;

	if (session) {
		// Real data from the session
		const terminalEntries = getTerminalEntriesAround(session.terminal.merged, moment.timestamp);
		const leadEntries = getTerminalEntriesAround(session.terminal.lead, moment.timestamp);
		const teamchatEvents = getEventsAround(session.teamchat.events, moment.timestamp);
		const protocolMsgs = getProtocolMessagesAround(session.protocol.messages, moment.timestamp);

		// Terminal pane: for DMs, show what the lead terminal showed (which is NOT the DM)
		if (moment.type === 'dm') {
			if (leadEntries.length > 0) {
				terminalContent = `<div class="pane-note">Lead terminal around this time:</div>\n${renderTerminalLines(leadEntries, 5)}`;
			} else if (terminalEntries.length > 0) {
				terminalContent = `<div class="pane-note">Nearby agent terminal output:</div>\n${renderTerminalLines(terminalEntries, 5)}`;
			} else {
				terminalContent = '<span class="empty-indicator">No terminal output — DMs are invisible to all terminals.</span>';
			}
		} else if (moment.type === 'broadcast') {
			// For broadcasts, show the repetitive protocol messages
			const broadcastMsgs = protocolMsgs.filter(m => m.isBroadcast);
			if (broadcastMsgs.length > 0) {
				const lines = broadcastMsgs.slice(0, 5).map(m => {
					return `<span class="term-time">[${formatTime(m.timestamp)}]</span> <span class="term-agent">${escapeHtml(m.from)}</span> -> <span class="term-agent">${escapeHtml(m.to)}</span>: ${escapeHtml(truncate(m.content, 80))}`;
				}).join('\n');
				const suffix = broadcastMsgs.length > 5 ? `\n<span class="term-more">... ${broadcastMsgs.length - 5} more identical sends</span>` : '';
				terminalContent = lines + suffix;
			} else {
				terminalContent = renderTerminalLines(terminalEntries, 5);
			}
		} else {
			terminalContent = renderTerminalLines(terminalEntries, 5);
		}

		// Teamchat pane: real events
		teamchatContent = renderTeamchatEvents(teamchatEvents, 5);
	} else {
		// Fallback to summary strings
		terminalContent = escapeHtml(moment.terminalSummary);
		teamchatContent = escapeHtml(moment.teamchatSummary);
	}

	return `
	<div class="moment-card">
		<div class="moment-header">
			<span class="moment-type ${moment.type}">${typeLabel}</span>
			<span class="moment-time">${escapeHtml(moment.timestamp)}</span>
		</div>
		<div class="moment-split">
			<div class="moment-pane">
				<div class="pane-label">What the terminal showed</div>
				<div class="terminal-mock">${terminalContent}</div>
			</div>
			<div class="moment-pane">
				<div class="pane-label">What teamchat showed</div>
				<div class="teamchat-mock">${teamchatContent}</div>
			</div>
		</div>
		<div class="moment-annotation">${escapeHtml(moment.description)}</div>
	</div>`;
}

// --- Section 2: "The Gap" Visual Breakdown ---

function renderGapBreakdown(scorecard: Scorecard, session: ParsedSession): string {
	const { metrics } = scorecard;
	const events = session.teamchat.events;

	// Count by category (single pass)
	let messageCt = 0;
	let systemCt = 0;
	let taskCt = 0;
	let reactionCt = 0;
	let presenceCt = 0;
	let threadCt = 0;

	for (const e of events) {
		switch (e.type) {
			case 'message': messageCt++; break;
			case 'system': systemCt++; break;
			case 'task-update': taskCt++; break;
			case 'reaction': reactionCt++; break;
			case 'presence': presenceCt++; break;
			case 'thread-marker': threadCt++; break;
		}
	}

	const totalEvents = events.length;

	// Hidden layer: DMs + broadcasts (single pass)
	let dmCount = 0;
	let broadcastCount = 0;
	for (const m of session.protocol.messages) {
		if (m.isDM) dmCount++;
		if (m.isBroadcast) broadcastCount++;
	}
	const hiddenTotal = dmCount + broadcastCount;

	// Bar max reference = teamchat event count (the fullest bar)
	const maxRef = Math.max(metrics.terminalLinesLead, metrics.terminalLinesAll, hiddenTotal, totalEvents, 1);

	function barWidth(count: number): number {
		return Math.max(2, Math.round((count / maxRef) * 100));
	}

	// Stacked bar segments for teamchat
	const segments = [
		{ label: 'Messages', count: messageCt, color: 'var(--accent-blue)' },
		{ label: 'System', count: systemCt, color: 'var(--text-dim)' },
		{ label: 'Tasks', count: taskCt, color: 'var(--accent-green)' },
		{ label: 'Reactions', count: reactionCt, color: 'var(--accent-amber)' },
		{ label: 'Presence', count: presenceCt, color: 'rgba(92, 96, 120, 0.5)' },
		{ label: 'Threads', count: threadCt, color: 'var(--accent-indigo)' },
	];

	function renderStackedBar(segs: typeof segments, total: number, width: number): string {
		if (total === 0) return '<div class="gap-bar-empty"></div>';
		const nonZero = segs.filter(s => s.count > 0);
		if (nonZero.length === 0) return '<div class="gap-bar-empty"></div>';

		// Compute proportional widths with minimum visibility, then normalize
		const minPct = 0.5;
		const adjusted = nonZero.map(s => Math.max(minPct, (s.count / total) * width));
		const sumAdj = adjusted.reduce((a, v) => a + v, 0);
		const scale = sumAdj > 0 ? width / sumAdj : 1;

		return nonZero.map((s, i) => {
			const pct = adjusted[i] * scale;
			return `<div class="gap-seg" style="width:${pct}%;background:${s.color}" title="${s.label}: ${s.count}"></div>`;
		}).join('');
	}

	const legendHtml = segments.filter(s => s.count > 0).map(s =>
		`<span class="gap-legend-item"><span class="gap-legend-dot" style="background:${s.color}"></span>${s.label} (${s.count})</span>`
	).join('');

	return `
<section>
<div class="container">
	<div class="section-header"><h2>The Gap</h2><p>How much each layer captures — the wider the bar, the more you see.</p></div>
	<div class="gap-chart">
		<div class="gap-row">
			<div class="gap-label">YOUR TERMINAL</div>
			<div class="gap-bar-track">
				<div class="gap-bar-fill terminal-bar" style="width:${barWidth(metrics.terminalLinesLead)}%"></div>
			</div>
			<div class="gap-count">${metrics.terminalLinesLead} lines</div>
		</div>
		<div class="gap-row">
			<div class="gap-label">ALL ${scorecard.session.agents} TERMINALS</div>
			<div class="gap-bar-track">
				<div class="gap-bar-fill all-terminals-bar" style="width:${barWidth(metrics.terminalLinesAll)}%"></div>
			</div>
			<div class="gap-count">${metrics.terminalLinesAll} lines</div>
		</div>
		<div class="gap-row">
			<div class="gap-label">HIDDEN LAYER</div>
			<div class="gap-bar-track">
				<div class="gap-bar-fill hidden-bar" style="width:${barWidth(hiddenTotal)}%"></div>
			</div>
			<div class="gap-count">${dmCount} DMs + ${broadcastCount} broadcasts</div>
		</div>
		<div class="gap-row">
			<div class="gap-label">TEAMCHAT VIEW</div>
			<div class="gap-bar-track" style="position:relative;display:flex">
				${renderStackedBar(segments, totalEvents, barWidth(totalEvents))}
			</div>
			<div class="gap-count">${totalEvents} events</div>
		</div>
	</div>
	<div class="gap-legend">${legendHtml}</div>
</div>
</section>`;
}

// --- Section 5: Full Synchronized Timeline ---

interface TimelineBucket {
	time: string; // HH:MM:SS
	terminal: string[];
	hidden: string[];
	teamchat: string[];
}

function buildTimeline(session: ParsedSession): TimelineBucket[] {
	const BUCKET_MS = 10000; // 10-second windows

	// Determine timestamp range incrementally (avoids stack overflow on large arrays)
	let minTs = Infinity;
	let maxTs = -Infinity;

	for (const e of session.terminal.merged) {
		const t = new Date(e.timestamp).getTime();
		if (!isNaN(t)) {
			if (t < minTs) minTs = t;
			if (t > maxTs) maxTs = t;
		}
	}
	for (const m of session.protocol.messages) {
		const t = new Date(m.timestamp).getTime();
		if (!isNaN(t)) {
			if (t < minTs) minTs = t;
			if (t > maxTs) maxTs = t;
		}
	}
	for (const e of session.teamchat.events) {
		const t = new Date(e.timestamp).getTime();
		if (!isNaN(t)) {
			if (t < minTs) minTs = t;
			if (t > maxTs) maxTs = t;
		}
	}

	if (!isFinite(minTs) || !isFinite(maxTs)) return [];

	// Build buckets
	const bucketMap = new Map<number, TimelineBucket>();

	function getBucket(ts: number): TimelineBucket {
		const key = Math.floor((ts - minTs) / BUCKET_MS);
		let bucket = bucketMap.get(key);
		if (!bucket) {
			const d = new Date(minTs + key * BUCKET_MS);
			bucket = { time: d.toTimeString().slice(0, 8), terminal: [], hidden: [], teamchat: [] };
			bucketMap.set(key, bucket);
		}
		return bucket;
	}

	// Terminal entries
	for (const e of session.terminal.merged) {
		const t = new Date(e.timestamp).getTime();
		if (isNaN(t)) continue;
		const bucket = getBucket(t);
		const toolTag = e.type === 'tool-call' ? `[${e.toolName ?? 'tool'}] ` : '';
		bucket.terminal.push(`${escapeHtml(e.agent)}: ${toolTag}${escapeHtml(truncate(e.content, 80))}`);
	}

	// Hidden layer (protocol messages)
	for (const m of session.protocol.messages) {
		const t = new Date(m.timestamp).getTime();
		if (isNaN(t)) continue;
		const bucket = getBucket(t);
		const label = m.isDM ? `${escapeHtml(m.from)} -> ${escapeHtml(m.to)}` : `${escapeHtml(m.from)} -> all`;
		bucket.hidden.push(`${label}: ${escapeHtml(truncate(m.content, 80))}`);
	}

	// Teamchat events
	for (const e of session.teamchat.events) {
		const t = new Date(e.timestamp).getTime();
		if (isNaN(t)) continue;
		const bucket = getBucket(t);
		switch (e.type) {
			case 'message': {
				const prefix = e.isDM ? '[DM] ' : e.isBroadcast ? '[BC] ' : '';
				bucket.teamchat.push(`${prefix}${escapeHtml(e.from)}: ${escapeHtml(truncate(e.text, 80))}`);
				break;
			}
			case 'system':
				bucket.teamchat.push(`<span class="tl-badge ${escapeHtml(e.subtype)}">${escapeHtml(e.subtype)}</span> ${escapeHtml(truncate(e.text, 80))}`);
				break;
			case 'reaction':
				bucket.teamchat.push(`${escapeHtml(e.emoji)} ${escapeHtml(e.fromAgent)} reacted`);
				break;
			case 'thread-marker':
				bucket.teamchat.push(`<span class="tl-badge thread">${e.subtype === 'thread-start' ? 'Thread start' : 'Thread end'}</span> ${escapeHtml(e.participants.join(', '))}`);
				break;
			case 'presence':
				bucket.teamchat.push(`<span class="tl-badge presence">${escapeHtml(e.status)}</span> ${escapeHtml(e.agentName)}`);
				break;
			case 'task-update':
				bucket.teamchat.push(`<span class="tl-badge task">${escapeHtml(e.task.status)}</span> ${escapeHtml(truncate(e.task.subject, 60))}`);
				break;
		}
	}

	// Sort buckets by key and return
	const sorted = [...bucketMap.entries()].sort((a, b) => a[0] - b[0]);
	return sorted.map(([, b]) => b);
}

function renderTimeline(session: ParsedSession): string {
	const buckets = buildTimeline(session);
	if (buckets.length === 0) return '';

	const totalEntries = buckets.reduce((sum, b) => sum + b.terminal.length + b.hidden.length + b.teamchat.length, 0);
	const INITIAL_MAX = 200;
	const showAll = buckets.length <= INITIAL_MAX;

	function renderBucketRows(bucketsToRender: TimelineBucket[]): string {
		return bucketsToRender.map(b => {
			const terminalCell = b.terminal.length > 0
				? b.terminal.slice(0, 3).join('<br>') + (b.terminal.length > 3 ? `<br><span class="tl-more">+${b.terminal.length - 3} more</span>` : '')
				: '<span class="tl-empty"></span>';
			const hiddenCell = b.hidden.length > 0
				? b.hidden.slice(0, 3).join('<br>') + (b.hidden.length > 3 ? `<br><span class="tl-more">+${b.hidden.length - 3} more</span>` : '')
				: '<span class="tl-empty"></span>';
			const teamchatCell = b.teamchat.length > 0
				? b.teamchat.slice(0, 3).join('<br>') + (b.teamchat.length > 3 ? `<br><span class="tl-more">+${b.teamchat.length - 3} more</span>` : '')
				: '<span class="tl-empty"></span>';

			return `<tr>
				<td class="tl-time">${b.time}</td>
				<td class="tl-terminal">${terminalCell}</td>
				<td class="tl-hidden">${hiddenCell}</td>
				<td class="tl-teamchat">${teamchatCell}</td>
			</tr>`;
		}).join('\n');
	}

	const initialBuckets = showAll ? buckets : buckets.slice(0, INITIAL_MAX);
	const remainingBuckets = showAll ? [] : buckets.slice(INITIAL_MAX);

	return `
<section>
<div class="container">
	<div class="section-header"><h2>Full Synchronized Timeline</h2><p>Every entry from all three data sources, aligned by time.</p></div>
	<details class="timeline-collapse">
		<summary class="timeline-toggle">Show full timeline (${totalEntries} entries across ${buckets.length} time windows)</summary>
		<div class="timeline-wrapper">
			<table class="timeline-table">
				<thead>
					<tr>
						<th class="tl-th-time">Time</th>
						<th class="tl-th-terminal">Terminal</th>
						<th class="tl-th-hidden">Hidden Layer</th>
						<th class="tl-th-teamchat">teamchat</th>
					</tr>
				</thead>
				<tbody id="timeline-body">
					${renderBucketRows(initialBuckets)}
				</tbody>
				${remainingBuckets.length > 0 ? `<tbody id="timeline-overflow" style="display:none">
					${renderBucketRows(remainingBuckets)}
				</tbody>` : ''}
			</table>
			${remainingBuckets.length > 0 ? `
			<div class="timeline-show-all" id="timeline-show-all">
				<button onclick="document.getElementById('timeline-overflow').style.display='table-row-group';document.getElementById('timeline-show-all').style.display='none';">
					Show all ${buckets.length} time windows (${remainingBuckets.length} more)
				</button>
			</div>` : ''}
		</div>
	</details>
</div>
</section>`;
}

// --- Coordination Chains ---

interface ChainEvent {
	timestamp: string;
	layer: 'terminal' | 'hidden' | 'teamchat';
	phase: 'dispatch' | 'work' | 'completion' | 'shutdown';
	text: string;
}

interface CoordinationChain {
	agentName: string;
	agentType: string;
	durationMs: number;
	events: ChainEvent[];
}

function buildCoordinationChains(session: ParsedSession): CoordinationChain[] {
	const chains: CoordinationChain[] = [];
	const { manifest, terminal, protocol, teamchat } = session;

	// Build unique role names from manifest (excluding lead).
	// Protocol messages and teamchat events identify agents by their role name
	// (agentType), not their raw agentId, so we iterate over unique role names.
	const subagents = manifest.agents.filter(a => a.agentType !== 'lead');
	const seenRoles = new Set<string>();
	const uniqueRoles: { roleName: string; agentType: string }[] = [];
	for (const agent of subagents) {
		if (!seenRoles.has(agent.agentType)) {
			seenRoles.add(agent.agentType);
			uniqueRoles.push({ roleName: agent.agentType, agentType: agent.agentType });
		}
	}
	if (uniqueRoles.length === 0) return chains;

	for (const role of uniqueRoles) {
		const roleName = role.roleName;
		const events: ChainEvent[] = [];

		// 1. Find Agent() dispatch in terminal.lead
		const dispatch = terminal.lead.find(e =>
			e.type === 'tool-call' &&
			e.toolName === 'Agent' &&
			e.content.includes(`"name":"${roleName}"`)
		);
		if (dispatch) {
			// Extract the description from the Agent call if available
			const descMatch = dispatch.content.match(/"description":"([^"]{0,80})/);
			const desc = descMatch ? descMatch[1] : truncate(dispatch.content, 80);
			events.push({
				timestamp: dispatch.timestamp,
				layer: 'terminal',
				phase: 'dispatch',
				text: `lead dispatches Agent("${roleName}: ${desc}")`,
			});
		}

		// 2. Find member-joined events in teamchat (may have multiple joins for same role)
		const joinEvents = teamchat.events.filter(e =>
			e.type === 'system' && e.subtype === 'member-joined' && e.agentName === roleName
		) as SystemEvent[];
		// Use first join for the dispatch phase (deduplicate multiple instances)
		if (joinEvents.length > 0) {
			events.push({
				timestamp: joinEvents[0].timestamp,
				layer: 'teamchat',
				phase: 'dispatch',
				text: `${roleName} joined the chat`,
			});
		}

		// 3. Find task-claimed events in teamchat (deduplicate by taskId)
		const claimEvents = teamchat.events.filter(e =>
			e.type === 'system' && e.subtype === 'task-claimed' && e.agentName === roleName
		) as SystemEvent[];
		const seenTaskClaims = new Set<string>();
		for (const claim of claimEvents) {
			const key = claim.taskId ?? claim.timestamp;
			if (seenTaskClaims.has(key)) continue;
			seenTaskClaims.add(key);
			const taskLabel = claim.taskId ? `Task #${claim.taskId}` : 'a task';
			events.push({
				timestamp: claim.timestamp,
				layer: 'teamchat',
				phase: 'dispatch',
				text: `${roleName} claimed ${taskLabel}`,
			});
		}

		// Helper: check if a protocol message is a control/noise message
		function isProtocolNoise(content: string): boolean {
			try {
				const parsed = JSON.parse(content);
				const noiseTypes = ['idle_notification', 'idle', 'shutdown_request', 'task_assignment', 'shutdown_approved'];
				return noiseTypes.includes(parsed.type);
			} catch {
				return false;
			}
		}

		// 4. Find DMs TO this agent (messages they received from other agents during work)
		const dmsReceived = protocol.messages.filter(m =>
			m.to === roleName && m.isDM && m.from !== 'team-lead' && m.from !== roleName
		);
		for (const dm of dmsReceived) {
			if (isProtocolNoise(dm.content)) continue;
			events.push({
				timestamp: dm.timestamp,
				layer: 'hidden',
				phase: 'work',
				text: `${roleName}\u2190${dm.from}: "${truncate(dm.content, 80)}"`,
			});
		}

		// 5. Find DMs FROM this agent (their completion announcements and reports)
		const dmsSent = protocol.messages.filter(m =>
			m.from === roleName && m.isDM && m.to !== roleName
		);
		for (const dm of dmsSent) {
			if (isProtocolNoise(dm.content)) continue;
			const phase = dm.to === 'team-lead' ? 'completion' as const : 'work' as const;
			events.push({
				timestamp: dm.timestamp,
				layer: 'hidden',
				phase,
				text: `${roleName}\u2192${dm.to}: "${truncate(dm.content, 80)}"`,
			});
		}

		// 6. Find broadcasts FROM this agent
		const broadcastsSent = protocol.messages.filter(m =>
			m.from === roleName && m.isBroadcast
		);
		// Deduplicate broadcasts (same content sent to multiple recipients)
		const seenBroadcasts = new Set<string>();
		for (const bc of broadcastsSent) {
			const key = bc.content.slice(0, 100);
			if (seenBroadcasts.has(key)) continue;
			seenBroadcasts.add(key);
			const recipientCount = broadcastsSent.filter(m => m.content.slice(0, 100) === key).length;
			events.push({
				timestamp: bc.timestamp,
				layer: 'hidden',
				phase: 'work',
				text: `${roleName} broadcast to ${recipientCount} agents: "${truncate(bc.content, 60)}"`,
			});
		}

		// 7. Find task-completed events in teamchat (deduplicate by taskId)
		const completionEvents = teamchat.events.filter(e =>
			e.type === 'system' && e.subtype === 'task-completed' && e.agentName === roleName
		) as SystemEvent[];
		const seenTaskCompletions = new Set<string>();
		const dedupedCompletions: SystemEvent[] = [];
		for (const comp of completionEvents) {
			const key = comp.taskId ?? comp.timestamp;
			if (seenTaskCompletions.has(key)) continue;
			seenTaskCompletions.add(key);
			dedupedCompletions.push(comp);
			// Look for unblocked tasks near this completion
			const compTime = new Date(comp.timestamp).getTime();
			const unblocks = teamchat.events.filter(e =>
				e.type === 'system' && e.subtype === 'task-unblocked' &&
				Math.abs(new Date(e.timestamp).getTime() - compTime) < 5000
			) as SystemEvent[];
			const taskLabel = comp.taskId ? `Task #${comp.taskId}` : 'task';
			const unblockedSuffix = unblocks.length > 0
				? ` \u2192 ${unblocks.length} task${unblocks.length > 1 ? 's' : ''} unblocked`
				: '';
			events.push({
				timestamp: comp.timestamp,
				layer: 'teamchat',
				phase: 'completion',
				text: `${taskLabel} completed${unblockedSuffix}`,
			});
		}

		// Also find lead marking task completed in terminal (near a completion event for this agent)
		const usedLeadEntries = new Set<string>();
		for (const comp of dedupedCompletions) {
			const compTime = new Date(comp.timestamp).getTime();
			const leadEntry = terminal.lead.find(e => {
				const t = new Date(e.timestamp).getTime();
				return !usedLeadEntries.has(e.timestamp + e.content) &&
					Math.abs(t - compTime) < 10000 &&
					e.type === 'tool-call' &&
					e.content.toLowerCase().includes('completed');
			});
			if (leadEntry) {
				usedLeadEntries.add(leadEntry.timestamp + leadEntry.content);
				events.push({
					timestamp: leadEntry.timestamp,
					layer: 'terminal',
					phase: 'completion',
					text: `lead marks task completed`,
				});
			}
		}

		// 8. Find shutdown_request in protocol messages (from lead to this agent)
		const shutdownMsgs = protocol.messages.filter(m => {
			if (m.to !== roleName) return false;
			try {
				const parsed = JSON.parse(m.content);
				return parsed.type === 'shutdown_request';
			} catch {
				return false;
			}
		});
		for (const shutdownMsg of shutdownMsgs) {
			events.push({
				timestamp: shutdownMsg.timestamp,
				layer: 'terminal',
				phase: 'shutdown',
				text: `lead sends shutdown to ${roleName}`,
			});
		}

		// 9. Find shutdown-approved/requested system events (deduplicate by subtype)
		const shutdownEvents = teamchat.events.filter(e =>
			e.type === 'system' && (e.subtype === 'shutdown-approved' || e.subtype === 'shutdown-requested') &&
			e.agentName === roleName
		) as SystemEvent[];
		const seenShutdownSubtypes = new Set<string>();
		for (const se of shutdownEvents) {
			if (seenShutdownSubtypes.has(se.subtype)) continue;
			seenShutdownSubtypes.add(se.subtype);
			events.push({
				timestamp: se.timestamp,
				layer: 'teamchat',
				phase: 'shutdown',
				text: `${roleName} shutdown ${se.subtype === 'shutdown-approved' ? 'approved' : 'requested'}`,
			});
		}

		// 10. Find member-left event (first only — deduplicate multiple instances)
		const leftEvent = teamchat.events.find(e =>
			e.type === 'system' && e.subtype === 'member-left' && e.agentName === roleName
		) as SystemEvent | undefined;
		if (leftEvent) {
			events.push({
				timestamp: leftEvent.timestamp,
				layer: 'teamchat',
				phase: 'shutdown',
				text: `${roleName} left`,
			});
		}

		// Sort events by timestamp
		events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

		// Compute duration from first to last event
		let durationMs = 0;
		if (events.length >= 2) {
			const first = new Date(events[0].timestamp).getTime();
			const last = new Date(events[events.length - 1].timestamp).getTime();
			durationMs = last - first;
		}

		if (events.length > 0) {
			chains.push({
				agentName: roleName,
				agentType: role.agentType,
				durationMs,
				events,
			});
		}
	}

	// Sort chains by dispatch time (first event timestamp)
	chains.sort((a, b) =>
		new Date(a.events[0].timestamp).getTime() - new Date(b.events[0].timestamp).getTime()
	);

	return chains;
}

function formatDurationCompact(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const min = Math.floor(totalSeconds / 60);
	const sec = totalSeconds % 60;
	if (min < 60) return `${min} min ${sec}s`;
	const h = Math.floor(min / 60);
	const m = min % 60;
	return `${h}h ${m}m ${sec}s`;
}

function renderChainCard(chain: CoordinationChain): string {
	const phases: ('dispatch' | 'work' | 'completion' | 'shutdown')[] = ['dispatch', 'work', 'completion', 'shutdown'];
	const phaseLabels: Record<string, string> = {
		dispatch: 'DISPATCH',
		work: 'WORK (hidden from lead terminal)',
		completion: 'COMPLETION',
		shutdown: 'SHUTDOWN',
	};
	const phaseIcons: Record<string, string> = {
		dispatch: '\u{1F4E4}',
		work: '\u{1F528}',
		completion: '\u2705',
		shutdown: '\u{1F534}',
	};

	let phasesHtml = '';
	for (const phase of phases) {
		const phaseEvents = chain.events.filter(e => e.phase === phase);
		if (phaseEvents.length === 0 && phase === 'work') {
			phasesHtml += `
			<div class="chain-phase">
				<div class="chain-phase-label">${phaseIcons[phase]} ${phaseLabels[phase]}</div>
				<div class="chain-event"><span class="chain-empty">No inter-agent messages during this agent's work period</span></div>
			</div>`;
			continue;
		}
		if (phaseEvents.length === 0) continue;

		const eventLines = phaseEvents.map(e => {
			const time = formatTime(e.timestamp);
			const layerClass = e.layer === 'terminal' ? 'layer-terminal' : e.layer === 'hidden' ? 'layer-hidden' : 'layer-teamchat';
			const layerLabel = e.layer;
			return `<div class="chain-event"><span class="chain-time">[${time}]</span> <span class="chain-layer ${layerClass}">${layerLabel}</span> ${escapeHtml(e.text)}</div>`;
		}).join('\n');

		phasesHtml += `
		<div class="chain-phase">
			<div class="chain-phase-label">${phaseIcons[phase]} ${phaseLabels[phase]}</div>
			${eventLines}
		</div>`;
	}

	return `
	<div class="chain-card">
		<div class="chain-header">
			<span class="chain-agent-name">${escapeHtml(chain.agentName)}</span>
			<span class="chain-agent-type">${escapeHtml(chain.agentType)}</span>
			<span class="chain-duration">${formatDurationCompact(chain.durationMs)}</span>
		</div>
		<div class="chain-timeline">
			<div class="chain-rail"></div>
			${phasesHtml}
		</div>
	</div>`;
}

function renderCoordinationChains(session: ParsedSession): string {
	const chains = buildCoordinationChains(session);
	if (chains.length === 0) return '';

	const INITIAL_MAX = 5;
	const initialChains = chains.slice(0, INITIAL_MAX);
	const remainingChains = chains.slice(INITIAL_MAX);

	const initialHtml = initialChains.map(c => renderChainCard(c)).join('\n');
	const remainingHtml = remainingChains.length > 0
		? `<details class="chains-collapse">
			<summary class="chains-toggle">Show all ${chains.length} agents (${remainingChains.length} more)</summary>
			<div class="chains-overflow">
				${remainingChains.map(c => renderChainCard(c)).join('\n')}
			</div>
		</details>`
		: '';

	return `
<section>
<div class="container">
	<div class="section-header"><h2>Coordination Chains</h2><p>Each agent's lifecycle traced across terminal, hidden protocol, and teamchat layers.</p></div>
	${initialHtml}
	${remainingHtml}
</div>
</section>`;
}

// --- Main render ---

export function renderReport(scorecard: Scorecard, session?: ParsedSession): string {
	const { session: sess, metrics, keyMoments } = scorecard;
	const momentCards = keyMoments.map((m, i) => renderMomentCard(m, i, session ?? null)).join('\n');

	const gapSection = session ? renderGapBreakdown(scorecard, session) : '';
	const chainsSection = session ? renderCoordinationChains(session) : '';
	const timelineSection = session ? renderTimeline(session) : '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>teamchat Session Report — ${escapeHtml(sess.team)}</title>
<style>
:root{--bg:#0f1117;--bg-card:#161922;--bg-elevated:#1c1f2e;--bg-terminal:#0a0c10;--border:#2a2d3a;--text:#e2e4ea;--text-muted:#8b8fa3;--text-dim:#5c6078;--accent-blue:#5b8def;--accent-green:#4ade80;--accent-amber:#f59e0b;--accent-red:#ef4444;--accent-purple:#a78bfa;--accent-indigo:#6366f1}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
.container{max-width:1100px;margin:0 auto;padding:0 24px}
.hero{padding:80px 0 60px;text-align:center;border-bottom:1px solid var(--border)}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:20px;padding:6px 16px;font-size:.8rem;color:var(--text-muted);margin-bottom:24px}
.hero-badge .dot{width:6px;height:6px;border-radius:50%;background:var(--accent-green)}
.hero h1{font-size:2.8rem;font-weight:700;letter-spacing:-.03em;margin-bottom:12px}
.hero h1 span{color:var(--accent-blue)}
.hero .subtitle{font-size:1.15rem;color:var(--text-muted);max-width:600px;margin:0 auto 48px}
.stat-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:820px;margin:0 auto}
.stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:28px 24px;text-align:center}
.stat-card .number{font-size:3rem;font-weight:800;letter-spacing:-.04em;line-height:1;margin-bottom:4px}
.stat-card .label{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px}
.stat-card .desc{font-size:.85rem;color:var(--text-dim);line-height:1.4}
.stat-card.terminal .number{color:var(--text-dim)}
.stat-card.hidden .number{color:var(--accent-amber)}
.stat-card.teamchat .number{color:var(--accent-green)}
.hero-meta{display:flex;justify-content:center;gap:32px;margin-top:32px;font-size:.82rem;color:var(--text-dim)}
section{padding:64px 0;border-bottom:1px solid var(--border)}
.section-header{margin-bottom:36px}
.section-header h2{font-size:1.6rem;font-weight:700;letter-spacing:-.02em;margin-bottom:6px}
.section-header p{color:var(--text-muted);font-size:.95rem}
.moment-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px}
.moment-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border)}
.moment-type{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;padding:3px 10px;border-radius:6px;font-weight:600}
.moment-type.dm{background:rgba(99,102,241,.15);color:var(--accent-indigo)}
.moment-type.cascade{background:rgba(74,222,128,.15);color:var(--accent-green)}
.moment-type.broadcast{background:rgba(245,158,11,.15);color:var(--accent-amber)}
.moment-type.bottleneck{background:rgba(239,68,68,.15);color:var(--accent-red)}
.moment-type.idle{background:rgba(167,139,250,.15);color:var(--accent-purple)}
.moment-type.coordination{background:rgba(91,141,239,.15);color:var(--accent-blue)}
.moment-time{font-size:.8rem;color:var(--text-dim);font-family:'SF Mono',monospace}
.moment-split{display:grid;grid-template-columns:1fr 1fr;min-height:120px}
.moment-pane{padding:20px}
.moment-pane:first-child{border-right:1px solid var(--border)}
.pane-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-dim);margin-bottom:12px;font-weight:600}
.terminal-mock{background:var(--bg-terminal);border:1px solid var(--border);border-radius:8px;padding:14px 16px;font-family:'SF Mono',monospace;font-size:.75rem;line-height:1.7;color:var(--text-dim);white-space:pre-wrap}
.teamchat-mock{background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:14px 16px;font-size:.8rem;line-height:1.5}
.moment-annotation{padding:14px 24px;border-top:1px solid var(--border);font-size:.85rem;color:var(--text-muted);background:rgba(91,141,239,.04)}

/* Terminal line styling */
.term-time{color:var(--text-dim)}
.term-agent{color:var(--accent-blue)}
.term-tool{color:var(--accent-amber);font-size:.7rem}
.term-more{color:var(--text-dim);font-style:italic;font-size:.7rem}
.empty-indicator{color:var(--text-dim);font-style:italic}
.pane-note{color:var(--text-dim);font-size:.7rem;font-style:italic;margin-bottom:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}

/* Teamchat event styling in moment cards */
.tc-event{margin-bottom:8px;line-height:1.4}
.tc-event:last-child{margin-bottom:0}
.tc-badge{display:inline-block;font-size:.65rem;text-transform:uppercase;letter-spacing:.06em;padding:1px 6px;border-radius:4px;font-weight:600;margin-right:4px;vertical-align:middle}
.tc-badge.dm{background:rgba(99,102,241,.2);color:var(--accent-indigo)}
.tc-badge.broadcast{background:rgba(245,158,11,.2);color:var(--accent-amber)}
.tc-badge.system{background:rgba(139,143,163,.15);color:var(--text-muted)}
.tc-badge.reaction{background:rgba(245,158,11,.15);color:var(--accent-amber)}
.tc-badge.thread{background:rgba(99,102,241,.15);color:var(--accent-indigo)}
.tc-badge.presence{background:rgba(92,96,120,.15);color:var(--text-dim)}
.tc-badge.task{background:rgba(74,222,128,.15);color:var(--accent-green)}
.tc-participants{color:var(--text-dim);font-size:.78rem}
.tc-more{color:var(--text-dim);font-size:.75rem;font-style:italic;margin-top:4px}

/* Gap breakdown section */
.gap-chart{display:flex;flex-direction:column;gap:16px;margin-bottom:24px}
.gap-row{display:grid;grid-template-columns:160px 1fr 140px;align-items:center;gap:16px}
.gap-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);font-weight:600;text-align:right}
.gap-bar-track{height:32px;background:var(--bg-elevated);border-radius:6px;overflow:hidden;display:flex;position:relative}
.gap-bar-fill{height:100%;border-radius:6px;transition:width .3s ease}
.terminal-bar{background:var(--text-dim)}
.all-terminals-bar{background:var(--text-muted)}
.hidden-bar{background:var(--accent-amber)}
.gap-seg{height:100%;min-width:2px}
.gap-seg:first-child{border-radius:6px 0 0 6px}
.gap-seg:last-child{border-radius:0 6px 6px 0}
.gap-bar-empty{height:100%;width:100%}
.gap-count{font-size:.82rem;color:var(--text-muted);font-variant-numeric:tabular-nums}
.gap-legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:8px;justify-content:center}
.gap-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:.75rem;color:var(--text-dim)}
.gap-legend-dot{width:8px;height:8px;border-radius:2px;display:inline-block}

/* Timeline section */
.timeline-collapse{margin-top:8px}
.timeline-toggle{cursor:pointer;padding:16px 24px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;font-size:.9rem;color:var(--text-muted);list-style:none;user-select:none;transition:background .15s}
.timeline-toggle:hover{background:var(--bg-elevated)}
.timeline-toggle::-webkit-details-marker{display:none}
.timeline-toggle::before{content:'+ ';color:var(--accent-blue);font-weight:700}
details[open] .timeline-toggle::before{content:'- '}
.timeline-wrapper{margin-top:16px;overflow-x:auto}
.timeline-table{width:100%;border-collapse:collapse;font-size:.78rem;table-layout:fixed}
.timeline-table th{text-align:left;padding:10px 12px;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);font-weight:600;border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--bg)}
.tl-th-time{width:80px}
.tl-th-terminal,.tl-th-hidden,.tl-th-teamchat{width:calc((100% - 80px) / 3)}
.timeline-table td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:top;line-height:1.5;word-break:break-word}
.tl-time{font-family:'SF Mono',monospace;color:var(--text-dim);font-size:.72rem;white-space:nowrap}
.tl-terminal{font-family:'SF Mono',monospace;color:var(--text-dim);font-size:.72rem}
.tl-hidden{color:var(--accent-amber);font-size:.75rem}
.tl-teamchat{font-size:.75rem}
.tl-empty{display:block;height:4px}
.tl-more{color:var(--text-dim);font-style:italic;font-size:.68rem}
.tl-badge{display:inline-block;font-size:.6rem;text-transform:uppercase;letter-spacing:.04em;padding:1px 5px;border-radius:3px;font-weight:600;margin-right:3px}
.tl-badge.member-joined,.tl-badge.team-created{background:rgba(74,222,128,.15);color:var(--accent-green)}
.tl-badge.task-created,.tl-badge.task-claimed,.tl-badge.task-completed,.tl-badge.task-unblocked,.tl-badge.all-tasks-completed,.tl-badge.task-assigned{background:rgba(74,222,128,.12);color:var(--accent-green)}
.tl-badge.task-failed,.tl-badge.bottleneck{background:rgba(239,68,68,.12);color:var(--accent-red)}
.tl-badge.idle-surfaced{background:rgba(167,139,250,.12);color:var(--accent-purple)}
.tl-badge.member-left,.tl-badge.shutdown-requested,.tl-badge.shutdown-approved,.tl-badge.shutdown-rejected,.tl-badge.team-deleted{background:rgba(139,143,163,.12);color:var(--text-muted)}
.tl-badge.nudge{background:rgba(245,158,11,.12);color:var(--accent-amber)}
.tl-badge.thread{background:rgba(99,102,241,.12);color:var(--accent-indigo)}
.tl-badge.presence{background:rgba(92,96,120,.12);color:var(--text-dim)}
.tl-badge.task{background:rgba(74,222,128,.12);color:var(--accent-green)}
.timeline-show-all{text-align:center;padding:16px}
.timeline-show-all button{background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 24px;color:var(--text-muted);font-size:.85rem;cursor:pointer;transition:background .15s}
.timeline-show-all button:hover{background:var(--bg-card)}

.noise-comparison{display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:start;margin-bottom:32px}
.noise-box{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.noise-label{padding:12px 16px;border-bottom:1px solid var(--border);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);font-weight:600}
.noise-content{padding:16px}
.noise-arrow{display:flex;align-items:center;justify-content:center;font-size:1.8rem;color:var(--text-dim);padding-top:40px}
.suppressed{display:inline-flex;align-items:center;gap:8px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 16px;font-size:.82rem}
.suppressed .dot{width:8px;height:8px;border-radius:50%;background:var(--accent-amber)}
.footer{padding:48px 0;border-bottom:none}
.footer h2{font-size:1.2rem;margin-bottom:16px}
.footer p{font-size:.85rem;color:var(--text-dim);line-height:1.7;max-width:700px;margin-bottom:12px}
.footer code{background:var(--bg-elevated);padding:2px 6px;border-radius:4px;font-size:.8rem}

/* Coordination chains section */
.chain-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px}
.chain-header{display:flex;align-items:center;gap:12px;padding:16px 24px;border-bottom:1px solid var(--border)}
.chain-agent-name{font-weight:700;font-size:.95rem;color:var(--text)}
.chain-agent-type{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;padding:2px 8px;border-radius:5px;background:rgba(91,141,239,.12);color:var(--accent-blue);font-weight:600}
.chain-duration{margin-left:auto;font-size:.8rem;color:var(--text-dim);font-family:'SF Mono',monospace}
.chain-timeline{position:relative;padding:20px 24px 20px 40px}
.chain-rail{position:absolute;left:30px;top:16px;bottom:16px;width:2px;background:var(--border)}
.chain-phase{margin-bottom:16px}
.chain-phase:last-child{margin-bottom:0}
.chain-phase-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:600;margin-bottom:6px;padding-left:4px}
.chain-event{font-size:.8rem;line-height:1.6;padding:2px 0 2px 4px;position:relative}
.chain-event::before{content:'';position:absolute;left:-14px;top:9px;width:6px;height:6px;border-radius:50%;background:var(--border)}
.chain-time{font-family:'SF Mono',monospace;font-size:.72rem;color:var(--text-dim)}
.chain-layer{display:inline-block;font-size:.62rem;text-transform:uppercase;letter-spacing:.04em;padding:1px 5px;border-radius:3px;font-weight:600;margin:0 4px;vertical-align:middle}
.chain-layer.layer-terminal{background:rgba(92,96,120,.2);color:var(--text-dim)}
.chain-layer.layer-hidden{background:rgba(245,158,11,.15);color:var(--accent-amber)}
.chain-layer.layer-teamchat{background:rgba(74,222,128,.15);color:var(--accent-green)}
.chain-empty{color:var(--text-dim);font-style:italic;font-size:.78rem}
.chains-collapse{margin-top:8px}
.chains-toggle{cursor:pointer;padding:14px 24px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;font-size:.88rem;color:var(--text-muted);list-style:none;user-select:none;transition:background .15s}
.chains-toggle:hover{background:var(--bg-elevated)}
.chains-toggle::-webkit-details-marker{display:none}
.chains-toggle::before{content:'+ ';color:var(--accent-blue);font-weight:700}
details[open] .chains-toggle::before{content:'- '}
.chains-overflow{margin-top:16px}
</style>
</head>
<body>

<section class="hero">
<div class="container">
<div class="hero-badge"><span class="dot"></span> Session Report</div>
<h1>Your terminal showed you <span>${metrics.terminalLinesLead} lines</span>.<br>${metrics.teamchatEvents} events actually happened.</h1>
<p class="subtitle">A comparison of what Claude Code's CLI showed versus what teamchat captured during a ${sess.agents}-agent team session.</p>
<div class="stat-cards">
<div class="stat-card terminal"><div class="label">Your Terminal</div><div class="number">${metrics.terminalLinesLead}</div><div class="desc">Lines of output in the lead agent's terminal.</div></div>
<div class="stat-card hidden"><div class="label">Hidden Layer</div><div class="number">${metrics.hiddenMessages}</div><div class="desc">Inter-agent messages no terminal showed.</div></div>
<div class="stat-card teamchat"><div class="label">teamchat View</div><div class="number">${metrics.teamchatEvents}</div><div class="desc">Total events rendered with derived intelligence.</div></div>
</div>
<div class="hero-meta">
<span>${formatDuration(sess.durationMs)}</span>
<span>${sess.agents} agents</span>
<span>${sess.tasks} tasks</span>
</div>
</div>
</section>

${gapSection}

<section>
<div class="container">
<div class="section-header"><h2>Key Moments</h2><p>The widest gaps between what the terminal shows and what actually happened.</p></div>
${momentCards}
</div>
</section>

${chainsSection}

<section>
<div class="container">
<div class="section-header"><h2>Noise Suppression</h2><p>What raw protocol data looks like versus what teamchat shows.</p></div>
<div class="noise-comparison">
<div class="noise-box"><div class="noise-label">Raw idle pings</div><div class="noise-content" style="font-family:monospace;font-size:.72rem;color:#3a3d4a;line-height:1.8">${metrics.idlePingsRaw > 0 ? '{"type":"idle","status":"available"}<br>'.repeat(Math.min(6, metrics.idlePingsRaw)) + '<div style="text-align:center;font-style:italic;margin-top:8px;color:var(--text-dim)">... ' + metrics.idlePingsRaw + ' total pings suppressed</div>' : '<em>No idle pings in this session.</em>'}</div></div>
<div class="noise-arrow">&#8594;</div>
<div class="noise-box"><div class="noise-label">teamchat renders</div><div class="noise-content"><div class="suppressed"><span class="dot"></span> ${metrics.idleEventsShown} idle indicator${metrics.idleEventsShown !== 1 ? 's' : ''} <span style="color:var(--text-dim);font-size:.75rem">(${metrics.idlePingsRaw} pings suppressed)</span></div></div></div>
</div>
${metrics.broadcastsRaw > 0 ? '<div class="noise-comparison"><div class="noise-box"><div class="noise-label">Broadcast in raw inboxes</div><div class="noise-content" style="font-family:monospace;font-size:.72rem;color:#3a3d4a;line-height:1.8">' + metrics.broadcastsRaw + ' identical inbox writes across ' + sess.agents + ' agents</div></div><div class="noise-arrow">&#8594;</div><div class="noise-box"><div class="noise-label">teamchat renders</div><div class="noise-content"><div class="suppressed"><span class="dot" style="background:var(--accent-blue)"></span> ' + metrics.broadcastsShown + ' broadcast card' + (metrics.broadcastsShown !== 1 ? 's' : '') + ' <span style="color:var(--text-dim);font-size:.75rem">(' + metrics.broadcastDedup + ':1 dedup ratio)</span></div></div></div></div>' : ''}
</div>
</section>

${timelineSection}

<section class="footer">
<div class="container">
<h2>Methodology</h2>
<p>Terminal output was reconstructed from Claude Code session logs stored in <code>~/.claude/projects/{project}/{session}.jsonl</code> and <code>subagents/agent-{id}.jsonl</code>. Each assistant message's content array was parsed to extract text blocks (visible output), tool calls, and tool results in chronological order.</p>
<p>The hidden layer represents inter-agent protocol messages from <code>~/.claude/teams/{name}/inboxes/</code> — JSON files that no terminal displays. teamchat events include all of the above plus derived intelligence: broadcast detection, idle suppression, protocol-derived reactions, thread grouping, and dependency cascade alerts.</p>
<p>Generated by <code>teamchat report</code> from a <code>.teamchat-capture</code> bundle.</p>
</div>
</section>

</body>
</html>`;
}
