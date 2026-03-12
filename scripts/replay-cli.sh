#!/usr/bin/env bash
set -euo pipefail

# CLI Replay — plays back captured tmux output into tmux panes with original timing.
# Used to produce the "CLI chaos" side of the comparison asset.
#
# Usage:
#   ./scripts/replay-cli.sh <capture-dir> [--speed 1|2|5|10]

CAPTURE_DIR="${1:?Usage: replay-cli.sh <capture-dir> [--speed N]}"
shift

SPEED=1
while [[ $# -gt 0 ]]; do
	case "$1" in
		--speed) SPEED="$2"; shift 2 ;;
		*) shift ;;
	esac
done

CLI_DIR="${CAPTURE_DIR}/cli"
if [ ! -d "$CLI_DIR" ]; then
	echo "Error: No CLI captures found at ${CLI_DIR}" >&2
	exit 1
fi

# Discover unique pane labels from capture files
# Files are named like: paneN-{title}-{seq}.txt
PANES=()
for f in "${CLI_DIR}"/pane*-00000.txt; do
	[ -f "$f" ] || continue
	label=$(basename "$f" | sed 's/-00000\.txt$//')
	# Skip full-window captures
	[[ "$label" == full-window* ]] && continue
	PANES+=("$label")
done

# Sort panes by index for consistent ordering
IFS=$'\n' PANES=($(sort <<<"${PANES[*]}")); unset IFS

PANE_COUNT=${#PANES[@]}
if [ "$PANE_COUNT" -eq 0 ]; then
	echo "Error: No pane captures found in ${CLI_DIR}" >&2
	echo "Expected files matching: pane*-00000.txt" >&2
	exit 1
fi

echo "Found ${PANE_COUNT} panes: ${PANES[*]}"
echo "Speed: ${SPEED}x"

# Create a tmux session with the right layout
SESSION="teamchat-cli-replay"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -x 200 -y 50

# Create panes to match the original layout
for ((i = 1; i < PANE_COUNT; i++)); do
	if (( i % 2 == 1 )); then
		tmux split-window -t "$SESSION" -h
	else
		tmux split-window -t "$SESSION" -v
	fi
	tmux select-layout -t "$SESSION" tiled 2>/dev/null || true
done

# Set pane titles (strip the paneN- prefix for display)
for ((i = 0; i < PANE_COUNT; i++)); do
	display_name=$(echo "${PANES[$i]}" | sed 's/^pane[0-9]*-//')
	tmux select-pane -t "${SESSION}:0.${i}" -T "$display_name"
done
tmux set-option -t "$SESSION" pane-border-format " #{pane_title} " 2>/dev/null || true
tmux set-option -t "$SESSION" pane-border-status top 2>/dev/null || true

echo "Tmux session '${SESSION}' created with ${PANE_COUNT} panes."
echo "Attach with: tmux attach -t ${SESSION}"

# Count total snapshots
SNAPSHOT_COUNT=$(ls "${CLI_DIR}/${PANES[0]}-"*.txt 2>/dev/null | wc -l | tr -d ' ')
echo "Snapshots to replay: ${SNAPSHOT_COUNT}"

# Calculate delay between frames
DELAY=$(echo "scale=2; 10 / $SPEED" | bc)

# Replay loop — send each snapshot's content to the corresponding pane
for seq_file in $(ls "${CLI_DIR}/${PANES[0]}-"*.txt 2>/dev/null | sort); do
	seq=$(basename "$seq_file" | sed "s/^${PANES[0]}-//" | sed 's/\.txt$//')

	for ((i = 0; i < PANE_COUNT; i++)); do
		local_file="${CLI_DIR}/${PANES[$i]}-${seq}.txt"
		if [ -f "$local_file" ]; then
			# Clear pane and send new content
			tmux send-keys -t "${SESSION}:0.${i}" "clear" Enter
			sleep 0.1
			# Use tmux load-buffer + paste to send content faithfully
			tmux load-buffer "$local_file" 2>/dev/null || true
			tmux paste-buffer -t "${SESSION}:0.${i}" 2>/dev/null || true
		fi
	done

	sleep "$DELAY"
done

echo "Replay complete."
echo "Session '${SESSION}' still available. Kill with: tmux kill-session -t ${SESSION}"
