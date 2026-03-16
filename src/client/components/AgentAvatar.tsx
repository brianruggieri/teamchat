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

	const sizeClass = size === 'xs' ? 'is-xs' : size === 'sm' ? 'is-sm' : '';

	return (
		<div className={`tc-avatar ${sizeClass}`}>
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
