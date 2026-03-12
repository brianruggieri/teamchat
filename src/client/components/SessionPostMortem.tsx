import React from 'react';
import type { PostMortemData, TeamState } from '../../shared/types.js';
import { AgentAvatar } from './AgentAvatar.jsx';

interface SessionPostMortemProps {
	data: PostMortemData;
	team: TeamState;
	onDismiss: () => void;
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const hours = Math.floor(minutes / 60);
	if (hours > 0) {
		const remainMins = minutes % 60;
		return `${hours}h ${remainMins}m`;
	}
	return `${minutes}m`;
}

function formatMomentTime(atMs: number): string {
	const totalSeconds = Math.floor(atMs / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const MOMENT_ICONS: Record<string, string> = {
	'session-start': '\u25B6',
	'first-task-claimed': '\u2691',
	'bottleneck': '\u26A0',
	'cascade': '\u26A1',
	'task-completed': '\u2713',
	'all-tasks-completed': '\u2605',
};

export function SessionPostMortem({ data, team, onDismiss }: SessionPostMortemProps) {
	const membersByName = new Map(team.members.map((m) => [m.name, m]));

	return (
		<div className="tc-postmortem-overlay" role="dialog" aria-label="Session post-mortem">
			<div className="tc-postmortem-inner">
				{/* 1. Hero Header */}
				<div className="tc-postmortem-header">
					<div className="tc-postmortem-header-text">
						<h2 className="tc-postmortem-title">Session Complete</h2>
						<span className="tc-postmortem-duration">{formatDuration(data.sessionDurationMs)}</span>
					</div>
					<button type="button" className="tc-postmortem-dismiss" onClick={onDismiss}>
						Dismiss
					</button>
				</div>

				{/* 2. Signal-to-Noise Card */}
				{data.signalNoise.idlePingsAbsorbed > 0 && (
					<div className="tc-postmortem-section">
						<div className="tc-postmortem-signal">
							<div className="tc-postmortem-signal-text">
								teamchat condensed <strong>{data.signalNoise.totalRawEvents}</strong> raw events into{' '}
								<strong>{data.signalNoise.meaningfulEvents}</strong> meaningful messages
							</div>
							<div className="tc-postmortem-signal-bar">
								<div
									className="tc-postmortem-signal-segment is-absorbed"
									style={{ flex: data.signalNoise.idlePingsAbsorbed }}
									title={`${data.signalNoise.idlePingsAbsorbed} idle pings absorbed`}
								/>
								<div
									className="tc-postmortem-signal-segment is-signal"
									style={{ flex: data.signalNoise.meaningfulEvents }}
									title={`${data.signalNoise.meaningfulEvents} meaningful events`}
								/>
							</div>
							<div className="tc-postmortem-signal-legend">
								<span className="tc-postmortem-legend-item is-absorbed">
									{data.signalNoise.idlePingsAbsorbed} absorbed
								</span>
								<span className="tc-postmortem-legend-item is-signal">
									{data.signalNoise.meaningfulEvents} signal
								</span>
							</div>
						</div>
					</div>
				)}

				{/* 3. Stats Strip */}
				<div className="tc-postmortem-section">
					<div className="tc-postmortem-stats">
						<div className="tc-stat-chip">
							<span className="tc-stat-chip-value">{data.agents.length}</span>
							<span className="tc-stat-chip-label">agents</span>
						</div>
						<div className="tc-stat-chip">
							<span className="tc-stat-chip-value">
								{data.summary.completedCount}/{data.summary.taskCount}
							</span>
							<span className="tc-stat-chip-label">tasks</span>
						</div>
						<div className="tc-stat-chip">
							<span className="tc-stat-chip-value">{data.summary.messageCount}</span>
							<span className="tc-stat-chip-label">messages</span>
						</div>
						<div className="tc-stat-chip">
							<span className="tc-stat-chip-value">{data.summary.broadcastCount}</span>
							<span className="tc-stat-chip-label">broadcasts</span>
						</div>
						<div className="tc-stat-chip">
							<span className="tc-stat-chip-value">{data.summary.dmThreadCount}</span>
							<span className="tc-stat-chip-label">DM threads</span>
						</div>
						<div className="tc-stat-chip">
							<span className="tc-stat-chip-value">{data.summary.resolvedThreadCount}</span>
							<span className="tc-stat-chip-label">resolved</span>
						</div>
					</div>
				</div>

				{/* 4. Key Moments Timeline */}
				{data.keyMoments.length > 0 && (
					<div className="tc-postmortem-section">
						<h3 className="tc-postmortem-section-title">Key Moments</h3>
						<div className="tc-postmortem-moments">
							{data.keyMoments.map((moment, i) => (
								<div key={i} className={`tc-postmortem-moment is-${moment.kind}`}>
									<span className="tc-postmortem-moment-time">{formatMomentTime(moment.atMs)}</span>
									<span className="tc-postmortem-moment-dot">{MOMENT_ICONS[moment.kind] ?? '\u2022'}</span>
									<span className="tc-postmortem-moment-label">{moment.label}</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* 5. Coordination Map */}
				{data.coordinationMatrix.length > 0 && (
					<div className="tc-postmortem-section">
						<h3 className="tc-postmortem-section-title">Coordination</h3>
						<div className="tc-postmortem-coord">
							{data.coordinationMatrix.map((cell, i) => {
								const agentA = membersByName.get(cell.agentA);
								const agentB = membersByName.get(cell.agentB);
								return (
									<div key={i} className="tc-coord-row">
										<div className="tc-coord-pair">
											{agentA && (
												<AgentAvatar name={agentA.name} color={agentA.color} size="xs" />
											)}
											<span className="tc-coord-arrow">\u2194</span>
											{agentB && (
												<AgentAvatar name={agentB.name} color={agentB.color} size="xs" />
											)}
										</div>
										<div className="tc-coord-stats">
											<span>{cell.messageCount} msgs</span>
											<span>{cell.threadCount} threads</span>
											{cell.resolvedCount > 0 && (
												<span className="tc-coord-resolved">\u2713 {cell.resolvedCount}</span>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* 6. Agent Contribution Cards */}
				{data.agents.length > 0 && (
					<div className="tc-postmortem-section">
						<h3 className="tc-postmortem-section-title">Agents</h3>
						<div className="tc-postmortem-agents">
							{data.agents.map((agent) => {
								const memberInfo = membersByName.get(agent.name);
								return (
									<div
										key={agent.name}
										className="tc-postmortem-agent-card"
										style={{ borderColor: `var(--agent-${agent.color}, var(--border-primary))` }}
									>
										<div className="tc-postmortem-agent-header">
											{memberInfo && (
												<AgentAvatar name={memberInfo.name} color={memberInfo.color} size="sm" />
											)}
											<span className="tc-postmortem-agent-name">{agent.name}</span>
										</div>
										<div className="tc-postmortem-agent-stats">
											<div>
												<span className="tc-stat-chip-value">{agent.tasksCompleted}/{agent.tasksTotal}</span>
												<span className="tc-stat-chip-label">tasks</span>
											</div>
											<div>
												<span className="tc-stat-chip-value">{agent.messagesSent}</span>
												<span className="tc-stat-chip-label">msgs</span>
											</div>
											<div>
												<span className="tc-stat-chip-value">{agent.dmThreads}</span>
												<span className="tc-stat-chip-label">DMs</span>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
