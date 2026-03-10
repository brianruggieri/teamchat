import React from 'react';
import type { ChatEvent, TaskInfo } from '../types.js';
import { formatDuration } from '../hooks/useRelativeTime.js';

interface SessionStatsProps {
	events: ChatEvent[];
	tasks: TaskInfo[];
	sessionStart: string | null;
	memberCount: number;
}

export function SessionStats({ events, tasks, sessionStart, memberCount }: SessionStatsProps) {
	const contentMessages = events.filter((e) => e.type === 'message').length;
	const systemMessages = events.filter((e) => e.type === 'system').length;
	const dmThreads = countDMThreads(events);
	const completedTasks = tasks.filter((t) => t.status === 'completed').length;
	const duration = sessionStart ? formatDuration(sessionStart) : '--';

	return (
		<div className="px-4 py-3 border-t border-surface-800 text-xs text-gray-500">
			<div className="grid grid-cols-2 gap-y-1.5">
				<span>Duration: {duration}</span>
				<span>Messages: {contentMessages} + {systemMessages} sys</span>
				<span>DM threads: {dmThreads}</span>
				<span>Tasks: {completedTasks}/{tasks.length}</span>
				<span>Agents: {memberCount > 0 ? memberCount - 1 : 0} + lead</span>
			</div>
		</div>
	);
}

function countDMThreads(events: ChatEvent[]): number {
	const threadPairs = new Set<string>();
	for (const event of events) {
		if (event.type === 'thread-marker' && event.subtype === 'thread-start') {
			const key = event.participants.sort().join('↔');
			threadPairs.add(key);
		}
	}
	return threadPairs.size;
}
