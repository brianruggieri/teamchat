import React from 'react';
import type { SystemEvent as SystemEventType } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import { AgentAvatar } from './AgentAvatar.jsx';

interface SystemEventProps {
	event: SystemEventType;
	inline?: boolean;
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

/**
 * Returns compact event text that omits the agent name when an avatar is present.
 * The avatar already identifies who — so the text focuses on what happened.
 * For task events with a chip in the header, we show the task subject instead.
 */
function getCompactText(event: SystemEventType): string {
	const { subtype, text, agentName, taskId, taskSubject } = event;

	// If no agent name, keep original text (no avatar to provide identity)
	if (!agentName) return text;

	switch (subtype) {
		case 'member-joined':
			return 'joined the chat';
		case 'member-left':
			return 'left the chat';
		case 'task-claimed':
			// Header shows "✋ claimed #N" — text shows the task subject
			if (taskSubject) return taskSubject;
			return taskId ? `claimed #${taskId}` : text;
		case 'task-completed':
			// Header shows "✅ complete #N" — text shows the task subject
			if (taskSubject) return taskSubject;
			return taskId ? `completed #${taskId}` : text;
		case 'task-failed':
			if (taskSubject) return taskSubject;
			return taskId ? `failed #${taskId}` : text;
		case 'idle-surfaced':
			return 'idle: available';
		case 'nudge': {
			// "team-lead nudged testing" → for the nudged agent: "nudged by team-lead"
			const match = text.match(/^(\S+)\s+nudged/);
			return match ? `nudged by ${match[1]}` : text;
		}
		case 'bottleneck': {
			// "schema is a bottleneck — tester, gateway waiting" → "bottleneck — tester, gateway waiting"
			return text.replace(new RegExp(`^${agentName}\\s+is\\s+a\\s+`, 'i'), '');
		}
		case 'shutdown-requested':
			return 'asked to leave';
		case 'shutdown-approved':
			return 'left the chat';
		default:
			return text;
	}
}

export function SystemEventComponent({ event, inline }: SystemEventProps) {
	const { formatAbsoluteTime, formatISOTooltip } = useRelativeTime();
	const meta = SUBTYPE_META[event.subtype] ?? {
		icon: '.',
		label: 'system',
		tone: 'neutral',
	};
	const hasAvatar = !!event.agentName;
	const compactText = getCompactText(event);

	if (inline) {
		return (
			<div className="tc-system-inline">
				<span className="tc-system-icon">{meta.icon}</span>
				{event.agentName && (
					<span className="tc-system-agent" style={{ color: event.agentColor ?? undefined }}>
						{event.agentName}
					</span>
				)}
				<span>{compactText}</span>
				<span className="tc-system-time">{formatAbsoluteTime(event.timestamp)}</span>
			</div>
		);
	}

	return (
		<div
			className="tc-system-row"
			data-task-id={event.taskId ?? undefined}
		>
			<div className={`tc-system-card is-${meta.tone}`}>
				<div className="tc-system-card-body">
					{hasAvatar && (
						<AgentAvatar name={event.agentName!} color={event.agentColor ?? 'gray'} size="sm" />
					)}
					<div className="tc-system-card-content">
						<div className="tc-system-header">
							<span className="tc-system-icon">{meta.icon}</span>
							<span className="tc-system-label">{meta.label}</span>
							{event.taskId && (
								<span className="tc-system-chip">#{event.taskId}</span>
							)}
						</div>
						<div className="tc-system-text">{compactText}</div>
						<div className="tc-system-meta">
							{!hasAvatar && (event.taskSubject ?? event.agentName ?? 'system')}
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
