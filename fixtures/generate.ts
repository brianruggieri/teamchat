#!/usr/bin/env bun
/**
 * Fixture generator for teamchat.
 *
 * Reads the fixture data (config, tasks, events) and writes them as
 * JSON files in the same directory structure that Claude Code Agent Teams
 * uses at runtime:
 *
 *   {output}/
 *     config.json                    — team config (members)
 *     inboxes/
 *       team-lead.json               — lead's inbox
 *       backend.json                 — backend's inbox
 *       frontend.json                — frontend's inbox
 *       privacy.json                 — privacy's inbox
 *       qa.json                      — qa's inbox
 *     tasks.json                     — all tasks (final state)
 *     tasks-snapshots.json           — chronological task state snapshots
 *
 * Usage:
 *   bun run fixtures/generate.ts [--output <dir>]
 *
 * Default output: fixtures/output/healthdash-sprint/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config, teamName } from "./data/config.js";
import { events } from "./data/events.js";
import { initialTasks, taskSnapshots, finalTasks } from "./data/tasks.js";
import type { RawInboxMessage } from "../src/shared/types.js";

// Parse CLI args
function parseArgs(): { output: string } {
	const args = process.argv.slice(2);
	let output = join(import.meta.dirname ?? ".", "output", teamName);

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--output" && args[i + 1]) {
			output = resolve(args[i + 1]);
			i++;
		}
	}

	return { output };
}

function generate(): void {
	const { output } = parseArgs();
	const inboxDir = join(output, "inboxes");

	// Create directory structure
	mkdirSync(inboxDir, { recursive: true });

	// Write config.json
	writeFileSync(
		join(output, "config.json"),
		JSON.stringify(config, null, "\t") + "\n",
	);
	console.log("  config.json");

	// Build inbox message arrays by routing events to inbox files
	const inboxes: Record<string, RawInboxMessage[]> = {};

	for (const event of events) {
		for (const inbox of event.inboxes) {
			if (!inboxes[inbox]) {
				inboxes[inbox] = [];
			}
			inboxes[inbox].push(event.message);
		}
	}

	// Write each inbox file
	for (const [agentName, messages] of Object.entries(inboxes)) {
		// Sort by timestamp to ensure chronological order
		messages.sort((a, b) =>
			new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);

		writeFileSync(
			join(inboxDir, `${agentName}.json`),
			JSON.stringify(messages, null, "\t") + "\n",
		);
		console.log(`  inboxes/${agentName}.json (${messages.length} messages)`);
	}

	// Write tasks.json (final state)
	writeFileSync(
		join(output, "tasks.json"),
		JSON.stringify(finalTasks, null, "\t") + "\n",
	);
	console.log(`  tasks.json (${finalTasks.length} tasks)`);

	// Write initial tasks (for replay / snapshot diffing)
	writeFileSync(
		join(output, "tasks-initial.json"),
		JSON.stringify(initialTasks, null, "\t") + "\n",
	);
	console.log(`  tasks-initial.json`);

	// Write task snapshots (for processor diff testing)
	writeFileSync(
		join(output, "tasks-snapshots.json"),
		JSON.stringify(taskSnapshots, null, "\t") + "\n",
	);
	console.log(`  tasks-snapshots.json (${taskSnapshots.length} snapshots)`);

	// Print summary
	const totalMessages = Object.values(inboxes).reduce((sum, msgs) => sum + msgs.length, 0);
	const inboxCount = Object.keys(inboxes).length;
	console.log(`\nGenerated ${totalMessages} inbox messages across ${inboxCount} inboxes`);
	console.log(`Output: ${output}`);
}

console.log(`Generating fixtures for "${teamName}"...\n`);
generate();
console.log("\nDone.");
