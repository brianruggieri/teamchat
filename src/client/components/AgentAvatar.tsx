import React from 'react';
import { getAgentColor } from '../types.js';

interface AgentAvatarProps {
	name: string;
	color: string;
	isLead?: boolean;
	size?: 'xs' | 'sm' | 'md';
}

export function AgentAvatar({
	name,
	color,
	isLead = false,
	size = 'md',
}: AgentAvatarProps) {
	const agentColor = getAgentColor(color);
	const letter = name.charAt(0).toUpperCase();

	return (
		<div className={`tc-avatar ${size === 'sm' ? 'is-sm' : size === 'xs' ? 'is-xs' : ''}`}>
			<div className={`tc-avatar-core ${agentColor.dot}`}>
				{letter}
			</div>
			{isLead && (
				<span className="tc-avatar-badge" title="Team Lead">
					👑
				</span>
			)}
		</div>
	);
}
