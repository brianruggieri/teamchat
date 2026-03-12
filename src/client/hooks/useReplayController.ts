import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayBundle, ReplayCursor } from '../../shared/replay.js';
import {
	buildReplayCheckpoints,
	createReplayBaseState,
	deriveReplayState,
	getNextMarkerCursor,
	getPrevMarkerCursor,
	getReplayCursorAtMs,
	getReplayDurationMs,
	stepReplayCursor,
} from '../replay.js';

export interface ReplayControllerState {
	status: 'paused' | 'playing';
	speed: number;
	cursor: ReplayCursor;
	durationMs: number;
	virtualNowMs: number;
}

export function useReplayController(bundle: ReplayBundle) {
	const baseState = useMemo(() => createReplayBaseState(bundle), [bundle]);
	const checkpoints = useMemo(
		() => buildReplayCheckpoints(bundle, baseState),
		[bundle, baseState],
	);
	const durationMs = useMemo(() => getReplayDurationMs(bundle), [bundle]);
	const [state, setState] = useState<ReplayControllerState>({
		status: 'paused',
		speed: 1,
		cursor: { atMs: 0, seq: -1 },
		durationMs,
		virtualNowMs: new Date(bundle.manifest.startedAt).getTime(),
	});
	const frameRef = useRef<number | null>(null);
	const lastFrameRef = useRef<number | null>(null);

	useEffect(() => {
		const initialAtMs = parseSeekParam(durationMs);
		const initialCursor = initialAtMs > 0
			? getReplayCursorAtMs(bundle, initialAtMs)
			: { atMs: 0, seq: -1 };
		setState({
			status: 'paused',
			speed: 1,
			cursor: initialCursor,
			durationMs,
			virtualNowMs: new Date(bundle.manifest.startedAt).getTime() + initialCursor.atMs,
		});
	}, [bundle, durationMs]);

	const seek = useCallback((atMs: number) => {
		setState((current) => {
			const cursor = getReplayCursorAtMs(bundle, atMs);
			return {
				...current,
				status: cursor.atMs >= durationMs ? 'paused' : current.status,
				cursor,
				virtualNowMs: new Date(bundle.manifest.startedAt).getTime() + cursor.atMs,
			};
		});
	}, [bundle, durationMs]);

	const pause = useCallback(() => {
		setState((current) => ({ ...current, status: 'paused' }));
	}, []);

	const play = useCallback(() => {
		setState((current) => ({ ...current, status: 'playing' }));
	}, []);

	const toggle = useCallback(() => {
		setState((current) => ({
			...current,
			status: current.status === 'playing' ? 'paused' : 'playing',
		}));
	}, []);

	const restart = useCallback(() => {
		setState((current) => ({
			...current,
			status: 'paused',
			cursor: { atMs: 0, seq: -1 },
			virtualNowMs: new Date(bundle.manifest.startedAt).getTime(),
		}));
	}, [bundle.manifest.startedAt]);

	const stepForward = useCallback(() => {
		setState((current) => {
			const cursor = stepReplayCursor(bundle, current.cursor, 1);
			return {
				...current,
				status: 'paused',
				cursor,
				virtualNowMs: new Date(bundle.manifest.startedAt).getTime() + cursor.atMs,
			};
		});
	}, [bundle]);

	const stepBack = useCallback(() => {
		setState((current) => {
			const cursor = stepReplayCursor(bundle, current.cursor, -1);
			return {
				...current,
				status: 'paused',
				cursor,
				virtualNowMs: new Date(bundle.manifest.startedAt).getTime() + cursor.atMs,
			};
		});
	}, [bundle]);

	const nextMarker = useCallback(() => {
		setState((current) => {
			const cursor = getNextMarkerCursor(bundle, current.cursor);
			return {
				...current,
				status: 'paused',
				cursor,
				virtualNowMs: new Date(bundle.manifest.startedAt).getTime() + cursor.atMs,
			};
		});
	}, [bundle]);

	const prevMarker = useCallback(() => {
		setState((current) => {
			const cursor = getPrevMarkerCursor(bundle, current.cursor);
			return {
				...current,
				status: 'paused',
				cursor,
				virtualNowMs: new Date(bundle.manifest.startedAt).getTime() + cursor.atMs,
			};
		});
	}, [bundle]);

	const setSpeed = useCallback((speed: number) => {
		setState((current) => ({ ...current, speed }));
	}, []);

	useEffect(() => {
		if (state.status !== 'playing') {
			if (frameRef.current) {
				cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
			lastFrameRef.current = null;
			return undefined;
		}

		const tick = (frameTime: number) => {
			if (lastFrameRef.current == null) {
				lastFrameRef.current = frameTime;
			}
			const delta = frameTime - lastFrameRef.current;
			lastFrameRef.current = frameTime;

			setState((current) => {
				if (current.status !== 'playing') {
					return current;
				}
				const nextAtMs = Math.min(current.cursor.atMs + delta * current.speed, durationMs);
				const cursor = getReplayCursorAtMs(bundle, nextAtMs);
				return {
					...current,
					status: nextAtMs >= durationMs ? 'paused' : 'playing',
					cursor,
					virtualNowMs: new Date(bundle.manifest.startedAt).getTime() + nextAtMs,
				};
			});

			frameRef.current = requestAnimationFrame(tick);
		};

		frameRef.current = requestAnimationFrame(tick);
		return () => {
			if (frameRef.current) {
				cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
			lastFrameRef.current = null;
		};
	}, [bundle, durationMs, state.status]);

	const derivedState = useMemo(
		() => deriveReplayState(bundle, baseState, checkpoints, state.cursor),
		[bundle, baseState, checkpoints, state.cursor],
	);

	return {
		state,
		derivedState,
		play,
		pause,
		toggle,
		seek,
		restart,
		stepForward,
		stepBack,
		nextMarker,
		prevMarker,
		setSpeed,
	};
}

function parseSeekParam(durationMs: number): number {
	const params = new URLSearchParams(window.location.search);
	const raw = params.get('seek');
	if (!raw) return 0;
	if (raw === 'end') return durationMs;
	if (raw.endsWith('%')) {
		const pct = parseFloat(raw.slice(0, -1));
		if (!Number.isNaN(pct)) return Math.round((pct / 100) * durationMs);
	}
	const ms = parseInt(raw, 10);
	if (!Number.isNaN(ms)) return ms;
	return 0;
}
