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
		# Sanitize title for filename, include pane index to prevent overwrites
		local safe_title
		safe_title=$(echo "$pane_title" | tr '/' '-' | tr ' ' '_')
		local pane_label="pane${i}-${safe_title}"

		# Plain text capture (full scrollback)
		tmux capture-pane -t "${tmux_session}:0.${i}" -p -S - \
			> "${capture_dir}/cli/${pane_label}-${seq}.txt" 2>/dev/null || true

		# ANSI capture (with colors, for visual replay)
		tmux capture-pane -t "${tmux_session}:0.${i}" -e -p -S - \
			> "${capture_dir}/cli/${pane_label}-${seq}.ansi" 2>/dev/null || true
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

	# Take initial snapshots of inbox and task state
	local inbox_dir="${HOME}/.claude/teams/${team}/inboxes"
	local task_dir="${HOME}/.claude/tasks/${team}"
	capture_inbox_snapshot "$team" "$capture_dir" "initial"
	capture_task_snapshot "$team" "$capture_dir" "initial"
	log "Initial inbox/task snapshots taken"

	# Also capture initial config if it exists
	local config_file="${HOME}/.claude/teams/${team}/config.json"
	if [ -f "$config_file" ]; then
		cp "$config_file" "${capture_dir}/meta/team-config.json"
		log "Team config captured"
	fi

	# Start fswatch on inbox and task dirs if fswatch is available

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
