import { useEffect, useRef, useCallback } from 'react';
import type { ChatAction } from '../types.js';
import type { ChatEvent, SessionState } from '../../shared/types.js';

const STATE_URL = `/state`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

/** Delay between dispatching simultaneous events (ms) */
const STAGGER_DELAY = 120;

/**
 * Events that arrive within this window (ms) of each other are considered
 * "simultaneous" and get staggered for visual smoothness.
 */
const SAME_BATCH_WINDOW = 500;

export function useWebSocket(
	dispatch: React.Dispatch<ChatAction>,
	wsUrl: string = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
) {
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectAttempt = useRef(0);
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const eventQueue = useRef<ChatEvent[]>([]);
	const drainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastDispatchTime = useRef(0);

	const drainQueue = useCallback(() => {
		drainTimer.current = null;
		const event = eventQueue.current.shift();
		if (!event) return;

		// Show typing indicator briefly before content messages
		if (event.type === 'message') {
			dispatch({ type: 'TYPING_START', event });
			setTimeout(() => {
				dispatch({ type: 'TYPING_STOP' });
				dispatch({ type: 'EVENT', event });
				lastDispatchTime.current = Date.now();
				if (eventQueue.current.length > 0) {
					drainTimer.current = setTimeout(drainQueue, STAGGER_DELAY);
				}
			}, 350);
		} else {
			dispatch({ type: 'EVENT', event });
			lastDispatchTime.current = Date.now();
			if (eventQueue.current.length > 0) {
				drainTimer.current = setTimeout(drainQueue, STAGGER_DELAY);
			}
		}
	}, [dispatch]);

	const enqueueEvents = useCallback((events: ChatEvent[]) => {
		const now = Date.now();
		const timeSinceLastDispatch = now - lastDispatchTime.current;

		// If only one event and nothing is queued and we haven't dispatched recently,
		// deliver immediately (no stagger needed for isolated events)
		if (events.length === 1 && eventQueue.current.length === 0 && timeSinceLastDispatch > SAME_BATCH_WINDOW) {
			const event = events[0]!;
			if (event.type === 'message') {
				dispatch({ type: 'TYPING_START', event });
				setTimeout(() => {
					dispatch({ type: 'TYPING_STOP' });
					dispatch({ type: 'EVENT', event });
					lastDispatchTime.current = Date.now();
				}, 350);
			} else {
				dispatch({ type: 'EVENT', event });
				lastDispatchTime.current = now;
			}
			return;
		}

		// Multiple events or rapid succession — queue and stagger
		eventQueue.current.push(...events);
		if (!drainTimer.current) {
			drainTimer.current = setTimeout(drainQueue, STAGGER_DELAY);
		}
	}, [dispatch, drainQueue]);

	const connect = useCallback(async () => {
		// Server sends { type: "init", state: SessionState } on WS connect,
		// so we don't need a separate REST fetch. GET /state is available
		// as a fallback if the WS init message is missed.
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			reconnectAttempt.current = 0;
			dispatch({ type: 'CONNECTION_CHANGE', connected: true });
		};

		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data) as { type: string; state?: SessionState; events?: ChatEvent[] };
				if (msg.type === 'init' && msg.state) {
					dispatch({ type: 'HYDRATE', state: msg.state });
				} else if (msg.type === 'events' && msg.events) {
					enqueueEvents(msg.events);
				}
			} catch {
				// Ignore malformed messages
			}
		};

		ws.onclose = () => {
			dispatch({ type: 'CONNECTION_CHANGE', connected: false });
			scheduleReconnect();
		};

		ws.onerror = () => {
			ws.close();
		};
	}, [dispatch, wsUrl]);

	const scheduleReconnect = useCallback(() => {
		const delay = RECONNECT_DELAYS[
			Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)
		];
		reconnectAttempt.current++;
		reconnectTimer.current = setTimeout(() => {
			connect();
		}, delay);
	}, [connect]);

	useEffect(() => {
		connect();
		return () => {
			if (reconnectTimer.current) {
				clearTimeout(reconnectTimer.current);
			}
			if (drainTimer.current) {
				clearTimeout(drainTimer.current);
			}
			if (wsRef.current) {
				wsRef.current.close();
			}
		};
	}, [connect]);
}
