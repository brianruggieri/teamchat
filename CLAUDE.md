# teamchat — Project Instructions

## What This Is

A group chat visualizer for Claude Code Agent Teams. Renders multi-agent coordination as a Slack/iMessage-style group chat with DM threads, reactions, task tracking, idle suppression, and session replay.

**Current status**: Pre-v1 — core features complete, preparing for npm publish + Show HN launch.

## Tech Stack

- **Runtime**: Bun (>= 1.0.0)
- **Server**: Bun HTTP + WebSocket (no external deps)
- **Client**: React 19 + Tailwind CSS 4 (dark theme, semantic `--tc-*` tokens)
- **Language**: TypeScript (strict mode)
- **Tests**: Bun test runner
- **Build**: `bun run build` bundles client via `scripts/build-client.ts`

## Quick Commands

```bash
bun install                    # Install dependencies
bun run dev                    # Dev server on port 4567 with test fixtures
bun run build                  # Bundle client to dist/client/
bun run typecheck              # tsc --noEmit
bun test                       # Run all tests
bun run fixture:generate       # Regenerate test fixtures
```

## Project Structure

```
bin/teamchat.ts                # CLI entry point, arg parsing, mode selection
src/
  server/
    server.ts                  # Bun HTTP + WebSocket server
    watcher.ts                 # File watcher (fs.watch) with debounce
    processor.ts               # Event classification, reactions, idle suppression
    journal.ts                 # JSONL session recording
    replay.ts                  # Replay bundle loading (server-side)
  client/
    App.tsx                    # Main React SPA
    components/                # 17+ components (messages, tasks, reactions, cards)
    hooks/                     # useWebSocket, useChatReducer, useAutoScroll, useRelativeTime
    styles/index.css           # Dark theme, animations, semantic CSS variables
    types.ts                   # Client-side types, agent color mappings
  shared/
    types.ts                   # ChatEvent type definitions (server↔client contract)
    parse.ts                   # System event parsing utilities
    replay.ts                  # ReplayBundle, ReplayManifest, ReplayEntry types
fixtures/
  replays/                     # Bundled demo session for --replay --demo
scripts/
  build-client.ts              # Bun bundler configuration
```

## Architecture

Event-sourced pipeline: File watcher → Event processor → WebSocket → React client.

- **File watcher** monitors `~/.claude/teams/{name}/` (inboxes, config) and `~/.claude/tasks/{name}/` (tasks)
- **Event processor** classifies messages (content vs system), detects broadcasts/DMs, suppresses idle pings, correlates reactions, computes dependency cascades
- **Server** broadcasts `ChatEvent` objects via WebSocket; serves client files and `/state` endpoint for hydration
- **Client** renders events using a reducer pattern (`useChatReducer`)

## Key Types

The `ChatEvent` union type in `src/shared/types.ts` is the core contract:
- `ContentMessage` — agent text messages
- `SystemEvent` — joins, leaves, task state changes, idle
- `ReactionEvent` — protocol-derived emoji reactions
- `ThreadMarker` — DM thread boundaries
- `PresenceChange` — working/idle/offline status
- `TaskUpdate` — task state transitions

## Conventions

- **Indentation**: Tabs
- **Reactions are never fabricated** — every emoji traces to a real protocol event
- **Idle suppression is critical** — a 42-min idle period produces ~630 pings. Without suppression, the chat is 95% noise.
- **Theming**: Semantic `--tc-*` CSS tokens for theming. Don't add new hardcoded color values.
- **Tests**: All tests use fixture data in `fixtures/`. Run `bun test` after any change.

## Current Branches

- `main` — stable, all tests passing
- `codex/timed-replay-system` — timed replay UI controls (needs merge to main for v1)
- `codex/theme-extension-spec` — theme system spec (v2, not for v1)

## Planning & Specs

Planning docs live in `.claude/` (local, gitignored — not committed to the repo):
- `teamchat-v1-spec.md` — v1 product spec (the launch plan)
- `teamchat-spec-v02.md` — original product spec (detailed design reference)
- `teamchat-build-handoff.md` — architecture decisions and rationale
- `market-research-and-plan.md` — competitive analysis, GTM strategy
- `teamchat-session-transcript.md` — simulated session for testing reference

## What NOT to Do

- Don't add telemetry, analytics, or network calls — teamchat is privacy-first, all local
- Don't fabricate emotional reactions (no 🔥, 💪, 🤔) — agents don't have emotions
- Don't add hardcoded color values — use semantic `--tc-*` CSS tokens
- Don't modify Claude Code files — teamchat is read-only against `~/.claude/`
- Don't write outside `~/.teamchat/` — that's our only writable location
