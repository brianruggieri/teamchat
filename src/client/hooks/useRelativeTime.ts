import { useState, useEffect, useCallback } from 'react';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export function formatRelativeTime(timestamp: string): string {
	const now = Date.now();
	const then = new Date(timestamp).getTime();
	const diff = now - then;

	if (diff < MINUTE) {
		return 'just now';
	}
	if (diff < HOUR) {
		const mins = Math.floor(diff / MINUTE);
		return `${mins}m ago`;
	}
	// For >= 1hr, show absolute time
	const date = new Date(timestamp);
	return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatAbsoluteTime(timestamp: string): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatISOTooltip(timestamp: string): string {
	return new Date(timestamp).toISOString();
}

export function formatDuration(startISO: string): string {
	const now = Date.now();
	const start = new Date(startISO).getTime();
	const diff = now - start;

	if (diff < MINUTE) {
		return '<1m';
	}
	if (diff < HOUR) {
		return `${Math.floor(diff / MINUTE)}m`;
	}
	const hours = Math.floor(diff / HOUR);
	const mins = Math.floor((diff % HOUR) / MINUTE);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function useRelativeTime(interval: number = 30000) {
	const [, setTick] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => setTick((t) => t + 1), interval);
		return () => clearInterval(timer);
	}, [interval]);

	return { formatRelativeTime, formatAbsoluteTime, formatISOTooltip, formatDuration };
}
