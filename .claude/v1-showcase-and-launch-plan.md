# teamchat v1 Showcase & Launch — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce launch-quality comparison assets (CLI chaos vs teamchat clarity), real demo fixtures from captured agent team sessions, and a polished v1 npm package ready for Show HN.

**Architecture:** Five phases — infrastructure (capture/replay tools), showcase session (real agent team + capture), comparison assets (recordings + analysis), v1 polish (packaging gaps), and persistent capture (future-proofing). The capture harness and CLI replay script are dev tools in `scripts/`, not shipped in the npm package.

**Tech Stack:** Bun, TypeScript, bash (capture scripts), tmux, asciinema, fswatch, ffmpeg

**Spec:** `.claude/v1-showcase-and-launch-design.md`

**Important notes:**
- Agent teams run via Claude Code CLI subscription (not API)
- Models: Opus lead + Sonnet workers for cost efficiency
- Available on this machine: tmux, ffmpeg. Need to install: asciinema, fswatch
- `fixtures/replays/` is NOT in `package.json` `files` array — must fix

---

## File Structure

### New Files to Create

| File | Responsibility |
|------|---------------|
| `scripts/capture-session.sh` | Capture harness — records tmux panes, inboxes, tasks, git during a team session |
| `scripts/replay-cli.sh` | CLI replay — plays back captured tmux output into tmux panes with timing |
| `scripts/install-capture-deps.sh` | One-liner to install asciinema + fswatch via brew |
| `showcase/taskboard/CLAUDE.md` | Project instructions for the taskboard showcase build |
| `showcase/taskboard/AGENTS.md` | Agent team definitions (6 agents with roles, models, dependencies) |
| `showcase/taskboard/package.json` | Minimal project scaffold |
| `showcase/taskboard/tsconfig.json` | TypeScript config |
| `showcase/taskboard/README.md` | What this project is (for the agents to read) |

### Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `fixtures/replays/` to `files`, bump version to `1.0.0`, add `showcase` script |
| `bin/teamchat.ts` | Port-in-use retry, better no-team-found error, `--demo` rewiring |
| `src/security/secret-scanner.ts` | Add high-entropy base64 blob detection |
| `src/security/secret-scanner.test.ts` | Tests for high-entropy detection |
| `src/server/server.ts` | Port-in-use retry with fallback |
| `README.md` | Add comparison assets, update for v1 launch |

---

## Chunk 1: Infrastructure — Capture Harness

### Task 1: Install Capture Dependencies

**Files:**
- Create: `scripts/install-capture-deps.sh`

- [ ] **Step 1: Create the dependency installer**

Create `scripts/install-capture-deps.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Installing teamchat capture dependencies..."

# Check for Homebrew
if ! command -v brew &>/dev/null; then
	echo "Error: Homebrew is required. Install from https://brew.sh"
	exit 1
fi

# Install missing tools
for tool in asciinema fswatch; do
	if ! command -v "$tool" &>/dev/null; then
		echo "Installing $tool..."
		brew install "$tool"
	else
		echo "$tool already installed"
	fi
done

# Verify tmux (should already exist)
if ! command -v tmux &>/dev/null; then
	echo "Installing tmux..."
	brew install tmux
fi

echo "All capture dependencies installed."
```

- [ ] **Step 2: Make executable and run it**

```bash
chmod +x scripts/install-capture-deps.sh
./scripts/install-capture-deps.sh
```

Expected: asciinema and fswatch installed successfully.

- [ ] **Step 3: Commit**

```bash
git add scripts/install-capture-deps.sh
git commit -m "Add capture dependency installer script"
```

---

### Task 2: Capture Harness Script

**Files:**
- Create: `scripts/capture-session.sh`

This script runs alongside a team session and captures all data sources: tmux pane scrollback, inbox files, task files, and git timeline.

- [ ] **Step 1: Create the capture harness**

Create `scripts/capture-session.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# teamchat capture harness
# Records tmux panes, inbox files, task files, and git timeline during a team session.
#
# Usage:
#   ./scripts/capture-session.sh start <team-name> [--project-dir <path>]
#   ./scripts/capture-session.sh stop
#   ./scripts/capture-session.sh bundle <team-name>
#   ./scripts/capture-session.sh status

CAPTURE_BASE="${HOME}/.teamchat/captures"
PIDFILE="/tmp/teamchat-capture.pid"
METAFILE="/tmp/teamchat-capture.meta"

# ---- Helpers ----

log() { echo "[capture] $(date +%H:%M:%S) $*" >&2; }

ensure_dir() { mkdir -p "$1"; }

get_team_tmux_session() {
	local team="$1"
	# Claude Code agent teams run in tmux sessions named after the team
	# Try common patterns: the team name itself, or "claude-team-{name}"
	for pattern in "$team" "claude-team-$team" "claude-$team"; do
		if tmux has-session -t "$pattern" 2>/dev/null; then
			echo "$pattern"
			return
		fi
	done
	# List all tmux sessions and try to find one containing the team name
	tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -i "$team" | head -1
}

capture_tmux_panes() {
	local team="$1"
	local capture_dir="$2"
	local seq="$3"
	local tmux_session
	tmux_session=$(get_team_tmux_session "$team")

	if [ -z "$tmux_session" ]; then
		return 0  # No tmux session found, skip silently
	fi

	local pane_count
	pane_count=$(tmux list-panes -t "$tmux_session" -F '#{pane_index}' 2>/dev/null | wc -l | tr -d ' ')

	# Capture each pane's scrollback
	for i in $(tmux list-panes -t "$tmux_session" -F '#{pane_index}' 2>/dev/null); do
		local pane_title
		pane_title=$(tmux display-message -t "${tmux_session}:0.${i}" -p '#{pane_title}' 2>/dev/null || echo "pane-${i}")
		# Sanitize title for filename
		local safe_title
		safe_title=$(echo "$pane_title" | tr '/' '-' | tr ' ' '_')

		# Plain text capture (full scrollback)
		tmux capture-pane -t "${tmux_session}:0.${i}" -p -S - \
			> "${capture_dir}/cli/${safe_title}-${seq}.txt" 2>/dev/null || true

		# ANSI capture (with colors, for visual replay)
		tmux capture-pane -t "${tmux_session}:0.${i}" -e -p -S - \
			> "${capture_dir}/cli/${safe_title}-${seq}.ansi" 2>/dev/null || true
	done

	# Full window capture (all panes visible)
	# This captures what the user actually sees
	for i in $(tmux list-panes -t "$tmux_session" -F '#{pane_index}' 2>/dev/null); do
		tmux capture-pane -t "${tmux_session}:0.${i}" -e -p \
			>> "${capture_dir}/cli/full-window-${seq}.ansi" 2>/dev/null || true
		echo "---PANE-BOUNDARY---" >> "${capture_dir}/cli/full-window-${seq}.ansi"
	done
}

capture_inbox_snapshot() {
	local team="$1"
	local capture_dir="$2"
	local seq="$3"
	local inbox_dir="${HOME}/.claude/teams/${team}/inboxes"

	if [ -d "$inbox_dir" ]; then
		local snapshot_dir="${capture_dir}/inboxes/${seq}"
		ensure_dir "$snapshot_dir"
		cp -r "$inbox_dir"/* "$snapshot_dir/" 2>/dev/null || true
	fi
}

capture_task_snapshot() {
	local team="$1"
	local capture_dir="$2"
	local seq="$3"
	local task_dir="${HOME}/.claude/tasks/${team}"

	if [ -d "$task_dir" ]; then
		local snapshot_dir="${capture_dir}/tasks/${seq}"
		ensure_dir "$snapshot_dir"
		cp -r "$task_dir"/* "$snapshot_dir/" 2>/dev/null || true
	fi
}

capture_git_snapshot() {
	local project_dir="$1"
	local capture_dir="$2"
	local seq="$3"

	if [ -d "$project_dir/.git" ] || [ -f "$project_dir/.git" ]; then
		git -C "$project_dir" log --all --oneline --graph -30 \
			> "${capture_dir}/git/log-${seq}.txt" 2>/dev/null || true
		git -C "$project_dir" diff --stat \
			> "${capture_dir}/git/diff-${seq}.txt" 2>/dev/null || true
	fi
}

# ---- Commands ----

cmd_start() {
	local team="${1:?Usage: capture-session.sh start <team-name> [--project-dir <path>]}"
	shift
	local project_dir=""

	while [[ $# -gt 0 ]]; do
		case "$1" in
			--project-dir) project_dir="$2"; shift 2 ;;
			*) shift ;;
		esac
	done

	local timestamp
	timestamp=$(date +%Y%m%d-%H%M%S)
	local capture_dir="${CAPTURE_BASE}/${team}/${timestamp}"

	ensure_dir "${capture_dir}/cli"
	ensure_dir "${capture_dir}/inboxes"
	ensure_dir "${capture_dir}/tasks"
	ensure_dir "${capture_dir}/git"
	ensure_dir "${capture_dir}/meta"

	# Save metadata
	cat > "${capture_dir}/meta/session.json" <<-METAJSON
	{
		"team": "${team}",
		"startedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
		"projectDir": "${project_dir}",
		"captureDir": "${capture_dir}",
		"hostname": "$(hostname)",
		"tmuxAvailable": $(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')
	}
	METAJSON

	log "Starting capture for team: ${team}"
	log "Capture dir: ${capture_dir}"

	# Save PID file and metadata for stop command
	echo "$$" > "$PIDFILE"
	echo "${team}|${capture_dir}|${project_dir}" > "$METAFILE"

	# Start fswatch on inbox and task dirs if fswatch is available
	local inbox_dir="${HOME}/.claude/teams/${team}/inboxes"
	local task_dir="${HOME}/.claude/tasks/${team}"

	if command -v fswatch &>/dev/null; then
		# Watch inboxes
		if [ -d "$inbox_dir" ]; then
			fswatch -0 "$inbox_dir" 2>/dev/null | while IFS= read -r -d '' _; do
				local seq
				seq=$(date +%s%3N)
				capture_inbox_snapshot "$team" "$capture_dir" "$seq"
			done &
			local fswatch_inbox_pid=$!
			log "Watching inboxes (pid: $fswatch_inbox_pid)"
		fi

		# Watch tasks
		if [ -d "$task_dir" ]; then
			fswatch -0 "$task_dir" 2>/dev/null | while IFS= read -r -d '' _; do
				local seq
				seq=$(date +%s%3N)
				capture_task_snapshot "$team" "$capture_dir" "$seq"
			done &
			local fswatch_task_pid=$!
			log "Watching tasks (pid: $fswatch_task_pid)"
		fi
	else
		log "fswatch not available — inbox/task snapshots will be periodic only"
	fi

	# Main capture loop — tmux panes + git every 10 seconds
	local seq=0
	while true; do
		capture_tmux_panes "$team" "$capture_dir" "$(printf '%05d' $seq)"
		if [ -n "$project_dir" ]; then
			capture_git_snapshot "$project_dir" "$capture_dir" "$(printf '%05d' $seq)"
		fi

		# Periodic inbox/task snapshot (fallback if no fswatch)
		if ! command -v fswatch &>/dev/null; then
			capture_inbox_snapshot "$team" "$capture_dir" "$(printf '%05d' $seq)"
			capture_task_snapshot "$team" "$capture_dir" "$(printf '%05d' $seq)"
		fi

		seq=$((seq + 1))
		sleep 10
	done
}

cmd_stop() {
	if [ ! -f "$METAFILE" ]; then
		log "No active capture session found"
		exit 1
	fi

	local meta
	meta=$(cat "$METAFILE")
	local team capture_dir project_dir
	IFS='|' read -r team capture_dir project_dir <<< "$meta"

	log "Stopping capture for team: ${team}"

	# Kill all background fswatch processes for this capture
	pkill -f "fswatch.*${team}" 2>/dev/null || true

	# Kill the capture loop if running in background
	if [ -f "$PIDFILE" ]; then
		local pid
		pid=$(cat "$PIDFILE")
		kill "$pid" 2>/dev/null || true
		rm "$PIDFILE"
	fi

	# Final snapshot
	local final_seq="final"
	capture_tmux_panes "$team" "$capture_dir" "$final_seq"
	capture_inbox_snapshot "$team" "$capture_dir" "$final_seq"
	capture_task_snapshot "$team" "$capture_dir" "$final_seq"
	if [ -n "$project_dir" ]; then
		capture_git_snapshot "$project_dir" "$capture_dir" "$final_seq"
	fi

	# Copy Claude Code session JSONL files
	local claude_projects="${HOME}/.claude/projects"
	if [ -d "$claude_projects" ]; then
		ensure_dir "${capture_dir}/claude-sessions"
		# Find session files modified in the last hour
		find "$claude_projects" -name "*.jsonl" -mmin -60 -exec cp {} "${capture_dir}/claude-sessions/" \; 2>/dev/null || true
		log "Copied recent Claude Code session files"
	fi

	# Save end metadata
	cat > "${capture_dir}/meta/ended.json" <<-ENDJSON
	{
		"endedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
		"cliCaptureCount": $(ls "${capture_dir}/cli/"*.txt 2>/dev/null | wc -l | tr -d ' '),
		"inboxSnapshotCount": $(ls -d "${capture_dir}/inboxes/"* 2>/dev/null | wc -l | tr -d ' '),
		"taskSnapshotCount": $(ls -d "${capture_dir}/tasks/"* 2>/dev/null | wc -l | tr -d ' '),
		"gitSnapshotCount": $(ls "${capture_dir}/git/"*.txt 2>/dev/null | wc -l | tr -d ' ')
	}
	ENDJSON

	rm -f "$METAFILE"
	log "Capture stopped. Data at: ${capture_dir}"
	log "Run './scripts/capture-session.sh bundle ${team}' to package."
}

cmd_bundle() {
	local team="${1:?Usage: capture-session.sh bundle <team-name>}"
	local latest_dir
	latest_dir=$(ls -td "${CAPTURE_BASE}/${team}/"* 2>/dev/null | head -1)

	if [ -z "$latest_dir" ]; then
		log "No captures found for team: ${team}"
		exit 1
	fi

	log "Bundling capture: ${latest_dir}"

	# Copy teamchat journal if it exists
	local journal="${HOME}/.teamchat/sessions/${team}.jsonl"
	if [ -f "$journal" ]; then
		cp "$journal" "${latest_dir}/teamchat-journal.jsonl"
		log "Included teamchat journal"
	fi

	# Create a summary
	cat > "${latest_dir}/CAPTURE-SUMMARY.md" <<-SUMMARY
	# Capture Summary: ${team}

	- **Captured**: $(cat "${latest_dir}/meta/session.json" 2>/dev/null | grep startedAt || echo "unknown")
	- **CLI snapshots**: $(ls "${latest_dir}/cli/"*.txt 2>/dev/null | wc -l | tr -d ' ')
	- **Inbox snapshots**: $(ls -d "${latest_dir}/inboxes/"* 2>/dev/null | wc -l | tr -d ' ')
	- **Task snapshots**: $(ls -d "${latest_dir}/tasks/"* 2>/dev/null | wc -l | tr -d ' ')
	- **Git snapshots**: $(ls "${latest_dir}/git/"*.txt 2>/dev/null | wc -l | tr -d ' ')
	- **teamchat journal**: $([ -f "${latest_dir}/teamchat-journal.jsonl" ] && wc -l < "${latest_dir}/teamchat-journal.jsonl" | tr -d ' ' || echo "not found")
	SUMMARY

	log "Bundle complete: ${latest_dir}"
	log "Summary: ${latest_dir}/CAPTURE-SUMMARY.md"
}

cmd_status() {
	if [ -f "$METAFILE" ]; then
		local meta
		meta=$(cat "$METAFILE")
		local team capture_dir
		IFS='|' read -r team capture_dir _ <<< "$meta"
		log "Active capture: team=${team}, dir=${capture_dir}"
		log "CLI snapshots so far: $(ls "${capture_dir}/cli/"*.txt 2>/dev/null | wc -l | tr -d ' ')"
	else
		log "No active capture session"
	fi
}

# ---- Dispatch ----

case "${1:-}" in
	start)  shift; cmd_start "$@" ;;
	stop)   cmd_stop ;;
	bundle) shift; cmd_bundle "$@" ;;
	status) cmd_status ;;
	*)
		echo "Usage: capture-session.sh {start|stop|bundle|status}"
		echo ""
		echo "  start <team-name> [--project-dir <path>]  Start capturing"
		echo "  stop                                       Stop capturing and finalize"
		echo "  bundle <team-name>                         Package latest capture"
		echo "  status                                     Show active capture info"
		exit 1
		;;
esac
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/capture-session.sh
```

- [ ] **Step 3: Test basic functionality**

```bash
# Verify the script parses arguments correctly
./scripts/capture-session.sh status
```

Expected: "No active capture session"

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-session.sh
git commit -m "Add session capture harness for tmux, inboxes, tasks, and git"
```

---

### Task 3: CLI Replay Script

**Files:**
- Create: `scripts/replay-cli.sh`

Replays captured CLI snapshots into tmux panes to reproduce the "wall of text" experience for recording.

- [ ] **Step 1: Create the replay script**

Create `scripts/replay-cli.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# CLI Replay — plays back captured tmux output into tmux panes with original timing.
# Used to produce the "CLI chaos" side of the comparison asset.
#
# Usage:
#   ./scripts/replay-cli.sh <capture-dir> [--speed 1|2|5|10] [--record <output.cast>]

CAPTURE_DIR="${1:?Usage: replay-cli.sh <capture-dir> [--speed N] [--record output.cast]}"
shift

SPEED=1
RECORD=""
while [[ $# -gt 0 ]]; do
	case "$1" in
		--speed) SPEED="$2"; shift 2 ;;
		--record) RECORD="$2"; shift 2 ;;
		*) shift ;;
	esac
done

CLI_DIR="${CAPTURE_DIR}/cli"
if [ ! -d "$CLI_DIR" ]; then
	echo "Error: No CLI captures found at ${CLI_DIR}" >&2
	exit 1
fi

# Discover unique pane names from capture files
# Files are named like: {pane-title}-{seq}.txt
PANES=()
for f in "${CLI_DIR}"/*-00000.txt; do
	[ -f "$f" ] || continue
	basename "$f" | sed 's/-00000\.txt$//' | while read -r name; do
		# Skip full-window captures
		[[ "$name" == "full-window" ]] && continue
		echo "$name"
	done
done | sort -u > /tmp/replay-panes.txt

while IFS= read -r pane; do
	PANES+=("$pane")
done < /tmp/replay-panes.txt

PANE_COUNT=${#PANES[@]}
if [ "$PANE_COUNT" -eq 0 ]; then
	echo "Error: No pane captures found in ${CLI_DIR}" >&2
	exit 1
fi

echo "Found ${PANE_COUNT} panes: ${PANES[*]}"
echo "Speed: ${SPEED}x"

# Create a tmux session with the right layout
SESSION="teamchat-cli-replay"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -x 200 -y 50

# Create panes
for ((i = 1; i < PANE_COUNT; i++)); do
	if (( i % 2 == 1 )); then
		tmux split-window -t "$SESSION" -h
	else
		tmux split-window -t "$SESSION" -v
	fi
	tmux select-layout -t "$SESSION" tiled 2>/dev/null || true
done

# Set pane titles
for ((i = 0; i < PANE_COUNT; i++)); do
	tmux select-pane -t "${SESSION}:0.${i}" -T "${PANES[$i]}"
done
tmux set-option -t "$SESSION" pane-border-format "#{pane_title}" 2>/dev/null || true
tmux set-option -t "$SESSION" pane-border-status top 2>/dev/null || true

echo "Tmux session '${SESSION}' created with ${PANE_COUNT} panes."
echo "Attach with: tmux attach -t ${SESSION}"

# Count total snapshots
SNAPSHOT_COUNT=$(ls "${CLI_DIR}/${PANES[0]}-"*.txt 2>/dev/null | wc -l | tr -d ' ')
echo "Snapshots to replay: ${SNAPSHOT_COUNT}"

# Calculate delay between frames
DELAY=$(echo "scale=2; 10 / $SPEED" | bc)

# If recording with asciinema, wrap the replay
if [ -n "$RECORD" ]; then
	if ! command -v asciinema &>/dev/null; then
		echo "Error: asciinema required for --record. Install with: brew install asciinema" >&2
		exit 1
	fi
	echo "Recording to: ${RECORD}"
	echo "Starting in 3 seconds..."
	sleep 3
	asciinema rec --command "bash -c '$(cat <<'INNER'
		SESSION="teamchat-cli-replay"
		tmux attach -t "$SESSION"
INNER
	)'" "$RECORD" &
	ASCIINEMA_PID=$!
fi

# Replay loop — send each snapshot's content to the corresponding pane
for seq_file in $(ls "${CLI_DIR}/${PANES[0]}-"*.txt 2>/dev/null | sort); do
	seq=$(basename "$seq_file" | sed "s/${PANES[0]}-//" | sed 's/\.txt$//')

	for ((i = 0; i < PANE_COUNT; i++)); do
		local_file="${CLI_DIR}/${PANES[$i]}-${seq}.txt"
		if [ -f "$local_file" ]; then
			# Clear pane and send new content
			tmux send-keys -t "${SESSION}:0.${i}" "clear" Enter
			# Use tmux load-buffer + paste to send content faithfully
			tmux load-buffer "$local_file" 2>/dev/null || true
			tmux paste-buffer -t "${SESSION}:0.${i}" 2>/dev/null || true
		fi
	done

	sleep "$DELAY"
done

echo "Replay complete."

if [ -n "$RECORD" ] && [ -n "${ASCIINEMA_PID:-}" ]; then
	kill "$ASCIINEMA_PID" 2>/dev/null || true
	echo "Recording saved to: ${RECORD}"
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/replay-cli.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/replay-cli.sh
git commit -m "Add CLI replay script for terminal output playback into tmux"
```

---

## Chunk 2: Showcase Project Spec

### Task 4: Taskboard Project Scaffold

**Files:**
- Create: `showcase/taskboard/CLAUDE.md`
- Create: `showcase/taskboard/AGENTS.md`
- Create: `showcase/taskboard/package.json`
- Create: `showcase/taskboard/tsconfig.json`
- Create: `showcase/taskboard/README.md`

This is the project spec that a real Claude Code agent team will execute. It must be carefully designed to produce rich coordination patterns.

- [ ] **Step 1: Create project directory**

```bash
mkdir -p showcase/taskboard
```

- [ ] **Step 2: Create CLAUDE.md**

Create `showcase/taskboard/CLAUDE.md`:

```markdown
# taskboard — Project Instructions

## What This Is

A collaborative task board: REST API + React frontend. Built by an agent team to demonstrate multi-agent coordination.

## Tech Stack

- **Runtime**: Bun
- **Server**: Hono (lightweight HTTP framework)
- **Database**: SQLite via bun:sqlite (zero deps)
- **Frontend**: React 19 + Tailwind CSS 4
- **Auth**: JWT tokens with bcrypt password hashing
- **Tests**: Bun test runner

## Architecture

```
src/
  db/
    schema.ts          # SQLite schema, migrations, seed data
    types.ts           # Shared TypeScript types (Task, User, Board)
  api/
    server.ts          # Hono app setup, route mounting
    routes/
      tasks.ts         # CRUD endpoints for tasks
      boards.ts        # Board management endpoints
      users.ts         # User registration, profile
    middleware/
      auth.ts          # JWT verification middleware
      validation.ts    # Request body validation
  auth/
    jwt.ts             # Token generation, verification, refresh
    passwords.ts       # Bcrypt hashing, comparison
    rbac.ts            # Role-based access: admin, member, viewer
  frontend/
    App.tsx            # Main React app
    components/
      BoardView.tsx    # Kanban board with columns
      TaskCard.tsx     # Draggable task card
      LoginForm.tsx    # Auth UI
      Header.tsx       # Nav with user info
    hooks/
      useAuth.ts       # Token management, login/logout
      useTasks.ts      # Task CRUD via API
  tests/
    api.test.ts        # API endpoint integration tests
    auth.test.ts       # Auth flow tests
    e2e.test.ts        # Full flow: register → login → create board → add task → move task
```

## Conventions

- Indentation: Tabs
- All API responses use `{ data, error }` envelope
- Auth tokens in `Authorization: Bearer <token>` header
- Task statuses: `todo`, `in_progress`, `review`, `done`
- Board roles: `admin` (full CRUD), `member` (create/edit tasks), `viewer` (read only)
- All database operations go through typed helper functions in schema.ts, not raw SQL in routes

## What to Build (in dependency order)

1. **schema** agent: Types, SQLite schema, migrations, seed data
2. **api** agent: Hono routes for tasks, boards, users (depends on schema types)
3. **auth** agent: JWT + bcrypt + RBAC middleware (depends on schema types)
4. **frontend** agent: React UI (depends on API contract from api agent)
5. **testing** agent: Integration + E2E tests (depends on api + auth)

## Critical Coordination Points

- `schema` must broadcast the TypeScript types to all agents once complete
- `api` and `auth` must agree on middleware ordering (auth before validation? or validation before auth?)
- `frontend` needs the API contract (route paths, request/response shapes) from `api`
- `auth` and `frontend` must agree on token storage strategy (localStorage vs httpOnly cookie)
- `testing` should write test scaffolds early but can only run full tests once api + auth are ready

## What NOT to Do

- Don't use an ORM — bun:sqlite with typed helpers is simpler
- Don't add WebSocket/real-time features — REST only for v1
- Don't implement OAuth/social login — email+password only
- Don't add file upload — text-only tasks
```

- [ ] **Step 3: Create AGENTS.md**

Create `showcase/taskboard/AGENTS.md`:

```markdown
# Agent Team: taskboard

## Team Structure

### lead
- **Model**: opus
- **Role**: Architect and coordinator
- **Prompt**: You are the lead architect for the taskboard project. Your job is to coordinate the team, make architectural decisions, review work, and resolve conflicts. Start by creating tasks for each agent with clear dependencies. Broadcast key decisions to the whole team. When agents have questions or conflicts, mediate and decide. Review completed work before marking tasks done.

### schema
- **Model**: sonnet
- **Role**: Database schema and types
- **Prompt**: You are the schema specialist. Your job is to design the SQLite database schema, TypeScript types, migration system, and seed data. Read CLAUDE.md for the project structure. Create all files under `src/db/`. Once your types are defined, broadcast them to the team — other agents depend on your type definitions. Focus on clean, minimal types that serve the API layer.

### api
- **Model**: sonnet
- **Role**: REST API endpoints
- **Prompt**: You are the API developer. Your job is to build the Hono REST API with routes for tasks, boards, and users. You are blocked until the schema agent provides TypeScript types. Once you have types, build the routes under `src/api/routes/`. You need to coordinate with the auth agent about middleware ordering — send them a DM to agree on whether auth middleware runs before or after request validation. Broadcast your API contract (route paths and response shapes) once routes are defined so frontend can start.

### auth
- **Model**: sonnet
- **Role**: Authentication and authorization
- **Prompt**: You are the auth specialist. Your job is to implement JWT token management, password hashing with bcrypt, and role-based access control (RBAC). You are blocked until the schema agent provides User types. Build files under `src/auth/` and `src/api/middleware/`. You need to coordinate with the api agent about middleware ordering — respond to their DM or initiate one. Also coordinate with the frontend agent about token storage strategy (localStorage vs httpOnly cookies) — send them a DM.

### frontend
- **Model**: sonnet
- **Role**: React UI
- **Prompt**: You are the frontend developer. Your job is to build the React UI with a kanban board, task cards, login form, and header. You are blocked until the api agent broadcasts the API contract (route paths, request/response shapes). Build files under `src/frontend/`. Coordinate with the auth agent about token storage — respond to their DM about localStorage vs httpOnly cookies. Use Tailwind CSS 4 for styling with a clean, minimal design.

### testing
- **Model**: sonnet
- **Role**: Integration and E2E tests
- **Prompt**: You are the testing specialist. Your job is to write integration tests for the API, auth flow tests, and an end-to-end test that covers the full user journey. Start by writing test scaffolds and helper utilities early — you can define the test structure before the implementation exists. Your full test suite is blocked until both api and auth agents complete their work. Once they're done, fill in the test implementations and run them. If you find bugs, report them to the relevant agent via DM with specifics. Build files under `src/tests/`.
```

- [ ] **Step 4: Create package.json**

Create `showcase/taskboard/package.json`:

```json
{
	"name": "taskboard",
	"version": "0.1.0",
	"type": "module",
	"scripts": {
		"dev": "bun run src/api/server.ts",
		"test": "bun test",
		"typecheck": "bun x tsc --noEmit"
	},
	"devDependencies": {
		"@types/bun": "latest",
		"@types/react": "^19.0.0",
		"@types/react-dom": "^19.0.0",
		"hono": "^4.0.0",
		"react": "^19.0.0",
		"react-dom": "^19.0.0",
		"tailwindcss": "^4.0.0",
		"typescript": "^5.9.3"
	}
}
```

- [ ] **Step 5: Create tsconfig.json**

Create `showcase/taskboard/tsconfig.json`:

```json
{
	"compilerOptions": {
		"target": "ESNext",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"jsx": "react-jsx",
		"strict": true,
		"noEmit": true,
		"skipLibCheck": true,
		"paths": {
			"@/*": ["./src/*"]
		}
	},
	"include": ["src/**/*"]
}
```

- [ ] **Step 6: Create README.md**

Create `showcase/taskboard/README.md`:

```markdown
# taskboard

A collaborative task board built by a Claude Code agent team. This project exists to demonstrate multi-agent coordination — the build process is the product, not the code.

## Purpose

This project was built by 6 AI agents working in parallel, captured by teamchat's recording system. The resulting session demonstrates:

- Dependency chains (schema → api → frontend)
- Inter-agent DM threads (api ↔ auth middleware negotiation)
- Broadcast messages (schema publishes types to all agents)
- Idle suppression (testing agent waits for implementations)
- Bug discovery and cross-agent coordination
- Task lifecycle from creation through completion

## Running

```bash
bun install
bun run dev    # Start API server
bun test       # Run tests
```
```

- [ ] **Step 7: Commit**

```bash
git add showcase/
git commit -m "Add taskboard showcase project spec for agent team demo session"
```

---

## Chunk 3: v1 Polish

### Task 5: Fix package.json — Add Fixtures to Published Files

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add fixtures to files array and bump version**

In `package.json`, add `"fixtures/replays/"` to the `files` array and bump version:

```json
"version": "1.0.0",
"files": [
	"bin/",
	"src/",
	"scripts/",
	"dist/",
	"fixtures/replays/",
	"LICENSE",
	"README.md"
],
```

Note: `scripts/` in the published package refers to `scripts/build-client.ts` (needed by prepack). The capture/replay scripts are dev tools and should NOT be in the published package. Move them to a directory excluded from publishing, or add them to a `.npmignore` if needed.

- [ ] **Step 2: Verify with dry-run**

```bash
bun run build && npm pack --dry-run 2>&1 | head -40
```

Expected: `fixtures/replays/` appears in the list. `scripts/capture-session.sh` and `scripts/replay-cli.sh` should NOT appear (they're dev tools). If they do, create `.npmignore`:

```
scripts/capture-session.sh
scripts/replay-cli.sh
scripts/install-capture-deps.sh
showcase/
.claude/
```

- [ ] **Step 3: Commit**

```bash
git add package.json .npmignore
git commit -m "Add fixtures to npm package files, bump version to 1.0.0"
```

---

### Task 6: Port-in-Use Retry

**Files:**
- Modify: `src/server/server.ts`

- [ ] **Step 1: Read the current server start method**

Read `src/server/server.ts` and find the `start()` method that calls `Bun.serve()`.

- [ ] **Step 2: Add port retry logic**

Wrap the `Bun.serve()` call in a try/catch that retries on the next port (up to 10 attempts):

```typescript
start(): void {
	const maxRetries = 10;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const tryPort = this.port + attempt;
		try {
			this.server = Bun.serve({
				port: tryPort,
				// ... existing options
			});
			if (attempt > 0) {
				console.error(`Port ${this.port} in use, using ${tryPort} instead`);
			}
			this.port = tryPort;
			// ... rest of existing start logic
			return;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (!lastError.message.includes('EADDRINUSE') && !lastError.message.includes('address already in use')) {
				throw lastError;
			}
		}
	}

	throw new Error(`Could not find an available port (tried ${this.port}-${this.port + maxRetries - 1})`);
}
```

- [ ] **Step 3: Run tests**

```bash
bun test
```

Expected: All 107 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/server/server.ts
git commit -m "Add port-in-use retry with automatic fallback"
```

---

### Task 7: Better No-Team-Found Error

**Files:**
- Modify: `bin/teamchat.ts`

- [ ] **Step 1: Improve the default no-team error message**

In `bin/teamchat.ts`, update the else branch at the bottom (the "no team specified" case) and the `startTeamSession` function to give helpful guidance:

For the `--team <name>` case, check if the team directory exists before starting. If not:

```typescript
const teamDir = path.join(homeDir, '.claude', 'teams', teamName);
if (!fs.existsSync(teamDir)) {
	console.error(`Team "${teamName}" not found at ${teamDir}`);
	console.error('');
	console.error('To use teamchat with Agent Teams:');
	console.error('  1. Start a Claude Code session with --team flag');
	console.error('  2. Or run: teamchat setup  (to auto-launch with new teams)');
	console.error('  3. Or try: teamchat --replay --demo  (to see a demo session)');
	process.exit(2);
}
```

For the default watch mode fallback, when `~/.claude/teams/` doesn't exist:

```typescript
console.error('No teams directory found. Agent Teams may not be configured yet.');
console.error('');
console.error('Quick start:');
console.error('  teamchat --replay --demo    See a demo session');
console.error('  teamchat setup              Configure auto-launch hook');
console.error('  teamchat --help             Show all options');
process.exit(2);
```

- [ ] **Step 2: Run tests**

```bash
bun test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add bin/teamchat.ts
git commit -m "Improve error messages with setup guidance for missing teams"
```

---

### Task 8: High-Entropy String Detection in Secret Scanner

**Files:**
- Modify: `src/security/secret-scanner.ts`
- Modify: `src/security/secret-scanner.test.ts`

- [ ] **Step 1: Add test for high-entropy base64 detection**

Add to `src/security/secret-scanner.test.ts`:

```typescript
describe('high-entropy strings', () => {
	test('detects long base64 blobs', () => {
		const blob = 'aVeryLongBase64StringThatIsOverFortyCharactersLongAndLooksLikeASecret1234567890==';
		const result = scanForSecrets(`config: ${blob}`);
		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(result.some(f => f.category === 'high-entropy')).toBe(true);
	});

	test('does not flag short base64', () => {
		const result = scanForSecrets('hash: abc123def456');
		expect(result.some(f => f.category === 'high-entropy')).toBe(false);
	});

	test('does not flag common long strings (URLs, paths)', () => {
		const result = scanForSecrets('https://github.com/brianruggieri/teamchat/blob/main/src/server/server.ts');
		expect(result.some(f => f.category === 'high-entropy')).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests — should fail**

```bash
bun test src/security/secret-scanner.test.ts
```

Expected: FAIL — `high-entropy` category not recognized.

- [ ] **Step 3: Add high-entropy category and pattern**

In `src/security/secret-scanner.ts`:

Add `'high-entropy'` to the `SecretCategory` union type.

Add to the `PATTERNS` array:

```typescript
// High-entropy base64 blobs (likely secrets or keys)
{
	category: 'high-entropy',
	pattern: /(?<![a-zA-Z0-9/:.@_-])[A-Za-z0-9+/]{40,}={0,2}(?![a-zA-Z0-9/:.@_-])/g,
	label: 'High-entropy string',
},
```

The negative lookbehind/lookahead prevents matching URLs, file paths, and other common long strings.

- [ ] **Step 4: Run tests — should pass**

```bash
bun test src/security/secret-scanner.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
bun test
```

Expected: All tests pass (verify no false positives in existing test data).

- [ ] **Step 6: Commit**

```bash
git add src/security/secret-scanner.ts src/security/secret-scanner.test.ts
git commit -m "Add high-entropy base64 blob detection to secret scanner"
```

---

### Task 9: Replace Demo Fixture with Real Session Data

**Files:**
- Modify: `bin/teamchat.ts` (rewire `--demo` path)
- Modify: `fixtures/replays/` (add sanitized real session)

This task uses the existing `test-team` session (637 lines, 5 agents, rich coordination).

- [ ] **Step 1: Export and sanitize the test-team session**

```bash
bun run bin/teamchat.ts export ~/.teamchat/sessions/test-team.jsonl --sanitize
```

Review the output — verify agent names are anonymized, paths stripped, no secrets.

- [ ] **Step 2: Convert sanitized bundle to fixture format**

The sanitized `.teamchat-replay` file needs to be placed as a fixture directory that `loadReplaySource` can read. Examine the existing fixture format at `fixtures/replays/teamchat-build-session/` and replicate the structure for the new demo:

```bash
mkdir -p fixtures/replays/demo
```

The replay loader expects either a directory with `session.jsonl` + `config.json` + `manifest.json`, or a single `.teamchat-replay` file. Check which format `--replay` currently supports and place the fixture accordingly.

- [ ] **Step 3: Update `--demo` flag to point to new fixture**

In `bin/teamchat.ts`, find where `--demo` resolves the fixture path and update it to point to `fixtures/replays/demo/`.

- [ ] **Step 4: Smoke test**

```bash
bun run bin/teamchat.ts --replay --demo --port 4568
```

Open browser. Verify: real session data plays, 5 agents visible, DM threads work, demo banner shows.

- [ ] **Step 5: Commit**

```bash
git add fixtures/replays/demo/ bin/teamchat.ts
git commit -m "Replace synthetic demo fixture with sanitized real session data"
```

---

## Chunk 4: Running the Showcase Session (Manual + Scripted)

### Task 10: Run the Taskboard Showcase

This task is **partially manual** — it requires running a real Claude Code agent team session.

- [ ] **Step 1: Install showcase project dependencies**

```bash
cd showcase/taskboard
bun install
cd ../..
```

- [ ] **Step 2: Start the capture harness**

In a separate terminal:

```bash
./scripts/capture-session.sh start taskboard --project-dir showcase/taskboard
```

- [ ] **Step 3: Start teamchat watching the session**

In another terminal:

```bash
bun run bin/teamchat.ts --team taskboard --port 4567
```

Open browser to `http://localhost:4567`.

- [ ] **Step 4: Launch the agent team**

In the main terminal, start a Claude Code session with agent teams enabled:

```bash
cd showcase/taskboard
claude --team taskboard
```

The lead agent should read CLAUDE.md and AGENTS.md, then begin creating tasks and spawning teammates. Monitor both the tmux panes (CLI chaos) and teamchat (organized chat) simultaneously.

- [ ] **Step 5: Let the session run to completion**

Wait for all tasks to complete (15-25 minutes expected). Don't intervene unless agents get stuck.

- [ ] **Step 6: Stop the capture**

```bash
./scripts/capture-session.sh stop
```

- [ ] **Step 7: Bundle the capture**

```bash
./scripts/capture-session.sh bundle taskboard
```

- [ ] **Step 8: Verify captured data**

```bash
cat ~/.teamchat/captures/taskboard/*/CAPTURE-SUMMARY.md
```

Verify: CLI snapshots > 50, inbox snapshots present, task snapshots present, teamchat journal exists.

- [ ] **Step 9: Export as fixture**

```bash
bun run bin/teamchat.ts export ~/.teamchat/sessions/taskboard.jsonl --sanitize
```

Review sanitization report. If clean, copy to fixtures:

```bash
mkdir -p fixtures/replays/taskboard-showcase
# Copy the sanitized bundle and supporting files
```

- [ ] **Step 10: Commit fixture**

```bash
git add fixtures/replays/taskboard-showcase/
git commit -m "Add taskboard showcase replay from real agent team session"
```

---

## Chunk 5: Comparison Assets

### Task 11: Produce CLI Replay Recording

Depends on: Task 10 (captured session data).

- [ ] **Step 1: Replay the CLI output**

```bash
./scripts/replay-cli.sh ~/.teamchat/captures/taskboard/*/  --speed 5 --record cli-replay.cast
```

If asciinema recording doesn't capture tmux well, use screen recording instead:

```bash
# Start the CLI replay in tmux
./scripts/replay-cli.sh ~/.teamchat/captures/taskboard/*/ --speed 5

# In another terminal, record with ffmpeg (captures the tmux window)
ffmpeg -f avfoundation -i "0" -t 60 -vf "scale=1600:900" cli-chaos.mp4
```

- [ ] **Step 2: Replay the teamchat session**

```bash
bun run bin/teamchat.ts --replay ~/.teamchat/sessions/taskboard.jsonl --port 4567
```

Record the browser with screen capture or Playwright automation.

- [ ] **Step 3: Produce side-by-side comparison**

Use ffmpeg to composite the two recordings:

```bash
ffmpeg -i cli-chaos.mp4 -i teamchat-replay.mp4 \
	-filter_complex "[0:v]scale=800:450[left];[1:v]scale=800:450[right];[left][right]hstack" \
	-t 30 comparison.mp4
```

Convert to GIF for README:

```bash
ffmpeg -i comparison.mp4 -vf "fps=10,scale=800:-1" -t 15 comparison.gif
```

- [ ] **Step 4: Capture key screenshots**

Take screenshots of specific comparison moments:
- DM thread interleaved in CLI vs clean thread in teamchat
- Idle period in CLI (wall of pings) vs sidebar indicator in teamchat
- Task status scattered across panes vs unified sidebar

- [ ] **Step 5: Commit assets**

```bash
mkdir -p assets
cp comparison.gif assets/demo.gif
git add assets/
git commit -m "Add comparison GIF and screenshots for README"
```

---

### Task 12: Quantitative Comparison Analysis

Depends on: Task 10 (captured session data).

- [ ] **Step 1: Count raw CLI output lines**

```bash
# Total lines across all tmux captures
wc -l ~/.teamchat/captures/taskboard/*/cli/*.txt | tail -1
```

- [ ] **Step 2: Count teamchat events**

```bash
wc -l ~/.teamchat/sessions/taskboard.jsonl
```

- [ ] **Step 3: Count idle/noise lines in CLI output**

```bash
# Lines that are idle pings, file watching messages, or repeated status
grep -c -E "(watching|idle|no changes|⠋|⠸|Compiling)" ~/.teamchat/captures/taskboard/*/cli/*.txt || echo "0"
```

- [ ] **Step 4: Produce comparison table**

Write up the numbers in a format suitable for the README. Include:
- Total CLI lines vs teamchat events
- Noise lines suppressed
- Signal-to-noise ratio improvement

---

## Chunk 6: README and Launch Prep

### Task 13: Update README with Comparison Assets

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add comparison section to README**

After the existing quick-start section, add a "Why teamchat?" section:

```markdown
## Why teamchat?

Here's what monitoring 5 AI agents looks like today vs with teamchat:

![CLI vs teamchat comparison](assets/demo.gif)

| | CLI (5 tmux panes) | teamchat |
|---|---|---|
| Lines of output | ~X,XXX | ~XXX events |
| Idle noise | ~XXX lines | Collapsed to sidebar |
| DM conversations | Interleaved, hard to follow | Clean threaded view |
| Task status | Scattered across panes | Unified sidebar |
| Time to understand session | Minutes of scrolling | Seconds at a glance |
```

Fill in actual numbers from Task 12.

- [ ] **Step 2: Verify all CLI examples in README work**

Test every command shown in the README:

```bash
bun run bin/teamchat.ts --version
bun run bin/teamchat.ts --help
bun run bin/teamchat.ts --replay --demo --port 4568
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Add comparison analysis and assets to README"
```

---

### Task 14: Show HN Draft

**Files:**
- Create: `.claude/show-hn-draft.md`

- [ ] **Step 1: Write the draft**

```markdown
# Show HN: teamchat — Group chat visualizer for Claude Code Agent Teams

I built a tool that shows multi-agent AI coding sessions as a Slack-style group chat instead of 5 tmux panes of scrolling text.

When you run Claude Code Agent Teams, each agent gets a tmux pane. With 5+ agents, you're staring at walls of interleaved output trying to figure out who's doing what. teamchat watches the same files Claude Code writes and presents it as a group chat — with DM threads, task tracking, idle suppression, and replay.

Try it: `npx teamchat --replay --demo`

Key features:
- Zero config — just `npx teamchat --team <name>` alongside your existing session
- DM threads between agents shown as collapsible conversations
- Task sidebar with live dependency tracking
- Idle suppression (600+ ping lines → one sidebar indicator)
- Session recording + replay with playback controls
- Built-in secret scanning before you share any recordings
- Privacy-first: everything stays on your machine, no telemetry

[Comparison GIF showing CLI chaos vs teamchat clarity]

GitHub: [link]

This is free, open source, and works with any Claude Code Agent Teams session. Built with Bun + React 19 + Tailwind CSS 4.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/show-hn-draft.md
git commit -m "Draft Show HN post"
```

---

### Task 15: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
bun test
```

Expected: All tests pass.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: Zero errors.

- [ ] **Step 3: Run build**

```bash
bun run build
```

Expected: Clean build.

- [ ] **Step 4: Validate npm package**

```bash
npm pack --dry-run 2>&1
```

Verify: includes `bin/`, `src/`, `dist/`, `fixtures/replays/`, `LICENSE`, `README.md`. Does NOT include `.claude/`, `showcase/`, `scripts/capture-session.sh`, `scripts/replay-cli.sh`.

- [ ] **Step 5: End-to-end smoke tests**

```bash
# Demo replay
bun run bin/teamchat.ts --replay --demo --port 4567

# Version
bun run bin/teamchat.ts --version

# Help
bun run bin/teamchat.ts --help

# Error handling
bun run bin/teamchat.ts --team nonexistent-team
bun run bin/teamchat.ts --replay nonexistent-file.jsonl

# Export
bun run bin/teamchat.ts export fixtures/replays/teamchat-build-session/
bun run bin/teamchat.ts scan fixtures/replays/teamchat-build-session/session.jsonl
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "v1.0.0 final verification"
```

---

## Task Dependency Graph

```
Chunk 1 (Infrastructure):
  Task 1 (Install deps) ─── standalone
  Task 2 (Capture harness) ─── standalone
  Task 3 (CLI replay) ─── standalone

Chunk 2 (Showcase spec):
  Task 4 (Taskboard scaffold) ─── standalone

Chunk 3 (v1 Polish):
  Task 5 (package.json fix) ─── standalone
  Task 6 (Port retry) ─── standalone
  Task 7 (Error messages) ─── standalone
  Task 8 (High-entropy detection) ─── standalone
  Task 9 (Demo fixture) ─── standalone

Chunk 4 (Run showcase):
  Task 10 (Run session) ─── depends on T1, T2, T4

Chunk 5 (Comparison):
  Task 11 (CLI recording) ─── depends on T3, T10
  Task 12 (Analysis) ─── depends on T10

Chunk 6 (Launch):
  Task 13 (README) ─── depends on T11, T12
  Task 14 (Show HN) ─── depends on T13
  Task 15 (Final verification) ─── depends on all
```

**Parallelizable groups:**
- Chunk 1 (T1, T2, T3) + Chunk 2 (T4) + Chunk 3 (T5-T9) — all independent, can run in parallel
- After T10: T11 + T12 can run in parallel
- T13 + T14 are sequential after comparison assets
- T15 is the final gate
