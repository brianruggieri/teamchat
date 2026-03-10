import React from 'react';
import type { SystemEvent as SystemEventType } from '../types.js';
import {
	formatAbsoluteTime,
	formatISOTooltip,
} from '../hooks/useRelativeTime.js';

interface SystemEventProps {
	event: SystemEventType;
}

const SUBTYPE_META: Record<string, { icon: string; label: string; tone: string }> = {
	'member-joined': { icon: '+', label: 'join', tone: 'positive' },
	'member-left': { icon: '-', label: 'leave', tone: 'danger' },
	'task-created': { icon: '#', label: 'task', tone: 'neutral' },
	'task-claimed': { icon: '>', label: 'claim', tone: 'accent' },
	'task-completed': { icon: '*', label: 'complete', tone: 'positive' },
	'task-failed': { icon: '!', label: 'failed', tone: 'danger' },
	'task-unblocked': { icon: '^', label: 'unblocked', tone: 'accent' },
	'all-tasks-completed': { icon: '*', label: 'milestone', tone: 'celebration' },
	'shutdown-requested': { icon: '>', label: 'shutdown', tone: 'warning' },
	'shutdown-approved': { icon: '*', label: 'shutdown', tone: 'neutral' },
	'shutdown-rejected': { icon: 'x', label: 'shutdown', tone: 'danger' },
	'team-created': { icon: '+', label: 'team', tone: 'accent' },
	'team-deleted': { icon: '-', label: 'team', tone: 'danger' },
	'idle-surfaced': { icon: '~', label: 'idle', tone: 'neutral' },
};

export function SystemEventComponent({ event }: SystemEventProps) {
	const meta = SUBTYPE_META[event.subtype] ?? {
		icon: '.',
		label: 'system',
		tone: 'neutral',
	};

	return (
		<div
			className="tc-system-row"
			data-task-id={event.taskId ?? undefined}
		>
			<div className={`tc-system-card is-${meta.tone}`}>
				<div className="tc-system-header">
					<span className="tc-system-icon">{meta.icon}</span>
					<span className="tc-system-label">{meta.label}</span>
					{event.taskId && (
						<span className="tc-system-chip">#{event.taskId}</span>
					)}
				</div>
				<div className="tc-system-text">{event.text}</div>
				<div className="tc-system-meta">
					{event.taskSubject ?? event.agentName ?? 'system'}
					<span
						className="tc-system-time"
						title={formatISOTooltip(event.timestamp)}
					>
						{formatAbsoluteTime(event.timestamp)}
					</span>
				</div>
			</div>
		</div>
	);
}
