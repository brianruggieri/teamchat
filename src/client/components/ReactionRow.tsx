import React from 'react';
import type { Reaction } from '../types.js';
import { getAgentColor } from '../types.js';

interface ReactionRowProps {
	reactions: Reaction[];
}

export function ReactionRow({ reactions }: ReactionRowProps) {
	if (reactions.length === 0) return null;

	// Group reactions by emoji
	const grouped = new Map<string, Reaction[]>();
	for (const r of reactions) {
		const existing = grouped.get(r.emoji) ?? [];
		existing.push(r);
		grouped.set(r.emoji, existing);
	}

	return (
		<div className="flex flex-wrap gap-1 mt-1">
			{Array.from(grouped.entries()).map(([emoji, reacts]) => (
				<span
					key={emoji}
					className="reaction-pill animate-pop-in"
					title={reacts.map((r) => r.tooltip ?? r.fromAgent).join(', ')}
				>
					<span>{emoji}</span>
					{reacts.map((r) => {
						const color = getAgentColor(r.fromColor);
						return (
							<span key={r.fromAgent} className={`${color.text} text-xs`}>
								{r.fromAgent}
							</span>
						);
					})}
				</span>
			))}
		</div>
	);
}
