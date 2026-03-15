import React from 'react';
import type { ThreadStatus, TaskInfo, TeamState } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { formatModel } from './PresenceRoster.jsx';

interface AgentProfileProps {
	agentName: string;
	team: TeamState;
	presence: Record<string, 'working' | 'idle' | 'offline'>;
	threadStatuses: Record<string, ThreadStatus>;
	tasks: TaskInfo[];
	onBack: () => void;
	onThreadClick?: (threadKey: string) => void;
}

export function AgentProfile({
	agentName, team, presence, threadStatuses, tasks, onBack, onThreadClick,
}: AgentProfileProps) {
	const member = team.members.find((m) => m.name === agentName);
	if (!member) return null;

	const agentThreads = Object.values(threadStatuses).filter(
		(ts) => ts.participants.includes(agentName),
	);
	const agentTasks = tasks.filter((t) => t.owner === agentName);
	const status = presence[agentName] ?? 'offline';

	return (
		<section className="tc-sidecard tc-agent-profile">
			<button className="tc-agent-back" onClick={onBack} type="button">← Overview</button>

			<div className="tc-agent-header">
				<AgentAvatar name={agentName} color={member.color} />
				<div className="tc-agent-header-info">
					<span className="tc-agent-header-name">{agentName}</span>
					<span className="tc-agent-header-meta">
						<span className={`tc-presence-dot is-${status}`} />
						{status}
						{member.model && <span className="tc-roster-badge is-model">{formatModel(member.model)}</span>}
					</span>
				</div>
			</div>

			{agentThreads.length > 0 && (
				<div className="tc-agent-section">
					<div className="tc-agent-section-title">Threads ({agentThreads.length})</div>
					{agentThreads.map((ts) => {
						const other = ts.participants.find((p) => p !== agentName) ?? '';
						return (
							<button
								key={ts.threadKey}
								className="tc-agent-thread-row"
								onClick={() => onThreadClick?.(ts.threadKey)}
								type="button"
							>
								<div className="tc-agent-thread-header">
									<span>{agentName} ↔ {other}</span>
									<span className={`tc-thread-status is-${ts.status}`}>
										{ts.status === 'resolved' ? '✓ resolved' : '● ' + ts.status}
									</span>
								</div>
								<div className="tc-agent-thread-topic">{ts.topic}</div>
								<div className="tc-agent-thread-meta">{ts.messageCount} messages</div>
							</button>
						);
					})}
				</div>
			)}

			{agentTasks.length > 0 && (
				<div className="tc-agent-section">
					<div className="tc-agent-section-title">Tasks ({agentTasks.length})</div>
					{agentTasks.map((task) => (
						<div key={task.id} className="tc-agent-task-row">
							<span className={`tc-status-dot is-${task.status}`} />
							<span className="tc-agent-task-subject">{task.subject}</span>
							<span className={`tc-status-pill is-${task.status}`}>{task.status}</span>
						</div>
					))}
				</div>
			)}

			<div className="tc-agent-section">
				<div className="tc-agent-section-title">Stats</div>
				<div className="tc-agent-stats-strip">
					<div className="tc-stat-chip">
						<span className="tc-stat-label">threads</span>
						<span className="tc-stat-value">{agentThreads.length}</span>
					</div>
					<div className="tc-stat-chip">
						<span className="tc-stat-label">tasks</span>
						<span className="tc-stat-value">
							{agentTasks.filter((t) => t.status === 'completed').length}/{agentTasks.length}
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}
