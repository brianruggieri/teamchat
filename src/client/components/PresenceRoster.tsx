import React from 'react';
import type { TeamState } from '../types.js';
import { getAgentColor } from '../types.js';

interface PresenceRosterProps {
	team: TeamState | null;
	presence: Record<string, 'working' | 'idle' | 'offline'>;
}

const STATUS_INDICATORS: Record<string, string> = {
	working: '⚡',
	idle: '💤',
	offline: '🔴',
};

export function PresenceRoster({ team, presence }: PresenceRosterProps) {
	if (!team) return null;

	const members = team.members;

	return (
		<div className="sidebar-section">
			<h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-1.5">
				👥 Team
			</h3>
			<div className="space-y-2">
				{/* Lead is always first */}
				<div className="flex items-center gap-2 px-2 py-1">
					<span className="presence-dot bg-indigo-500" />
					<span className="text-sm text-gray-200">
						👑 team-lead
					</span>
				</div>

				{/* Teammates */}
				{members
					.filter((m) => m.name !== 'team-lead')
					.map((member) => {
						const agentColor = getAgentColor(member.color);
						const status = presence[member.name] ?? 'working';
						const indicator = STATUS_INDICATORS[status];

						return (
							<div
								key={member.name}
								className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-800 transition-colors cursor-default"
								title={`${member.name} — ${status}`}
							>
								<span className={`presence-dot ${agentColor.dot}`} />
								<span className={`text-sm ${agentColor.text}`}>
									{member.name}
								</span>
								<span className="text-xs ml-auto">{indicator}</span>
							</div>
						);
					})}
			</div>
		</div>
	);
}
