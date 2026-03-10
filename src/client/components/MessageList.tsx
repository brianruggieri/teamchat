import React, { useMemo } from 'react';
import type {
	ChatEvent,
	Reaction,
	ContentMessage,
	SystemEvent,
	ThreadMarker,
} from '../types.js';
import { ChatMessage } from './ChatMessage.jsx';
import { SystemEventComponent } from './SystemEvent.jsx';
import { ThreadBlock } from './ThreadBlock.jsx';
import { PlanApprovalCard } from './PlanApprovalCard.jsx';
import { PermissionRequestCard } from './PermissionRequestCard.jsx';

interface MessageListProps {
	events: ChatEvent[];
	reactions: Record<string, Reaction[]>;
}

interface ThreadGroup {
	kind: 'thread';
	participants: string[];
	events: ChatEvent[];
}

interface SingleEvent {
	kind: 'event';
	event: ChatEvent;
}

type RenderItem = ThreadGroup | SingleEvent;

export function MessageList({ events, reactions }: MessageListProps) {
	const items = useMemo(() => groupEvents(events), [events]);

	return (
		<div className="px-5 py-4">
			{items.map((item, i) => {
				if (item.kind === 'thread') {
					return (
						<ThreadBlock
							key={`thread-${i}`}
							participants={item.participants}
							events={item.events}
							reactions={reactions}
						/>
					);
				}

				const event = item.event;

				if (event.type === 'message') {
					const msg = event as ContentMessage;

					// Check if this is a plan approval request
					if (isPlanApproval(msg)) {
						const planContent = extractPlanContent(msg.text);
						return (
							<PlanApprovalCard
								key={msg.id}
								message={msg}
								planContent={planContent}
								reactions={reactions[msg.id] ?? []}
							/>
						);
					}

					// Check if this is a permission request
					if (isPermissionRequest(msg)) {
						const { toolName, command } = extractPermissionInfo(msg.text);
						return (
							<PermissionRequestCard
								key={msg.id}
								message={msg}
								toolName={toolName}
								command={command}
								reactions={reactions[msg.id] ?? []}
							/>
						);
					}

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
						<SystemEventComponent
							key={event.id}
							event={event as SystemEvent}
						/>
					);
				}

				// thread-marker, presence, task-update, reaction — handled elsewhere or not rendered directly
				return null;
			})}
		</div>
	);
}

function groupEvents(events: ChatEvent[]): RenderItem[] {
	const items: RenderItem[] = [];
	let i = 0;

	while (i < events.length) {
		const event = events[i];

		// Check for thread-start marker
		if (event.type === 'thread-marker') {
			const marker = event as ThreadMarker;
			if (marker.subtype === 'thread-start') {
				// Collect events until thread-end
				const threadEvents: ChatEvent[] = [];
				i++;
				while (i < events.length) {
					const inner = events[i];
					if (
						inner.type === 'thread-marker' &&
						(inner as ThreadMarker).subtype === 'thread-end'
					) {
						i++;
						break;
					}
					threadEvents.push(inner);
					i++;
				}
				items.push({
					kind: 'thread',
					participants: marker.participants,
					events: threadEvents,
				});
				continue;
			}
			// Skip orphan thread-end markers
			i++;
			continue;
		}

		// Skip presence and task-update events from main rendering
		// (they're handled by sidebar)
		if (event.type === 'presence' || event.type === 'task-update') {
			i++;
			continue;
		}

		// Skip reaction events (they're attached to messages via the reactions map)
		if (event.type === 'reaction') {
			i++;
			continue;
		}

		// Group consecutive system events of similar types
		if (event.type === 'system') {
			const systemEvents: ChatEvent[] = [event];
			let j = i + 1;
			while (
				j < events.length &&
				events[j].type === 'system' &&
				areGroupableSystemEvents(event as SystemEvent, events[j] as SystemEvent)
			) {
				systemEvents.push(events[j]);
				j++;
			}
			if (systemEvents.length > 1) {
				for (const se of systemEvents) {
					items.push({ kind: 'event', event: se });
				}
				i = j;
				continue;
			}
		}

		items.push({ kind: 'event', event });
		i++;
	}

	return items;
}

function areGroupableSystemEvents(a: SystemEvent, b: SystemEvent): boolean {
	// Group join events together, shutdown events together, etc.
	const groupMap: Record<string, string> = {
		'member-joined': 'join',
		'member-left': 'leave',
		'shutdown-requested': 'shutdown',
		'shutdown-approved': 'shutdown',
		'task-created': 'task-create',
	};
	return (groupMap[a.subtype] ?? a.subtype) === (groupMap[b.subtype] ?? b.subtype);
}

function isPlanApproval(msg: ContentMessage): boolean {
	try {
		const parsed = JSON.parse(msg.text);
		return parsed.type === 'plan_approval_request';
	} catch {
		return false;
	}
}

function isPermissionRequest(msg: ContentMessage): boolean {
	try {
		const parsed = JSON.parse(msg.text);
		return parsed.type === 'permission_request';
	} catch {
		return false;
	}
}

function extractPlanContent(text: string): string {
	try {
		const parsed = JSON.parse(text);
		return parsed.planContent ?? text;
	} catch {
		return text;
	}
}

function extractPermissionInfo(text: string): { toolName: string; command: string } {
	try {
		const parsed = JSON.parse(text);
		return {
			toolName: parsed.toolName ?? '',
			command: parsed.description ?? parsed.input?.command ?? text,
		};
	} catch {
		return { toolName: '', command: text };
	}
}
