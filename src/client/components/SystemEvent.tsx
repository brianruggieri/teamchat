import React from 'react';
import type { SystemEvent as SystemEventType } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import { AgentAvatar } from './AgentAvatar.jsx';

interface SystemEventProps {
	event: SystemEventType;
}

const SUBTYPE_META: Record<string, { icon: string; label: string; tone: string }> = {
	'member-joined': { icon: '👋', label: 'joined', tone: 'positive' },
	'member-left': { icon: '←', label: 'left', tone: 'neutral' },
	'task-created': { icon: '📋', label: 'task', tone: 'neutral' },
	'task-claimed': { icon: '✋', label: 'claimed', tone: 'accent' },
	'task-completed': { icon: '✅', label: 'complete', tone: 'positive' },
	'task-failed': { icon: '❌', label: 'failed', tone: 'danger' },
	'task-unblocked': { icon: '🔓', label: 'unblocked', tone: 'accent' },
	'all-tasks-completed': { icon: '🎉', label: 'milestone', tone: 'celebration' },
	'shutdown-requested': { icon: '⏹', label: 'shutdown', tone: 'warning' },
	'shutdown-approved': { icon: '👋', label: 'goodbye', tone: 'neutral' },
	'shutdown-rejected': { icon: '🚫', label: 'rejected', tone: 'danger' },
	'team-created': { icon: '🚀', label: 'launched', tone: 'accent' },
	'team-deleted': { icon: '💀', label: 'deleted', tone: 'danger' },
	'idle-surfaced': { icon: '💤', label: 'idle', tone: 'neutral' },
	'nudge': { icon: '👉', label: 'nudge', tone: 'warning' },
	'bottleneck': { icon: '🔴', label: 'bottleneck', tone: 'danger' },
	'session-summary': { icon: '📊', label: 'summary', tone: 'celebration' },
};

export function SystemEventComponent({ event }: SystemEventProps) {
	const { formatAbsoluteTime, formatISOTooltip } = useRelativeTime();
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
				<div className="tc-system-card-body">
					{event.agentName && event.agentColor && (
						<AgentAvatar name={event.agentName} color={event.agentColor} size="sm" />
					)}
					<div className="tc-system-card-content">
						<div className="tc-system-header">
							<span className="tc-system-icon">{meta.icon}</span>
							<span className="tc-system-label">{meta.label}</span>
							{event.taskId && (
								<span className="tc-system-chip">#{event.taskId}</span>
							)}
						</div>
						<div className="tc-system-text">{event.text}</div>
						<div className="tc-system-meta">
							{event.taskSubject ?? (!event.agentColor ? event.agentName : null) ?? 'system'}
							<span
								className="tc-system-time"
								title={formatISOTooltip(event.timestamp)}
							>
								{formatAbsoluteTime(event.timestamp)}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
