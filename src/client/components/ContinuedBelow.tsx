import React from 'react';

interface ContinuedBelowProps {
	threadKey: string;
	participants: string[];
}

export function ContinuedBelow({ threadKey, participants }: ContinuedBelowProps) {
	const handleClick = () => {
		const el = document.querySelector(`[data-thread-key="${threadKey}"]`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	};

	return (
		<button
			type="button"
			className="tc-continued-below"
			onClick={handleClick}
			aria-label={`Scroll to ${participants.join(' and ')} thread`}
		>
			<span className="tc-continued-below-line" />
			<span className="tc-continued-below-label">
				{'\u2193'} {participants.join(' \u00b7 ')} continued below
			</span>
			<span className="tc-continued-below-line" />
		</button>
	);
}
