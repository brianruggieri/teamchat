import React, { useState } from 'react';
import type { ContentMessage, Reaction } from '../types.js';
import { getAgentColor } from '../types.js';
import { ReactionRow } from './ReactionRow.jsx';
import { useRelativeTime } from '../hooks/useRelativeTime.js';

interface ChatMessageProps {
	message: ContentMessage;
	reactions: Reaction[];
	stackPosition?: 'single' | 'first' | 'middle' | 'last';
}

const TRUNCATE_LENGTH = 200;

export function ChatMessage({
	message,
	reactions,
	stackPosition = 'single',
}: ChatMessageProps) {
	const [expanded, setExpanded] = useState(false);
	const { nowMs, formatRelativeTime, formatAbsoluteTime, formatISOTooltip } = useRelativeTime();
	const agentColor = getAgentColor(message.fromColor);
	const isLong = message.text.length > TRUNCATE_LENGTH;
	const displayText = isLong && !expanded
		? message.summary ?? `${message.text.slice(0, TRUNCATE_LENGTH)}...`
		: message.text;

	const msgTime = new Date(message.timestamp).getTime();
	const isRecent = nowMs - msgTime < 3600000;
	const timeDisplay = isRecent
		? formatRelativeTime(message.timestamp)
		: formatAbsoluteTime(message.timestamp);

	return (
		<article
			className={`tc-chat-message ${message.isLead ? 'is-lead' : 'is-peer'}`}
		>
			<div
				className={`tc-chat-bubble ${message.isLead ? 'is-lead' : 'is-peer'} ${
					stackPosition !== 'single' ? `is-${stackPosition}` : 'is-single'
				} ${message.isLead ? '' : `border-l-2 ${agentColor.border}`}`}
			>
				<MessageContent text={displayText} />
				{isLong && (
					<button
						onClick={() => setExpanded(!expanded)}
						className="tc-expand-button"
					>
						{expanded ? 'collapse' : 'expand'}
					</button>
				)}
			</div>
			<div
				className={`tc-chat-meta ${message.isLead ? 'is-lead' : 'is-peer'}`}
			>
				{message.isBroadcast && (
					<span className="tc-broadcast-pill" title="Broadcast message">
						broadcast
					</span>
				)}
				<span
					className="tc-chat-timestamp"
					title={formatISOTooltip(message.timestamp)}
				>
					{timeDisplay}
				</span>
			</div>
			<ReactionRow
				reactions={reactions}
				align={message.isLead ? 'end' : 'start'}
			/>
		</article>
	);
}

function MessageContent({ text }: { text: string }) {
	const parts = text.split(/(```[\s\S]*?```)/g);

	return (
		<div className="tc-message-content">
			{parts.map((part, index) => {
				if (part.startsWith('```') && part.endsWith('```')) {
					const code = part.slice(3, -3);
					const firstNewline = code.indexOf('\n');
					const content = firstNewline > -1 ? code.slice(firstNewline + 1) : code;
					return (
						<pre key={index} className="tc-code-block">
							{content}
						</pre>
					);
				}

				return <span key={index}>{renderInlineMarkdown(part)}</span>;
			})}
		</div>
	);
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	const regex = /(`[^`]+`|\*\*[^*]+\*\*|@\w[\w-]*)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			nodes.push(text.slice(lastIndex, match.index));
		}

		const token = match[0];
		if (token.startsWith('`') && token.endsWith('`')) {
			nodes.push(
				<code key={match.index} className="tc-inline-code">
					{token.slice(1, -1)}
				</code>
			);
		} else if (token.startsWith('**') && token.endsWith('**')) {
			nodes.push(
				<strong key={match.index}>{token.slice(2, -2)}</strong>
			);
		} else if (token.startsWith('@')) {
			nodes.push(
				<span key={match.index} className="tc-mention">
					{token}
				</span>
			);
		}

		lastIndex = match.index + token.length;
	}

	if (lastIndex < text.length) {
		nodes.push(text.slice(lastIndex));
	}

	return nodes;
}
