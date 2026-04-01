import React, { useMemo } from 'react';
import type {
	ChatEvent,
	ContentMessage,
	Reaction,
	TaskInfo,
	TeamState,
	ThreadStatus,
} from '../types.js';
import { ThreadBlock } from './ThreadBlock.jsx';
import { ContinuedBelow } from './ContinuedBelow.jsx';
import { MessageStack } from './MessageStack.jsx';
import { SystemEventComponent } from './SystemEvent.jsx';
import { SystemEventGroup } from './SystemEventGroup.jsx';
import { SetupCard } from './SetupCard.jsx';
import { PlanApprovalCard } from './PlanApprovalCard.jsx';
import { PermissionRequestCard } from './PermissionRequestCard.jsx';
import { SessionSummaryCard } from './SessionSummaryCard.jsx';
import { HeartbeatRow } from './HeartbeatRow.jsx';
import { ThoughtBubble } from './ThoughtBubble.jsx';
import { buildMessageLaneItems, type MessageLaneItem } from './messageGrouping.js';

interface MessageListProps {
	events: ChatEvent[];
	reactions: Record<string, Reaction[]>;
	tasks: TaskInfo[];
	team: TeamState | null;
	threadStatuses: Record<string, ThreadStatus>;
	sessionStart: string | null;
	resurfacedThreadKeys?: Set<string>;
	threadFilter?: string | null;
}

interface AccumulatedThread {
	kind: 'accumulated-thread';
	threadKey: string;
	participants: string[];
	events: ChatEvent[];
	topic: string;
}

interface ContinuedBelowItem {
	kind: 'continued-below';
	threadKey: string;
	participants: string[];
}

interface FlatEventsGroup {
	kind: 'flat-events';
	events: ChatEvent[];
	laneItems: MessageLaneItem[];
}

type RenderItem = AccumulatedThread | ContinuedBelowItem | FlatEventsGroup;

export function MessageList({ events, reactions, tasks, team, threadStatuses, sessionStart, resurfacedThreadKeys, threadFilter }: MessageListProps) {
	const items = useMemo(
		() => groupEvents(events, resurfacedThreadKeys),
		[events, resurfacedThreadKeys],
	);

	// Apply thread filter: when active, only show items related to that thread
	const visibleItems = useMemo(() => {
		if (!threadFilter) return items;
		return items.filter((item) => {
			if (item.kind === 'accumulated-thread') return item.threadKey === threadFilter;
			if (item.kind === 'continued-below') return item.threadKey === threadFilter;
			// Show flat events from agents involved in the filtered thread
			if (item.kind === 'flat-events') {
				const threadParts = threadFilter.split(':');
				return item.events.some((e) => {
					if (e.type === 'message') return threadParts.includes((e as ContentMessage).from);
					if (e.type === 'system') return threadParts.includes(e.agentName ?? '');
					return false;
				});
			}
			return true;
		});
	}, [items, threadFilter]);

	return (
		<div className="tc-message-list">
			{visibleItems.map((item, index) => {
				if (item.kind === 'accumulated-thread') {
					return (
						<ThreadBlock
							key={item.threadKey}
							threadKey={item.threadKey}
							participants={item.participants}
							events={item.events}
							reactions={reactions}
							topic={item.topic}
						/>
					);
				}

				if (item.kind === 'continued-below') {
					return (
						<ContinuedBelow
							key={`continued-${item.threadKey}`}
							threadKey={item.threadKey}
							participants={item.participants}
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

							if (laneItem.kind === 'setup-card') {
								return (
									<SetupCard
										key={`setup-${laneItem.events[0]?.id ?? 'card'}`}
										events={laneItem.events}
									/>
								);
							}

							if (laneItem.kind === 'system') {
								if (laneItem.event.subtype === 'session-summary') {
									return (
										<SessionSummaryCard
											key={laneItem.event.id}
											event={laneItem.event}
											teamSize={team?.members.length ?? 0}
											tasksCompleted={tasks.filter(t => t.status === 'completed').length}
											tasksTotal={tasks.length}
											threadsResolved={Object.values(threadStatuses).filter(t => t.status === 'resolved').length}
											threadsTotal={Object.values(threadStatuses).length}
											sessionStart={sessionStart}
										/>
									);
								}
								return (
									<SystemEventComponent
										key={laneItem.event.id}
										event={laneItem.event}
										inline
									/>
								);
							}

							if (laneItem.kind === 'heartbeat') {
								return (
									<HeartbeatRow
										key={laneItem.event.id}
										event={laneItem.event}
									/>
								);
							}

							if (laneItem.kind === 'thought') {
								return (
									<ThoughtBubble
										key={laneItem.event.id}
										event={laneItem.event}
									/>
								);
							}

							return null;
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
 * thread block. For re-surfaced threads (3+ messages), the block is
 * placed at the LAST DM position (WhatsApp-style) and a "continued
 * below" placeholder marks the original position.
 *
 * Non-resurfaced threads are placed at the first DM position (original
 * behavior). Thread markers are ignored entirely (legacy compat).
 */
function groupEvents(events: ChatEvent[], resurfacedThreadKeys?: Set<string>): RenderItem[] {
	const items: RenderItem[] = [];
	const dmsByPair = new Map<string, ChatEvent[]>();
	const dmPairFirstSeen = new Set<string>();
	const dmPairLastSeen = new Set<string>();
	let flatBuffer: ChatEvent[] = [];

	const sessionStartMs = events.length > 0 ? new Date(events[0]!.timestamp).getTime() : undefined;

	const pushFlat = () => {
		if (flatBuffer.length > 0) {
			items.push({
				kind: 'flat-events',
				events: flatBuffer,
				laneItems: buildMessageLaneItems(flatBuffer, sessionStartMs),
			});
			flatBuffer = [];
		}
	};

	// Pre-collect all DMs by pair
	for (const event of events) {
		if (event.type === 'message' && (event as ContentMessage).isDM) {
			const msg = event as ContentMessage;
			if (!msg.dmParticipants) {
				console.warn('DM message missing dmParticipants:', msg.id);
			}
			const key = [...(msg.dmParticipants ?? [])].sort().join(':');
			if (!dmsByPair.has(key)) dmsByPair.set(key, []);
			dmsByPair.get(key)!.push(event);
		}
	}

	// Determine which pairs are re-surfaced
	const resurfaced = resurfacedThreadKeys ?? new Set<string>();

	// Find the index of the last DM for each resurfaced pair
	const lastDmIndex = new Map<string, number>();
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'message' && (event as ContentMessage).isDM) {
			const msg = event as ContentMessage;
			const key = [...(msg.dmParticipants ?? [])].sort().join(':');
			if (resurfaced.has(key) && !lastDmIndex.has(key)) {
				lastDmIndex.set(key, i);
			}
		}
	}

	// Build timeline with accumulated thread blocks
	for (let i = 0; i < events.length; i++) {
		const event = events[i]!;

		// Skip thread markers entirely
		if (event.type === 'thread-marker') continue;

		if (event.type === 'message' && (event as ContentMessage).isDM) {
			const msg = event as ContentMessage;
			const key = [...(msg.dmParticipants ?? [])].sort().join(':');
			const isResurfaced = resurfaced.has(key);

			if (isResurfaced) {
				// Re-surfaced thread: place "continued below" at first DM,
				// place accumulated block at last DM
				if (!dmPairFirstSeen.has(key)) {
					dmPairFirstSeen.add(key);
					pushFlat();
					items.push({
						kind: 'continued-below',
						threadKey: key,
						participants: [...(msg.dmParticipants ?? [])].sort(),
					});
				}

				if (!dmPairLastSeen.has(key) && i === lastDmIndex.get(key)) {
					dmPairLastSeen.add(key);
					pushFlat();
					const allDMs = dmsByPair.get(key) ?? [];
					items.push({
						kind: 'accumulated-thread',
						threadKey: key,
						participants: [...(msg.dmParticipants ?? [])].sort(),
						events: allDMs,
						topic: allDMs.length > 0
							? (allDMs[0] as ContentMessage).text.slice(0, 60).replace(/\n/g, ' ')
							: '',
					});
				}
			} else {
				// Non-resurfaced: place block at first DM (original behavior)
				if (!dmPairFirstSeen.has(key)) {
					pushFlat();
					dmPairFirstSeen.add(key);
					const allDMs = dmsByPair.get(key) ?? [];
					items.push({
						kind: 'accumulated-thread',
						threadKey: key,
						participants: [...(msg.dmParticipants ?? [])].sort(),
						events: allDMs,
						topic: msg.text.slice(0, 60).replace(/\n/g, ' '),
					});
				}
			}
			// All DM events are in the accumulated block — skip individual rendering
			continue;
		}

		// Non-DM event — add to flat buffer
		flatBuffer.push(event);
	}

	pushFlat();
	return items;
}

export { type RenderItem, type ContinuedBelowItem, type AccumulatedThread };
