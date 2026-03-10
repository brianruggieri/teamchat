import React, { useState, useEffect, useRef } from 'react';
import type { TaskInfo } from '../types.js';
import { TaskCard } from './TaskCard.jsx';

interface TaskSidebarProps {
	tasks: TaskInfo[];
	onTaskClick: (taskId: string) => void;
}

export function TaskSidebar({ tasks, onTaskClick }: TaskSidebarProps) {
	const [recentlyUnblocked, setRecentlyUnblocked] = useState<Set<string>>(new Set());
	const prevTasks = useRef<TaskInfo[]>([]);

	// Detect task unblocks for pulse animation
	useEffect(() => {
		const prevMap = new Map(prevTasks.current.map((t) => [t.id, t]));
		const newlyUnblocked: string[] = [];

		for (const task of tasks) {
			const prev = prevMap.get(task.id);
			if (prev && prev.status === 'pending' && task.status !== 'pending') {
				// Status changed from pending — might be unblocked
			}
			// A task is "unblocked" if it was blocked (had blockedBy) and now its
			// blocking tasks are all completed
			if (
				prev &&
				prev.blockedBy &&
				prev.blockedBy.length > 0 &&
				task.status === 'pending'
			) {
				const allBlockersCompleted = prev.blockedBy.every((blockerId) => {
					const blocker = tasks.find((t) => t.id === blockerId);
					return blocker && blocker.status === 'completed';
				});
				const prevAllCompleted = prev.blockedBy.every((blockerId) => {
					const blocker = prevTasks.current.find((t) => t.id === blockerId);
					return blocker && blocker.status === 'completed';
				});
				if (allBlockersCompleted && !prevAllCompleted) {
					newlyUnblocked.push(task.id);
				}
			}
		}

		if (newlyUnblocked.length > 0) {
			setRecentlyUnblocked((prev) => {
				const next = new Set(prev);
				for (const id of newlyUnblocked) next.add(id);
				return next;
			});
			// Clear pulse after 3 seconds
			setTimeout(() => {
				setRecentlyUnblocked((prev) => {
					const next = new Set(prev);
					for (const id of newlyUnblocked) next.delete(id);
					return next;
				});
			}, 3000);
		}

		prevTasks.current = tasks;
	}, [tasks]);

	const completed = tasks.filter((t) => t.status === 'completed').length;
	const total = tasks.length;
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

	return (
		<div className="sidebar-section">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
					📋 Tasks
				</h3>
				<span className="text-xs text-gray-500">
					{completed}/{total}
				</span>
			</div>

			{/* Progress bar */}
			<div className="progress-bar-track mb-3">
				<div
					className="progress-bar-fill"
					style={{ width: `${pct}%` }}
				/>
			</div>

			{/* Task list */}
			<div className="space-y-0.5">
				{tasks.map((task) => (
					<TaskCard
						key={task.id}
						task={task}
						onTaskClick={onTaskClick}
						isPulsing={recentlyUnblocked.has(task.id)}
					/>
				))}
			</div>
		</div>
	);
}
