import React, { useState } from 'react';
import type { ContentMessage, Reaction } from '../types.js';
import { getAgentColor } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { ReactionRow } from './ReactionRow.jsx';
import { formatRelativeTime, formatAbsoluteTime, formatISOTooltip } from '../hooks/useRelativeTime.js';

interface ChatMessageProps {
	message: ContentMessage;
	reactions: Reaction[];
}

const TRUNCATE_LENGTH = 200;

export function ChatMessage({ message, reactions }: ChatMessageProps) {
	const [expanded, setExpanded] = useState(false);
	const agentColor = getAgentColor(message.fromColor);
	const isLong = message.text.length > TRUNCATE_LENGTH;
	const displayText = isLong && !expanded
		? message.summary ?? message.text.slice(0, TRUNCATE_LENGTH) + '...'
		: message.text;

	const now = Date.now();
	const msgTime = new Date(message.timestamp).getTime();
	const isRecent = (now - msgTime) < 3600000;
	const timeDisplay = isRecent
		? formatRelativeTime(message.timestamp)
		: formatAbsoluteTime(message.timestamp);

	if (message.isLead) {
		return (
			<div className="flex justify-end animate-slide-in-right mb-4">
				<div className="flex items-start gap-2 max-w-[75%]">
					<div className="flex flex-col items-end">
						<div className="flex items-center gap-2 mb-1">
							<span
								className="text-xs text-gray-500"
								title={formatISOTooltip(message.timestamp)}
							>
								{timeDisplay}
							</span>
							<span className="text-sm font-medium text-indigo-400">team-lead</span>
						</div>
						<div className="chat-bubble chat-bubble-lead">
							<MessageContent text={displayText} />
							{isLong && (
								<button
									onClick={() => setExpanded(!expanded)}
									className="text-indigo-200 text-xs mt-1 hover:text-white transition-colors"
								>
									{expanded ? 'collapse' : '... (expand)'}
								</button>
							)}
						</div>
						<ReactionRow reactions={reactions} />
					</div>
					<AgentAvatar name="team-lead" color="indigo" isLead />
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-start animate-slide-in-left mb-4">
			<div className="flex items-start gap-2 max-w-[75%]">
				<AgentAvatar name={message.from} color={message.fromColor} />
				<div className="flex flex-col">
					<div className="flex items-center gap-2 mb-1">
						<span className={`text-sm font-medium ${agentColor.text}`}>
							{message.from}
						</span>
						{message.isBroadcast && (
							<span className="text-xs" title="Broadcast">📢</span>
						)}
						<span
							className="text-xs text-gray-500"
							title={formatISOTooltip(message.timestamp)}
						>
							{timeDisplay}
						</span>
					</div>
					<div className={`chat-bubble chat-bubble-teammate border-l-2 ${agentColor.border}`}>
						<MessageContent text={displayText} />
						{isLong && (
							<button
								onClick={() => setExpanded(!expanded)}
								className="text-gray-400 text-xs mt-1 hover:text-gray-200 transition-colors"
							>
								{expanded ? 'collapse' : '... (expand)'}
							</button>
						)}
					</div>
					<ReactionRow reactions={reactions} />
				</div>
			</div>
		</div>
	);
}

function MessageContent({ text }: { text: string }) {
	// Split on code blocks for basic rendering
	const parts = text.split(/(```[\s\S]*?```)/g);

	return (
		<div className="text-sm leading-relaxed whitespace-pre-wrap">
			{parts.map((part, i) => {
				if (part.startsWith('```') && part.endsWith('```')) {
					const code = part.slice(3, -3);
					const firstNewline = code.indexOf('\n');
					const content = firstNewline > -1 ? code.slice(firstNewline + 1) : code;
					return (
						<pre
							key={i}
							className="bg-black/30 rounded px-2 py-1.5 my-1 text-xs overflow-x-auto font-mono"
						>
							{content}
						</pre>
					);
				}
				return <span key={i}>{renderInlineMarkdown(part)}</span>;
			})}
		</div>
	);
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	// Simple inline code, bold, and @mentions
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
				<code key={match.index} className="bg-black/30 px-1 rounded text-xs font-mono">
					{token.slice(1, -1)}
				</code>
			);
		} else if (token.startsWith('**') && token.endsWith('**')) {
			nodes.push(
				<strong key={match.index}>{token.slice(2, -2)}</strong>
			);
		} else if (token.startsWith('@')) {
			nodes.push(
				<span key={match.index} className="text-indigo-400 font-medium">
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
