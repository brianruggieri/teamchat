# teamchat

A group chat visualizer for [Claude Code Agent Teams](https://docs.anthropic.com/en/docs/claude-code). Renders multi-agent coordination as a familiar Slack/iMessage-style group chat with DM threads, reactions, task tracking, and idle suppression.

## Quick Start

```bash
npx teamchat --team my-team
```

Opens a browser at `localhost:3456` showing the live chat for the specified team.

## Auto-Launch Hook

Add this to `~/.claude/settings.json` to launch teamchat automatically when a team starts:

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

Or run the setup command:

```bash
teamchat setup
```

## CLI Reference

```
teamchat --team <name>           Watch a running team session
teamchat --watch                 Auto-detect any team creation
teamchat --replay <file.jsonl>   Replay a recorded session
teamchat --port <number>         Custom port (default: 3456)
teamchat --compact               Compress short acks into reactions
teamchat --no-journal            Disable JSONL session recording
teamchat --share                 Expose server for remote access
teamchat setup                   Install auto-launch hook
```

## How It Works

teamchat watches three filesystem paths that Claude Code Agent Teams uses for coordination:

| Path | What It Contains |
|------|-----------------|
| `~/.claude/teams/{name}/config.json` | Team roster (members, colors) |
| `~/.claude/teams/{name}/inboxes/*.json` | Agent messages (content + system events) |
| `~/.claude/tasks/{name}/*.json` | Task states (status, owner, dependencies) |

On each file change, teamchat:

1. **Parses** message type (content vs system event via `JSON.parse` on the `text` field)
2. **Detects** broadcasts (same text in 3+ inboxes within 1s)
3. **Detects** DMs (message in teammate inbox from non-lead sender)
4. **Suppresses** idle pings (collapses to sidebar presence indicator)
5. **Correlates** task claims to lead messages for reaction attachment
6. **Computes** dependency unblock cascades by diffing task statuses
7. **Emits** structured `ChatEvent` objects via WebSocket to the browser client

## Replay Mode

Sessions are automatically recorded to `~/.teamchat/sessions/{team-name}.jsonl`. Replay with:

```bash
teamchat --replay ~/.teamchat/sessions/healthdash-sprint.jsonl
```

Controls: play/pause, speed (1x/2x/5x/10x), scrub timeline, jump to task completions.

## Chat Features

- **Lead messages** right-aligned (like "your" messages in iMessage)
- **Teammate messages** left-aligned with color-coded avatars
- **DM threads** between teammates shown as collapsible inline threads
- **Broadcasts** marked with a megaphone indicator
- **Reactions** derived from protocol events (task claims, approvals, completions)
- **Task sidebar** with live status, dependency tracking, and unblock cascade alerts
- **Presence roster** showing working/idle/offline status per agent
- **Idle suppression** collapses hundreds of idle pings into a single sidebar indicator

## Development

```bash
# Generate test fixtures
bun run fixture:generate

# Start dev server with fixture data
bun run dev

# Run tests
bun test
```

## License

MIT
