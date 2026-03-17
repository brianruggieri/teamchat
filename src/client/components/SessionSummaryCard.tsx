import type { SystemEvent } from '../types.js';

interface SessionSummaryCardProps {
	event: SystemEvent;
	teamSize: number;
	tasksCompleted: number;
	tasksTotal: number;
	threadsResolved: number;
	threadsTotal: number;
	sessionStart: string | null;
}

export function SessionSummaryCard({
	event, teamSize, tasksCompleted, tasksTotal,
	threadsResolved, threadsTotal, sessionStart,
}: SessionSummaryCardProps) {
	const duration = sessionStart
		? formatDuration(new Date(event.timestamp).getTime() - new Date(sessionStart).getTime())
		: null;

	return (
		<div className="tc-system-row">
			<div className="tc-system-card is-summary" style={{
				background: 'linear-gradient(135deg, rgba(42, 208, 108, 0.08), rgba(91, 109, 247, 0.08))',
				border: '1px solid rgba(42, 208, 108, 0.2)',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
					<span style={{ fontSize: '1.2rem' }}>📊</span>
					<span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Session Complete</span>
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
					{duration && (
						<div>
							<div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', textTransform: 'uppercase' }}>Duration</div>
							<div>{duration}</div>
						</div>
					)}
					<div>
						<div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', textTransform: 'uppercase' }}>Agents</div>
						<div>{teamSize}</div>
					</div>
					<div>
						<div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', textTransform: 'uppercase' }}>Tasks</div>
						<div>{tasksCompleted}/{tasksTotal} completed</div>
					</div>
					<div>
						<div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', textTransform: 'uppercase' }}>Threads</div>
						<div>{threadsResolved}/{threadsTotal} resolved</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function formatDuration(ms: number): string {
	const mins = Math.floor(ms / 60000);
	if (mins < 60) return `${mins}m`;
	const hrs = Math.floor(mins / 60);
	return `${hrs}h ${mins % 60}m`;
}
