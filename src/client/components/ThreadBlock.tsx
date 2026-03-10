import React, { useState } from 'react';
import type { ChatEvent, Reaction } from '../types.js';
import { ChatMessage } from './ChatMessage.jsx';
import { SystemEventComponent } from './SystemEvent.jsx';
import type { ContentMessage, SystemEvent } from '../../shared/types.js';

interface ThreadBlockProps {
	participants: string[];
	events: ChatEvent[];
	reactions: Record<string, Reaction[]>;
}

export function ThreadBlock({ participants, events, reactions }: ThreadBlockProps) {
	const [collapsed, setCollapsed] = useState(false);
	const label = participants.join(' → ');

	return (
		<div className="my-3 animate-fade-in">
			{/* Thread start marker */}
			<div className="thread-marker">
				<button
					onClick={() => setCollapsed(!collapsed)}
					className="flex items-center gap-1 hover:text-gray-300 transition-colors whitespace-nowrap"
				>
					<span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>
						▸
					</span>
					<span>{label} (DM)</span>
				</button>
			</div>

			{/* Thread content */}
			<div
				className={`expandable-content pl-4 border-l border-surface-700 ${
					collapsed ? 'max-h-0 opacity-0' : 'max-h-[5000px] opacity-100'
				}`}
			>
				{events.map((event) => {
					if (event.type === 'message') {
						const msg = event as ContentMessage;
						return (
							<ChatMessage
								key={msg.id}
								message={msg}
								reactions={reactions[msg.id] ?? []}
							/>
						);
					}
					if (event.type === 'system') {
						return (
							<SystemEventComponent key={event.id} event={event as SystemEvent} />
						);
					}
					return null;
				})}
			</div>

			{/* Thread end marker */}
			{!collapsed && (
				<div className="thread-marker">
					<span>back to #general</span>
				</div>
			)}
		</div>
	);
}
