import React from 'react';
import type { ContentMessage, Reaction } from '../types.js';
import { getAgentColor } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { ChatMessage } from './ChatMessage.jsx';

interface MessageStackProps {
	messages: ContentMessage[];
	reactions: Record<string, Reaction[]>;
}

export function MessageStack({ messages, reactions }: MessageStackProps) {
	const firstMessage = messages[0];
	const isLead = firstMessage.isLead;
	const agentColor = getAgentColor(firstMessage.fromColor);

	return (
		<section
			className={`tc-message-stack ${isLead ? 'is-lead' : 'is-peer'}`}
		>
			<div className="tc-message-stack-shell">
				{!isLead && (
					<AgentAvatar
						name={firstMessage.from}
						color={firstMessage.fromColor}
					/>
				)}
				<div className="tc-message-stack-main">
					<header
						className={`tc-message-stack-header ${isLead ? 'is-lead' : ''}`}
					>
						<span
							className={`tc-message-stack-name ${
								isLead ? 'is-lead' : agentColor.text
							}`}
						>
							{isLead ? 'team-lead' : firstMessage.from}
						</span>
						{firstMessage.isDM && (
							<span className="tc-message-stack-context">direct thread</span>
						)}
					</header>
					<div className="tc-message-stack-items">
						{messages.map((message, index) => {
							const stackPosition = getStackPosition(index, messages.length);
							return (
								<ChatMessage
									key={message.id}
									message={message}
									reactions={reactions[message.id] ?? []}
									stackPosition={stackPosition}
								/>
							);
						})}
					</div>
				</div>
				{isLead && (
					<AgentAvatar
						name="team-lead"
						color="indigo"
						isLead
					/>
				)}
			</div>
		</section>
	);
}

function getStackPosition(
	index: number,
	total: number
): 'single' | 'first' | 'middle' | 'last' {
	if (total === 1) return 'single';
	if (index === 0) return 'first';
	if (index === total - 1) return 'last';
	return 'middle';
}
