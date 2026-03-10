import React from 'react';
import type { ContentMessage, Reaction } from '../types.js';
import { getAgentColor } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { ReactionRow } from './ReactionRow.jsx';
import {
	formatRelativeTime,
	formatISOTooltip,
} from '../hooks/useRelativeTime.js';

interface PermissionRequestCardProps {
	message: ContentMessage;
	toolName: string;
	command: string;
	reactions: Reaction[];
}

export function PermissionRequestCard({
	message,
	toolName,
	command,
	reactions,
}: PermissionRequestCardProps) {
	const agentColor = getAgentColor(message.fromColor);
	const status = reactions.some((reaction) => reaction.emoji === '✅')
		? 'approved'
		: reactions.some((reaction) => reaction.emoji === '🚫')
			? 'denied'
			: 'pending';

	return (
		<section className="tc-protocol-row">
			<div className="tc-protocol-shell">
				<AgentAvatar name={message.from} color={message.fromColor} />
				<div className="tc-protocol-main">
					<div className="tc-protocol-meta">
						<span className={`tc-protocol-sender ${agentColor.text}`}>
							{message.from}
						</span>
						<span
							className="tc-protocol-time"
							title={formatISOTooltip(message.timestamp)}
						>
							{formatRelativeTime(message.timestamp)}
						</span>
					</div>
					<article className="tc-protocol-card tc-permission-card">
						<header className="tc-protocol-card-header">
							<div className="tc-protocol-card-title-group">
								<span className="tc-protocol-label">PERMISSION</span>
								<span className="tc-protocol-card-title">
									Approval required before execution
								</span>
							</div>
							<span className={`tc-status-pill is-${status}`}>
								{status}
							</span>
						</header>
						<div className="tc-protocol-card-body">
							<div className="tc-protocol-grid">
								<div>
									<div className="tc-protocol-field-label">requester</div>
									<div className="tc-protocol-field-value">{message.from}</div>
								</div>
								<div>
									<div className="tc-protocol-field-label">tool</div>
									<div className="tc-protocol-field-value">
										{toolName || 'unknown'}
									</div>
								</div>
							</div>
							<pre className="tc-command-block">{command}</pre>
						</div>
						<footer className="tc-protocol-card-footer">
							<ReactionRow reactions={reactions} />
						</footer>
					</article>
				</div>
			</div>
		</section>
	);
}
