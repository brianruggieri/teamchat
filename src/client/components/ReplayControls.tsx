import React from 'react';

interface ReplayControlsProps {
	status: 'paused' | 'playing';
	speed: number;
	elapsedMs: number;
	durationMs: number;
	onToggle: () => void;
	onRestart: () => void;
	onStepBack: () => void;
	onStepForward: () => void;
	onPrevMarker: () => void;
	onNextMarker: () => void;
	onSpeedChange: (speed: number) => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10];

export function ReplayControls({
	status,
	speed,
	elapsedMs,
	durationMs,
	onToggle,
	onRestart,
	onStepBack,
	onStepForward,
	onPrevMarker,
	onNextMarker,
	onSpeedChange,
}: ReplayControlsProps) {
	return (
		<div className="tc-replay-controls" role="group" aria-label="Replay controls">
			<button
				type="button"
				className="tc-replay-button is-primary"
				onClick={onToggle}
				aria-pressed={status === 'playing'}
			>
				{status === 'playing' ? 'Pause' : 'Play'}
			</button>
			<button type="button" className="tc-replay-button" onClick={onRestart}>
				Restart
			</button>
			<button type="button" className="tc-replay-button is-subtle" onClick={onStepBack}>
				Step -
			</button>
			<button type="button" className="tc-replay-button is-subtle" onClick={onStepForward}>
				Step +
			</button>
			<button type="button" className="tc-replay-button is-subtle" onClick={onPrevMarker}>
				Prev marker
			</button>
			<button type="button" className="tc-replay-button is-subtle" onClick={onNextMarker}>
				Next marker
			</button>
			<label className="tc-replay-speed">
				<span>Speed</span>
				<select
					value={String(speed)}
					onChange={(event) => onSpeedChange(Number(event.target.value))}
				>
					{SPEED_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option}x
						</option>
					))}
				</select>
			</label>
			<div className="tc-replay-clock">
				<span>{formatMs(elapsedMs)}</span>
				<span>/</span>
				<span>{formatMs(durationMs)}</span>
			</div>
		</div>
	);
}

export function formatMs(value: number): string {
	const totalSeconds = Math.floor(value / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
