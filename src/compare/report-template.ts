import type { Scorecard, KeyMoment } from './types.js';

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

function renderMomentCard(moment: KeyMoment, index: number): string {
	const typeLabel = {
		dm: 'DM Thread', cascade: 'Task Cascade', broadcast: 'Broadcast',
		idle: 'Idle Gap', bottleneck: 'Bottleneck', coordination: 'Coordination',
	}[moment.type];

	return `
	<div class="moment-card">
		<div class="moment-header">
			<span class="moment-type ${moment.type}">${typeLabel}</span>
			<span class="moment-time">${escapeHtml(moment.timestamp)}</span>
		</div>
		<div class="moment-split">
			<div class="moment-pane">
				<div class="pane-label">What the terminal showed</div>
				<div class="terminal-mock">${escapeHtml(moment.terminalSummary)}</div>
			</div>
			<div class="moment-pane">
				<div class="pane-label">What teamchat showed</div>
				<div class="teamchat-mock">${escapeHtml(moment.teamchatSummary)}</div>
			</div>
		</div>
		<div class="moment-annotation">${escapeHtml(moment.description)}</div>
	</div>`;
}

export function renderReport(scorecard: Scorecard): string {
	const { session, metrics, keyMoments } = scorecard;
	const momentCards = keyMoments.map((m, i) => renderMomentCard(m, i)).join('\n');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>teamchat Session Report — ${escapeHtml(session.team)}</title>
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
</style>
</head>
<body>

<section class="hero">
<div class="container">
<div class="hero-badge"><span class="dot"></span> Session Report</div>
<h1>Your terminal showed you <span>${metrics.terminalLinesLead} lines</span>.<br>${metrics.teamchatEvents} events actually happened.</h1>
<p class="subtitle">A comparison of what Claude Code's CLI showed versus what teamchat captured during a ${session.agents}-agent team session.</p>
<div class="stat-cards">
<div class="stat-card terminal"><div class="label">Your Terminal</div><div class="number">${metrics.terminalLinesLead}</div><div class="desc">Lines of output in the lead agent's terminal.</div></div>
<div class="stat-card hidden"><div class="label">Hidden Layer</div><div class="number">${metrics.hiddenMessages}</div><div class="desc">Inter-agent messages no terminal showed.</div></div>
<div class="stat-card teamchat"><div class="label">teamchat View</div><div class="number">${metrics.teamchatEvents}</div><div class="desc">Total events rendered with derived intelligence.</div></div>
</div>
<div class="hero-meta">
<span>${formatDuration(session.durationMs)}</span>
<span>${session.agents} agents</span>
<span>${session.tasks} tasks</span>
</div>
</div>
</section>

<section>
<div class="container">
<div class="section-header"><h2>Key Moments</h2><p>The widest gaps between what the terminal shows and what actually happened.</p></div>
${momentCards}
</div>
</section>

<section>
<div class="container">
<div class="section-header"><h2>Noise Suppression</h2><p>What raw protocol data looks like versus what teamchat shows.</p></div>
<div class="noise-comparison">
<div class="noise-box"><div class="noise-label">Raw idle pings</div><div class="noise-content" style="font-family:monospace;font-size:.72rem;color:#3a3d4a;line-height:1.8">${metrics.idlePingsRaw > 0 ? '{"type":"idle","status":"available"}<br>'.repeat(Math.min(6, metrics.idlePingsRaw)) + '<div style="text-align:center;font-style:italic;margin-top:8px;color:var(--text-dim)">... ' + metrics.idlePingsRaw + ' total pings suppressed</div>' : '<em>No idle pings in this session.</em>'}</div></div>
<div class="noise-arrow">&#8594;</div>
<div class="noise-box"><div class="noise-label">teamchat renders</div><div class="noise-content"><div class="suppressed"><span class="dot"></span> ${metrics.idleEventsShown} idle indicator${metrics.idleEventsShown !== 1 ? 's' : ''} <span style="color:var(--text-dim);font-size:.75rem">(${metrics.idlePingsRaw} pings suppressed)</span></div></div></div>
</div>
${metrics.broadcastsRaw > 0 ? '<div class="noise-comparison"><div class="noise-box"><div class="noise-label">Broadcast in raw inboxes</div><div class="noise-content" style="font-family:monospace;font-size:.72rem;color:#3a3d4a;line-height:1.8">' + metrics.broadcastsRaw + ' identical inbox writes across ' + session.agents + ' agents</div></div><div class="noise-arrow">&#8594;</div><div class="noise-box"><div class="noise-label">teamchat renders</div><div class="noise-content"><div class="suppressed"><span class="dot" style="background:var(--accent-blue)"></span> ' + metrics.broadcastsShown + ' broadcast card' + (metrics.broadcastsShown !== 1 ? 's' : '') + ' <span style="color:var(--text-dim);font-size:.75rem">(' + metrics.broadcastDedup + ':1 dedup ratio)</span></div></div></div></div>' : ''}
</div>
</section>

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
