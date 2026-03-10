import { useEffect, useRef, useCallback } from 'react';
import type { ChatAction } from '../types.js';
import type { ChatEvent, SessionState } from '../../shared/types.js';

const STATE_URL = `/state`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function useWebSocket(
	dispatch: React.Dispatch<ChatAction>,
	wsUrl: string = `ws://${window.location.host}/ws`,
) {
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectAttempt = useRef(0);
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
					for (const event of msg.events) {
						dispatch({ type: 'EVENT', event });
					}
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
			if (wsRef.current) {
				wsRef.current.close();
			}
		};
	}, [connect]);
}
