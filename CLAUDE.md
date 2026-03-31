# teamchat — Project Instructions

## What This Is

A group chat visualizer for Claude Code Agent Teams. Renders multi-agent coordination as a Slack/iMessage-style group chat with DM threads, reactions, task tracking, idle suppression, and session replay.

**Current status**: v1.0.0 — core features complete, preparing for public launch.

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
bun run dev                    # Live-watch mode (team "test-team" on port 4567)
bun run dev:demo               # Replay bundled demo session on port 4567
bun run dev:replay             # Replay build session fixture on port 4567
bun run build                  # Bundle client to dist/client/
bun run typecheck              # tsc --noEmit
bun test                       # Run all tests (559 tests across 27 files)
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
    components/                # 26 components (messages, tasks, reactions, threads, cards)
    components/tests/          # Client component tests (messageGrouping)
    hooks/                     # useWebSocket, useChatReducer, useAutoScroll, useRelativeTime, useReplayController
    styles/                    # 18 CSS files: index.css entry + 17 per-section modules
    tests/                     # Client state tests (state.test.ts)
    artifacts.ts               # Artifact loading and display
    avatar-marks.ts            # Generative avatar mark system (hash-based)
    replay.ts                  # Client-side replay engine
    replayTimeline.ts          # Timeline marker computation
    state.ts                   # Chat state reducer (drives the entire UI)
    types.ts                   # Client-side types, agent color mappings
  shared/
    types.ts                   # ChatEvent type definitions (server↔client contract)
    parse.ts                   # System event parsing utilities
    replay.ts                  # ReplayBundle, ReplayManifest, ReplayEntry types
    distill.ts                 # Text distillation/summarization utility
  security/
    sanitizer.ts               # Agent anonymization and content redaction
    secret-scanner.ts          # Pattern-based secret detection
  export/
    cli.ts                     # Export subcommand handler
    exporter.ts                # Session → .teamchat-replay bundle exporter
fixtures/
  replays/                     # Bundled demo session for --replay --demo
  tests/                       # Server-side test suites
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

## Planning & Specs

Planning docs live in `.claude/` (some specs are committed; local plans are gitignored):

**Active plans (have remaining work):**
- `plan-v2-kickoff.md` — master plan: Waves 1–2 complete, Waves 3–4 pending
- `v1-showcase-and-launch-plan.md` — launch tasks 10–15 (showcase sessions, demo GIF, launch post)
- `v1-event-enrichment-plan.md` — P1 done, P2–5 remaining (advanced reactions, post-mortem)
- `ui-polish-and-postmortem-plan.md` — sidebar layout, celebrations, post-mortem pipeline
- `2025-03-15-chat-ux-improvements-plan.md` — timeline lead glow and overlap handling

**Active reference (useful context):**
- `teamchat-spec-v02.md` — original product spec (protocol ground truth)
- `teamchat-build-handoff.md` — architecture decisions and rationale
- `market-research-and-plan.md` — competitive analysis, GTM strategy
- `pulse-spec.md` — spec for the pulse showcase session (Wave 3)
- `frontend-redesign-spec.md` — Playwright-driven UI audit (918 lines of findings)

**Archived (completed work):** in `.claude/archive/`

## What NOT to Do

- Don't add telemetry, analytics, or network calls — teamchat is privacy-first, all local
- Don't fabricate emotional reactions (no 🔥, 💪, 🤔) — agents don't have emotions
- Don't add hardcoded color values — use semantic `--tc-*` CSS tokens
- Don't modify Claude Code files — teamchat is read-only against `~/.claude/`
- Don't write outside `~/.teamchat/` — that's our only writable location
