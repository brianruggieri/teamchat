import React from 'react';
import type { TeamState, ThreadStatus, TaskInfo } from '../types.js';
import { getAgentColor, getAgentColorValues } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';

interface PresenceRosterProps {
	mode?: 'live' | 'replay';
	team: TeamState | null;
	presence: Record<string, 'working' | 'idle' | 'offline'>;
	threadStatuses?: Record<string, ThreadStatus>;
	tasks?: TaskInfo[];
	onAgentClick?: (agentName: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
	working: 'working',
	idle: 'idle',
	offline: 'offline',
};

export function formatModel(model: string): string {
	if (model.includes('opus')) return 'opus';
	if (model.includes('sonnet')) return 'sonnet';
	if (model.includes('haiku')) return 'haiku';
	// Strip "claude-" prefix and version suffixes for brevity
	return model.replace(/^claude-/, '').replace(/-\d+$/, '');
}

function getSmartStatus(
	name: string,
	presence: string,
	threadStatuses: Record<string, ThreadStatus>,
	tasks: TaskInfo[],
): { label: string; tone: string } {
	const activeThreads = Object.values(threadStatuses).filter(
		(ts) => ts.participants.includes(name) && ts.status !== 'resolved',
	);
	const agentTasks = tasks.filter((t) => t.owner === name && t.status === 'pending');
	const blockedTask = agentTasks.find((t) => t.blockedBy && t.blockedBy.length > 0);

	if (presence === 'offline') return { label: 'offline', tone: 'offline' };
	if (blockedTask) return { label: `blocked #${blockedTask.blockedBy![0]}`, tone: 'blocked' };
	if (activeThreads.length === 1) {
		const other = activeThreads[0]!.participants.find((p) => p !== name);
		return { label: `DM → ${other}`, tone: 'working' };
	}
	if (activeThreads.length > 1) return { label: `${activeThreads.length} DMs`, tone: 'working' };
	if (presence === 'idle') return { label: 'idle', tone: 'idle' };
	return { label: 'working', tone: 'working' };
}

export function PresenceRoster({
	mode = 'live',
	team,
	presence,
	threadStatuses,
	tasks,
	onAgentClick,
}: PresenceRosterProps) {
	if (!team) return null;

	const useSmartStatus = threadStatuses != null && tasks != null;

	const liveCount = team.members.filter((member) => {
		if (member.name === 'team-lead') return true;
		const status = presence[member.name] ?? 'offline';
		return status !== 'offline';
	}).length;

	return (
		<section className="tc-sidecard tc-team-panel">
			<div className="tc-sidecard-header">
				<h3 className="tc-sidecard-title">Team</h3>
				<span className="tc-sidecard-metric">
					{liveCount} {mode === 'replay' ? 'present' : 'live'}
				</span>
			</div>
			<div className="tc-roster-list">
				{(() => {
					const leadMember = team.members.find((m) => m.name === 'team-lead');
					const leadModel = leadMember?.model;
					return (
						<div className="tc-roster-row is-lead">
							<div className="tc-roster-identity">
								<AgentAvatar name="team-lead" color="gold" isLead size="xs" />
								<div className="tc-roster-name">team-lead</div>
							</div>
							<div className="tc-roster-trailing">
								<span className="tc-roster-badge">lead</span>
								{leadModel && (
									<span className="tc-roster-badge is-model" title={leadModel}>
										{formatModel(leadModel)}
									</span>
								)}
								<span className="tc-roster-state is-working">working</span>
							</div>
						</div>
					);
				})()}

				{team.members
					.filter((member) => member.name !== 'team-lead')
					.map((member) => {
						const agentColor = getAgentColor(member.color);
						const status = presence[member.name] ?? 'offline';
						const smartStatus = useSmartStatus
							? getSmartStatus(member.name, status, threadStatuses!, tasks!)
							: { label: STATUS_LABELS[status] ?? status, tone: status };

						const agentTasks = (tasks ?? []).filter((t) => t.owner === member.name);
						const completed = agentTasks.filter((t) => t.status === 'completed').length;
						const total = agentTasks.length;
						const pct = total > 0 ? (completed / total) * 100 : 0;
						const fillColor = getAgentColorValues(member.color).fill;

						const statusDotColor =
							status === 'working' ? '#8ef2b4' :
							status === 'idle' ? '#ffd38b' :
							'#ffb0b0';

						return (
							<div
								key={member.name}
								className={`tc-roster-row ${onAgentClick ? 'is-clickable' : ''}`}
								title={`${member.name} — ${smartStatus.label}`}
								onClick={() => onAgentClick?.(member.name)}
								style={onAgentClick ? { cursor: 'pointer' } : undefined}
							>
								<div className="tc-roster-identity">
									<AgentAvatar name={member.name} color={member.color} size="xs" />
									<div className={`tc-roster-name ${agentColor.text}`}>
										{member.name}
									</div>
								</div>
								<div className="tc-roster-trailing">
									{total > 0 && (
										<>
											<div style={{
												width: 32, height: 4,
												background: '#1e293b',
												borderRadius: 2,
												overflow: 'hidden',
												flexShrink: 0,
											}}>
												<div style={{
													width: `${pct}%`,
													height: '100%',
													background: fillColor,
													borderRadius: 2,
												}} />
											</div>
											<span style={{ fontSize: '0.62rem', color: '#475569', flexShrink: 0 }}>
												{completed}/{total}
											</span>
										</>
									)}
									<span style={{
										width: 6,
										height: 6,
										borderRadius: '50%',
										background: statusDotColor,
										flexShrink: 0,
										display: 'inline-block',
									}} />
								</div>
							</div>
						);
					})}
			</div>
		</section>
	);
}
