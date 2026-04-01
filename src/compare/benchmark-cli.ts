// src/compare/benchmark-cli.ts — CLI handler for the benchmark subcommand

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BenchmarkResult } from './types.js';
import {
	runBenchmark,
	compareBenchmarks,
	formatStandaloneOutput,
	formatComparisonOutput,
} from './benchmark.js';

export async function runBenchmarkCommand(args: string[]): Promise<void> {
	// Parse args:
	// teamchat benchmark <bundle-path> [--save-baseline] [--compare <baseline-path>] [--port N]
	let bundlePath: string | null = null;
	let baselinePath: string | undefined;
	let saveBaseline = false;
	let port = 0;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		switch (arg) {
			case '--save-baseline':
				saveBaseline = true;
				break;
			case '--compare': {
				const next = args[++i];
				if (!next) {
					console.error('--compare requires a path to a baseline benchmark.json');
					process.exit(1);
				}
				baselinePath = next;
				break;
			}
			case '--port': {
				const next = args[++i];
				if (!next) {
					console.error('--port requires a number');
					process.exit(1);
				}
				port = parseInt(next, 10);
				if (Number.isNaN(port)) {
					console.error(`Invalid port: ${next}`);
					process.exit(1);
				}
				break;
			}
			default:
				if (!arg.startsWith('-') && !bundlePath) {
					bundlePath = arg;
				}
				break;
		}
	}

	if (!bundlePath) {
		console.error('Usage: teamchat benchmark <bundle-path> [--save-baseline] [--compare <baseline>] [--port N]');
		process.exit(1);
	}

	const resolvedBundle = path.resolve(bundlePath);
	if (!fs.existsSync(resolvedBundle)) {
		console.error(`Bundle not found: ${resolvedBundle}`);
		process.exit(1);
	}

	// Load baseline if comparison mode
	let baseline: BenchmarkResult | undefined;
	if (baselinePath) {
		const resolvedBaseline = path.resolve(baselinePath);
		if (!fs.existsSync(resolvedBaseline)) {
			console.error(`Baseline not found: ${resolvedBaseline}`);
			process.exit(1);
		}
		try {
			baseline = JSON.parse(fs.readFileSync(resolvedBaseline, 'utf-8')) as BenchmarkResult;
		} catch {
			console.error(`Failed to parse baseline: ${resolvedBaseline}`);
			process.exit(1);
		}
	}

	// Run the benchmark
	console.log(`Running benchmark against ${resolvedBundle}...`);
	const result = await runBenchmark({
		bundlePath: resolvedBundle,
		saveBaseline,
		port,
	});

	// Output results
	if (baseline) {
		const comparisons = compareBenchmarks(result, baseline);
		console.log('');
		console.log(formatComparisonOutput(result, comparisons));
	} else {
		const savedTo = saveBaseline
			? path.join(resolvedBundle, 'benchmark.json')
			: undefined;
		console.log('');
		console.log(formatStandaloneOutput(result, savedTo));
	}
}
