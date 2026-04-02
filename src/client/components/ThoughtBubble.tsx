import React from 'react';
import type { LeadThought } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';

interface ThoughtBubbleProps {
	event: LeadThought;
}

export function ThoughtBubble({ event }: ThoughtBubbleProps) {
	const { formatAbsoluteTime, formatISOTooltip } = useRelativeTime();

	// Truncate long thoughts
	const maxLen = 300;
	const displayText = event.text.length > maxLen
		? event.text.slice(0, maxLen) + '...'
		: event.text;

	return (
		<div className="tc-thought-bubble">
			<span className="tc-thought-icon">💭</span>
			<span className="tc-thought-text">{displayText}</span>
			<span className="tc-thought-time" title={formatISOTooltip(event.timestamp)}>
				{formatAbsoluteTime(event.timestamp)}
			</span>
		</div>
	);
}
