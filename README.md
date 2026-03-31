# teamchat

> Group chat visualizer for Claude Code Agent Teams

A group chat visualizer for [Claude Code Agent Teams](https://www.anthropic.com/claude). Watches your team session in real time and renders multi-agent coordination as a familiar Slack/iMessage-style group chat — with DM threads, reactions, task tracking, idle suppression, and session replay.

![teamchat demo](assets/demo.gif)
<!-- GIF will be recorded separately; placeholder for now -->

## Quick Start

```bash
npx teamchat --replay --demo
```

Opens a browser at `localhost:3456` playing back a sample teamchat session. No team running required.

## Live Mode

Watch a running team session by name:

```bash
teamchat --team my-team
```

Auto-detect any team that starts under `~/.claude/teams/`:

```bash
teamchat --watch ~/.claude/teams
```

Or run without arguments — teamchat defaults to watching `~/.claude/teams/` if it exists.

Start in lobby mode — waits for the first new team to be created:

```bash
teamchat --auto
```

### Auto-Launch Hook

Run once to configure teamchat to start automatically whenever a Claude Code Agent Team is created:

```bash
teamchat setup
```

This writes a `PostToolUse` hook to `~/.claude/settings.json` that launches teamchat in the background when a `TeamCreate` tool is invoked.

## Features

- Lead messages right-aligned (iMessage style), teammate messages left-aligned with color-coded avatars
- DM threads between agents shown as collapsible inline threads
- Broadcasts detected and marked when the same message appears in 3+ inboxes within 1 second
- Reactions derived from protocol events (task claims, completions, approvals) — never fabricated
- Task sidebar with live status, dependency tracking, and unblock cascade alerts
- Presence roster showing working/idle/offline status per agent
- Idle suppression — collapses hundreds of idle pings into a single sidebar indicator
- Session replay with play/pause, speed controls, timeline scrubber, and keyboard shortcuts
- JSONL session journal written automatically during live sessions (disable with `--no-journal`)

## Privacy First

teamchat is entirely local. It makes no network calls and collects no telemetry. During live sessions, it reads Claude team data from `~/.claude/` (read-only) and writes journals to `~/.teamchat/`. Replay (`--replay <file-or-dir>`) and export (`export <path>`) operate only on paths you explicitly provide. Before sharing a session, run `scan` to check for secrets and `export --sanitize` to scrub them.

## CLI Reference

| Command / Flag | Description |
|---|---|
| `teamchat --team, -t <name>` | Watch a specific running team |
| `teamchat --watch, -w <dir>` | Auto-detect teams in a directory |
| `teamchat --auto` | Wait for a new team to be created (lobby mode) |
| `teamchat --replay, -r <file-or-dir>` | Replay a JSONL journal or bundle directory |
| `teamchat --replay --demo` | Replay the bundled demo session |
| `teamchat export <path>` | Export a session to a `.teamchat-replay` bundle |
| `teamchat export --latest` | Export the most recent session |
| `teamchat export --sanitize` | Anonymize agent names and redact detected secrets |
| `teamchat export --strip-content` | Strip all message content (requires `--sanitize`) |
| `teamchat scan <file.jsonl>` | Scan a session file for secrets |
| `teamchat setup` | Install the auto-launch hook into `~/.claude/settings.json` |
| `--port, -p <port>` | Server port (default: `3456`) |
| `--compact` | Compress short acknowledgement messages into reactions |
| `--no-journal` | Disable automatic JSONL session recording |
| `--share` | Expose server on all interfaces (for sharing over LAN) |
| `--version, -v` | Print version and exit |
| `--help, -h` | Show help |

## Export & Security

Export a live session journal to a portable replay bundle:

```bash
teamchat export ~/.teamchat/sessions/my-team.jsonl
teamchat export --latest
```

Before sharing a bundle, scan for secrets:

```bash
teamchat scan ~/.teamchat/sessions/my-team.jsonl
```

Export with sanitization (anonymizes agent names and redacts detected secrets):

```bash
teamchat export --latest --sanitize
teamchat export --latest --sanitize --strip-content  # removes all message content
```

### Replay Bundle Format

A bundle is a directory containing:

| File | Contents |
|---|---|
| `manifest.json` | Session metadata (team name, duration, event count) |
| `session.jsonl` or `events.jsonl` | Recorded event stream |
| `config.json` | Team roster |
| `tasks.initial.json` | Task state at `t=0` |
| `tasks.final.json` | Task state at end of session |
| `artifacts.json` | Saved artifact index |
| `artifacts/` | Artifact files (reports, outputs) |

## How It Works

teamchat watches `~/.claude/teams/{name}/` for inbox and config changes and `~/.claude/tasks/{name}/` for task state. A file watcher feeds deltas to an event processor that classifies messages, detects broadcasts and DMs, suppresses idle pings, and correlates reactions to protocol events. The processor emits `ChatEvent` objects over a WebSocket to a React client that renders them in the browser.

## Replay Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `ArrowLeft` / `ArrowRight` | Step backward / forward one event |
| `Shift+ArrowLeft` / `Shift+ArrowRight` | Jump to previous / next marker |
| `0` | Restart from the beginning |
| `1`, `2`, `5` | Set playback speed |

## Requirements

- Bun >= 1.0.0
- macOS or Linux (Windows not tested)

## License

MIT
