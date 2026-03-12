import { useEffect, useState } from 'react';

interface ConfettiOverlayProps {
	active: boolean;
	duration?: number;
}

const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#eab308', '#ef4444', '#06b6d4', '#f97316'];
const PARTICLE_COUNT = 40;

export function ConfettiOverlay({ active, duration = 4000 }: ConfettiOverlayProps) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (!active) return;
		setVisible(true);
		const timer = setTimeout(() => setVisible(false), duration);
		return () => clearTimeout(timer);
	}, [active, duration]);

	if (!visible) return null;

	const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
		const color = COLORS[i % COLORS.length]!;
		const left = Math.random() * 100;
		const delay = Math.random() * 1.5;
		const animDuration = 2 + Math.random() * 2;
		const size = 4 + Math.random() * 6;
		const shape = i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'square' : 'strip';
		return (
			<span
				key={i}
				className="tc-confetti-particle"
				data-shape={shape}
				style={{
					left: `${left}%`,
					backgroundColor: color,
					width: shape === 'strip' ? `${size * 0.4}px` : `${size}px`,
					height: shape === 'strip' ? `${size * 1.8}px` : `${size}px`,
					borderRadius: shape === 'circle' ? '50%' : shape === 'strip' ? '2px' : '1px',
					animationDelay: `${delay}s`,
					animationDuration: `${animDuration}s`,
				}}
			/>
		);
	});

	return (
		<div className="tc-confetti-overlay" aria-hidden="true">
			{particles}
		</div>
	);
}
