# teamchat Build Session Replay

This bundle captures the real Claude team session that built `teamchat`. It is
the most representative replay in the repo because it contains the same
coordination patterns the UI is designed to surface.

## Files

- `session.jsonl`: canonical replay input for `teamchat --replay`
- `config.json`: team roster and color assignments from the original session
- `tasks.json`: final task state snapshot for reference

## Usage

Run the replay from the repo root:

```bash
teamchat --replay fixtures/replays/teamchat-build-session/session.jsonl --port 4567
```

## What This Replay Shows

- Team creation and initial task fan-out
- Repeated plan approval traffic, including the plan-mode failure loop
- Lead shutdown and respawn recovery
- Task dependency unblocks landing in visible waves
- Direct teammate threads between implementation agents
- Real protocol cards, reactions, presence changes, and shutdown events

## Session Snapshot

- Duration: about 1 hour 26 minutes
- Events: 79 total
- Agents: 3 teammates plus 1 lead
- Tasks: 9 total
- DM threads: 2

## Why Keep It

This replay is both a realistic demo and a regression target. When the chat UI
changes, this is the bundle to load first because it stresses the exact
behaviors that make `teamchat` useful.
