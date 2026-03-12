import React, { useMemo } from 'react';
import type {
	ChatEvent,
	ContentMessage,
	Reaction,
} from '../types.js';
import type { AgentInfo } from '../../shared/types.js';
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
	team?: AgentInfo[];
}

interface AccumulatedThread {
	kind: 'accumulated-thread';
	threadKey: string;
	participants: string[];
	events: ChatEvent[];
	topic: string;
}

interface FlatEventsGroup {
	kind: 'flat-events';
	events: ChatEvent[];
	laneItems: MessageLaneItem[];
}

type RenderItem = AccumulatedThread | FlatEventsGroup;

export function MessageList({ events, reactions, team }: MessageListProps) {
	const items = useMemo(() => groupEvents(events), [events]);

	return (
		<div className="tc-message-list">
			{items.map((item, index) => {
				if (item.kind === 'accumulated-thread') {
					return (
						<ThreadBlock
							key={item.threadKey}
							threadKey={item.threadKey}
							participants={item.participants}
							events={item.events}
							reactions={reactions}
							topic={item.topic}
							team={team}
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
 * Group events into accumulated thread blocks and flat event groups.
 *
 * All DMs for each participant pair are accumulated into a single
 * thread block, placed at the position of the first DM for that pair.
 * Thread markers are ignored entirely (legacy compat).
 */
function groupEvents(events: ChatEvent[]): RenderItem[] {
	const items: RenderItem[] = [];
	const dmsByPair = new Map<string, ChatEvent[]>();
	const dmPairInserted = new Set<string>();
	let flatBuffer: ChatEvent[] = [];

	const pushFlat = () => {
		if (flatBuffer.length > 0) {
			items.push({
				kind: 'flat-events',
				events: flatBuffer,
				laneItems: buildMessageLaneItems(flatBuffer),
			});
			flatBuffer = [];
		}
	};

	// Pre-collect all DMs by pair
	for (const event of events) {
		if (event.type === 'message' && (event as ContentMessage).isDM) {
			const msg = event as ContentMessage;
			const key = [...(msg.dmParticipants ?? [])].sort().join(':');
			if (!dmsByPair.has(key)) dmsByPair.set(key, []);
			dmsByPair.get(key)!.push(event);
		}
	}

	// Build timeline with accumulated thread blocks
	for (const event of events) {
		// Skip thread markers entirely
		if (event.type === 'thread-marker') continue;

		if (event.type === 'message' && (event as ContentMessage).isDM) {
			const msg = event as ContentMessage;
			const key = [...(msg.dmParticipants ?? [])].sort().join(':');

			if (!dmPairInserted.has(key)) {
				// First DM for this pair — insert the accumulated block here
				pushFlat();
				dmPairInserted.add(key);
				const allDMs = dmsByPair.get(key) ?? [];
				items.push({
					kind: 'accumulated-thread',
					threadKey: key,
					participants: [...(msg.dmParticipants ?? [])].sort(),
					events: allDMs,
					topic: msg.text.slice(0, 60).replace(/\n/g, ' '),
				});
			}
			// Subsequent DMs for this pair are already in the accumulated block — skip
			continue;
		}

		// Non-DM event — add to flat buffer
		flatBuffer.push(event);
	}

	pushFlat();
	return items;
}
