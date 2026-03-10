import React from 'react';
import { getAgentColor } from '../types.js';

interface AgentAvatarProps {
	name: string;
	color: string;
	isLead?: boolean;
	size?: 'sm' | 'md';
}

export function AgentAvatar({ name, color, isLead = false, size = 'md' }: AgentAvatarProps) {
	const agentColor = getAgentColor(color);
	const letter = name.charAt(0).toUpperCase();
	const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';

	return (
		<div className="relative flex-shrink-0">
			<div
				className={`${sizeClass} rounded-full flex items-center justify-center font-semibold ${agentColor.dot} text-white`}
			>
				{letter}
			</div>
			{isLead && (
				<span className="absolute -top-1 -right-1 text-xs" title="Team Lead">
					👑
				</span>
			)}
		</div>
	);
}
