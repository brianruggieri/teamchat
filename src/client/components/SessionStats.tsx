import React from 'react';
import type { ChatEvent, TaskInfo } from '../types.js';
import { formatDuration } from '../hooks/useRelativeTime.js';

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
	const contentMessages = events.filter((event) => event.type === 'message').length;
	const systemMessages = events.filter((event) => event.type === 'system').length;
	const dmThreads = countDMThreads(events);
	const completedTasks = tasks.filter((task) => task.status === 'completed').length;
	const duration = sessionStart ? formatDuration(sessionStart) : '--';

	return (
		<section className="tc-sidecard">
			<div className="tc-sidecard-header">
				<div>
					<h3 className="tc-sidecard-title">Session</h3>
					<p className="tc-sidecard-subtitle">Live browser and replay metrics</p>
				</div>
			</div>
			<div className="tc-stats-grid">
				<div className="tc-stat-cell">
					<span className="tc-stat-label">duration</span>
					<span className="tc-stat-value">{duration}</span>
				</div>
				<div className="tc-stat-cell">
					<span className="tc-stat-label">messages</span>
					<span className="tc-stat-value">{contentMessages}</span>
				</div>
				<div className="tc-stat-cell">
					<span className="tc-stat-label">system rows</span>
					<span className="tc-stat-value">{systemMessages}</span>
				</div>
				<div className="tc-stat-cell">
					<span className="tc-stat-label">DM threads</span>
					<span className="tc-stat-value">{dmThreads}</span>
				</div>
				<div className="tc-stat-cell">
					<span className="tc-stat-label">tasks done</span>
					<span className="tc-stat-value">
						{completedTasks}/{tasks.length}
					</span>
				</div>
				<div className="tc-stat-cell">
					<span className="tc-stat-label">agents</span>
					<span className="tc-stat-value">
						{memberCount > 0 ? memberCount - 1 : 0} + lead
					</span>
				</div>
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
