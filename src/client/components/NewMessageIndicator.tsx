import React from 'react';

interface NewMessageIndicatorProps {
	show: boolean;
	onClick: () => void;
}

export function NewMessageIndicator({ show, onClick }: NewMessageIndicatorProps) {
	if (!show) return null;

	return (
		<button
			onClick={onClick}
			className="new-message-indicator animate-fade-in"
		>
			↓ New messages
		</button>
	);
}
