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

	return (
		<section className="tc-sidecard">
			<div className="tc-sidecard-header">
				<div>
					<h3 className="tc-sidecard-title">Presence</h3>
					<p className="tc-sidecard-subtitle">Current roster and idle state</p>
				</div>
				<span className="tc-sidecard-metric">{team.members.length}</span>
			</div>
			<div className="tc-roster-list">
				<div className="tc-roster-row is-lead">
					<div className="tc-roster-identity">
						<span className="tc-roster-dot is-lead" />
						<div>
							<div className="tc-roster-name">team-lead</div>
							<div className="tc-roster-status">lead · working</div>
						</div>
					</div>
					<span className="tc-roster-badge">lead</span>
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
									<div>
										<div className={`tc-roster-name ${agentColor.text}`}>
											{member.name}
										</div>
										<div className="tc-roster-status">
											{STATUS_LABELS[status]}
										</div>
									</div>
								</div>
								<span className={`tc-roster-badge is-${status}`}>
									{STATUS_LABELS[status]}
								</span>
							</div>
						);
					})}
			</div>
		</section>
	);
}
