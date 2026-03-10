import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const TimeContext = createContext<number>(Date.now());

export function formatRelativeTime(timestamp: string, nowMs: number = Date.now()): string {
	const then = new Date(timestamp).getTime();
	const diff = nowMs - then;

	if (diff < MINUTE) {
		return 'just now';
	}
	if (diff < HOUR) {
		const mins = Math.floor(diff / MINUTE);
		return `${mins}m ago`;
	}
	return formatAbsoluteTime(timestamp);
}

export function formatAbsoluteTime(timestamp: string): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatISOTooltip(timestamp: string): string {
	return new Date(timestamp).toISOString();
}

export function formatDuration(startISO: string, nowMs: number = Date.now()): string {
	const start = new Date(startISO).getTime();
	const diff = nowMs - start;

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

export function TimeProvider({
	nowMs,
	children,
	interval = 30000,
}: {
	nowMs?: number;
	children: React.ReactNode;
	interval?: number;
}) {
	const [liveNowMs, setLiveNowMs] = useState(nowMs ?? Date.now());
	const value = nowMs ?? liveNowMs;

	useEffect(() => {
		if (typeof nowMs === 'number') {
			return undefined;
		}

		const timer = setInterval(() => setLiveNowMs(Date.now()), interval);
		return () => clearInterval(timer);
	}, [interval, nowMs]);

	useEffect(() => {
		if (typeof nowMs === 'number') {
			setLiveNowMs(nowMs);
		}
	}, [nowMs]);

	return React.createElement(TimeContext.Provider, { value }, children);
}

export function useRelativeTime() {
	const nowMs = useContext(TimeContext);

	return useMemo(() => ({
		nowMs,
		formatRelativeTime: (timestamp: string) => formatRelativeTime(timestamp, nowMs),
		formatAbsoluteTime,
		formatISOTooltip,
		formatDuration: (timestamp: string) => formatDuration(timestamp, nowMs),
	}), [nowMs]);
}
