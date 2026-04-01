import React from 'react';
import type { AgentHeartbeat } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import { getAgentColorValues } from '../types.js';

interface HeartbeatRowProps {
	event: AgentHeartbeat;
}

export function HeartbeatRow({ event }: HeartbeatRowProps) {
	const { formatAbsoluteTime, formatISOTooltip } = useRelativeTime();
	const colorValues = getAgentColorValues(event.agentColor);

	return (
		<div className="tc-heartbeat-row">
			<span className="tc-heartbeat-icon">🔨</span>
			<span
				className="tc-heartbeat-agent"
				style={{ color: colorValues.light }}
			>
				{event.agentName}
			</span>
			<span className="tc-heartbeat-dot">&middot;</span>
			<span className="tc-heartbeat-activities">{event.activities}</span>
			<span className="tc-heartbeat-ops">({event.opCount} ops)</span>
			<span
				className="tc-heartbeat-time"
				title={formatISOTooltip(event.timestamp)}
			>
				{formatAbsoluteTime(event.timestamp)}
			</span>
		</div>
	);
}
