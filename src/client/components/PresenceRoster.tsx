import React from 'react';
import type { TeamState } from '../types.js';
import { getAgentColor } from '../types.js';

interface PresenceRosterProps {
	team: TeamState | null;
	presence: Record<string, 'working' | 'idle' | 'offline'>;
}

const STATUS_LABELS: Record<string, string> = {
	working: 'working',
	idle: 'idle',
	offline: 'offline',
};

export function PresenceRoster({ team, presence }: PresenceRosterProps) {
	if (!team) return null;

	const liveCount = team.members.filter((member) => {
		if (member.name === 'team-lead') return true;
		const status = presence[member.name] ?? 'working';
		return status !== 'offline';
	}).length;

	return (
		<section className="tc-sidecard tc-team-panel">
			<div className="tc-sidecard-header">
				<h3 className="tc-sidecard-title">Team</h3>
				<span className="tc-sidecard-metric">{liveCount} live</span>
			</div>
			<div className="tc-roster-list">
				<div className="tc-roster-row is-lead">
					<div className="tc-roster-identity">
						<span className="tc-roster-dot is-lead" />
						<div className="tc-roster-name">team-lead</div>
					</div>
					<div className="tc-roster-trailing">
						<span className="tc-roster-badge">lead</span>
						<span className="tc-roster-state is-working">working</span>
					</div>
				</div>

				{team.members
					.filter((member) => member.name !== 'team-lead')
					.map((member) => {
						const agentColor = getAgentColor(member.color);
						const status = presence[member.name] ?? 'working';
						return (
							<div
								key={member.name}
								className="tc-roster-row"
								title={`${member.name} — ${status}`}
							>
								<div className="tc-roster-identity">
									<span className={`tc-roster-dot ${agentColor.dot}`} />
									<div className={`tc-roster-name ${agentColor.text}`}>
										{member.name}
									</div>
								</div>
								<div className="tc-roster-trailing">
									<span className={`tc-roster-state is-${status}`}>
										{STATUS_LABELS[status]}
									</span>
								</div>
							</div>
						);
					})}
			</div>
		</section>
	);
}
