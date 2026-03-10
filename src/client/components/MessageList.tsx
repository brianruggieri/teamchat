import React, { useMemo } from 'react';
import type {
	ChatEvent,
	Reaction,
	ThreadMarker,
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

function groupEvents(events: ChatEvent[]): RenderItem[] {
	const items: RenderItem[] = [];
	let currentFlatEvents: ChatEvent[] = [];
	let index = 0;

	const pushFlatEvents = () => {
		if (currentFlatEvents.length > 0) {
			const group: FlatEventsGroup = {
				kind: 'flat-events',
				events: currentFlatEvents,
				laneItems: buildMessageLaneItems(currentFlatEvents),
			};
			items.push(group);
			currentFlatEvents = [];
		}
	};

	while (index < events.length) {
		const event = events[index];

		if (event.type === 'thread-marker') {
			const marker = event as ThreadMarker;
			if (marker.subtype === 'thread-start') {
				pushFlatEvents();
				const threadEvents: ChatEvent[] = [];
				index++;
				while (index < events.length) {
					const inner = events[index];
					if (
						inner.type === 'thread-marker'
						&& (inner as ThreadMarker).subtype === 'thread-end'
					) {
						index++;
						break;
					}
					threadEvents.push(inner);
					index++;
				}
				items.push({
					kind: 'thread',
					participants: marker.participants,
					events: threadEvents,
				});
				continue;
			}

			index++;
			continue;
		}

		currentFlatEvents.push(event);
		index++;
	}

	pushFlatEvents();
	return items;
}
