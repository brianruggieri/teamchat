import React, { useMemo, useState } from 'react';
import type { ContentMessage, Reaction } from '../types.js';
import { getAgentColor } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { ReactionRow } from './ReactionRow.jsx';
import { useRelativeTime } from '../hooks/useRelativeTime.js';

interface PlanApprovalCardProps {
	message: ContentMessage;
	planContent: string;
	reactions: Reaction[];
}

export function PlanApprovalCard({
	message,
	planContent,
	reactions,
}: PlanApprovalCardProps) {
	const [expanded, setExpanded] = useState(false);
	const { formatRelativeTime, formatISOTooltip } = useRelativeTime();
	const agentColor = getAgentColor(message.fromColor);
	const lines = useMemo(() => planContent.split('\n'), [planContent]);
	const previewLineCount = Math.min(lines.length, 4);
	const preview = lines.slice(0, previewLineCount).join('\n');
	const status = reactions.some((reaction) => reaction.emoji === '👍')
		? 'approved'
		: reactions.some((reaction) => reaction.emoji === '👎')
			? 'rejected'
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
					<article className="tc-protocol-card tc-plan-card">
						<header className="tc-protocol-card-header">
							<div className="tc-protocol-card-title-group">
								<span className="tc-protocol-label">PLAN REVIEW</span>
								<span className="tc-protocol-card-title">
									Implementation plan from {message.from}
								</span>
							</div>
							<span className={`tc-status-pill is-${status}`}>
								{status}
							</span>
						</header>
						<div className="tc-protocol-card-body">
							<div className="tc-protocol-grid">
								<div>
									<div className="tc-protocol-field-label">origin</div>
									<div className="tc-protocol-field-value">{message.from}</div>
								</div>
								<div>
									<div className="tc-protocol-field-label">lines</div>
									<div className="tc-protocol-field-value">{lines.length}</div>
								</div>
							</div>
							<pre className="tc-plan-preview">{expanded ? planContent : preview}</pre>
							{lines.length > previewLineCount && (
								<button
									type="button"
									onClick={() => setExpanded(!expanded)}
									className="tc-protocol-expand"
								>
									{expanded ? 'Collapse plan' : `Expand plan (${lines.length} lines)`}
								</button>
							)}
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
