import React from 'react';
import type { TeamState } from '../types.js';

interface HeaderProps {
	team: TeamState | null;
	connected: boolean;
	onlineCount: number;
}

export function Header({
	team,
	connected,
	onlineCount,
}: HeaderProps) {
	const teamName = team?.name ?? 'teamchat';

	return (
		<header className="tc-header">
			<div className="tc-header-brand">
				<div className="tc-header-logo">TC</div>
				<div className="tc-header-copy">
					<span className="tc-header-title">teamchat</span>
					<span className="tc-header-subtitle">{teamName}</span>
				</div>
			</div>
			<div className="tc-header-actions">
				<div className="tc-header-status">
					<span className={`tc-connection-dot ${connected ? 'is-live' : 'is-down'}`} />
					<span className="tc-header-status-text">
						{connected ? 'live' : 'reconnecting'}
					</span>
					<span className="tc-header-online">{onlineCount} online</span>
				</div>
			</div>
		</header>
	);
}
