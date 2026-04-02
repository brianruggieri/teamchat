import React from 'react';
import type { SystemEvent } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';

interface CascadeCardProps {
	completion: SystemEvent;
	unblocks: SystemEvent[];
	claims: SystemEvent[];
}

export function CascadeCard({ completion, unblocks, claims }: CascadeCardProps) {
	const { formatAbsoluteTime, formatISOTooltip } = useRelativeTime();

	const agentLabel = completion.agentName ?? 'unknown';
	const taskLabel = completion.taskId ? `#${completion.taskId}` : null;
	const subject = completion.taskSubject ?? completion.text;

	return (
		<div className="tc-cascade-card">
			<div className="tc-cascade-header">
				<span className="tc-cascade-icon">✅</span>
				<span
					className="tc-cascade-agent"
					style={{ color: completion.agentColor ?? undefined }}
				>
					{agentLabel}
				</span>
				{taskLabel && <span className="tc-cascade-chip">{taskLabel}</span>}
				<span className="tc-cascade-subject">{subject}</span>
				<time
					className="tc-cascade-time"
					title={formatISOTooltip(completion.timestamp)}
				>
					{formatAbsoluteTime(completion.timestamp)}
				</time>
			</div>

			{unblocks.length > 0 && (
				<ul className="tc-cascade-unblocks">
					{unblocks.map((u) => {
						const claimForTask = claims.find((c) => c.taskId === u.taskId);
						return (
							<li key={u.id} className="tc-cascade-unblock-item">
								<span className="tc-cascade-unblock-icon">🔓</span>
								{u.taskId && (
									<span className="tc-cascade-chip">#{u.taskId}</span>
								)}
								<span className="tc-cascade-unblock-subject">
									{u.taskSubject ?? u.text}
								</span>
								{claimForTask && (
									<span className="tc-cascade-claim">
										<span>✋</span>
										<span
											style={{ color: claimForTask.agentColor ?? undefined }}
										>
											{claimForTask.agentName}
										</span>
									</span>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
