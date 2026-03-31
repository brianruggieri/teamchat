# teamchat — Agent Instructions

Instructions for AI agents working on this project.

## Before You Start

1. Read `CLAUDE.md` for project overview and conventions
2. Read the relevant spec in `.claude/` for the feature you're working on
3. Run `bun test` and `bun run typecheck` to confirm a clean baseline
4. After making changes, always run `bun test` and `bun run typecheck` before claiming completion

## Specs & Plans

Planning docs live in `.claude/` (local, gitignored). Key references:
- `plan-v2-kickoff.md` — master plan with work items and wave structure
- `teamchat-spec-v02.md` — original product spec (protocol ground truth)
- `teamchat-build-handoff.md` — architecture decisions and rationale

## Code Style

- **TypeScript strict mode** — no `any` abuse, no `@ts-ignore`
- **Tabs** for indentation
- **Bun-native APIs** preferred (Bun.serve, Bun.file, Bun.build)
- **No external runtime dependencies** beyond React and Tailwind (chokidar is an optional fallback for file watching)
- **Event-sourced architecture** — all state is built from immutable `ChatEvent` streams
- **Reducer pattern** in client — state changes go through `useChatReducer`

## Testing

- Tests live alongside source in `src/` and in `fixtures/tests/`
- Test files: `*.test.ts`
- Run: `bun test`
- All tests use fixture data — don't depend on real Claude Code installations
- When adding new features, add tests for the new event processing logic
- Current: 559 tests across 27 files covering processor, DMs, idle suppression, broadcasts, reactions, task cascades, task prompt collapse, avatar marks, conversation beats, replay engine, state reducer, message grouping, export, sanitization, and secret scanning

## Key Design Principles

1. **Privacy first** — no data leaves the machine. No telemetry. No network calls except serving localhost UI.
2. **Passive observation** — teamchat reads Claude Code files, never modifies them.
3. **Chat metaphor** — everything maps to a group chat concept. If it doesn't fit the metaphor, reconsider.
4. **Reactions trace to events** — never fabricate emotional reactions. Every emoji corresponds to a real protocol event.
5. **Idle suppression is mandatory** — hundreds of idle pings must collapse to a sidebar indicator, not flood the chat.

## Working on the Replay System

The replay system has two tiers:
- **Local journal** (JSONL) — raw event recording, always-on during live sessions
- **Replay bundle** (`.teamchat-replay`) — portable, optionally sanitized export

The sanitization pipeline (secret scanning, anonymization, content stripping) is security-critical. When working on it:
- Test against all secret pattern categories
- Never log or print full secret values — use partial masking
- The `--sanitize` flag must be safe by default (no secrets leak through)

## File Watching

The watcher in `src/server/watcher.ts` monitors three paths:
- `~/.claude/teams/{name}/config.json` — team roster
- `~/.claude/teams/{name}/inboxes/*.json` — agent messages
- `~/.claude/tasks/{name}/*.json` — task states

File changes are debounced; the watcher forwards both the previous and current snapshots to the processor, which computes the deltas.

## Common Pitfalls

- **Broadcast detection** uses a 1-second tolerance window. Don't tighten this — agent writes are not perfectly synchronized.
- **Idle suppression** surfaces a single system message after 30s of continuous idle, then collapses further pings to the presence roster. Don't remove the 30s threshold.
- **Task dependency cascades** are computed by cross-referencing `blockedBy` arrays against current task statuses. The `blockedBy` field in JSON never changes — availability is always recomputed.
- **Inbox files are created lazily** — they don't exist until the first message is written to that agent. Handle missing files gracefully.
