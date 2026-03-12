# UI Polish & Session Post-Mortem Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve DM thread readability with avatar icons, fix sidebar layout issues (wider rail, scrollable tasks, pinned stats), add celebration animations for completions/resolutions, and build the full Session Post-Mortem recap panel.

**Architecture:** Six tasks across two groups — visual polish (Tasks 1–3, parallelizable) and post-mortem feature (Tasks 4–6, sequential). All CSS uses semantic `--tc-*` tokens. Animations use CSS keyframes only, no JS animation libraries. Post-mortem data is collected server-side and exposed via existing `/state` endpoint.

**Tech Stack:** React 19, Tailwind CSS 4, Bun runtime, CSS keyframes for animations

---

## File Structure

```
src/client/components/ThreadBlock.tsx        — Modify: avatar icons in header
src/client/components/AgentAvatar.tsx         — Modify: add 'xs' size (20px)
src/client/components/TaskSidebar.tsx         — Modify: completion glow animation
src/client/components/TaskCard.tsx            — Modify: completion animation class
src/client/components/SystemEvent.tsx         — Modify: celebration banner treatment
src/client/components/SessionPostMortem.tsx   — Create: full recap panel
src/client/components/ConfettiOverlay.tsx     — Create: lightweight CSS confetti
src/client/App.tsx                            — Modify: sidebar layout, post-mortem trigger
src/client/styles/index.css                   — Modify: sidebar width, pinned stats, animations
src/client/state.ts                           — Modify: hydrate postMortemData
src/client/types.ts                           — Modify: add PostMortemData to ChatState
src/server/processor.ts                       — Modify: collect post-mortem data
src/server/server.ts                          — Modify: expose postMortemData in /state
src/shared/types.ts                           — Modify: add PostMortemData type, extend SessionState
fixtures/tests/postmortem.test.ts             — Create: post-mortem data collection tests
fixtures/tests/thread-avatars.test.ts         — Create: (optional) snapshot tests
```

---

## Task 1: Avatar Icons in DM Thread Headers

Replace text participant names (`billing ↔ schema`) with colored avatar circles in the collapsed ThreadBlock header. Text names become tooltip/aria-label only.

**Files:**
- Modify: `src/client/components/AgentAvatar.tsx`
- Modify: `src/client/components/ThreadBlock.tsx`
- Modify: `src/client/styles/index.css`

**Dependencies:** None (parallelizable with Tasks 2, 3)

### Steps

- [ ] **Step 1: Add `xs` avatar size to AgentAvatar**

In `src/client/components/AgentAvatar.tsx`, extend the `size` prop to accept `'xs' | 'sm' | 'md'`:

```tsx
interface AgentAvatarProps {
	name: string;
	color: string;
	isLead?: boolean;
	size?: 'xs' | 'sm' | 'md';
}
```

The `xs` size renders at 20px with 7px border-radius and 0.6rem font-size. Add `is-xs` class handling:

```tsx
<div className={`tc-avatar ${size === 'sm' ? 'is-sm' : size === 'xs' ? 'is-xs' : ''}`}>
```

- [ ] **Step 2: Add `is-xs` CSS for avatar**

In `src/client/styles/index.css`, add after the existing `.tc-avatar.is-sm` block:

```css
.tc-avatar.is-xs {
	height: 20px;
	width: 20px;
}

.tc-avatar.is-xs .tc-avatar-core {
	height: 20px;
	width: 20px;
	border-radius: 7px;
	font-size: 0.6rem;
}
```

- [ ] **Step 3: Accept `team` prop in ThreadBlock**

ThreadBlock needs the team roster to resolve agent colors for avatars. Update `ThreadBlockProps`:

```tsx
import type { AgentInfo } from '../../shared/types.js';

interface ThreadBlockProps {
	threadKey: string;
	participants: string[];
	events: ChatEvent[];
	reactions: Record<string, Reaction[]>;
	topic: string;
	team: AgentInfo[];
}
```

- [ ] **Step 4: Render avatar pair in thread header**

Replace the text label in the `tc-thread-heading` span with two `AgentAvatar` components:

```tsx
import { AgentAvatar } from './AgentAvatar.jsx';

// Inside the component, resolve colors
const participantInfos = participants.map((name) => {
	const member = team.find((m) => m.name === name);
	return { name, color: member?.color ?? 'gray' };
});

// In the JSX, replace:
//   <span className="tc-thread-title">{label}</span>
// with:
<span className="tc-thread-title" title={label} aria-label={label}>
	<span className="tc-thread-avatars">
		{participantInfos.map((p) => (
			<AgentAvatar key={p.name} name={p.name} color={p.color} size="xs" />
		))}
	</span>
</span>
```

- [ ] **Step 5: Add CSS for avatar pair layout in thread header**

```css
.tc-thread-avatars {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
```

- [ ] **Step 6: Wire team prop through MessageList**

In `src/client/components/MessageList.tsx`, pass `team` to ThreadBlock from the parent. The team members array is available from the ChatState. Update MessageList to accept `team: AgentInfo[]` prop and pass it through:

```tsx
<ThreadBlock
	threadKey={item.threadKey}
	participants={item.participants}
	events={item.events}
	reactions={reactions}
	topic={item.topic}
	team={team}
/>
```

Update MessageList's parent in `App.tsx` to pass `state.team?.members ?? []`.

- [ ] **Step 7: Run typecheck and tests**

```bash
bun run typecheck
bun test
```

- [ ] **Step 8: Commit**

```bash
git add src/client/components/AgentAvatar.tsx src/client/components/ThreadBlock.tsx src/client/components/MessageList.tsx src/client/App.tsx src/client/styles/index.css
git commit -m "Replace text names with avatar icons in DM thread headers"
```

---

## Task 2: Sidebar Layout — Wider Rail, Scrollable Tasks, Pinned Stats

Fix three sidebar layout issues: (a) widen the right rail from 312px to 360px, (b) make the task section scroll independently, (c) pin session stats to the bottom of the viewport.

**Files:**
- Modify: `src/client/styles/index.css`
- Modify: `src/client/App.tsx`

**Dependencies:** None (parallelizable with Tasks 1, 3)

### Steps

- [ ] **Step 1: Widen the right rail**

In `src/client/styles/index.css`, change the rail width from 312px to 360px:

```css
/* .tc-right-rail — change existing width */
.tc-right-rail {
	/* ... existing properties ... */
	width: 360px;
	flex-shrink: 0;
}
```

Also update the grid template in the desktop media query:

```css
@media (min-width: 1024px) {
	.tc-app-body {
		grid-template-columns: minmax(0, 1fr) 360px;
	}
}
```

- [ ] **Step 2: Restructure rail frame for pinned stats**

Update `.tc-rail-frame` to fill available height:

```css
.tc-rail-frame {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
	height: 100%;
}
```

- [ ] **Step 3: Make task section flex-grow and scroll**

Add CSS to make the middle rail section (tasks) grow to fill space and scroll:

```css
.tc-rail-section.is-growable {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding-right: 2px;
}
```

- [ ] **Step 4: Pin stats section to bottom**

Add a class for the bottom-pinned section:

```css
.tc-rail-section.is-pinned-bottom {
	flex-shrink: 0;
	margin-top: auto;
}
```

- [ ] **Step 5: Apply layout classes in App.tsx**

In `App.tsx`, update the `desktopPanels` rendering to wrap each panel with the appropriate class. Change the panel rendering from generic `tc-rail-section` to specific variants:

In `TeamChatScaffold`, update the panel rendering section (around line 583-588):

```tsx
{desktopPanels.map((panel, index) => (
	<div
		key={index}
		className={`tc-rail-section ${
			index === 1 ? 'is-growable' : ''
		} ${
			index === desktopPanels.length - 1 ? 'is-pinned-bottom' : ''
		}`}
	>
		{panel}
	</div>
))}
```

This makes the second panel (TaskSidebar, index 1) scrollable, and the last panel (SessionStats) pinned.

- [ ] **Step 6: Tighten roster badge font sizes for wider rail**

With more space, the truncation goes away. But also tighten up chip text slightly:

```css
.tc-roster-badge {
	font-size: 0.62rem;
}

.tc-roster-state {
	font-size: 0.62rem;
	min-width: 52px;
	text-align: right;
}
```

- [ ] **Step 7: Run typecheck and visual check**

```bash
bun run typecheck
bun test
```

- [ ] **Step 8: Commit**

```bash
git add src/client/styles/index.css src/client/App.tsx
git commit -m "Widen sidebar, make tasks scrollable, pin session stats to bottom"
```

---

## Task 3: Celebration Animations

Add visual fanfare for task completions, thread resolutions, the all-tasks-completed milestone, and session wind-down.

**Files:**
- Create: `src/client/components/ConfettiOverlay.tsx`
- Modify: `src/client/components/SystemEvent.tsx`
- Modify: `src/client/components/TaskCard.tsx`
- Modify: `src/client/components/TaskSidebar.tsx`
- Modify: `src/client/components/ThreadBlock.tsx`
- Modify: `src/client/styles/index.css`
- Modify: `src/client/App.tsx`

**Dependencies:** None (parallelizable with Tasks 1, 2)

### Steps

- [ ] **Step 1: Create CSS confetti keyframes**

In `src/client/styles/index.css`, add keyframes at the end of the file:

```css
/* === Celebration Animations === */

@keyframes confettiFall {
	0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
	100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}

@keyframes celebrationGlow {
	0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
	50% { box-shadow: 0 0 16px 4px rgba(34, 197, 94, 0.2); }
	100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

@keyframes resolutionPulse {
	0% { box-shadow: 0 0 0 0 rgba(91, 109, 247, 0.4); }
	50% { box-shadow: 0 0 12px 3px rgba(91, 109, 247, 0.2); }
	100% { box-shadow: 0 0 0 0 rgba(91, 109, 247, 0); }
}

@keyframes taskCompleteFade {
	0% { background-color: rgba(34, 197, 94, 0.15); }
	100% { background-color: transparent; }
}

@keyframes pulseUnblock {
	0% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.4); }
	50% { box-shadow: 0 0 8px 2px rgba(96, 165, 250, 0.2); }
	100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0); }
}

.tc-task-card.pulse {
	animation: pulseUnblock 3s ease-in-out;
}

.tc-task-card.celebrate {
	animation: celebrationGlow 2s ease-in-out;
}

.tc-task-card.celebrate .tc-status-pill.is-completed {
	animation: taskCompleteFade 2s ease-in-out;
}

.tc-thread-block.is-resolved {
	animation: resolutionPulse 2s ease-in-out;
}

.tc-system-card.is-celebration {
	border-color: rgba(34, 197, 94, 0.3);
	background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(91, 109, 247, 0.08));
}

.tc-system-card.is-celebration .tc-system-icon {
	font-size: 1.4rem;
}

.tc-system-card.is-celebration .tc-system-text {
	font-size: 0.88rem;
	font-weight: 600;
}
```

- [ ] **Step 2: Create ConfettiOverlay component**

Create `src/client/components/ConfettiOverlay.tsx` — a lightweight CSS-only confetti burst:

```tsx
import { useEffect, useState } from 'react';

interface ConfettiOverlayProps {
	active: boolean;
	duration?: number;
}

const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#eab308', '#ef4444', '#06b6d4', '#f97316'];
const PARTICLE_COUNT = 40;

export function ConfettiOverlay({ active, duration = 4000 }: ConfettiOverlayProps) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (!active) return;
		setVisible(true);
		const timer = setTimeout(() => setVisible(false), duration);
		return () => clearTimeout(timer);
	}, [active, duration]);

	if (!visible) return null;

	const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
		const color = COLORS[i % COLORS.length]!;
		const left = Math.random() * 100;
		const delay = Math.random() * 1.5;
		const animDuration = 2 + Math.random() * 2;
		const size = 4 + Math.random() * 6;
		const shape = i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'square' : 'strip';
		return (
			<span
				key={i}
				className="tc-confetti-particle"
				data-shape={shape}
				style={{
					left: `${left}%`,
					backgroundColor: color,
					width: shape === 'strip' ? `${size * 0.4}px` : `${size}px`,
					height: shape === 'strip' ? `${size * 1.8}px` : `${size}px`,
					borderRadius: shape === 'circle' ? '50%' : shape === 'strip' ? '2px' : '1px',
					animationDelay: `${delay}s`,
					animationDuration: `${animDuration}s`,
				}}
			/>
		);
	});

	return (
		<div className="tc-confetti-overlay" aria-hidden="true">
			{particles}
		</div>
	);
}
```

- [ ] **Step 3: Add confetti overlay CSS**

```css
.tc-confetti-overlay {
	position: fixed;
	inset: 0;
	pointer-events: none;
	z-index: 9999;
	overflow: hidden;
}

.tc-confetti-particle {
	position: absolute;
	top: -10px;
	animation: confettiFall linear forwards;
	will-change: transform;
}
```

- [ ] **Step 4: Track recently completed tasks in TaskSidebar**

In `src/client/components/TaskSidebar.tsx`, extend the existing unblock-tracking pattern to also track recently completed tasks:

```tsx
const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set());

// Inside the existing useEffect, after the unblock detection:
const newlyCompleted: string[] = [];
for (const task of tasks) {
	const prevTask = prevMap.get(task.id);
	if (prevTask && prevTask.status !== 'completed' && task.status === 'completed') {
		newlyCompleted.push(task.id);
	}
}

if (newlyCompleted.length > 0) {
	setRecentlyCompleted((prev) => {
		const next = new Set(prev);
		for (const id of newlyCompleted) next.add(id);
		return next;
	});
	const compTimer = setTimeout(() => {
		setRecentlyCompleted((prev) => {
			const next = new Set(prev);
			for (const id of newlyCompleted) next.delete(id);
			return next;
		});
	}, 2500);
	// Clean up timer alongside existing timer
}
```

Pass `isCelebrating={recentlyCompleted.has(task.id)}` to TaskCard.

- [ ] **Step 5: Add celebrate class to TaskCard**

In `src/client/components/TaskCard.tsx`, accept and apply the class:

```tsx
interface TaskCardProps {
	task: TaskInfo;
	onTaskClick: (taskId: string) => void;
	isPulsing?: boolean;
	isCelebrating?: boolean;
}

// In the className:
className={`tc-task-card ${isPulsing ? 'pulse' : ''} ${isCelebrating ? 'celebrate' : ''}`}
```

- [ ] **Step 6: Add resolved class to ThreadBlock**

In `src/client/components/ThreadBlock.tsx`, add the resolved class when all beat reactions include a resolution:

```tsx
const isResolved = beatEmojis.includes('🤝');

// On the outer div:
<div className={`tc-thread-block ${isResolved ? 'is-resolved' : ''}`} data-thread-key={threadKey}>
```

- [ ] **Step 7: Wire confetti into App for all-tasks-completed**

In `App.tsx`, detect `all-tasks-completed` events and trigger confetti:

```tsx
import { ConfettiOverlay } from './components/ConfettiOverlay.jsx';

// Inside TeamChatScaffold or LiveWorkspace:
const allTasksCompleted = state.events.some(
	(e) => e.type === 'system' && e.subtype === 'all-tasks-completed'
);
const [confettiTriggered, setConfettiTriggered] = useState(false);
const prevAllCompleted = useRef(false);

useEffect(() => {
	if (allTasksCompleted && !prevAllCompleted.current) {
		setConfettiTriggered(true);
	}
	prevAllCompleted.current = allTasksCompleted;
}, [allTasksCompleted]);

// In the JSX, add before the closing </div> of tc-app-shell:
<ConfettiOverlay active={confettiTriggered} />
```

- [ ] **Step 8: Run typecheck and tests**

```bash
bun run typecheck
bun test
```

- [ ] **Step 9: Commit**

```bash
git add src/client/components/ConfettiOverlay.tsx src/client/components/TaskSidebar.tsx src/client/components/TaskCard.tsx src/client/components/ThreadBlock.tsx src/client/components/SystemEvent.tsx src/client/App.tsx src/client/styles/index.css
git commit -m "Add celebration animations for task completion, thread resolution, and session end"
```

---

## Task 4: Post-Mortem Data Collection

Add server-side tracking for session recap data: agent timelines, DM pair counts, broadcast log, bottleneck log, and noise metrics. Expose via existing `/state` endpoint.

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/server/processor.ts`
- Modify: `src/server/server.ts`
- Modify: `src/client/types.ts`
- Modify: `src/client/state.ts`
- Create: `fixtures/tests/postmortem.test.ts`

**Dependencies:** None from Tasks 1–3, but Tasks 5 and 6 depend on this.

### Steps

- [ ] **Step 1: Define PostMortemData type**

In `src/shared/types.ts`, add after the `ThreadStatus` interface:

```typescript
export interface AgentTimeline {
	name: string;
	color: string;
	joinedAt: string;
	completedAt: string | null;
	idleRanges: [string, string][];
	tasksCompleted: number;
}

export interface DmPairCount {
	participants: [string, string];
	messageCount: number;
	topic: string;
}

export interface BottleneckEntry {
	taskId: string;
	owner: string;
	waiters: string[];
	durationMs: number;
}

export interface PostMortemData {
	sessionComplete: boolean;
	totalDurationMs: number;
	agentTimelines: AgentTimeline[];
	dmPairCounts: DmPairCount[];
	broadcastCount: number;
	bottlenecks: BottleneckEntry[];
	stats: {
		agentCount: number;
		taskCount: number;
		completedTaskCount: number;
		messageCount: number;
		systemEventCount: number;
		idlePingsSuppressed: number;
		dmThreadCount: number;
	};
}
```

Extend `SessionState` to include the post-mortem data:

```typescript
export interface SessionState {
	team: TeamState;
	events: ChatEvent[];
	tasks: TaskInfo[];
	presence: Record<string, 'working' | 'idle' | 'offline'>;
	sessionStart: string;
	threadStatuses: ThreadStatus[];
	postMortem: PostMortemData | null;
}
```

- [ ] **Step 2: Add tracking fields to EventProcessor**

In `src/server/processor.ts`, add new fields after line 101 (`threadStatuses`):

```typescript
// Post-mortem tracking
private agentJoinTimes: Map<string, string> = new Map();
private agentCompletionTimes: Map<string, string> = new Map();
private agentIdleRanges: Map<string, [string, string][]> = new Map();
private agentIdleStart: Map<string, string> = new Map();
private dmPairMessageCounts: Map<string, number> = new Map();
private dmPairTopics: Map<string, string> = new Map();
private broadcastCount = 0;
private bottlenecks: BottleneckEntry[] = [];
private sessionComplete = false;
private sessionCompleteTime: string | null = null;
```

- [ ] **Step 3: Instrument existing event paths**

In the processor's existing event handling methods, add tracking calls:

**On member-joined** (in `processConfigChange`): record `agentJoinTimes.set(name, timestamp)`.

**On presence change to idle**: record `agentIdleStart.set(name, timestamp)`.

**On presence change to working** (from idle): record idle range and clear start.

**On DM emit**: increment `dmPairMessageCounts` for the sorted pair key. On first DM, record topic.

**On broadcast emit**: increment `broadcastCount`.

**On task-completed**: record `agentCompletionTimes.set(owner, timestamp)`. Check if blocked tasks existed and log bottleneck if wait was significant (> 60s).

**On all-tasks-completed**: set `sessionComplete = true`, record time.

- [ ] **Step 4: Add getPostMortemData method**

```typescript
getPostMortemData(sessionStart: string): PostMortemData {
	const now = this.sessionCompleteTime ?? new Date().toISOString();
	const totalDurationMs = new Date(now).getTime() - new Date(sessionStart).getTime();

	const agentTimelines: AgentTimeline[] = [];
	for (const [name, joinedAt] of this.agentJoinTimes) {
		const member = [...this.presence.keys()].includes(name);
		if (!member) continue;
		agentTimelines.push({
			name,
			color: 'gray', // Will be enriched from team config
			joinedAt,
			completedAt: this.agentCompletionTimes.get(name) ?? null,
			idleRanges: this.agentIdleRanges.get(name) ?? [],
			tasksCompleted: Array.from(this.previousTasks.values())
				.filter((t) => t.owner === name && t.status === 'completed').length,
		});
	}

	const dmPairCounts: DmPairCount[] = [];
	for (const [key, count] of this.dmPairMessageCounts) {
		const parts = key.split(':') as [string, string];
		dmPairCounts.push({
			participants: parts,
			messageCount: count,
			topic: this.dmPairTopics.get(key) ?? '',
		});
	}

	const messages = this.allEvents.filter((e) => e.type === 'message');
	const systemEvents = this.allEvents.filter((e) => e.type === 'system');

	return {
		sessionComplete: this.sessionComplete,
		totalDurationMs: Math.max(0, totalDurationMs),
		agentTimelines,
		dmPairCounts: dmPairCounts.sort((a, b) => b.messageCount - a.messageCount),
		broadcastCount: this.broadcastCount,
		bottlenecks: this.bottlenecks,
		stats: {
			agentCount: this.agentJoinTimes.size,
			taskCount: this.previousTasks.size,
			completedTaskCount: Array.from(this.previousTasks.values())
				.filter((t) => t.status === 'completed').length,
			messageCount: messages.length,
			systemEventCount: systemEvents.length,
			idlePingsSuppressed: this.idlePingCount,
			dmThreadCount: this.threadStatuses.size,
		},
	};
}
```

- [ ] **Step 5: Expose in server's getSessionState**

In `src/server/server.ts`, add to the `getSessionState` return:

```typescript
postMortem: this.processor.getPostMortemData(this.sessionStart),
```

- [ ] **Step 6: Add PostMortemData to client types**

In `src/client/types.ts`, import and add to ChatState:

```typescript
import type { ..., PostMortemData } from '../shared/types.js';

export interface ChatState {
	// ... existing fields ...
	postMortem: PostMortemData | null;
}

export const INITIAL_STATE: ChatState = {
	// ... existing fields ...
	postMortem: null,
};
```

- [ ] **Step 7: Hydrate postMortem in client state**

In `src/client/state.ts`, update `hydrateChatState` and `cloneChatState`:

```typescript
// In hydrateChatState:
postMortem: session.postMortem ?? null,

// In cloneChatState:
postMortem: state.postMortem ? { ...state.postMortem } : null,
```

- [ ] **Step 8: Write tests**

Create `fixtures/tests/postmortem.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
// Test that:
// 1. getPostMortemData returns sessionComplete: false initially
// 2. After processing member-joined events, agentTimelines populate
// 3. DM pair counts increment correctly
// 4. all-tasks-completed sets sessionComplete: true
// 5. idlePingsSuppressed counts idle ping absorptions
```

Use the existing `createCollector()` + `EventProcessor` pattern from `conversation-beats.test.ts`.

- [ ] **Step 9: Run typecheck and tests**

```bash
bun run typecheck
bun test
```

- [ ] **Step 10: Commit**

```bash
git add src/shared/types.ts src/server/processor.ts src/server/server.ts src/client/types.ts src/client/state.ts fixtures/tests/postmortem.test.ts
git commit -m "Add post-mortem data collection and wire through server/client state"
```

---

## Task 5: SessionPostMortem Component

Build the slide-up recap panel that renders after session completion or on demand via "View Recap" button.

**Files:**
- Create: `src/client/components/SessionPostMortem.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles/index.css`

**Dependencies:** Task 4 (PostMortemData must be available in state)

### Steps

- [ ] **Step 1: Create SessionPostMortem component**

Create `src/client/components/SessionPostMortem.tsx`:

```tsx
import React from 'react';
import type { PostMortemData, TeamState } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';

interface SessionPostMortemProps {
	data: PostMortemData;
	team: TeamState;
	onDismiss: () => void;
}

export function SessionPostMortem({ data, team, onDismiss }: SessionPostMortemProps) {
	// Sections:
	// 1. Header: "Session Complete 🎉" + duration
	// 2. Stats strip: agents, tasks, duration, messages, idle pings suppressed
	// 3. Coordination map: DM pair counts as rows with avatar pairs + message count
	// 4. Agent timeline: horizontal bars (working/idle/done)
	// 5. Noise ratio: raw estimate vs teamchat signal
}
```

The component renders as a slide-up overlay panel with `tc-postmortem` class.

**Sections detail:**

**Header:** Large "Session Complete" text with 🎉, formatted duration.

**Stats strip:** Horizontal row of `tc-stat-chip` elements:
- `{stats.agentCount} agents`
- `{stats.completedTaskCount}/{stats.taskCount} tasks`
- Duration formatted as `Xm Ys`
- `{stats.messageCount} messages`
- `{stats.idlePingsSuppressed} idle pings absorbed`

**Coordination map:** For each DM pair, render a row with two xs avatars, arrow, message count, and topic snippet:
```
[A] ←→ [S]  4 messages  "middleware ordering"
```

**Agent timeline:** For each agent in `agentTimelines`, render a horizontal bar. The bar width is proportional to session duration. Colored segments show working time, dimmed segments show idle ranges. Show completion time label at the end.

**Noise ratio:** Show comparison text:
```
teamchat: {messageCount} messages, {systemEventCount} system events
Idle pings absorbed: {idlePingsSuppressed}
```

- [ ] **Step 2: Add PostMortem CSS**

In `src/client/styles/index.css`:

```css
/* Post-mortem overlay */
.tc-postmortem-overlay {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	max-height: 60vh;
	background: rgba(7, 14, 22, 0.97);
	backdrop-filter: blur(16px);
	border-top: 1px solid rgba(255, 255, 255, 0.06);
	border-radius: 20px 20px 0 0;
	z-index: 100;
	overflow-y: auto;
	padding: 28px 32px 36px;
	animation: slideUpOverlay 400ms ease-out;
}

@keyframes slideUpOverlay {
	from { transform: translateY(100%); }
	to { transform: translateY(0); }
}

.tc-postmortem-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 20px;
}

.tc-postmortem-title {
	font-size: 1.3rem;
	font-weight: 700;
	color: var(--text-primary);
}

.tc-postmortem-duration {
	font-size: 0.85rem;
	color: var(--text-muted);
}

.tc-postmortem-dismiss {
	background: none;
	border: none;
	color: var(--text-muted);
	cursor: pointer;
	font-size: 1.2rem;
	padding: 4px 8px;
}

.tc-postmortem-section {
	margin-bottom: 20px;
}

.tc-postmortem-section-title {
	font-size: 0.72rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--text-muted);
	margin-bottom: 8px;
}

.tc-postmortem-stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
	gap: 8px;
}

/* Coordination map row */
.tc-coord-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.tc-coord-pair {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 64px;
}

.tc-coord-arrow {
	font-size: 0.7rem;
	color: var(--text-muted);
}

.tc-coord-count {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--text-primary);
	min-width: 28px;
}

.tc-coord-topic {
	font-size: 0.72rem;
	color: var(--text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* Agent timeline bars */
.tc-timeline-row {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 4px;
}

.tc-timeline-label {
	font-size: 0.72rem;
	color: var(--text-muted);
	width: 72px;
	text-align: right;
	flex-shrink: 0;
}

.tc-timeline-bar {
	flex: 1;
	height: 12px;
	background: rgba(255, 255, 255, 0.04);
	border-radius: 6px;
	overflow: hidden;
	position: relative;
}

.tc-timeline-segment {
	position: absolute;
	top: 0;
	height: 100%;
	border-radius: 6px;
}

.tc-timeline-done-label {
	font-size: 0.62rem;
	color: var(--text-muted);
	flex-shrink: 0;
	width: 48px;
}
```

- [ ] **Step 3: Add "View Recap" button to header**

When `postMortem?.sessionComplete` is true, show a button in the app header area (not inside the Header component — in the top-content area or as a floating button):

```tsx
const [showPostMortem, setShowPostMortem] = useState(false);

// Auto-show on session complete
useEffect(() => {
	if (state.postMortem?.sessionComplete && !showPostMortem) {
		// Small delay so confetti plays first
		const timer = setTimeout(() => setShowPostMortem(true), 2000);
		return () => clearTimeout(timer);
	}
}, [state.postMortem?.sessionComplete]);
```

Add a "View Recap" button in the header trailing area when session is complete.

- [ ] **Step 4: Render PostMortem overlay in App**

In `TeamChatScaffold`, render the overlay when `showPostMortem` is true:

```tsx
{showPostMortem && state.postMortem && state.team && (
	<SessionPostMortem
		data={state.postMortem}
		team={state.team}
		onDismiss={() => setShowPostMortem(false)}
	/>
)}
```

- [ ] **Step 5: Run typecheck and tests**

```bash
bun run typecheck
bun test
```

- [ ] **Step 6: Commit**

```bash
git add src/client/components/SessionPostMortem.tsx src/client/App.tsx src/client/styles/index.css
git commit -m "Add SessionPostMortem slide-up recap panel with stats, coordination map, and timelines"
```

---

## Task 6: Replay Post-Mortem Integration

Make the post-mortem panel available immediately in replay mode since all data is known upfront.

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/server/replay.ts`

**Dependencies:** Task 5

### Steps

- [ ] **Step 1: Compute PostMortemData from replay bundle**

In `src/server/replay.ts`, add a function that derives PostMortemData from a complete ReplayBundle's entries and tasks. This is a pure computation — no live tracking needed since all data is known:

```typescript
export function derivePostMortemFromBundle(bundle: ReplayBundle): PostMortemData {
	// Walk all entries once:
	// - Track agent join/completion times from system events
	// - Count DM pairs from message events with isDM
	// - Count broadcasts
	// - Detect bottlenecks from task-update sequences
	// - Compute stats from final tallies
}
```

- [ ] **Step 2: Expose in replay bootstrap**

In `src/server/server.ts`, include post-mortem data in the replay bootstrap:

```typescript
// In getBootstrap, when mode === 'replay':
replayPostMortem: derivePostMortemFromBundle(this.replay.bundle),
```

Update `AppBootstrap` type in `src/shared/replay.ts` to include the field.

- [ ] **Step 3: Wire into ReplayWorkspaceLoaded**

In `App.tsx`, the replay workspace should pass the post-mortem data through and show a "View Recap" button immediately in the replay toolbar:

```tsx
// In ReplayWorkspaceLoaded:
const [showPostMortem, setShowPostMortem] = useState(false);

// Add "View Recap" button in the replay toolbar (next to Play/Pause/Speed controls)
```

- [ ] **Step 4: Run typecheck and tests**

```bash
bun run typecheck
bun test
```

- [ ] **Step 5: Commit**

```bash
git add src/server/replay.ts src/server/server.ts src/shared/replay.ts src/client/App.tsx
git commit -m "Add replay post-mortem: compute from bundle, show View Recap immediately"
```

---

## Implementation Order

```
Tasks 1, 2, 3   (parallel — independent visual work)
    ↓
Task 4           (post-mortem data collection)
    ↓
Task 5           (post-mortem component)
    ↓
Task 6           (replay integration)
```

Tasks 1–3 can be dispatched as parallel subagents. Tasks 4–6 are sequential.

## Visual Verification

After all tasks, use the saaskit replay session to verify:
1. Thread headers show avatar pairs instead of text names
2. Sidebar is wider, tasks scroll, stats are pinned to bottom
3. When replay reaches task completions, task cards glow green
4. When replay reaches all-tasks-completed, confetti fires
5. "View Recap" button appears, clicking it shows the post-mortem panel with stats, coordination map, and timelines
