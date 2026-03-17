import React, { useEffect, useRef, useState } from 'react';
import type { TaskInfo } from '../types.js';
import { TaskCard } from './TaskCard.jsx';

interface TaskSidebarProps {
	tasks: TaskInfo[];
	onTaskClick: (taskId: string) => void;
}

export function TaskSidebar({ tasks, onTaskClick }: TaskSidebarProps) {
	const [recentlyUnblocked, setRecentlyUnblocked] = useState<Set<string>>(new Set());
	const prevTasks = useRef<TaskInfo[]>([]);

	useEffect(() => {
		const prevMap = new Map(prevTasks.current.map((task) => [task.id, task]));
		const newlyUnblocked: string[] = [];

		for (const task of tasks) {
			const prevTask = prevMap.get(task.id);
			if (
				prevTask
				&& prevTask.blockedBy
				&& prevTask.blockedBy.length > 0
				&& task.status === 'pending'
			) {
				const allBlockersCompleted = prevTask.blockedBy.every((blockerId) => {
					const blocker = tasks.find((candidate) => candidate.id === blockerId);
					return blocker?.status === 'completed';
				});
				const prevAllCompleted = prevTask.blockedBy.every((blockerId) => {
					const blocker = prevTasks.current.find(
						(candidate) => candidate.id === blockerId
					);
					return blocker?.status === 'completed';
				});
				if (allBlockersCompleted && !prevAllCompleted) {
					newlyUnblocked.push(task.id);
				}
			}
		}

		let timerId: ReturnType<typeof setTimeout> | undefined;

		if (newlyUnblocked.length > 0) {
			setRecentlyUnblocked((previous) => {
				const next = new Set(previous);
				for (const taskId of newlyUnblocked) {
					next.add(taskId);
				}
				return next;
			});

			timerId = setTimeout(() => {
				setRecentlyUnblocked((previous) => {
					const next = new Set(previous);
					for (const taskId of newlyUnblocked) {
						next.delete(taskId);
					}
					return next;
				});
			}, 3000);
		}

		prevTasks.current = tasks;

		return () => {
			if (timerId !== undefined) {
				clearTimeout(timerId);
			}
		};
	}, [tasks]);

	const completedTasks = tasks.filter((task) => task.status === 'completed').length;
	const totalTasks = tasks.length;
	const activeTasks = tasks.filter((task) => task.status === 'in_progress').length;
	const blockedTasks = tasks.filter(
		(task) => task.status === 'pending' && task.blockedBy && task.blockedBy.length > 0
	).length;
	const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	return (
		<section className="tc-sidecard tc-task-panel">
			<div className="tc-sidecard-header">
				<h3 className="tc-sidecard-title">Tasks</h3>
				<span className="tc-sidecard-metric">
					{completedTasks}/{totalTasks}
				</span>
			</div>
			<div className="tc-sidecard-inline-meta">
				<span>{activeTasks} active</span>
				<span>{blockedTasks} blocked</span>
				<span>{pct}% complete</span>
			</div>
			<div className="tc-progress-track">
				<div
					className="tc-progress-fill"
					style={{ width: `${pct}%` }}
				/>
			</div>
			{totalTasks > 0 && (
				<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
					<div style={{ flex: 1, height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
						<div style={{ width: `${(completedTasks / totalTasks) * 100}%`, height: '100%',
							background: 'linear-gradient(90deg, #22c55e, #3b82f6)', borderRadius: 2 }} />
					</div>
					<span style={{ fontSize: '0.66rem', color: '#475569' }}>{completedTasks}/{totalTasks}</span>
				</div>
			)}
			<div className="tc-task-list">
				{tasks.length === 0 ? (
					<div className="tc-sidecard-empty">No correlated tasks yet.</div>
				) : (
					tasks.map((task) => (
						<TaskCard
							key={task.id}
							task={task}
							onTaskClick={onTaskClick}
							isPulsing={recentlyUnblocked.has(task.id)}
						/>
					))
				)}
			</div>
		</section>
	);
}
