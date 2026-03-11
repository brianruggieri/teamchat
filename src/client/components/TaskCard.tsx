import React from 'react';
import type { TaskInfo } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';

interface TaskCardProps {
	task: TaskInfo;
	onTaskClick: (taskId: string) => void;
	isPulsing?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
	pending: 'pending',
	in_progress: 'active',
	completed: 'done',
	failed: 'failed',
};

export function TaskCard({
	task,
	onTaskClick,
	isPulsing = false,
}: TaskCardProps) {
	const { formatDuration } = useRelativeTime();
	const isBlocked = task.status === 'pending'
		&& task.blockedBy
		&& task.blockedBy.length > 0;

	return (
		<button
			type="button"
			className={`tc-task-card ${isPulsing ? 'pulse' : ''}`}
			onClick={() => onTaskClick(task.id)}
			title={task.description ?? task.subject}
		>
			<div className="tc-task-card-header">
				<div className={`tc-task-state-dot is-${task.status}`} />
				<div className="tc-task-card-main">
					<div className="tc-task-card-subject">{task.subject}</div>
					<div className="tc-task-card-id">#{task.id}</div>
				</div>
				<span className={`tc-status-pill is-${task.status}`}>
					{STATUS_LABELS[task.status] ?? task.status}
				</span>
			</div>
			<div className="tc-task-card-meta">
				<span>{task.owner ?? 'unassigned'}</span>
				{isBlocked ? (
					<span>
						blocked by {task.blockedBy!.map((taskId) => `#${taskId}`).join(', ')}
					</span>
				) : task.status === 'in_progress' && task.updated ? (
					<span>{formatDuration(task.updated)}</span>
				) : null}
			</div>
		</button>
	);
}
