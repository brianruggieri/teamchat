#!/usr/bin/env bun

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FileWatcher } from '../src/server/watcher.js';
import { EventProcessor } from '../src/server/processor.js';
import { Journal } from '../src/server/journal.js';
import { TeamChatServer } from '../src/server/server.js';
import type { ChatEvent } from '../src/shared/types.js';

// === Argument parsing ===

interface CliArgs {
	team: string | null;
	watch: string | null;
	replay: string | null;
	port: number;
	compact: boolean;
	noJournal: boolean;
	share: boolean;
	setup: boolean;
	help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		team: null,
		watch: null,
		replay: null,
		port: 3456,
		compact: false,
		noJournal: false,
		share: false,
		setup: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		switch (arg) {
			case '--team':
			case '-t':
				args.team = argv[++i] ?? null;
				break;
			case '--watch':
			case '-w':
				args.watch = argv[++i] ?? null;
				break;
			case '--replay':
			case '-r':
				args.replay = argv[++i] ?? null;
				break;
			case '--port':
			case '-p':
				args.port = parseInt(argv[++i] ?? '3456', 10);
				break;
			case '--compact':
				args.compact = true;
				break;
			case '--no-journal':
				args.noJournal = true;
				break;
			case '--share':
				args.share = true;
				break;
			case 'setup':
				args.setup = true;
				break;
			case '--help':
			case '-h':
				args.help = true;
				break;
		}
	}

	return args;
}

function printHelp(): void {
	console.log(`
teamchat — Group chat visualizer for Claude Code Agent Teams

USAGE:
  teamchat --team <name>           Watch a specific team
  teamchat --watch <dir>           Auto-detect teams in directory
  teamchat --replay <file.jsonl>   Replay a recorded session
  teamchat setup                   Configure auto-launch hook

OPTIONS:
  --team, -t <name>       Team name to watch
  --watch, -w <dir>       Directory to watch for new teams
  --replay, -r <file>     JSONL file to replay
  --port, -p <port>       Server port (default: 3456)
  --compact               Enable compact mode (compress short acks to reactions)
  --no-journal            Disable JSONL journaling
  --share                 Expose server on all interfaces (for sharing)
  --help, -h              Show this help message
`);
}

// === Setup command ===

function runSetup(): void {
	const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
	const settingsPath = path.join(homeDir, '.claude', 'settings.json');

	const hookConfig = {
		hooks: {
			PostToolUse: [
				{
					matcher: 'Teammate',
					hooks: [
						{
							type: 'command',
							command:
								"bash -c 'TEAM=$(cat | jq -r \".tool_input.team_name // empty\"); if [ -n \"$TEAM\" ] && ! pgrep -f \"teamchat.*$TEAM\" > /dev/null; then teamchat --team \"$TEAM\" & fi'",
							async: true,
							timeout: 5,
						},
					],
				},
			],
		},
	};

	let existing: Record<string, unknown> = {};
	if (fs.existsSync(settingsPath)) {
		try {
			existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
		} catch {
			// Corrupted settings — start fresh
		}
	}

	// Merge hook configuration
	const existingHooks = (existing.hooks ?? {}) as Record<string, unknown>;
	const existingPostToolUse = (existingHooks.PostToolUse ?? []) as unknown[];
	const hasTeamchatHook = existingPostToolUse.some(
		(h: unknown) => (h as Record<string, unknown>).matcher === 'Teammate',
	);

	if (hasTeamchatHook) {
		console.log('teamchat auto-launch hook is already configured.');
		return;
	}

	existingHooks.PostToolUse = [
		...existingPostToolUse,
		...hookConfig.hooks.PostToolUse,
	];
	existing.hooks = existingHooks;

	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
	fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
	console.log(`Auto-launch hook written to ${settingsPath}`);
	console.log('teamchat will now start automatically when you use Agent Teams.');
}

// === Watch mode (auto-detect teams) ===

function startWatchMode(watchDir: string, port: number, compact: boolean, noJournal: boolean): void {
	const teamsDir = watchDir.endsWith('teams') ? watchDir : path.join(watchDir, 'teams');
	console.log(`Watching for teams in ${teamsDir}...`);

	const activeTeams = new Set<string>();

	const checkForTeams = (): void => {
		try {
			if (!fs.existsSync(teamsDir)) return;
			const dirs = fs.readdirSync(teamsDir);
			for (const dir of dirs) {
				const configPath = path.join(teamsDir, dir, 'config.json');
				if (fs.existsSync(configPath) && !activeTeams.has(dir)) {
					activeTeams.add(dir);
					console.log(`Detected team: ${dir}`);
					startTeamSession(dir, port + activeTeams.size - 1, compact, noJournal);
				}
			}
		} catch {
			// Directory doesn't exist yet
		}
	};

	checkForTeams();
	setInterval(checkForTeams, 2000);
}

// === Replay mode ===

function startReplayMode(filePath: string, port: number): void {
	const entries = Journal.readFrom(filePath);
	if (entries.length === 0) {
		console.error(`No entries found in ${filePath}`);
		process.exit(1);
	}

	console.log(`Loaded ${entries.length} events from ${filePath}`);

	// Extract team name from file path
	const teamName = path.basename(filePath, '.jsonl');
	const allEvents = entries.map((e) => e.event);

	// Create a minimal processor and watcher for the server
	const emittedEvents: ChatEvent[] = [];
	const processor = new EventProcessor((events) => {
		emittedEvents.push(...events);
	}, false);

	// Manually populate processor state from journal
	const watcher = new FileWatcher(teamName, () => {}, 100);

	const server = new TeamChatServer({
		mode: 'live',
		port,
		teamName,
		processor,
		watcher,
	});

	server.start();

	// Serve replay events with timing
	let currentIndex = 0;
	const baseTime = entries[0] ? new Date(entries[0].event.timestamp).getTime() : 0;

	const replayNext = (): void => {
		if (currentIndex >= entries.length) {
			console.log('Replay complete.');
			return;
		}

		const entry = entries[currentIndex]!;
		server.broadcast([entry.event]);
		currentIndex++;

		if (currentIndex < entries.length) {
			const nextEntry = entries[currentIndex]!;
			const currentTime = new Date(entry.event.timestamp).getTime();
			const nextTime = new Date(nextEntry.event.timestamp).getTime();
			const delay = Math.min(Math.max(nextTime - currentTime, 10), 5000); // Cap at 5s
			setTimeout(replayNext, delay);
		} else {
			console.log('Replay complete.');
		}
	};

	// Start replay after a small delay to let clients connect
	setTimeout(replayNext, 1000);
}

// === Main team session ===

function startTeamSession(
	teamName: string,
	port: number,
	compact: boolean,
	noJournal: boolean,
): void {
	const journal = new Journal(teamName, !noJournal);

	const processor = new EventProcessor((events) => {
		// Journal each event
		for (const event of events) {
			journal.append(event);
		}
		// Broadcast to WebSocket clients
		server.broadcast(events);
	}, compact);

	const watcher = new FileWatcher(teamName, (delta) => {
		processor.processDelta(delta);
	});

	const server = new TeamChatServer({
		mode: 'live',
		port,
		teamName,
		processor,
		watcher,
	});

	// Read initial state and process it through the processor
	const initialSnapshot = watcher.readInitialState();

	// Process existing config as a delta (null → current)
	if (initialSnapshot.config) {
		processor.processDelta({
			type: 'config',
			previous: null,
			current: initialSnapshot.config,
		});
	}

	// Process existing tasks as a delta (empty → current)
	if (initialSnapshot.tasks.length > 0) {
		processor.processDelta({
			type: 'tasks',
			previous: [],
			current: [...initialSnapshot.tasks],
		});
	}

	// Process existing inbox messages as deltas (empty → current)
	for (const [agentName, messages] of initialSnapshot.inboxes) {
		if (messages.length > 0) {
			processor.processDelta({
				type: 'inbox',
				agentName,
				previous: [],
				current: [...messages],
			});
		}
	}

	// Start the server
	server.start();

	// Start watching for changes
	watcher.start();

	if (!noJournal) {
		console.log(`Journal: ${journal.getFilePath()}`);
	}

	// Handle graceful shutdown
	const shutdown = (): void => {
		console.log('\nShutting down...');
		watcher.stop();
		server.stop();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

// === Entry point ===

const args = parseArgs(process.argv.slice(2));

if (args.help) {
	printHelp();
	process.exit(0);
}

if (args.setup) {
	runSetup();
	process.exit(0);
}

if (args.replay) {
	startReplayMode(args.replay, args.port);
} else if (args.watch) {
	startWatchMode(args.watch, args.port, args.compact, args.noJournal);
} else if (args.team) {
	startTeamSession(args.team, args.port, args.compact, args.noJournal);
} else {
	// Default: watch ~/.claude/teams/
	const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
	const defaultWatch = path.join(homeDir, '.claude', 'teams');
	if (fs.existsSync(defaultWatch)) {
		startWatchMode(defaultWatch, args.port, args.compact, args.noJournal);
	} else {
		console.error('No team specified. Use --team <name>, --watch <dir>, or --replay <file>.');
		printHelp();
		process.exit(1);
	}
}
