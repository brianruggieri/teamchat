# teamchat — Build Handoff & Agent Orchestration Guide

## Decisions Finalized from Brian's Review

---

### Q7: Chat UI — Build or Borrow?

**Decision: Build custom with Tailwind. Don't use a chat UI library.**

I looked at the landscape. The best options are:

- **@chatscope/chat-ui-kit-react** — the most complete React chat component library. Has MessageList, Message, ChatContainer, typing indicators, avatars. But it's designed for two-party chat apps (customer support widgets), not multi-party group chats with reactions, collapsible DM threads, interactive cards (plan approval, permission requests), and a sidebar task board. We'd fight the library's opinions more than we'd benefit from its components. The sticky scrollbar handling is nice, but we can get that with a `useRef` + `scrollIntoView` in 10 lines.

- **@llamaindex/chat-ui** — LLM-focused, good for AI chat but assumes a single user↔AI conversation. No multi-party, no reactions.

- **Stream Chat SDK / CometChat** — commercial SDKs for real chat infrastructure. Total overkill and wrong abstraction — they manage real users, auth, message storage. We're rendering local JSON files.

**The right call is custom components with Tailwind.** Our UI has highly specific requirements — left/right alignment based on agent role, emoji reactions attached to messages, collapsible DM thread blocks, interactive plan approval and permission request cards, a live task sidebar. No existing library handles this combination. The chat UI is simple enough (it's a scrolling list of styled divs) that a library would add dependency weight without saving meaningful development time.

**One thing to borrow:** the CSS approach for chat bubble shapes and the auto-scroll-to-bottom behavior. Look at chatscope's sticky scroll implementation for reference — they solved the "user scrolled up to read history, don't yank them to bottom on new message" problem well. Implement the same pattern: auto-scroll if user is within 100px of bottom, otherwise show a "↓ New messages" indicator.

---

### Q8: Auto-Launch — How to Hook Into Claude Code

**Decision: PostToolUse hook on Teammate tool, with async flag. Also support manual `teamchat --watch`.**

The hook configuration for auto-launch:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Teammate",
      "hooks": [{
        "type": "command",
        "command": "bash -c 'TEAM=$(cat | jq -r \".tool_input.team_name // empty\"); if [ -n \"$TEAM\" ] && ! pgrep -f \"teamchat.*$TEAM\" > /dev/null; then teamchat --team \"$TEAM\" & fi'",
        "async": true,
        "timeout": 5
      }]
    }]
  }
}
```

This:
- Fires after any Teammate tool call (which includes spawnTeam)
- Extracts the team name from the tool input JSON on stdin
- Checks if teamchat is already running for this team (prevents duplicates)
- Launches teamchat in the background
- Uses `async: true` so it doesn't block Claude Code

The hook goes in `~/.claude/settings.json` (user-level, applies to all projects).

This is NOT a plugin. It's a simple hook configuration. Plugins in Claude Code are a heavier mechanism (git repos with agents, commands, skills). We don't need any of that — we're just watching files. A hook is the right weight class.

**Fallback:** If the user doesn't want to configure hooks, `teamchat --watch` polls `~/.claude/teams/` every 2 seconds for new `config.json` files and auto-starts sessions.

**Also ship:** a `teamchat setup` command that writes the hook configuration to `~/.claude/settings.json` automatically (with user confirmation).

---

### Q13: What Is This Thing? Distribution & Identity

**It's a standalone CLI tool, distributed as an npm package.**

```bash
npm install -g teamchat
# or
npx teamchat --team my-team
```

**Why npm:**
- Claude Code users already have Node.js (it's a prerequisite for Claude Code itself)
- `npx` means zero-install for trying it out
- The Bun runtime is used internally but the package works with Node too (Bun APIs we use — file watching, WebSocket — have Node equivalents via `ws` and `chokidar` as fallbacks)
- npm is how Claude Code plugins, skills, and companion tools are distributed in the ecosystem

**Cross-platform:**
- macOS: primary target (your stack, most Claude Code users)
- Linux: should work out of the box (same filesystem paths, same Node ecosystem)
- Windows: Claude Code on Windows uses `%USERPROFILE%\.claude\` instead of `~/.claude/`. Add path resolution logic. WSL users get Linux behavior. Native Windows is secondary priority.

**What it is NOT:**
- Not a Claude Code plugin (plugins are repos with `.claude/` structures that add agents/commands/skills — we don't need any of that)
- Not a VS Code extension (though someone could build one later using our WebSocket API)
- Not an Electron app (too heavy for what's essentially a file watcher + web UI)
- Not a TUI (we want rich interaction — reactions, expandable threads, sidebar)

**The "juice" — making it feel polished without being gimmicky:**

- **Smooth animations:** Messages slide in from left/right with a subtle 150ms ease-out. Reactions pop in with a scale bounce. DM threads expand/collapse with a smooth height transition. Task sidebar items pulse when they unblock. These are all CSS transitions, zero JS animation libraries.

- **Sound effects (optional, off by default):** A subtle notification sound when a new message arrives (if the tab is in the background). A satisfying "ding" on all-tasks-completed. `--sounds` flag to enable. Use the Web Audio API to play short tones — no audio files needed.

- **Dark theme by default** with a light theme toggle. The dark theme should feel like a premium dev tool (think Linear, Warp, Raycast), not like a chat app. Muted backgrounds, sharp accent colors per agent, high contrast on message text.

- **Agent avatars:** Generate a unique avatar per agent from their name + color. Use the first letter of their name in a colored circle (like Google's default avatars). The lead gets a 👑 overlay. This is trivial to implement and makes the chat immediately feel like a real group conversation.

- **Timestamps:** Show relative time ("2m ago") for recent messages, switch to absolute time ("10:35 AM") for messages older than 1 hour. On hover, always show the full ISO timestamp.

- **Session recording:** The JSONL journal automatically creates a replayable session. After the team finishes, show a "Session ended" card with a summary and a "Replay" button. This is the kind of detail that makes people share the tool.

---

## Agent Team Build Plan

### Team Structure

```
Lead (you / human) — Reviews plans, approves key decisions
├── server-agent — Owns: bin/, src/server/, src/shared/
├── client-agent — Owns: src/client/, all React + Tailwind
└── fixture-agent — Owns: fixtures/, integration tests, README, package.json
```

### Shared Contract: ChatEvent Types

**This must be defined FIRST, before any agent starts coding.** It's the interface contract between server and client.

```typescript
// src/shared/types.ts

// === Agent & Team ===
interface AgentInfo {
  name: string;
  agentId: string;
  agentType: string;
  color: string;
}

interface TeamState {
  name: string;
  members: AgentInfo[];
}

// === Tasks ===
interface TaskInfo {
  id: string;
  subject: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  owner: string | null;
  blockedBy: string[] | null;
  activeForm: string | null;
  created: string;
  updated: string;
}

// === Chat Events (server → client via WebSocket) ===
type ChatEvent =
  | ContentMessage
  | SystemEvent
  | ReactionEvent
  | ThreadMarker
  | PresenceChange
  | TaskUpdate;

interface ContentMessage {
  type: 'message';
  id: string;                    // unique, generated by processor
  from: string;                  // agent name
  fromColor: string;             // agent color
  text: string;                  // full message content
  summary: string | null;        // short preview if available
  timestamp: string;             // ISO8601
  isBroadcast: boolean;          // 📢 indicator
  isDM: boolean;                 // appears in DM thread
  dmParticipants: string[] | null; // [sender, recipient] for DM
  isLead: boolean;               // right-aligned if true
  replyToId: string | null;      // for compact mode acknowledgments
}

interface SystemEvent {
  type: 'system';
  id: string;
  subtype:
    | 'member-joined'
    | 'member-left'
    | 'task-created'
    | 'task-claimed'
    | 'task-completed'
    | 'task-failed'
    | 'task-unblocked'
    | 'all-tasks-completed'
    | 'shutdown-requested'
    | 'shutdown-approved'
    | 'shutdown-rejected'
    | 'team-created'
    | 'team-deleted'
    | 'idle-surfaced';           // only after 30s threshold
  text: string;                  // human-readable description
  timestamp: string;
  agentName: string | null;      // who triggered this
  agentColor: string | null;
  taskId: string | null;         // related task if applicable
  taskSubject: string | null;
}

interface ReactionEvent {
  type: 'reaction';
  id: string;
  targetMessageId: string;       // which message to attach to
  emoji: string;                 // ✋ 👍 👎 ✅ 🚫 👋 🙅 🎉
  fromAgent: string;
  fromColor: string;
  timestamp: string;
  tooltip: string | null;        // e.g. "Approved. Add encounters.notes..."
}

interface ThreadMarker {
  type: 'thread-marker';
  id: string;
  subtype: 'thread-start' | 'thread-end';
  participants: string[];        // agent names in the thread
  timestamp: string;
}

interface PresenceChange {
  type: 'presence';
  agentName: string;
  status: 'working' | 'idle' | 'offline';
  timestamp: string;
}

interface TaskUpdate {
  type: 'task-update';
  task: TaskInfo;                // full updated task state
  timestamp: string;
}

// === Initial State (REST endpoint) ===
interface SessionState {
  team: TeamState;
  events: ChatEvent[];
  tasks: TaskInfo[];
  presence: Record<string, 'working' | 'idle' | 'offline'>;
  sessionStart: string;
}

// === Plan Approval Card Data ===
interface PlanApprovalCard {
  type: 'plan-approval';
  requestId: string;
  from: string;
  planContent: string;
  status: 'pending' | 'approved' | 'rejected';
  feedback: string | null;
}

// === Permission Request Card Data ===
interface PermissionRequestCard {
  type: 'permission-request';
  requestId: string;
  agentName: string;
  toolName: string;
  command: string;
  status: 'pending' | 'approved' | 'denied';
}
```

### Agent Spawn Prompts

**server-agent:**

```
You are building the server component of teamchat, a CLI tool that watches
Claude Code Agent Teams filesystem artifacts and serves them as chat events
via WebSocket.

Your files: bin/teamchat.ts, src/server/watcher.ts, src/server/processor.ts,
src/server/journal.ts, src/server/server.ts, src/shared/types.ts, src/shared/parse.ts

Key responsibilities:
1. File watcher: monitor ~/.claude/teams/{name}/inboxes/*.json,
   ~/.claude/tasks/{name}/*.json, ~/.claude/teams/{name}/config.json
   Use Bun native file watching with 100ms debounce. Try/catch JSON.parse
   for partial writes. Fall back to chokidar if Bun watch unavailable.

2. Event processor: classify messages (content vs system event via
   JSON.parse on text field), detect broadcasts (same text in 3+ inboxes
   within 1s — use 500ms hold window), detect DMs (message in teammate
   inbox from non-lead), suppress idle pings (collapse to presence state,
   surface after 30s), correlate task claims to lead messages within 120s
   for ✋ reactions, compute dependency unblock cascades by diffing task
   statuses.

3. WebSocket server at localhost:3456. Broadcast ChatEvent objects.
   REST GET /state returns SessionState for initial hydration.

4. JSONL journal: append each ChatEvent to
   ~/.teamchat/sessions/{team-name}.jsonl

5. CLI: bin/teamchat.ts parses args (--team, --watch, --replay, --port,
   --compact, --no-journal, --share, setup). --replay reads the JSONL
   journal and serves events with timestamp-based playback.

Shared types are in src/shared/types.ts — import from there, do not
redefine. The ChatEvent type union is your output contract.

Do NOT build the React client. That's another agent's job.
Do NOT modify files in src/client/.
```

**client-agent:**

```
You are building the browser client for teamchat, a group chat visualizer
for Claude Code Agent Teams.

Your files: src/client/index.html, src/client/App.tsx, src/client/components/,
src/client/hooks/, src/client/styles/

Key responsibilities:
1. Single-page React app served by the teamchat server at localhost:3456.
   Connects via WebSocket. On connect, fetch GET /state for initial hydration.

2. Chat layout: single column chat (scrolling message list) with a right
   sidebar (task list + presence roster + session stats).

3. Message rendering:
   - Lead messages: right-aligned, crown avatar, accent background
   - Teammate messages: left-aligned, colored accent from agent color
   - System events: centered, muted, small text
   - DM threads: collapsible blocks with "── A → B (DM) ──" markers
   - Broadcasts: 📢 icon next to sender name
   - Plan approval cards: expandable with plan content, 👍/👎 reaction
   - Permission request cards: tool name + command, ✅/🚫 reaction
   - Reactions: small row below target message, Slack-style
   - Long messages: truncate at 200 chars, expand on click. Code blocks
     collapsible with syntax highlighting.

4. Sidebar:
   - Task list: status icon + #id + subject + owner + duration. Progress
     bar at top. Pulse animation on unblock. Click scrolls to related message.
   - Presence roster: agent name + color dot + ⚡/💤/🔴 status.
   - Session stats footer: duration, message count, DM threads, task progress.

5. Styling: Tailwind CSS. Dark theme by default (think Linear/Raycast
   aesthetic — muted backgrounds, sharp accent colors, high contrast text).
   Message slide-in animation (150ms ease-out). Reaction pop-in (scale bounce).
   Thread expand/collapse smooth height transition.

6. Auto-scroll: scroll to bottom on new message IF user is within 100px
   of bottom. Otherwise show "↓ New messages" floating indicator.

7. Agent avatars: first letter of name in colored circle. Lead gets 👑 overlay.

8. Timestamps: relative ("2m ago") for recent, absolute ("10:35 AM") for
   >1hr. Full ISO on hover.

Import ChatEvent types from src/shared/types.ts — that is the contract
with the server. Do NOT redefine types. Use useReducer for state management.
Dispatch incoming WebSocket ChatEvents to the reducer.

Do NOT build the server, watcher, or processor. That's another agent's job.
Do NOT modify files in src/server/.
```

**fixture-agent:**

```
You are building the test fixtures, integration tests, package configuration,
and documentation for teamchat.

Your files: fixtures/, package.json, tsconfig.json, README.md, .github/ (if needed)

Key responsibilities:
1. Fixture generator (fixtures/generate.ts): Creates a complete
   ~/.claude/teams/test-team/ directory structure with:
   - config.json with 5 members (team-lead + 4 teammates with distinct colors)
   - inboxes/ with inbox files containing a realistic mix of:
     - Content messages (plain text with summary)
     - System events: idle_notification, shutdown_request, shutdown_approved,
       task_completed, plan_approval_request, plan_approval_response,
       permission_request, join_request
     - DM messages (teammate→teammate)
     - Broadcasts (same message in all inboxes)
   - Tasks with dependency chains, various statuses, owners

   Base this on the healthdash-sprint session transcript (provided separately).
   The fixture should produce the exact sequence of events from that transcript
   when processed by the server's watcher+processor.

2. package.json:
   - name: "teamchat"
   - bin: { "teamchat": "./bin/teamchat.ts" }
   - dependencies: minimal (bun types, chokidar as optional fallback)
   - scripts: dev, build, test, fixture:generate
   - Bun as the runtime (add "trustedDependencies" if needed)

3. README.md:
   - What it is (one paragraph)
   - Screenshot placeholder
   - Quick start: npx teamchat --team my-team
   - Auto-launch hook configuration
   - CLI reference
   - How it works (filesystem watching)
   - Replay mode
   - Contributing

4. Integration tests: verify that the fixture data, when processed by
   the server's processor, produces the expected ChatEvent sequence.
   Test: message ordering, broadcast deduplication, DM thread detection,
   idle suppression, reaction correlation, dependency unblock cascades.

Import types from src/shared/types.ts. Coordinate with server-agent on
processor.ts interface for testing.

Do NOT build server or client code. Only fixtures, tests, config, docs.
```

### Build Order & Coordination

```
Phase 1 (parallel, no dependencies):
  - server-agent: src/shared/types.ts + src/shared/parse.ts
  - fixture-agent: fixtures/generate.ts + package.json + README
  - client-agent: src/client/ scaffolding + component stubs

Phase 2 (parallel, depends on types.ts from Phase 1):
  - server-agent: watcher.ts + processor.ts + server.ts + journal.ts
  - client-agent: full component implementation + styling
  - fixture-agent: integration tests (needs processor.ts interface)

Phase 3 (sequential):
  - fixture-agent: run integration tests against server processor
  - client-agent: verify rendering against fixture data via dev server
  - server-agent: CLI (bin/teamchat.ts) + replay mode

Phase 4 (lead reviews):
  - End-to-end: generate fixture → start server → open browser → verify chat
  - Polish: animations, dark theme, reaction timing, scroll behavior
```

### What to Tell the Lead Agent

```
Build teamchat — a group chat visualizer for Claude Code Agent Teams.

Spawn three teammates:
- server-agent: file watcher, event processor, WebSocket server, CLI
- client-agent: React + Tailwind chat UI with sidebar
- fixture-agent: test fixtures, integration tests, package config, README

Coordination rules:
1. server-agent writes src/shared/types.ts FIRST. Both other agents
   import from there. Do not duplicate type definitions.
2. File ownership is strict: server-agent owns src/server/ and src/shared/,
   client-agent owns src/client/, fixture-agent owns fixtures/ and root config.
3. No agent modifies another agent's files.
4. When server-agent finishes processor.ts, message fixture-agent so they
   can write integration tests against it.
5. When client-agent finishes component stubs, message server-agent to
   confirm the WebSocket event format works.

Use delegate mode. Do not implement code yourself.
Require plan approval from all teammates before they start coding.

Quality gates:
- All TypeScript must compile with strict mode
- Integration tests must pass against fixture data
- The dev server must serve the client and render fixture data correctly
```
