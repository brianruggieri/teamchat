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
