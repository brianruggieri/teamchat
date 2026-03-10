import React, { useMemo, useState } from 'react';
import type { ChatEvent, Reaction } from '../types.js';
import { MessageStack } from './MessageStack.jsx';
import { SystemEventComponent } from './SystemEvent.jsx';
import { SystemEventGroup } from './SystemEventGroup.jsx';
import { PlanApprovalCard } from './PlanApprovalCard.jsx';
import { PermissionRequestCard } from './PermissionRequestCard.jsx';
import { buildMessageLaneItems } from './messageGrouping.js';

interface ThreadBlockProps {
	participants: string[];
	events: ChatEvent[];
	reactions: Record<string, Reaction[]>;
}

export function ThreadBlock({ participants, events, reactions }: ThreadBlockProps) {
	const [collapsed, setCollapsed] = useState(false);
	const laneItems = useMemo(() => buildMessageLaneItems(events), [events]);
	const label = participants.join(' -> ');
	const messageCount = laneItems.reduce((count, item) => {
		if (item.kind === 'message-stack') {
			return count + item.messages.length;
		}
		if (item.kind === 'plan-card' || item.kind === 'permission-card') {
			return count + 1;
		}
		return count;
	}, 0);

	return (
		<section className="tc-thread-block">
			<button
				onClick={() => setCollapsed(!collapsed)}
				className="tc-thread-toggle"
				type="button"
			>
				<span className={`tc-thread-chevron ${collapsed ? '' : 'is-open'}`}>
					{'›'}
				</span>
				<div className="tc-thread-heading">
					<span className="tc-thread-title">{label}</span>
					<span className="tc-thread-subtitle">
						DM thread · {messageCount} {messageCount === 1 ? 'message' : 'messages'}
					</span>
				</div>
			</button>

			<div className={`tc-thread-content ${collapsed ? 'is-collapsed' : ''}`}>
				<div className="tc-thread-lane">
					{laneItems.map((item) => {
						if (item.kind === 'message-stack') {
							return (
								<MessageStack
									key={item.messages[0]?.id ?? label}
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

						return (
							<SystemEventComponent
								key={item.event.id}
								event={item.event}
							/>
						);
					})}
				</div>
			</div>

			{!collapsed && (
				<div className="tc-thread-footer">back to #general</div>
			)}
		</section>
	);
}
