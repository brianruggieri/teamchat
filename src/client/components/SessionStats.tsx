import React from 'react';
import type { ChatEvent, TaskInfo } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';

interface SessionStatsProps {
	events: ChatEvent[];
	tasks: TaskInfo[];
	sessionStart: string | null;
	memberCount: number;
}

export function SessionStats({
	events,
	tasks,
	sessionStart,
	memberCount,
}: SessionStatsProps) {
	const { formatDuration } = useRelativeTime();
	const contentMessages = events.filter((event) => event.type === 'message').length;
	const systemMessages = events.filter((event) => event.type === 'system').length;
	const dmThreads = countDMThreads(events);
	const completedTasks = tasks.filter((task) => task.status === 'completed').length;
	const duration = sessionStart ? formatDuration(sessionStart) : '--';
	const stats = [
		{ label: 'msgs', value: contentMessages },
		{ label: 'system', value: systemMessages },
		{ label: 'threads', value: dmThreads },
		{ label: 'done', value: `${completedTasks}/${tasks.length}` },
		{ label: 'team', value: memberCount > 0 ? memberCount : '--' },
	];

	return (
		<section className="tc-sidecard tc-session-panel">
			<div className="tc-sidecard-header">
				<h3 className="tc-sidecard-title">Session</h3>
				<span className="tc-sidecard-metric">{duration}</span>
			</div>
			<div className="tc-stats-strip">
				{stats.map((stat) => (
					<div key={stat.label} className="tc-stat-chip">
						<span className="tc-stat-label">{stat.label}</span>
						<span className="tc-stat-value">{stat.value}</span>
					</div>
				))}
			</div>
		</section>
	);
}

function countDMThreads(events: ChatEvent[]): number {
	const threadPairs = new Set<string>();
	for (const event of events) {
		if (event.type === 'thread-marker' && event.subtype === 'thread-start') {
			const key = [...event.participants].sort().join('<->');
			threadPairs.add(key);
		}
	}
	return threadPairs.size;
}
