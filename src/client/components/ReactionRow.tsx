import React from 'react';
import type { Reaction } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';

interface ReactionRowProps {
	reactions: Reaction[];
	align?: 'start' | 'end';
}

export function ReactionRow({
	reactions,
	align = 'start',
}: ReactionRowProps) {
	if (reactions.length === 0) return null;

	const grouped = new Map<string, Reaction[]>();
	for (const reaction of reactions) {
		const existing = grouped.get(reaction.emoji) ?? [];
		existing.push(reaction);
		grouped.set(reaction.emoji, existing);
	}

	return (
		<div className={`tc-reaction-row ${align === 'end' ? 'is-end' : ''}`}>
			{Array.from(grouped.entries()).map(([emoji, groupedReactions]) => (
				<span
					key={emoji}
					className="tc-reaction-pill animate-pop-in"
					title={groupedReactions
						.map((reaction) => reaction.tooltip ?? reaction.fromAgent)
						.join(', ')}
				>
					<span className="tc-reaction-emoji">{emoji}</span>
					<span className="tc-reaction-count">{groupedReactions.length}</span>
					<span className="tc-reaction-people">
						{renderReactionPeople(emoji, groupedReactions)}
					</span>
				</span>
			))}
		</div>
	);
}

function renderReactionPeople(emoji: string, reactions: Reaction[]) {
	if (reactions.length === 0) return null;
	return reactions.slice(0, 3).map((r, i) => (
		<AgentAvatar key={`${r.fromAgent}-${emoji}`} name={r.fromAgent} color={r.fromColor} size="xs" />
	));
}
