import React, { useState } from 'react';
import type { ContentMessage, Reaction } from '../types.js';
import { getAgentColor } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { ReactionRow } from './ReactionRow.jsx';
import { formatRelativeTime, formatISOTooltip } from '../hooks/useRelativeTime.js';

interface PlanApprovalCardProps {
	message: ContentMessage;
	planContent: string;
	reactions: Reaction[];
}

export function PlanApprovalCard({ message, planContent, reactions }: PlanApprovalCardProps) {
	const [expanded, setExpanded] = useState(false);
	const agentColor = getAgentColor(message.fromColor);
	const lines = planContent.split('\n');
	const previewLines = lines.slice(0, 3).join('\n');

	return (
		<div className="flex justify-start animate-slide-in-left mb-4">
			<div className="flex items-start gap-2 max-w-[85%] w-full">
				<AgentAvatar name={message.from} color={message.fromColor} />
				<div className="flex flex-col w-full">
					<div className="flex items-center gap-2 mb-1">
						<span className={`text-sm font-medium ${agentColor.text}`}>
							{message.from}
						</span>
						<span
							className="text-xs text-gray-500"
							title={formatISOTooltip(message.timestamp)}
						>
							{formatRelativeTime(message.timestamp)}
						</span>
					</div>
					<div className="plan-card">
						<div className={`px-4 py-2 border-b border-surface-700 flex items-center gap-2 ${agentColor.bg}`}>
							<span>📋</span>
							<span className="text-sm font-medium text-gray-200">PLAN</span>
							<span className={`text-sm ${agentColor.text}`}>
								{message.from}: Plan for Review
							</span>
						</div>
						<div className="px-4 py-3">
							<pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
								{expanded ? planContent : previewLines}
							</pre>
							{lines.length > 3 && (
								<button
									onClick={() => setExpanded(!expanded)}
									className="text-indigo-400 text-xs mt-2 hover:text-indigo-300 transition-colors flex items-center gap-1"
								>
									<span>{expanded ? '▾' : '▸'}</span>
									{expanded ? 'Collapse' : `View plan (${lines.length} lines)`}
								</button>
							)}
						</div>
					</div>
					<ReactionRow reactions={reactions} />
				</div>
			</div>
		</div>
	);
}
