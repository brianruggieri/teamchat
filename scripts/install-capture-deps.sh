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
