import React from 'react';
import type { TeamState } from '../types.js';

interface HeaderProps {
	team: TeamState | null;
	connected: boolean;
	onlineCount: number;
	mode?: 'live' | 'replay';
	statusText?: string;
	children?: React.ReactNode;
}

export function Header({
	team,
	connected,
	onlineCount,
	mode = 'live',
	statusText,
	children,
}: HeaderProps) {
	const teamName = team?.name ?? 'teamchat';
	const liveStatusText = statusText ?? (connected ? 'following stream' : 'reconnecting');
	const replayStatusText = statusText ?? 'paused';
	const audienceLabel = mode === 'replay' ? 'present' : 'online';

	return (
		<header className="tc-header">
			<div className="tc-header-brand">
				<div className="tc-header-logo">TC</div>
				<div className="tc-header-copy">
					<span className="tc-header-title">
						teamchat
						<span className={`tc-mode-badge is-${mode}`}>
							{mode === 'replay' ? 'replay view' : 'live view'}
						</span>
					</span>
					<span className="tc-header-subtitle">{teamName}</span>
				</div>
			</div>
			<div className="tc-header-actions">
				<div className="tc-header-status">
					<span className={`tc-connection-dot ${
						mode === 'replay'
							? 'is-replay'
							: connected
								? 'is-live'
								: 'is-down'
					}`} />
					<span className="tc-header-status-text">
						{mode === 'replay' ? replayStatusText : liveStatusText}
					</span>
					<span className="tc-header-online">{onlineCount} {audienceLabel}</span>
				</div>
				{children}
			</div>
		</header>
	);
}
