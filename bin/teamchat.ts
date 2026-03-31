#!/usr/bin/env bun

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FileWatcher } from '../src/server/watcher.js';
import { EventProcessor } from '../src/server/processor.js';
import { Journal } from '../src/server/journal.js';
import { TeamChatServer } from '../src/server/server.js';
import { loadReplaySource } from '../src/server/replay.js';
import { runExport, runScan, type ExportArgs } from '../src/export/cli.js';

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
	version: boolean;
	demo: boolean;
	auto: boolean;
	// Export subcommand
	subcommand: 'export' | 'scan' | 'capture' | 'report' | null;
	subcommandArg: string | null;
	// Export flags
	latest: boolean;
	sanitize: boolean;
	stripContent: boolean;
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
		version: false,
		demo: false,
		auto: false,
		subcommand: null,
		subcommandArg: null,
		latest: false,
		sanitize: false,
		stripContent: false,
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
			case '-r': {
				const next = argv[i + 1];
				if (next && !next.startsWith('--')) {
					args.replay = argv[++i] ?? null;
				} else {
					args.replay = '__demo_placeholder__';
				}
				break;
			}
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
			case '--version':
			case '-v':
				args.version = true;
				break;
			case '--demo':
				args.demo = true;
				break;
			case '--auto':
				args.auto = true;
				break;
			case '--latest':
				args.latest = true;
				break;
			case '--sanitize':
				args.sanitize = true;
				break;
			case '--strip-content':
				args.stripContent = true;
				break;
			case 'export':
				args.subcommand = 'export';
				// Next arg is the path (if it doesn't start with --)
				if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) {
					args.subcommandArg = argv[++i] ?? null;
				}
				break;
			case 'scan':
				args.subcommand = 'scan';
				if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) {
					args.subcommandArg = argv[++i] ?? null;
				}
				break;
			case 'capture':
				args.subcommand = 'capture';
				if (argv[i + 1] && !argv[i + 1]!.startsWith('-')) {
					args.subcommandArg = argv[++i] ?? null;
				}
				break;
			case 'report':
				args.subcommand = 'report';
				if (argv[i + 1] && !argv[i + 1]!.startsWith('-')) {
					args.subcommandArg = argv[++i] ?? null;
				}
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
  teamchat --auto                  Wait for a new team to be created (lobby mode)
  teamchat --watch <dir>           Auto-detect teams in directory
  teamchat --replay <file-or-dir>  Replay a recorded session
  teamchat --replay --demo         Replay bundled demo session
  teamchat export <path>           Export session to .teamchat-replay bundle
  teamchat export --latest         Export most recent session
  teamchat scan <file.jsonl>       Scan a session for secrets
  teamchat capture <session-id>    Bundle a session for comparison reports
  teamchat report <bundle>         Generate an HTML comparison report
  teamchat setup                   Configure auto-launch hook

OPTIONS:
  --team, -t <name>       Team name to watch
  --auto                  Wait for a new team to be created (lobby mode)
  --watch, -w <dir>       Directory to watch for new teams (spawns a server per team)
  --replay, -r <path>     JSONL file or bundle directory to replay
  --demo                  Use bundled demo session (with --replay)
  --port, -p <port>       Server port (default: 3456)
  --compact               Enable compact mode (compress short acks to reactions)
  --no-journal            Disable JSONL journaling
  --share                 Expose server on all interfaces (for sharing)
  --version, -v           Print version and exit
  --help, -h              Show this help message

EXPORT OPTIONS:
  --latest                Export the most recent session
  --sanitize              Run sanitization pipeline (anonymize agents, redact secrets)
  --strip-content         Strip all message content (use with --sanitize)
`);
}

// === Team freshness check ===

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isTeamFresh(teamsDir: string, teamDir: string): boolean {
	const teamPath = path.join(teamsDir, teamDir);
	try {
		const stat = fs.statSync(teamPath);
		return Date.now() - stat.mtimeMs < STALE_THRESHOLD_MS;
	} catch {
		return false;
	}
}

// === Setup command ===

function runSetup(): void {
	const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
	const settingsPath = path.join(homeDir, '.claude', 'settings.json');

	const launchCommand =
		"bash -c 'TEAM=$(cat | jq -r \".tool_input.team_name // empty\"); " +
		"TEAM=$(printf \"%s\" \"$TEAM\" | tr -cd \"a-zA-Z0-9_-\"); " +
		'if [ -n "$TEAM" ] && ! pgrep -f "teamchat.*$TEAM" > /dev/null; ' +
		"then teamchat --team \"$TEAM\" & fi'";
	const hookEntry = (matcher: string) => ({
		matcher,
		hooks: [
			{ type: 'command', command: launchCommand, async: true, timeout: 5 },
		],
	});
	const hookConfig = {
		hooks: {
			PostToolUse: [hookEntry('TeamCreate')],
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
		(h: unknown) => (h as Record<string, unknown>).matcher === 'TeamCreate',
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
				const fresh = isTeamFresh(teamsDir, dir);
				if (fs.existsSync(configPath) && !activeTeams.has(dir) && fresh) {
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

	// Bun exits when no I/O is pending — keep alive with a idle server
	Bun.serve({
		port,
		fetch: () => new Response('teamchat watch mode — waiting for teams'),
	});
	console.log(`Watch mode active on port ${port}, polling every 2s...`);
}

// === Auto mode (lobby — single server, waits for first team) ===

function startAutoMode(teamsDir: string, port: number, compact: boolean, noJournal: boolean): void {
	const server = new TeamChatServer({ mode: 'auto', port });
	server.start();

	console.log(`Waiting for a team to be created in ${teamsDir}...`);

	let activatedTeam: string | null = null;
	let activeWatcher: FileWatcher | null = null;
	let activeProcessor: EventProcessor | null = null;
	let activeJournal: Journal | null = null;
	let sessionStartedAt: number | null = null;
	let fsWatchHandle: fs.FSWatcher | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	const tryActivate = (teamName: string): void => {
		if (activatedTeam !== null) return;
		activatedTeam = teamName;

		// Stop discovery watchers now that we have a team
		if (fsWatchHandle) {
			fsWatchHandle.close();
			fsWatchHandle = null;
		}
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}

		console.log(`Team detected: ${teamName}. Starting session...`);

		const journal = new Journal(teamName, !noJournal);
		activeJournal = journal;
		sessionStartedAt = Date.now();

		const processor = new EventProcessor((events) => {
			for (const event of events) {
				journal.append(event);
			}
			server.broadcast(events);
		}, compact);
		activeProcessor = processor;

		const watcher = new FileWatcher(teamName, (delta) => {
			processor.processDelta(delta);
			if (delta.type === 'config' && delta.current) {
				journal.saveConfig(delta.current as import('../src/shared/types.js').TeamConfig);
			}
		});
		activeWatcher = watcher;

		const initialSnapshot = watcher.readInitialState();

		if (initialSnapshot.config) {
			processor.processDelta({
				type: 'config',
				previous: null,
				current: initialSnapshot.config,
			});
			journal.saveConfig(initialSnapshot.config);
		}

		if (initialSnapshot.tasks.length > 0) {
			processor.processDelta({
				type: 'tasks',
				previous: [],
				current: [...initialSnapshot.tasks],
			});
		}

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

		server.activateTeam(teamName, processor, watcher);
		watcher.start();

		if (!noJournal) {
			console.log(`Journal: ${journal.getFilePath()}`);
		}
	};

	const checkForTeam = (): void => {
		if (activatedTeam !== null) return;
		try {
			if (!fs.existsSync(teamsDir)) return;
			const dirs = fs.readdirSync(teamsDir);
			for (const dir of dirs) {
				const configPath = path.join(teamsDir, dir, 'config.json');
				if (fs.existsSync(configPath) && isTeamFresh(teamsDir, dir)) {
					tryActivate(dir);
					return;
				}
			}
		} catch {
			// Directory doesn't exist yet — ignore
		}
	};

	// Check immediately in case a team already exists
	checkForTeam();

	if (activatedTeam === null) {
		// Watch for config.json creation using fs.watch (fast detection)
		try {
			fs.mkdirSync(teamsDir, { recursive: true });
			fsWatchHandle = fs.watch(teamsDir, { recursive: true }, (_event, filename) => {
				if (filename && (filename as string).endsWith('config.json') && activatedTeam === null) {
					// Small delay to let the file write complete
					setTimeout(checkForTeam, 50);
				}
			});
		} catch {
			// fs.watch with recursive may not be supported on all platforms — fall back to polling
		}

		// Always keep a polling fallback (1-second interval) for reliability
		pollInterval = setInterval(checkForTeam, 1000);
	}

	const shutdown = (): void => {
		console.log('\nShutting down...');

		if (fsWatchHandle) {
			fsWatchHandle.close();
		}
		if (pollInterval) {
			clearInterval(pollInterval);
		}

		if (activatedTeam && activeProcessor && activeJournal && sessionStartedAt !== null) {
			const allEvents = activeProcessor.getAllEvents();
			const messageCount = allEvents.filter((e) => e.type === 'message').length;
			activeJournal.saveTasks(activeProcessor.getTasks());
			activeJournal.saveMetadata({
				teamName: activatedTeam,
				startedAt: new Date(sessionStartedAt).toISOString(),
				endedAt: new Date().toISOString(),
				durationMs: Date.now() - sessionStartedAt,
				eventCount: allEvents.length,
				messageCount,
				presence: activeProcessor.getPresence(),
			});
		}

		if (activeWatcher) {
			activeWatcher.stop();
		}
		server.stop();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

// === Replay mode ===

function startReplayMode(filePath: string, port: number, isDemo: boolean): void {
	if (!fs.existsSync(filePath)) {
		console.error(`Replay path not found: ${filePath}`);
		process.exit(1);
	}

	const replay = loadReplaySource(filePath);
	if (replay.bundle.entries.length === 0) {
		console.error(`No replay events found in ${filePath}`);
		process.exit(1);
	}

	console.log(`Loaded replay: ${replay.bundle.manifest.teamName}`);
	console.log(`Events: ${replay.bundle.manifest.eventCount}`);
	if (isDemo) {
		console.log('Demo mode: using bundled fixture session');
	}

	const server = new TeamChatServer({
		port,
		teamName: replay.bundle.manifest.teamName,
		mode: 'replay',
		replay,
	});

	server.start();

	const shutdown = (): void => {
		console.log('\nShutting down replay server...');
		server.stop();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

// === Main team session ===

function startTeamSession(
	teamName: string,
	port: number,
	compact: boolean,
	noJournal: boolean,
): void {
	const journal = new Journal(teamName, !noJournal);
	const sessionStartedAt = Date.now();

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
		// Auto-capture config on every change
		if (delta.type === 'config' && delta.current) {
			journal.saveConfig(delta.current as import('../src/shared/types.js').TeamConfig);
		}
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
		// Auto-capture initial config
		journal.saveConfig(initialSnapshot.config);
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

		// Save final state for replay
		const allEvents = processor.getAllEvents();
		const messageCount = allEvents.filter((e) => e.type === 'message').length;
		journal.saveTasks(processor.getTasks());
		journal.saveMetadata({
			teamName,
			startedAt: new Date(sessionStartedAt).toISOString(),
			endedAt: new Date().toISOString(),
			durationMs: Date.now() - sessionStartedAt,
			eventCount: allEvents.length,
			messageCount,
			presence: processor.getPresence(),
		});

		watcher.stop();
		server.stop();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

// === Version ===

function printVersion(): void {
	const pkgPath = path.resolve(import.meta.dir ?? '.', '../package.json');
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
		console.log(`teamchat v${pkg.version}`);
	} catch {
		console.log('teamchat v0.1.0');
	}
}

// === Entry point ===

const args = parseArgs(process.argv.slice(2));

if (args.version) {
	printVersion();
	process.exit(0);
}

if (args.help) {
	printHelp();
	process.exit(0);
}

if (args.setup) {
	runSetup();
	process.exit(0);
}

if (args.subcommand === 'export') {
	const exportArgs: ExportArgs = {
		input: args.subcommandArg,
		latest: args.latest,
		sanitize: args.sanitize,
		stripContent: args.stripContent,
	};
	runExport(exportArgs);
} else if (args.subcommand === 'scan') {
	if (!args.subcommandArg) {
		console.error('Usage: teamchat scan <file.jsonl>');
		process.exit(1);
	}
	runScan(args.subcommandArg);
} else if (args.subcommand === 'report') {
	if (!args.subcommandArg) {
		console.error('Usage: teamchat report <capture-bundle-path>');
		process.exit(1);
	}
	const { generateReport } = await import('../src/compare/report-generator');
	const html = generateReport(args.subcommandArg);
	const outputPath = args.subcommandArg.replace(/\/?$/, '') + '-report.html';
	await Bun.write(outputPath, html);
	console.log(`Report written to ${outputPath}`);
} else if (args.subcommand === 'capture') {
	if (!args.subcommandArg) {
		console.error('Usage: teamchat capture <session-id>');
		process.exit(1);
	}
	const { runCapture } = await import('../src/capture/cli');
	await runCapture(args.subcommandArg);
} else if (args.replay) {
	const replayPath = args.demo
		? path.resolve(import.meta.dir ?? '.', '../fixtures/replays/demo/session.teamchat-replay')
		: args.replay;
	startReplayMode(replayPath, args.port, args.demo);
} else if (args.watch) {
	startWatchMode(args.watch, args.port, args.compact, args.noJournal);
} else if (args.team) {
	const teamDir = path.join(
		process.env.HOME ?? process.env.USERPROFILE ?? '~',
		'.claude',
		'teams',
		args.team,
	);
	if (!fs.existsSync(teamDir)) {
		console.error(`Team "${args.team}" not found at ${teamDir}`);
		console.error('');
		console.error('To use teamchat with Agent Teams:');
		console.error('  1. Start a Claude Code session with --team flag');
		console.error('  2. Or run: teamchat setup  (to auto-launch with new teams)');
		console.error('  3. Or try: teamchat --replay --demo  (to see a demo session)');
		process.exit(2);
	}
	startTeamSession(args.team, args.port, args.compact, args.noJournal);
} else if (args.auto) {
	const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
	const teamsDir = path.join(homeDir, '.claude', 'teams');
	startAutoMode(teamsDir, args.port, args.compact, args.noJournal);
} else {
	// Default: watch ~/.claude/teams/
	const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '~';
	const defaultWatch = path.join(homeDir, '.claude', 'teams');
	if (fs.existsSync(defaultWatch)) {
		startWatchMode(defaultWatch, args.port, args.compact, args.noJournal);
	} else {
		console.error('No teams directory found. Agent Teams may not be configured yet.');
		console.error('');
		console.error('Quick start:');
		console.error('  teamchat --auto             Wait for a new team to be created');
		console.error('  teamchat --replay --demo    See a demo session');
		console.error('  teamchat setup              Configure auto-launch hook');
		console.error('  teamchat --help             Show all options');
		process.exit(2);
	}
}
