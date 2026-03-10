import React from 'react';
import type { TaskInfo } from '../types.js';
import { formatDuration } from '../hooks/useRelativeTime.js';

interface TaskCardProps {
	task: TaskInfo;
	onTaskClick: (taskId: string) => void;
	isPulsing?: boolean;
}

const STATUS_ICONS: Record<string, string> = {
	pending: '⏳',
	in_progress: '🔵',
	completed: '✅',
	failed: '❌',
};

export function TaskCard({ task, onTaskClick, isPulsing = false }: TaskCardProps) {
	const icon = STATUS_ICONS[task.status] ?? '⏳';
	const isBlocked = task.status === 'pending' && task.blockedBy && task.blockedBy.length > 0;

	return (
		<div
			className={`task-card ${isPulsing ? 'pulse' : ''}`}
			onClick={() => onTaskClick(task.id)}
			title={task.description ?? task.subject}
		>
			<span className="flex-shrink-0">{icon}</span>
			<div className="flex-1 min-w-0">
				<div className="flex items-baseline gap-1.5">
					<span className="text-xs text-gray-500">#{task.id}</span>
					<span className="text-sm text-gray-200 truncate">{task.subject}</span>
				</div>
				<div className="flex items-center gap-2 mt-0.5">
					{task.owner && (
						<span className="text-xs text-gray-500">
							→ {task.owner}
						</span>
					)}
					{task.status === 'in_progress' && task.updated && (
						<span className="text-xs text-gray-600">
							{formatDuration(task.updated)}
						</span>
					)}
					{isBlocked && (
						<span className="text-xs text-yellow-600">
							blocked by {task.blockedBy!.map((id) => `#${id}`).join(', ')}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
