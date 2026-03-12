import React, { useMemo } from 'react';
import type {
	ChatEvent,
	ContentMessage,
	Reaction,
} from '../types.js';
import { ThreadBlock } from './ThreadBlock.jsx';
import { MessageStack } from './MessageStack.jsx';
import { SystemEventComponent } from './SystemEvent.jsx';
import { SystemEventGroup } from './SystemEventGroup.jsx';
import { PlanApprovalCard } from './PlanApprovalCard.jsx';
import { PermissionRequestCard } from './PermissionRequestCard.jsx';
import { buildMessageLaneItems, type MessageLaneItem } from './messageGrouping.js';

interface MessageListProps {
	events: ChatEvent[];
	reactions: Record<string, Reaction[]>;
}

interface ThreadGroup {
	kind: 'thread';
	participants: string[];
	events: ChatEvent[];
}

interface FlatEventsGroup {
	kind: 'flat-events';
	events: ChatEvent[];
	laneItems: MessageLaneItem[];
}

type RenderItem = ThreadGroup | FlatEventsGroup;

export function MessageList({ events, reactions }: MessageListProps) {
	const items = useMemo(() => groupEvents(events), [events]);

	return (
		<div className="tc-message-list">
			{items.map((item, index) => {
				if (item.kind === 'thread') {
					return (
						<ThreadBlock
							key={`thread-${index}`}
							participants={item.participants}
							events={item.events}
							reactions={reactions}
						/>
					);
				}

				const laneItems = item.laneItems;
				return (
					<React.Fragment key={`lane-${index}`}>
						{laneItems.map((laneItem) => {
							if (laneItem.kind === 'message-stack') {
								const key = laneItem.messages[0]?.id ?? `stack-${index}`;
								return (
									<MessageStack
										key={key}
										messages={laneItem.messages}
										reactions={reactions}
									/>
								);
							}

							if (laneItem.kind === 'plan-card') {
								return (
									<PlanApprovalCard
										key={laneItem.message.id}
										message={laneItem.message}
										planContent={laneItem.planContent}
										reactions={reactions[laneItem.message.id] ?? []}
									/>
								);
							}

							if (laneItem.kind === 'permission-card') {
								return (
									<PermissionRequestCard
										key={laneItem.message.id}
										message={laneItem.message}
										toolName={laneItem.toolName}
										command={laneItem.command}
										reactions={reactions[laneItem.message.id] ?? []}
									/>
								);
							}

							if (laneItem.kind === 'system-group') {
								if (laneItem.events.length === 1) {
									return (
										<SystemEventComponent
											key={laneItem.events[0].id}
											event={laneItem.events[0]}
										/>
									);
								}

								return (
									<SystemEventGroup
										key={laneItem.events[0].id}
										subtype={laneItem.subtype}
										events={laneItem.events}
									/>
								);
							}

							return (
								<SystemEventComponent
									key={laneItem.event.id}
									event={laneItem.event}
								/>
							);
						})}
					</React.Fragment>
				);
			})}
		</div>
	);
}

/**
 * Group events into thread blocks and flat event groups.
 *
 * Threads are formed purely from data — consecutive DM messages
 * with the same participants get grouped together. No markers needed.
 * Thread markers are ignored entirely (legacy compat).
 *
 * Any non-DM event (system, task-update, general message, presence)
 * breaks a thread group and goes into flat events.
 */
function groupEvents(events: ChatEvent[]): RenderItem[] {
	const items: RenderItem[] = [];
	let currentFlatEvents: ChatEvent[] = [];
	let currentThread: { participants: string[]; events: ChatEvent[] } | null = null;

	const pushFlatEvents = () => {
		if (currentFlatEvents.length > 0) {
			items.push({
				kind: 'flat-events',
				events: currentFlatEvents,
				laneItems: buildMessageLaneItems(currentFlatEvents),
			});
			currentFlatEvents = [];
		}
	};

	const pushThread = () => {
		if (currentThread && currentThread.events.length > 0) {
			items.push({
				kind: 'thread',
				participants: currentThread.participants,
				events: currentThread.events,
			});
		}
		currentThread = null;
	};

	for (const event of events) {
		// Skip thread markers — we don't need them anymore
		if (event.type === 'thread-marker') {
			continue;
		}

		// Check if this is a DM message
		if (event.type === 'message') {
			const msg = event as ContentMessage;
			if (msg.isDM && msg.dmParticipants) {
				const key = msg.dmParticipants.join(':');

				if (currentThread) {
					const threadKey = currentThread.participants.join(':');
					if (key === threadKey) {
						// Same thread — add to it
						currentThread.events.push(event);
						continue;
					}
					// Different thread — close current, start new
					pushThread();
				}

				// Start a new thread
				pushFlatEvents();
				currentThread = {
					participants: msg.dmParticipants,
					events: [event],
				};
				continue;
			}
		}

		// Non-DM event — close any active thread, add to flat events
		pushThread();
		currentFlatEvents.push(event);
	}

	// Flush remaining
	pushThread();
	pushFlatEvents();

	return items;
}
