import React from 'react';
import type { SystemEvent as SystemEventType } from '../types.js';
import { getAgentColor } from '../types.js';

interface SystemEventProps {
	event: SystemEventType;
}

const SUBTYPE_ICONS: Record<string, string> = {
	'member-joined': '🟢',
	'member-left': '🔴',
	'task-created': '📋',
	'task-claimed': '✋',
	'task-completed': '✅',
	'task-failed': '❌',
	'task-unblocked': '🔓',
	'all-tasks-completed': '🎉',
	'shutdown-requested': '👑',
	'shutdown-approved': '👋',
	'shutdown-rejected': '🙅',
	'team-created': '🏗️',
	'team-deleted': '🏁',
	'idle-surfaced': '💤',
};

export function SystemEventComponent({ event }: SystemEventProps) {
	const icon = SUBTYPE_ICONS[event.subtype] ?? '•';
	const isHighlight = event.subtype === 'all-tasks-completed'
		|| event.subtype === 'team-created'
		|| event.subtype === 'team-deleted';

	const isCelebration = event.subtype === 'all-tasks-completed';

	return (
		<div
			className={`system-event animate-fade-in my-2 ${
				isHighlight ? 'py-3' : 'py-1'
			}`}
		>
			<div
				className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
					isCelebration
						? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
						: isHighlight
							? 'bg-surface-800 text-gray-300 border border-surface-700'
							: 'text-gray-500'
				}`}
			>
				<span>{icon}</span>
				<span>{event.text}</span>
			</div>
		</div>
	);
}
