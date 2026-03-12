import { useState, useCallback, useMemo } from 'react';
import type { ChatEvent, ContentMessage } from '../../shared/types.js';
import type { Reaction } from '../types.js';
import { MessageStack } from './MessageStack.jsx';
import { SystemEventComponent } from './SystemEvent.jsx';
import { SystemEventGroup } from './SystemEventGroup.jsx';
import { PlanApprovalCard } from './PlanApprovalCard.jsx';
import { PermissionRequestCard } from './PermissionRequestCard.jsx';
import { buildMessageLaneItems } from './messageGrouping.js';

interface ThreadBlockProps {
	threadKey: string;
	participants: string[];
	events: ChatEvent[];
	reactions: Record<string, Reaction[]>;
	topic: string;
}

export function ThreadBlock({ threadKey, participants, events, reactions, topic }: ThreadBlockProps) {
	const [expanded, setExpanded] = useState(false);
	const messageCount = events.filter((e) => e.type === 'message').length;
	const label = participants.join(' \u2194 ');

	// Collect beat reactions for summary display
	const beatEmojis = useMemo(() => {
		const emojis: string[] = [];
		for (const event of events) {
			if (event.type !== 'message') continue;
			const msgReactions = reactions[event.id] ?? [];
			for (const r of msgReactions) {
				if (r.tooltip?.startsWith('beat:')) {
					emojis.push(r.emoji);
				}
			}
		}
		return emojis;
	}, [events, reactions]);

	// Last message preview
	const messages = events.filter((e) => e.type === 'message') as ContentMessage[];
	const lastMsg = messages[messages.length - 1];

	const toggle = useCallback(() => setExpanded((prev) => !prev), []);

	const laneItems = useMemo(() => buildMessageLaneItems(events), [events]);

	return (
		<div className="tc-thread-block" data-thread-key={threadKey}>
			<button className="tc-thread-toggle" onClick={toggle} type="button">
				<span className="tc-thread-chevron" data-expanded={expanded}>
					<svg width="12" height="12" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
				</span>
				<span className="tc-thread-heading">
					<span className="tc-thread-title">{label}</span>
					<span className="tc-thread-subtitle">
						{messageCount} {messageCount === 1 ? 'message' : 'messages'}
						{beatEmojis.length > 0 && (
							<span className="tc-thread-beats">{beatEmojis.join('')}</span>
						)}
					</span>
				</span>
				<span className="tc-thread-topic">{topic}</span>
			</button>

			<div className="tc-thread-content" data-expanded={expanded}>
				{expanded ? (
					<div className="tc-thread-lane">
						{laneItems.map((item) => {
							if (item.kind === 'message-stack') {
								return (
									<MessageStack
										key={item.messages[0]?.id ?? threadKey}
										messages={item.messages}
										reactions={reactions}
									/>
								);
							}

							if (item.kind === 'plan-card') {
								return (
									<PlanApprovalCard
										key={item.message.id}
										message={item.message}
										planContent={item.planContent}
										reactions={reactions[item.message.id] ?? []}
									/>
								);
							}

							if (item.kind === 'permission-card') {
								return (
									<PermissionRequestCard
										key={item.message.id}
										message={item.message}
										toolName={item.toolName}
										command={item.command}
										reactions={reactions[item.message.id] ?? []}
									/>
								);
							}

							if (item.kind === 'system-group') {
								if (item.events.length === 1) {
									return (
										<SystemEventComponent
											key={item.events[0].id}
											event={item.events[0]}
										/>
									);
								}

								return (
									<SystemEventGroup
										key={item.events[0].id}
										subtype={item.subtype}
										events={item.events}
									/>
								);
							}

							if (item.kind === 'system') {
								return (
									<SystemEventComponent
										key={item.event.id}
										event={item.event}
									/>
								);
							}

							return null;
						})}
					</div>
				) : lastMsg ? (
					<div className="tc-thread-preview">
						<span className="tc-thread-preview-from" style={{ color: `var(--agent-${lastMsg.fromColor})` }}>
							{lastMsg.from}
						</span>
						<span className="tc-thread-preview-text">{lastMsg.text.slice(0, 80)}</span>
					</div>
				) : null}
			</div>
		</div>
	);
}
