import React from 'react';
import type { TeamState } from '../types.js';

interface HeaderProps {
	team: TeamState | null;
	connected: boolean;
	onlineCount: number;
}

export function Header({ team, connected, onlineCount }: HeaderProps) {
	const teamName = team?.name ?? 'teamchat';

	return (
		<header className="flex items-center justify-between px-5 py-3 border-b border-surface-800 bg-surface-900/80 backdrop-blur-sm sticky top-0 z-40">
			<div className="flex items-center gap-3">
				<span className="text-lg font-semibold text-gray-100">
					⬡ teamchat
				</span>
				<span className="text-sm text-gray-500">
					{teamName}
				</span>
			</div>
			<div className="flex items-center gap-3">
				<span className="text-sm text-gray-500">
					{onlineCount} online
				</span>
				<span
					className={`w-2 h-2 rounded-full ${
						connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
					}`}
					title={connected ? 'Connected' : 'Disconnected'}
				/>
			</div>
		</header>
	);
}
