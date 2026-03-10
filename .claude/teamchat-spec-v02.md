# `teamchat` — Group Chat Visualizer for Claude Code Agent Teams

## Product Spec v0.2

---

## The Idea

Render Claude Code Agent Teams coordination as a **familiar group chat interface** — Slack/WhatsApp/iMessage style — where the lead and each teammate appear as participants in a shared conversation. Messages are distilled, humanized, and presented in a format any developer already knows how to read.

No graph theory. No swim lanes. No dashboards. Just a group chat.

---

## Why This Metaphor Works

Agent Teams already *is* a group chat under the hood. The filesystem primitives map 1:1:

| Agent Teams Primitive | Group Chat Equivalent |
|---|---|
| `SendMessage` type `message` | Direct message / @mention |
| `SendMessage` type `broadcast` | Message to #general channel |
| `idle_notification` | Presence indicator (💤 in sidebar) |
| `shutdown_request` / `shutdown_response` | "X has left the chat" / "X is leaving..." |
| `plan_approval_request` / `plan_approval_response` | Shared document card with 👍/👎 reaction |
| `permission_request` | Interactive card with ✅/🚫 reaction |
| `task_completed` | ✅ reaction on originating task card |
| `TaskCreate` | Pinned task card in sidebar |
| `TaskUpdate` (claim) | ✋ reaction on lead's assignment message |
| `TaskUpdate` (status change) | Status emoji update on sidebar task |
| `config.json` member added | "X joined the chat" system message |
| `config.json` member removed | "X left the chat" system message |
| `team-lead` inbox | The main conversation thread |
| `{teammate}.json` inbox | DM thread / side thread |

The analogy holds because the *actual coordination protocol* is conversational. Agents write natural language messages to each other's inboxes. The only departure from a real chat is the system event messages (idle pings, shutdown handshakes), and those map cleanly to presence indicators and join/leave events that every chat app already handles.

---

## Data Sources (All Filesystem)

### Primary — Inbox Files (the messages)
```
~/.claude/teams/{team-name}/inboxes/{agent-name}.json
```

Each file is a JSON array. Each entry:

```json
{
  "from": "worker-1",
  "text": "plain text content OR stringified JSON for system events",
  "summary": "short preview (plain text messages only)",
  "timestamp": "2026-02-18T18:39:39.925Z",
  "color": "blue",
  "read": false
}
```

**Message type detection** — parse `text` field:
- If `JSON.parse(text)` succeeds and has a `type` field → system event
- Otherwise → plain text content message

**Known system event types** (from `text` field when parsed as JSON):
- `idle_notification` — agent finished its turn, polling for work. Fields: `idleReason`, `completedTaskId`, `completedStatus`
- `shutdown_request` — lead asking agent to shut down. Fields: `requestId`, `reason`
- `shutdown_approved` — agent confirming shutdown. Fields: `requestId`, `paneId`, `backendType`
- `shutdown_rejected` — agent refusing shutdown (still working). Fields: `requestId`, `reason`
- `task_completed` — agent finished a specific task. Fields: `taskId`, `taskSubject`
- `plan_approval_request` — agent submitting plan for review. Fields: `requestId`, `planContent`
- `plan_approval_response` — lead approving/rejecting plan. Fields: `requestId`, `approved`, `feedback`
- `join_request` — agent requesting to join team. Fields: `proposedName`, `requestId`, `capabilities`
- `permission_request` — agent asking lead to approve a tool use. Fields: `requestId`, `workerId`, `workerName`, `workerColor`, `toolName`, `description`, `input`, `permissionSuggestions`
- `task_assignment` — internal tracking

**Inbox ownership determines message routing:**
- Message found in `team-lead.json` with `from: "backend"` → teammate→lead message (left-aligned in chat)
- Message found in `backend.json` with `from: "team-lead"` → lead→teammate message (right-aligned)
- Message found in `frontend.json` with `from: "backend"` → teammate→teammate DM (rendered as thread)
- Same message found in ALL teammate inboxes → broadcast (📢 indicator)

**Broadcast detection heuristic:** If messages with identical `text` and `timestamp` (within 1s tolerance) appear in 3+ inboxes simultaneously, classify as broadcast.

### Secondary — Task Files (the work)
```
~/.claude/tasks/{team-name}/tasks.json
  OR
~/.claude/tasks/{team-name}/{id}.json
```

Each task:
```json
{
  "id": "1",
  "subject": "Implement JWT auth middleware",
  "description": "Add JWT validation to API routes...",
  "status": "pending | in_progress | completed | failed",
  "owner": "worker-1" | null,
  "blockedBy": ["0"] | null,
  "activeForm": "Setting up auth middleware...",
  "created": "ISO8601",
  "updated": "ISO8601"
}
```

**Task state diffing:** On every `tasks.json` change, diff against previous state to detect:
- New tasks (TaskCreate) → task card in sidebar
- Owner change (null → agent name) → task claim event
- Status change (pending → in_progress → completed/failed) → system message + sidebar update
- **Dependency unblock cascade:** When a task completes, scan all pending tasks. If all entries in a task's `blockedBy` array now have `completed` status, that task just unblocked. Emit a system event. Note: the `blockedBy` field in the JSON never changes — availability is computed fresh every time by cross-referencing statuses.

### Tertiary — Team Config (the roster)
```
~/.claude/teams/{team-name}/config.json
```

Contains `members` array with each agent's `name`, `agentId`, `agentType`, and `color`. Diff against previous state to detect join/leave events.

**Important:** Inbox files are created lazily — they don't exist until the first message is written TO that agent. The lead's inbox may not appear for minutes after team creation. Handle this gracefully (don't error on missing files).

---

## Emoji Reactions System

### Design Philosophy

Reactions in teamchat follow the same conventions used by professional engineering teams on Slack: functional signals that replace low-information messages, not decorative flourish. Every reaction must map to a real protocol event. Fabricated emotional reactions (🔥, 💪, 🤔) are never generated — agents don't have emotions, and pretending they do undermines trust in a debugging tool.

### Tier 1 — Protocol-Event Reactions (ship as default)

These reactions are derived from protocol events that provably occurred. They appear on the originating message automatically.

| Protocol Event | Reaction | Appears On | Attributed To |
|---|---|---|---|
| Task claimed after lead assigns it | ✋ | Lead's assignment message | Claiming agent |
| Task completed | ✅ | Original TaskCreate card or assignment message | Completing agent |
| Plan approved | 👍 | plan_approval_request card | team-lead |
| Plan rejected | 👎 | plan_approval_request card (opens thread with feedback) | team-lead |
| Permission approved | ✅ | permission_request card | team-lead |
| Permission denied | 🚫 | permission_request card | team-lead |
| Shutdown approved | 👋 | shutdown_request system message | Departing agent |
| Shutdown rejected | 🙅 | shutdown_request system message (opens thread with reason) | Rejecting agent |
| All tasks completed | 🎉 | Final task-completed system message | teamchat (the one editorial reaction) |

**Correlation logic for task claims:** When a `TaskUpdate` sets `owner` on a task, scan recent lead messages (last 60 seconds) for content that references the task subject or task ID. If found, attach the ✋ reaction to that message. If not found (agent self-claimed without lead assignment), emit a system message instead.

**Reaction rendering:** Reactions appear as a small row below the message, identical to Slack:
```
👑 team-lead                                              10:00
┌──────────────────────────────────────────────────────────────┐
│ @backend — you own the schema and API. Start with #1...       │
│ @frontend — wait for the schema, then #3 and #7...            │
│ @privacy — you own #4 and #5...                               │
│ @qa — blocked until #2, #3, #4 are done...                    │
└──────────────────────────────────────────────────────────────┘
  ✋ backend  ✋ privacy  👀 qa
```

Reactions do NOT scroll away — they're permanently attached to the message they react to. This makes them strictly better than system messages for acknowledgment tracking, because the acknowledgment stays co-located with the thing being acknowledged.

### Tier 2 — Inferred Acknowledgment Reactions (opt-in "Compact Mode")

When a teammate sends a short content message (< 50 chars) within 30 seconds of another message, and the content is an acknowledgment phrase, compress it into a reaction on the referenced message instead of a separate chat bubble.

**Acknowledgment phrases detected:** "Got it", "On it", "Will do", "Sounds good", "Understood", "Confirmed", "Thanks", "Good catch", "Makes sense", "Agreed", "Roger", "OK", "Sure"

**Mapped to:** 👍 (agreement/confirmation), 👀 (investigating), 🙏 (thanks)

**This is a toggle:** `--compact` flag or UI setting. Off by default. When off, these short messages render as normal chat bubbles. When on, they compress into reactions and the chat becomes significantly shorter.

**Why this is defensible:** The agent DID send a message. We're compressing its visual representation, not fabricating content. The full message text is always available on hover/click of the reaction.

### What We Do NOT Do

- **No fabricated emotional reactions.** No 🔥 on impressive code, no 🤔 on questions, no 💪 on task completions. The agents didn't express these emotions.
- **No reaction GIFs.** Not in v1. The `--fun` flag idea is noted for future exploration but risks undermining the tool's credibility as a debugging aid.
- **No reactions from teamchat's own analysis** except the single 🎉 on all-tasks-completed. Every other reaction traces to a specific protocol event.

---

## UI Design

### Layout: Single-Column Chat + Sidebar

```
┌─────────────────────────────────────────────────────────────────┐
│  ⬡ teamchat           healthdash-sprint          4 online      │
├────────────────────────────────────────┬────────────────────────┤
│                                        │  📋 Tasks              │
│  ┌─ system ───────────────────────┐    │                        │
│  │ 🟢 backend joined              │    │  ✅ #1 Design schema   │
│  │ 🟢 frontend joined             │    │     → backend  3m      │
│  │ 🟢 privacy joined              │    │  🔵 #2 API endpoints  │
│  │ 🟢 qa joined                   │    │     → backend          │
│  └────────────────────────────────┘    │  🔵 #3 React dashboard│
│                                        │     → frontend         │
│  👑 team-lead                  10:00   │  🔵 #4 PHI encryption  │
│  ┌────────────────────────────────┐    │     → privacy          │
│  │ Alright. Here's the plan:      │    │  ⏳ #5 Data masking    │
│  │ @backend — schema and API...   │    │     blocked by #4      │
│  │ @frontend — React components...│    │  ⏳ #6 Integration     │
│  │ @privacy — encryption...       │    │     blocked #2,#3,#4   │
│  │ @qa — blocked, prep tests...   │    │  ⏳ #7 Accessibility   │
│  └────────────────────────────────┘    │     blocked by #3      │
│    ✋ backend  ✋ privacy  👀 qa       │  ⏳ #8 HIPAA valid.    │
│                                        │     blocked #4,#5,#6   │
│        backend 🔵              10:00   │────────────────────────│
│        ┌──────────────────────┐        │  👥 Team               │
│        │ Claimed #1. Exploring │        │                        │
│        │ the Prisma schema.    │        │  👑 team-lead          │
│        └──────────────────────┘        │  🔵 backend  ⚡        │
│                                        │  🟢 frontend ⚡        │
│  ── backend → frontend, privacy ──     │  🟣 privacy  ⚡        │
│        backend 🔵              10:05   │  🟡 qa       💤        │
│        ┌──────────────────────┐        │                        │
│        │ Schema draft ready.   │        │                        │
│        │ patients, encounters, │        │                        │
│        │ vitals, medications.  │        │                        │
│        │ Cols marked ↟ = PHI.  │        │                        │
│        │  ▸ Full schema (38 ln)│        │                        │
│        └──────────────────────┘        │                        │
│          👍 frontend  👍 privacy       │                        │
│  ── #general ─────────────────────     │                        │
│                                        │                        │
│  ┌─ 📋 PLAN ─────────────────────┐    │                        │
│  │ 🟣 privacy: Encryption Strat. │    │                        │
│  │  ▸ View plan (12 lines)       │    │                        │
│  └────────────────────────────────┘    │                        │
│    👍 team-lead: "Approved. Add..."    │                        │
│                                        │                        │
└────────────────────────────────────────┴────────────────────────┘
```

### Message Rendering Rules

**Lead messages** — right-aligned (like "your" messages in iMessage). Crown emoji (👑) avatar. The lead IS you, or your proxy.

**Teammate messages** — left-aligned, each with their assigned `color` from config.json. Color is rendered as an accent dot/stripe on the message bubble and a colored circle avatar.

**System events** — centered, muted, small text:
- `idle_notification` → **SUPPRESS from chat**. Show as 💤/⚡ presence dot in sidebar roster only. Surface a single "💤 X is idle" system message only after 30s of continuous idle pings (configurable). This is critical — a 42-minute idle period produces ~630 idle pings. Without suppression the chat is 95% noise.
- `shutdown_request` → "👑 team-lead asked X to leave"
- `shutdown_approved` → "👋 X has left the chat" (with 👋 reaction on the request)
- `shutdown_rejected` → "🙅 X declined: [reason]" (opens thread on the request)
- `task_completed` → "✅ X completed: [subject]" + ✅ reaction on originating message
- `plan_approval_request` → expandable card with plan content
- `plan_approval_response` → 👍/👎 reaction on the plan card, feedback as thread
- `permission_request` → distinct card: "🔐 X wants to run: `command`" with ✅/🚫 reaction once resolved
- `join_request` → "🙋 X wants to join the team"
- `config.json` member add → "🟢 X joined the chat" (grouped if multiple arrive within 5s)
- `config.json` member remove → "X left the chat"
- **Dependency unblock cascade** → "🔓 #N unblocked → available for [owner or 'anyone']" — this is a computed event, not a message. Highlight in the sidebar with a pulse animation on the unblocked task.
- **All tasks completed** → "🎉 All N tasks completed!" with 🎉 reaction on the final task-completed message.

**DM threads** — when a message targets a specific teammate's inbox (not team-lead's), render as a collapsible thread section:
```
── backend → frontend (DM) ──────────────────
  [messages between them, chronologically]
── #general ─────────────────────────────────
```

Consecutive DMs between the same pair within 5 minutes are grouped into a single thread block. If a DM thread is followed by a message to the lead referencing the DM outcome, show a "💬 resolved in DM" indicator linking to the thread.

**Broadcast messages** — render with a 📢 indicator next to the sender name.

**Content formatting within messages:**
- Markdown in agent messages → render with basic formatting (bold, code, lists)
- Code blocks → collapsible with syntax highlighting
- Markdown tables → render inline or collapse behind "📊 shared a table (expand)"
- Long messages (> 300 chars) → show `summary` field if available, full `text` on expand. If no summary, truncate at 200 chars with "... (expand)"

### Task Sidebar

Right sidebar, always visible, updating in real time as tasks.json changes:

- Status icons: ⏳ pending, 🔵 in_progress, ✅ completed, ❌ failed
- Each task shows: status icon, `#id`, subject (truncated), owner (if claimed), duration since claim
- Blocked tasks show dependency chain: "blocked by #2, #4"
- When a task unblocks, pulse animation on the task card for 3 seconds
- Clicking a task scrolls to and highlights related messages in the chat (messages that reference that task ID or subject)
- Progress bar at top: "5/8 tasks completed"

### Presence Roster

Below tasks in sidebar:

- Agent name + color dot + status icon
- ⚡ working (received no idle_notification in last 10s)
- 💤 idle (receiving idle pings)
- 🔴 offline (shutdown_approved received or removed from config)
- Clicking an agent name filters the chat to show only their messages

---

## Architecture

### Runtime Model

```
┌───────────────────────────────────────┐
│  File Watcher (chokidar)              │
│  watches:                             │
│   ~/.claude/teams/{name}/inboxes/*.json│
│   ~/.claude/tasks/{name}/*.json       │
│   ~/.claude/teams/{name}/config.json  │
│                                       │
│  On change: read file, diff against   │
│  previous snapshot, emit delta events │
└──────────────┬────────────────────────┘
               │ raw events
               ▼
┌───────────────────────────────────────┐
│  Event Processor                      │
│                                       │
│  1. Parse message type (content vs    │
│     system event via JSON.parse)      │
│  2. Detect broadcasts (same text in   │
│     3+ inboxes within 1s)            │
│  3. Detect DMs (message in teammate   │
│     inbox from non-lead sender)       │
│  4. Suppress idle pings (collapse to  │
│     presence state, surface after 30s)│
│  5. Correlate task claims to lead     │
│     messages (for ✋ reactions)        │
│  6. Compute dependency unblocks       │
│     (diff task statuses)              │
│  7. Detect all-tasks-completed        │
│  8. (Compact mode) Detect short       │
│     acknowledgment messages           │
│                                       │
│  Output: ChatEvent stream             │
│  Types: message, system, reaction,    │
│         thread-start, thread-end,     │
│         presence-change, task-update   │
└──────────────┬────────────────────────┘
               │ ChatEvents
               ▼
┌───────────────────────────────────────┐
│  WebSocket Server (Bun)               │
│  - Broadcasts ChatEvents to clients   │
│  - Serves static client files         │
│  - REST endpoint: GET /state for      │
│    initial hydration on connect       │
└──────────────┬────────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│  Browser Client (React)               │
│  - Chat message list (virtualized)    │
│  - Task sidebar                       │
│  - Presence roster                    │
│  - Reaction rendering                 │
│  - Thread collapse/expand             │
│  - Message expand/collapse for long   │
│    content                            │
│  - Session stats footer               │
└───────────────────────────────────────┘
```

### Auto-Detection & Startup

When a team starts, `TeamCreate` writes `config.json`. The watcher detects this and initializes the chat session. When `TeamDelete` cleans up, the chat shows a "🏁 Team disbanded" message and freezes as a readable log.

**Ideal DX**: a PostToolUse hook on Teammate that launches teamchat automatically:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Teammate",
      "hooks": [{
        "type": "command",
        "command": "teamchat --team $CLAUDE_CODE_TEAM_NAME &"
      }]
    }]
  }
}
```

Or simply: `teamchat --watch ~/.claude/teams/` to auto-detect any team creation.

### Data Snapshot for Replay

`TeamDelete` removes all inbox and task files. To support replay, teamchat must either:
1. **Snapshot on shutdown:** A PreToolUse hook on `Teammate` (matcher for cleanup/TeamDelete operation) copies the team directory to `~/.teamchat/sessions/{team-name}-{timestamp}/` before deletion.
2. **Continuous journaling:** As inbox files change, append parsed events to a local JSONL file at `~/.teamchat/sessions/{team-name}.jsonl`. This survives TeamDelete without hooks.

**Recommendation:** Option 2. The JSONL journal is cheap, doesn't require hook configuration, and provides the replay dataset automatically. The journal is also the data source for session stats.

### Replay Mode

```bash
teamchat --replay ~/.teamchat/sessions/healthdash-sprint.jsonl
```

Replay controls: play/pause, speed (1x/2x/5x/10x), scrub timeline, jump to task completions. In replay mode, reactions appear with their messages as they occurred chronologically.

### Tech Stack

- **Runtime**: Bun (server + file watching via built-in `Bun.file().watch()` or chokidar)
- **Server**: Bun HTTP server + WebSocket (built-in, no dependencies)
- **Client**: React with Tailwind CSS for styling
- **State**: In-memory on server, rebuilt from files on startup. JSONL journal for persistence.
- **Distribution**: npm package, `npx teamchat` to run
- **Zero external dependencies beyond Bun and React.** No database, no message broker.

---

## Resolved Design Decisions

These were open questions in v0.1, now resolved based on transcript simulation and research:

### Thread Model → Hybrid (Slack-style threads for DMs, flat for #general)

DM exchanges between teammates render as collapsible threads inline in the chronological chat. The main channel stays flat. This mirrors Slack's model where threaded conversations are visible but don't fragment the main flow. The simulated transcript proved this works — the frontend↔privacy DM about data masking and the qa→backend bug report both read naturally as inline threads.

### Live vs. Replay Priority → Live first, with automatic journaling for replay

Live mode is the primary use case (watching a running session). The JSONL journal is written continuously during live mode, so replay is available automatically after any session. No separate "capture" step needed.

### Hook Integration → Not in v1, designed for v2

v1 reads only inbox files, task files, and config. No coupling to the hook system. The event processor's `ChatEvent` type system is designed to accept hook-sourced events later (a `tool-call` ChatEvent type is reserved but unimplemented). v2 adds `--with-hooks` flag.

### Message Distillation → summary field + truncation, no LLM calls

The `summary` field in inbox messages is sufficient for most cases. Long messages truncate at 200 chars with expand. No Haiku calls — this keeps teamchat zero-cost to run and eliminates latency. If summary is missing, use first line of text content.

### Rendering Target → Browser (localhost), not TUI

Browser provides richer interaction (hover states, expandable threads, clickable reactions, task sidebar). The shareable URL mode (expose via tunnel for team visibility) is a natural extension. TUI via Ink/React-Ink is technically possible but sacrifices too much interaction richness for the marginal benefit of staying in terminal.

---

## Testability Against Real Sessions

### Fixture Data Strategy

Two sources provide complete coverage of all message types without running a real Agent Teams session during development:

1. **claudecodecamp filesystem dump** — real inbox JSON arrays with content messages, idle notifications, and timestamps from actual sessions.
2. **kieranklaassen gist** — exhaustive examples of every system event type: idle_notification, shutdown_request/approved/rejected, task_completed, plan_approval_request, join_request, permission_request, with full field schemas.

**Build a fixture generator** that produces a complete `~/.claude/teams/test-team/` directory structure with:
- `config.json` with 4 members
- `inboxes/` with inbox files for each agent containing a mix of content messages and system events
- `tasks/` with 6-8 tasks in various states with dependency chains

This fixture is the test harness. All rendering logic is tested against it.

### Verification Checklist

For any session (live or replay):
- [ ] Every content message appears in chronological order
- [ ] DMs between teammates appear in correct thread blocks
- [ ] Task claims show ✋ reaction on the right lead message
- [ ] Task completions show ✅ reaction and sidebar update simultaneously
- [ ] Plan approval/rejection shows 👍/👎 on the plan card
- [ ] Permission request shows ✅/🚫 once resolved
- [ ] Idle notifications do NOT appear in chat (only sidebar presence)
- [ ] Idle > 30s surfaces a single "💤 X is idle" system message
- [ ] Dependency unblock cascades appear as system messages with correct task references
- [ ] All-tasks-completed shows 🎉
- [ ] Shutdown sequence groups into clean "X left" messages
- [ ] Broadcasts show 📢 and are deduplicated (not shown N times for N recipients)
- [ ] Orphaned messages (inbox file with no matching config member) show ⚠️
- [ ] Message expand/collapse works for long content
- [ ] Sidebar task list matches tasks.json state at all times
- [ ] Session stats are accurate (duration, message count, DM thread count, task count)

### Edge Cases

- **Orphaned messages** (write to non-existent agent inbox) → ⚠️ "undelivered" indicator
- **Rapid idle ping flood** (630 pings in 42 minutes) → collapsed to sidebar presence
- **Teammate rejects shutdown** → 🙅 reaction + thread with reason
- **Task stuck in `in_progress`** → no ✅ reaction appears; sidebar shows duration growing; debug by comparing task timeline to agent messages
- **Headless mode** (`claude -p`) where `read: false` → chat renders normally, read receipts disabled
- **Empty team** (created, no teammates yet) → "Waiting for teammates..." placeholder
- **Team with single teammate** → DM threads disabled, all messages in #general
- **Agent sends to wrong recipient name** (issue #25135) → orphaned inbox file detected, ⚠️ indicator
- **Concurrent writes** (two agents claim same task simultaneously) → file lock means one wins; the loser's claim attempt doesn't produce an inbox message, but their subsequent TaskList call shows the task is taken, and they silently move on

---

## Session Statistics

Displayed as a footer bar during live sessions and as a summary card after session ends:

```
Duration: 1h 23m  │  Messages: 34 content + 12 system  │  DM threads: 3
Tasks: 8/8 ✅      │  Bugs found: 2 (from DM threads)   │  Agents: 4 + lead
```

**"Bugs found" heuristic:** Count DM threads where the initiating message contains keywords: "bug", "issue", "found", "problem", "broken", "failing", "vulnerability", "error", "fix". This is imprecise but useful as an at-a-glance indicator.

---

## External Notification Layer (v2, not in v1)

An optional module that emits structured events to external services. Not a chat bridge — a webhook emitter.

**Events emitted:**
- `team.started` — team name, member count, task count
- `task.completed` — task subject, owner, duration
- `task.blocked` — task subject, what it's waiting on
- `plan.submitted` / `plan.resolved` — summary, outcome
- `team.finished` — final summary: tasks completed, total duration, agents used

**Destinations:** Slack webhook, Discord webhook, generic HTTP POST, JSONL file.

**What it does NOT emit:** Raw message content (may contain secrets), permission request details (contains shell commands), idle notifications.

**Opt-in escape hatch:** `--forward-content` flag forwards full message text with pattern-based redaction of common secret formats (API keys, tokens, connection strings). Off by default.

**Shareable URL mode (preferred for team visibility):** `teamchat --share` exposes the localhost server. Combine with ngrok/Cloudflare Tunnel/Tailscale Funnel for remote access. Read-only. No inbound messages. Data stays on your machine.

---

## Why This Is a Real Project (Not a Toy)

1. **It solves the debugging problem**: when a team gets stuck, you currently `cat` JSON files and cross-reference timestamps manually. The chat view makes the conversation readable. Reactions make acknowledgment flow visible at a glance.

2. **It captures what tmux can't**: tmux shows what each agent is *doing* (terminal output). It doesn't show what agents are *saying to each other*. The transcript simulation proved that DM threads — agents negotiating interfaces, reporting bugs directly to each other — are where the most valuable coordination happens, and they're invisible in tmux.

3. **It surfaces emergent patterns**: the simulated session showed a lead redirecting idle agents into cross-review work, which produced a real security finding. That pattern is obvious in the chat ("lead messages idle agents → agents find new issue") but invisible in any other view. Once visible, it can be codified into a TeammateIdle hook.

4. **It's cheap to build**: the data layer is trivially simple (watch 3 filesystem paths, parse JSON, diff, emit WebSocket events). The UI is a solved problem. The hard part — message classification, idle suppression, reaction correlation, broadcast deduplication, dependency cascade computation — is all well-scoped string parsing and state diffing.

5. **It naturally extends**: hook integration (v2), external notifications (v2), LLM-powered session summaries (v3), token cost annotations per-message (v3). The chat metaphor and the ChatEvent type system accommodate all of these as additive features.

6. **It's portfolio-grade**: a tool that reads filesystem artifacts of a multi-agent system, classifies message types, computes derived events (unblock cascades), maps protocol events to Slack-style reactions, and renders it all as a familiar group chat demonstrates understanding of agentic architecture, developer tooling, and practical UX.

---

*Brian Doe — March 2026*
*Spec v0.2 for `teamchat`, a group chat visualizer for Claude Code Agent Teams*
