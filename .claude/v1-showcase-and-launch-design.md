# teamchat v1 Showcase & Launch Design

*2026-03-11 — Validated design for launch-quality demo assets, comparison analysis, and v1 polish*

---

## Goal

Produce a compelling, evidence-backed launch for teamchat v1 that demonstrates **measurable superiority** over reading raw CLI logs. Ship with:

1. A real agent team session recorded with full data capture
2. Side-by-side comparison: CLI chaos vs teamchat clarity
3. Replayable CLI terminal output alongside teamchat replay
4. Polished v1 package ready for npm publish + Show HN

---

## Part 1: Showcase Project — `taskboard`

### What the Agents Build

A collaborative task board REST API + React UI. Meta-appropriate (task tool built by agents doing tasks), universally relatable, naturally produces rich inter-agent coordination.

### Team Composition (6 agents)

| Agent | Role | Starts After | Coordination Patterns |
|-------|------|-------------|----------------------|
| **lead** | Architect, coordinator, reviewer | Immediate | Broadcasts architecture decisions, reviews PRs, resolves conflicts |
| **schema** | DB schema, TypeScript types, seed data | Immediate | Finishes first, broadcasts data model |
| **api** | REST endpoints, validation, error handling | `schema` completes types | DMs with `auth` about middleware ordering |
| **auth** | Auth middleware, RBAC, JWT tokens | `schema` completes types | DMs with `api` about middleware, DMs with `frontend` about token storage |
| **frontend** | React UI consuming the API | `api` publishes contract | DMs with `auth` about token storage strategy |
| **testing** | Integration tests, E2E tests | Scaffolds early, full tests after `api` + `auth` | Goes idle waiting (idle suppression demo), finds bugs (cross-agent coordination) |

### Why This Produces a Masterpiece Session

- **Dependency cascade**: schema → api/auth → frontend → testing (visible unblocking)
- **DM threads**: api↔auth (middleware), auth↔frontend (tokens), testing→api (bug report)
- **Broadcasts**: lead announces architecture, schema announces data model
- **Idle suppression**: testing agent waits for endpoints, produces idle pings that teamchat collapses
- **Bug discovery**: testing finds an issue, triggers cross-agent coordination
- **Task lifecycle**: all states visible (pending → claimed → in-progress → blocked → completed)
- **Duration**: 15-25 min real time → 3-5 min at 5x replay

### Project Spec Location

The AGENTS.md and project scaffold will be written to a dedicated directory:
`showcase/taskboard/` with its own CLAUDE.md, AGENTS.md, package.json, etc.

The project must be real, buildable, and testable — not a mock.

---

## Part 2: Capture Harness

### Overview

A persistent capture system that records every data source during any agent team session on this machine. Two modes:

1. **Always-on passive capture** — a hook that auto-starts lightweight recording whenever a team session begins
2. **Full showcase capture** — manual activation for the deep recording needed for comparison assets

### Data Sources

| Source | What It Captures | Capture Method | Output Location |
|--------|-----------------|----------------|-----------------|
| **teamchat journal** | Structured chat events | Auto (teamchat `--team`) | `~/.teamchat/sessions/{team}.jsonl` |
| **tmux pane scrollback** | Raw CLI output per agent, per pane | `tmux capture-pane -p -S -` per pane, periodic (every 10s) | `~/.teamchat/captures/{team}/cli/{agent}-{seq}.txt` |
| **tmux pane snapshots** | Terminal with ANSI colors at key moments | `tmux capture-pane -e -p` on triggers | `~/.teamchat/captures/{team}/cli/{agent}-{seq}.ansi` |
| **Full tmux window screenshot** | The 5-pane chaos view | `tmux capture-pane` for all panes stitched together | `~/.teamchat/captures/{team}/cli/full-window-{seq}.ansi` |
| **Team inbox files** | Raw inter-agent message JSON | `cp` triggered by fswatch on `~/.claude/teams/{team}/inboxes/` | `~/.teamchat/captures/{team}/inboxes/{timestamp}/` |
| **Task files** | Task state transitions as raw JSON | `cp` triggered by fswatch on `~/.claude/tasks/{team}/` | `~/.teamchat/captures/{team}/tasks/{timestamp}/` |
| **Claude Code session JSONL** | Full conversation logs per agent | Copy from `~/.claude/projects/` after session ends | `~/.teamchat/captures/{team}/sessions/` |
| **Git timeline** | Commits from each agent over time | `git log --all --oneline --graph` periodic (every 30s) | `~/.teamchat/captures/{team}/git/{timestamp}.txt` |
| **teamchat UI** | The polished chat experience | Playwright screenshot automation or screen recording | `~/.teamchat/captures/{team}/ui/` |

### Capture Script

`scripts/capture-session.sh` — the showcase capture script:

```
Usage:
  ./scripts/capture-session.sh start <team-name> [--project-dir <path>]
  ./scripts/capture-session.sh stop
  ./scripts/capture-session.sh bundle <team-name>
```

- `start`: Begins all capture mechanisms (tmux polling, fswatch, git polling)
- `stop`: Gracefully ends capture, copies Claude Code session files
- `bundle`: Packages all captured data into `~/.teamchat/captures/{team}/bundle/`

### Persistent Auto-Capture Hook

A lighter version that installs as a Claude Code hook (alongside the existing auto-launch hook):

- Triggers on team session start
- Captures tmux scrollback periodically
- Copies inbox/task file snapshots
- Stores in `~/.teamchat/captures/` automatically
- No manual intervention required

This ensures **every future team run on this machine** produces reusable data.

---

## Part 3: CLI Replay System

### The Problem

To produce the side-by-side comparison GIF/video, we need to replay the raw CLI output in a terminal at the same speed it originally appeared. The tmux captures give us the content; we need a player.

### Design

A script that replays captured CLI snapshots into tmux panes with original timing:

```
scripts/replay-cli.sh <capture-dir> [--speed 1x|2x|5x]
```

1. Creates a tmux session with the same pane layout as the original
2. Reads the timestamped CLI capture files
3. Plays them back into the panes with original timing (or accelerated)
4. Produces a recording via `asciinema` or `termtosvg` for embedding

### Output Formats

| Format | Use Case |
|--------|----------|
| `asciinema` recording | Embeddable terminal replay on the web |
| `termtosvg` | SVG animation for README |
| `ttyrec` | Raw terminal recording for `ttyplay` |
| Screen capture (MP4/GIF) | Side-by-side comparison video |

### Synchronized Playback

For the comparison asset, both the CLI replay and teamchat replay need to run at the same speed from the same start time. The capture harness timestamps everything relative to session start, so we can synchronize by:

1. Start CLI replay at t=0
2. Start teamchat replay at t=0 (using `--replay` with the journal)
3. Record both side-by-side (screen capture or composited video)

---

## Part 4: Comparison Analysis

### Quantitative Metrics

After capturing a showcase session, produce these numbers:

| Metric | CLI | teamchat | Delta |
|--------|-----|----------|-------|
| Total lines of output | (raw count from tmux captures) | (event count from journal) | Noise reduction ratio |
| Idle ping lines | (count "watching for changes" etc.) | 0 (suppressed to sidebar) | Signal improvement |
| DM thread lines | (interleaved across panes, hard to follow) | (clean threaded view) | Readability gain |
| Task status visibility | (scattered across N panes, grep for "task") | (unified sidebar, always visible) | Discoverability |
| Time to answer "what is agent X doing?" | (find the right pane, scroll, parse) | (click agent, see messages) | Seconds to insight |
| Time to answer "what tasks are blocked?" | (check each pane, mental model) | (glance at sidebar) | Seconds to insight |

### Qualitative Comparison Points

1. **The DM thread**: Same conversation shown interleaved in CLI vs threaded in teamchat
2. **The idle period**: 42 minutes of pings in CLI vs collapsed sidebar indicator in teamchat
3. **The unblock cascade**: One task completes, three agents start — scattered across panes vs visible chain reaction
4. **The bug report**: Testing finds an issue — buried in scrollback vs highlighted message with reaction

### Deliverables

| Asset | Format | Purpose |
|-------|--------|---------|
| **Hero comparison GIF** (15-30s) | GIF, 800px wide | README, HN post, social |
| **Full comparison video** (2-3 min) | MP4 | YouTube, detailed walkthrough |
| **Information density chart** | PNG/SVG | README "Why teamchat?" section |
| **DM thread comparison screenshot** | PNG | Blog post, README |
| **Idle suppression comparison screenshot** | PNG | Blog post, README |

---

## Part 5: Demo Fixture Pipeline

### Strategy: Real Data First

1. **Primary demo (`--demo`)**: Sanitized `test-team` session (637 lines, 5 agents, full feature coverage) — already exists on this machine
2. **Showcase demo**: The `taskboard` session captured with the harness — becomes the hero content
3. **Meta demo**: The `teamchat-build` session (352 lines) — "watch the tool that built itself"
4. **Existing synthetic fixture**: Keep as fallback, but real data is the default

### Sanitization

All shipped fixtures run through the sanitization pipeline:
- Secret scanning (zero findings required)
- Agent name anonymization (unless names are already generic)
- Path stripping (no real home directories)
- Metadata cleaning (timestamps shifted to epoch)

### Fixture Packaging

Shipped fixtures live in `fixtures/replays/`:
```
fixtures/replays/
  demo/                    # Default --demo fixture (sanitized test-team)
  taskboard-showcase/      # The masterpiece session
  teamchat-build/          # Existing meta session (already here)
```

---

## Part 6: v1 Polish Gaps

| Item | Current State | Work Needed |
|------|-------------|-------------|
| Exporter module (43 lines) | Suspiciously thin — may not compute markers | Audit, likely expand |
| `npm pack --dry-run` | Not validated | Run and verify `files` field |
| Version in package.json | `0.1.0` | Bump to `1.0.0` |
| Port-in-use retry | Missing | Add fallback port logic in server.ts |
| No-team-found UX | Bare error message | Add `teamchat setup` suggestion |
| High-entropy string detection | Likely missing from secret scanner | Add base64 blob pattern |
| `--replay --demo` fixture | Points to 79-line synthetic | Rewire to sanitized real session |
| Show HN draft | Not written | Write after comparison assets exist |

---

## Part 7: Future Capture Infrastructure

### Goal

Every team run on this machine automatically produces data that can be:
- Replayed in teamchat
- Replayed as raw CLI output
- Used for comparison analysis
- Used as demo fixtures (after sanitization)
- Used for learning and improving teamchat

### Implementation

1. **Auto-capture hook**: Installed via `teamchat setup` alongside the auto-launch hook
2. **Capture directory**: `~/.teamchat/captures/{team-name}/{timestamp}/`
3. **Retention policy**: Keep last 10 sessions per team, archive older ones
4. **CLI integration**: `teamchat captures list`, `teamchat captures replay <id>`, `teamchat captures bundle <id>`

This is partially v2 scope, but the capture harness built for the showcase naturally becomes the foundation.

---

## Execution Order

### Phase A: Infrastructure (capture harness + CLI replay)
1. Build `scripts/capture-session.sh`
2. Build `scripts/replay-cli.sh`
3. Test with a small throwaway team session

### Phase B: Showcase Session
4. Write the `taskboard` project spec (CLAUDE.md, AGENTS.md, scaffold)
5. Run the real agent team with capture harness active
6. Verify all data sources captured correctly

### Phase C: Comparison Assets
7. Replay CLI output, record with asciinema/screen capture
8. Replay teamchat session, record UI
9. Produce side-by-side GIF and video
10. Produce quantitative comparison analysis

### Phase D: v1 Polish & Ship
11. Close all polish gaps (exporter audit, packaging, version bump)
12. Replace demo fixture with sanitized real data
13. Update README with comparison assets
14. Draft Show HN post
15. Final smoke test
16. Ship

### Phase E: Persistent Capture (post-launch foundation)
17. Install auto-capture hook
18. Add `teamchat captures` CLI commands
19. Document for contributors

---

## Success Criteria

- [ ] Side-by-side GIF clearly shows teamchat's superiority over raw CLI
- [ ] Quantitative metrics demonstrate >10x noise reduction
- [ ] `npx teamchat --replay --demo` plays a real, sanitized session
- [ ] The showcase session tells a compelling story (dependency chains, DMs, bug discovery)
- [ ] CLI replay faithfully reproduces the terminal chaos
- [ ] Every future team run on this machine auto-captures usable data
- [ ] v1 package publishes cleanly to npm
- [ ] Show HN post is drafted with assets embedded
