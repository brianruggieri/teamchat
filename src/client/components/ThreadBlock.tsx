import React, { useState, useMemo } from 'react';
import type { ChatEvent, ContentMessage } from '../../shared/types.js';
import type { Reaction } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';
import { MessageStack } from './MessageStack.jsx';
import { SystemEventComponent } from './SystemEvent.jsx';
import { SystemEventGroup } from './SystemEventGroup.jsx';
import { SetupCard } from './SetupCard.jsx';
import { PlanApprovalCard } from './PlanApprovalCard.jsx';
import { PermissionRequestCard } from './PermissionRequestCard.jsx';
import { buildMessageLaneItems } from './messageGrouping.js';
import { distillSummary } from '../../shared/distill.js';
import { useAvatarMark } from './AvatarMarkContext.js';
import { renderAvatarMark } from '../avatar-marks.js';

interface ThreadBlockProps {
	threadKey: string;
	participants: string[];
	events: ChatEvent[];
	reactions: Record<string, Reaction[]>;
	topic: string;
}

/** Maps agent color names to CSS border/tint values for inline styles. */
const AGENT_COLOR_CSS: Record<string, { border: string; tint: string }> = {
	blue: { border: 'rgb(59, 130, 246)', tint: 'rgba(59, 130, 246, 0.04)' },
	green: { border: 'rgb(34, 197, 94)', tint: 'rgba(34, 197, 94, 0.04)' },
	purple: { border: 'rgb(168, 85, 247)', tint: 'rgba(168, 85, 247, 0.04)' },
	yellow: { border: 'rgb(234, 179, 8)', tint: 'rgba(234, 179, 8, 0.04)' },
	red: { border: 'rgb(239, 68, 68)', tint: 'rgba(239, 68, 68, 0.04)' },
	orange: { border: 'rgb(249, 115, 22)', tint: 'rgba(249, 115, 22, 0.04)' },
	cyan: { border: 'rgb(6, 182, 212)', tint: 'rgba(6, 182, 212, 0.04)' },
	pink: { border: 'rgb(236, 72, 153)', tint: 'rgba(236, 72, 153, 0.04)' },
	gold: { border: 'rgb(234, 179, 8)', tint: 'rgba(234, 179, 8, 0.04)' },
};

const DEFAULT_COLOR_CSS = { border: 'rgb(107, 114, 128)', tint: 'rgba(255, 255, 255, 0.04)' };

function getColorCss(color: string) {
	return AGENT_COLOR_CSS[color] ?? DEFAULT_COLOR_CSS;
}

const RESOLUTION_PATTERNS = [
	/\baligned\b/i, /\bconfirmed\b/i, /\bthis works\b/i,
	/\bworks for me\b/i, /\bagreed\b/i, /\bmatches perfectly\b/i,
	/\bimplementation matches\b/i, /\bfully aligned\b/i,
];

function isThreadResolved(messages: ContentMessage[]): boolean {
	if (messages.length === 0) return false;
	const lastText = messages[messages.length - 1]!.text;
	return RESOLUTION_PATTERNS.some(p => p.test(lastText));
}

function DmBubblePip({ name, color }: { name: string; color: string }) {
	const identity = useAvatarMark(name);
	if (identity) {
		return (
			<span
				className="tc-dm-bubble-dot"
				dangerouslySetInnerHTML={{
					__html: renderAvatarMark(name, color, 10, identity),
				}}
			/>
		);
	}
	return <span className="tc-dm-bubble-dot" style={{ backgroundColor: 'var(--text-muted)' }} />;
}

export function ThreadBlock({ threadKey, participants, events, reactions, topic }: ThreadBlockProps) {
	const messages = useMemo(
		() => events.filter((e) => e.type === 'message') as ContentMessage[],
		[events],
	);
	const messageCount = messages.length;

	// 1-message guard: render as a regular message with a DM badge
	if (messageCount === 1 && messages[0]) {
		const msg = messages[0];
		const otherParticipant = participants.find(p => p !== msg.from) ?? participants[1] ?? '';
		return (
			<div className="tc-thread-block" data-thread-key={threadKey}>
				<MessageStack
					messages={[msg]}
					reactions={reactions}
				/>
				<span className="tc-dm-badge">DM to {otherParticipant}</span>
			</div>
		);
	}

	// Lane container for 2+ messages
	return <ThreadLane
		threadKey={threadKey}
		participants={participants}
		events={events}
		messages={messages}
		reactions={reactions}
		topic={topic}
		messageCount={messageCount}
	/>;
}

interface ThreadLaneProps {
	threadKey: string;
	participants: string[];
	events: ChatEvent[];
	messages: ContentMessage[];
	reactions: Record<string, Reaction[]>;
	topic: string;
	messageCount: number;
}

function ThreadLane({ threadKey, participants, events, messages, reactions, topic, messageCount }: ThreadLaneProps) {
	const [expanded, setExpanded] = useState(false);
	const [showAll, setShowAll] = useState(false);

	// Extract initiator and responder info
	const initiator = messages[0]?.from ?? participants[0] ?? '';
	const initiatorColor = messages[0]?.fromColor ?? '';
	const responder = participants.find(p => p !== initiator) ?? participants[1] ?? '';
	const responderColor = useMemo(() => {
		const responderMsg = messages.find(m => m.from !== initiator);
		return responderMsg?.fromColor ?? '';
	}, [messages, initiator]);

	const isResolved = useMemo(() => isThreadResolved(messages), [messages]);

	const initiatorColorCss = getColorCss(initiatorColor);

	// Capping logic
	let visibleMessages: ContentMessage[];
	if (messages.length <= 3) {
		visibleMessages = messages;
	} else if (!expanded) {
		visibleMessages = [messages[0]!, messages[messages.length - 1]!];
	} else if (messages.length > 20 && !showAll) {
		visibleMessages = messages.slice(0, 15);
	} else {
		visibleMessages = messages;
	}

	const hiddenCount = expanded ? 0 : messages.length - 2;
	const remainingCount = messages.length > 20 && !showAll ? messages.length - 15 : 0;

	const laneItems = useMemo(() => buildMessageLaneItems(events), [events]);

	return (
		<div
			className="tc-dm-lane"
			data-thread-key={threadKey}
			style={{
				borderLeftColor: initiatorColorCss.border,
				backgroundColor: initiatorColorCss.tint,
			}}
		>
			{/* Lane header */}
			<div className="tc-dm-lane-header">
				<div className="tc-avatar-pair">
					<AgentAvatar name={initiator} color={initiatorColor} size="sm" />
					<AgentAvatar name={responder} color={responderColor} size="sm" />
				</div>
				<span className="tc-dm-lane-names">{participants.join(' \u00b7 ')}</span>
				<span className="tc-dm-lane-count">{messageCount} messages</span>
				{isResolved && <span className="tc-dm-lane-resolution">{'\u2705'}</span>}
			</div>

			{/* Alternating bubbles with separator for capped views */}
			{visibleMessages.map((msg, idx) => {
				const isResponder = msg.from !== initiator;
				const msgColorCss = getColorCss(msg.fromColor);
				const isCapped = !expanded && messages.length > 3;
				const showSeparatorAfter = isCapped && idx === 0;

				return (
					<React.Fragment key={msg.id}>
						<div
							className={`tc-dm-bubble ${isResponder ? 'is-responder' : ''}`}
							style={{
								backgroundColor: msgColorCss.tint,
							}}
						>
							<DmBubblePip name={msg.from} color={msg.fromColor} />
							<span className="tc-dm-bubble-text">
								{distillSummary(msg.text, msg.summary, 140)}
							</span>
						</div>
						{showSeparatorAfter && (
							<button
								type="button"
								className="tc-dm-lane-separator"
								onClick={() => setExpanded(true)}
								aria-label="Show all thread messages"
								aria-expanded={expanded}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										setExpanded(true);
									}
								}}
							>
								<div className="tc-dm-lane-separator-line" />
								<span className="tc-dm-lane-separator-label">{hiddenCount} more</span>
								<div className="tc-dm-lane-separator-line" />
							</button>
						)}
					</React.Fragment>
				);
			})}

			{expanded && messages.length > 20 && !showAll && (
				<button
					type="button"
					className="tc-dm-lane-expand"
					onClick={() => setShowAll(true)}
				>
					show all {messages.length} messages ({remainingCount} more)
				</button>
			)}

			{/* Non-message lane items (system events, plan cards, etc.) */}
			{laneItems.filter(item => item.kind !== 'message-stack').map((item) => {
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

				if (item.kind === 'setup-card') {
					return (
						<SetupCard
							key={`setup-${item.events[0]?.id ?? 'card'}`}
							events={item.events}
						/>
					);
				}

				return null;
			})}
		</div>
	);
}
