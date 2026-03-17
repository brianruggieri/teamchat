import React from 'react';
import type { ThreadStatus } from '../types.js';

interface ThreadSummaryProps {
	threadStatuses: Record<string, ThreadStatus>;
	onThreadClick?: (threadKey: string) => void;
}

export function ThreadSummary({ threadStatuses, onThreadClick }: ThreadSummaryProps) {
	const threads = Object.values(threadStatuses);
	if (threads.length === 0) return null;
	const active = threads.filter((t) => t.status !== 'resolved').length;
	const resolved = threads.filter((t) => t.status === 'resolved').length;

	return (
		<section className="tc-sidecard tc-rail-section">
			<div className="tc-sidecard-header">
				<span className="tc-sidecard-title">Threads</span>
				<div style={{ display: 'flex', gap: 8, fontSize: '0.72rem' }}>
					{active > 0 && <span style={{ color: '#ffd38b' }}>{active} active</span>}
					{resolved > 0 && <span style={{ color: '#8ef2b4' }}>{resolved} resolved</span>}
				</div>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
				{threads.map((thread) => (
					<button
						key={thread.threadKey}
						type="button"
						onClick={() => onThreadClick?.(thread.threadKey)}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							padding: '4px 6px',
							background: 'var(--surface-card)',
							borderRadius: 6,
							border: 'none',
							borderLeft: `2px solid ${thread.status === 'resolved' ? '#8ef2b4' : '#ffd38b'}`,
							opacity: thread.status === 'resolved' ? 0.6 : 1,
							cursor: 'pointer',
							width: '100%',
							textAlign: 'left',
							color: 'inherit',
							font: 'inherit',
						}}
					>
						<span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
							{thread.participants.join(' ↔ ')}
						</span>
						<span style={{
							marginLeft: 'auto',
							fontSize: '0.66rem',
							color: thread.status === 'resolved' ? '#8ef2b4' : '#ffd38b',
						}}>
							{thread.status === 'resolved' ? '✅' : '●'} {thread.messageCount} msgs
						</span>
					</button>
				))}
			</div>
		</section>
	);
}
