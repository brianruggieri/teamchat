import React, { useState } from 'react';
import type { SystemEvent } from '../types.js';

interface SetupCardProps {
	events: SystemEvent[];
}

export function SetupCard({ events }: SetupCardProps) {
	const [expanded, setExpanded] = useState(false);
	const taskCount = events.filter(e => e.subtype === 'task-created').length;
	const claimCount = events.filter(e => e.subtype === 'task-claimed').length;
	const memberCount = events.filter(e => e.subtype === 'member-joined').length;

	const parts: string[] = [];
	if (taskCount > 0) parts.push(`${taskCount} tasks created`);
	if (claimCount > 0) parts.push(`${claimCount} claimed`);
	if (memberCount > 0) parts.push(`${memberCount} joined`);

	return (
		<div className="tc-system-card is-accent tc-setup-card">
			<button type="button" className="tc-setup-card-toggle" onClick={() => setExpanded(!expanded)}>
				<span className="tc-setup-card-icon">📋</span>
				<span className="tc-setup-card-label">
					{parts.length > 0 ? parts.join(', ') : 'Session setup'}
				</span>
				<span className="tc-setup-card-chevron">{expanded ? '▾' : '▸'}</span>
			</button>
			{expanded && (
				<div className="tc-setup-card-detail">
					{events.map(e => (
						<div key={e.id} className="tc-setup-card-item">{e.text}</div>
					))}
				</div>
			)}
		</div>
	);
}
