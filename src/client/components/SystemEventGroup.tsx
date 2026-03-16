import React, { useMemo, useState } from 'react';
import type { SystemEvent } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';

interface SystemEventGroupProps {
	subtype: 'member-joined' | 'task-created' | 'task-claimed';
	events: SystemEvent[];
}

export function SystemEventGroup({
	subtype,
	events,
}: SystemEventGroupProps) {
	const [collapsed, setCollapsed] = useState(true);
	const { formatAbsoluteTime, formatISOTooltip } = useRelativeTime();
	const detailId = useMemo(
		() => `tc-system-group-${events[0]?.id ?? subtype}`,
		[events, subtype]
	);
	const taskIds = useMemo(
		() => events
			.map((event) => event.taskId)
			.filter((taskId): taskId is string => Boolean(taskId))
			.join(' '),
		[events]
	);
	const preview = useMemo(() => {
		if (subtype === 'member-joined') {
			const members = events
				.map((event) => event.agentName)
				.filter((name): name is string => Boolean(name));
			return members.slice(0, 3).join(', ');
		}

		const subjects = events
			.map((event) => event.taskSubject ?? event.taskId)
			.filter((value): value is string => Boolean(value));
		return subjects.slice(0, 2).join(' · ');
	}, [events, subtype]);

	const title = subtype === 'member-joined'
		? `${events.length} ${events.length === 1 ? 'member joined' : 'members joined'}`
		: subtype === 'task-claimed'
			? `${events.length} ${events.length === 1 ? 'task claimed' : 'tasks claimed'}`
			: `${events.length} ${events.length === 1 ? 'task created' : 'tasks created'}`;
	const icon = subtype === 'member-joined' ? '🟢' : subtype === 'task-claimed' ? '✋' : '📋';

	return (
		<section className="tc-system-group">
			<button
				type="button"
				className="tc-system-group-toggle"
				onClick={() => setCollapsed(!collapsed)}
				aria-expanded={!collapsed}
				aria-controls={detailId}
				data-task-ids={taskIds || undefined}
			>
				<span className="tc-system-group-icon" aria-hidden="true">{icon}</span>
				<span className="tc-system-group-copy">
					<span className="tc-system-group-title">{title}</span>
					{preview && (
						<span className="tc-system-group-preview">{preview}</span>
					)}
				</span>
				<span className={`tc-system-group-chevron ${collapsed ? '' : 'is-open'}`}>
					▸
				</span>
			</button>
			<div
				id={detailId}
				className={`tc-system-group-details ${collapsed ? 'is-collapsed' : ''}`}
			>
				{events.map((event) => (
					<div
						key={event.id}
						className="tc-system-group-item"
						data-task-id={event.taskId ?? undefined}
					>
						<div className="tc-system-group-item-main">
							<div className="tc-system-group-item-text">{event.text}</div>
							{event.taskSubject && (
								<div className="tc-system-group-item-meta">
									{event.taskSubject}
								</div>
							)}
						</div>
						<time
							className="tc-system-group-item-time"
							title={formatISOTooltip(event.timestamp)}
						>
							{formatAbsoluteTime(event.timestamp)}
						</time>
					</div>
				))}
			</div>
		</section>
	);
}
