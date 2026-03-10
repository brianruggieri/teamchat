import React from 'react';
import type { ContentMessage, Reaction } from '../types.js';
import { getAgentColor } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { ReactionRow } from './ReactionRow.jsx';
import { formatRelativeTime, formatISOTooltip } from '../hooks/useRelativeTime.js';

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
	const hasApproval = reactions.some((r) => r.emoji === '✅');
	const hasDenial = reactions.some((r) => r.emoji === '🚫');
	const isResolved = hasApproval || hasDenial;

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
					<div className="permission-card">
						<div className="px-4 py-2 border-b border-surface-700 flex items-center gap-2 bg-yellow-500/10">
							<span>🔐</span>
							<span className="text-sm font-medium text-gray-200">
								PERMISSION REQUEST
							</span>
						</div>
						<div className="px-4 py-3">
							<p className="text-sm text-gray-300 mb-2">
								<span className={agentColor.text}>{message.from}</span> wants to run:
							</p>
							<pre className="bg-black/30 rounded px-3 py-2 text-xs font-mono text-gray-200 overflow-x-auto">
								{command}
							</pre>
							{toolName && (
								<p className="text-xs text-gray-500 mt-2">
									Tool: <span className="text-gray-400">{toolName}</span>
								</p>
							)}
							{isResolved && (
								<div className="mt-3 flex items-center gap-2">
									{hasApproval && (
										<span className="text-xs text-green-400 flex items-center gap-1">
											✅ Approved
										</span>
									)}
									{hasDenial && (
										<span className="text-xs text-red-400 flex items-center gap-1">
											🚫 Denied
										</span>
									)}
								</div>
							)}
						</div>
					</div>
					<ReactionRow reactions={reactions} />
				</div>
			</div>
		</div>
	);
}
