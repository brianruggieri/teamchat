import * as fs from 'node:fs';
import * as path from 'node:path';
import { exportSession, findLatestSession, writeBundle } from './exporter.js';
import { scanForSecrets } from '../security/secret-scanner.js';
import { Journal } from '../server/journal.js';
import type { SanitizationReport } from '../security/sanitizer.js';

export interface ExportArgs {
	input: string | null;
	latest: boolean;
	sanitize: boolean;
	stripContent: boolean;
}

export function runExport(args: ExportArgs): void {
	if (args.stripContent && !args.sanitize) {
		console.error('Error: --strip-content requires --sanitize');
		process.exit(1);
	}

	let inputPath: string;
	if (args.latest) {
		const latest = findLatestSession();
		if (!latest) {
			console.error('No sessions found in ~/.teamchat/sessions/');
			process.exit(1);
		}
		inputPath = latest;
	} else if (args.input) {
		inputPath = args.input;
	} else {
		console.error('Usage: teamchat export <file-or-dir> [--sanitize] [--strip-content]');
		process.exit(1);
	}

	try {
		const result = exportSession(inputPath, {
			sanitize: args.sanitize,
			stripContent: args.stripContent,
		});

		const stat = fs.existsSync(inputPath) ? fs.statSync(inputPath) : null;
		const baseName = stat?.isDirectory()
			? path.basename(inputPath)
			: path.basename(inputPath, path.extname(inputPath));
		const suffix = args.sanitize ? '.sanitized' : '';
		const outDir = stat?.isDirectory() ? path.dirname(inputPath) : path.dirname(inputPath);
		const outputPath = path.join(outDir, `${baseName}${suffix}.teamchat-replay`);

		writeBundle(result.bundle, outputPath);

		if (result.report) {
			printSanitizationReport(result.report, outputPath);
		} else {
			console.error(`Exported: ${outputPath}`);
			console.error(`  Events: ${result.bundle.entries.length}`);
			console.error(`  Duration: ${formatDurationMs(result.bundle.manifest.durationMs)}`);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Failed to export session from "${inputPath}": ${message}`);
		process.exit(1);
	}
}

export function runScan(filePath: string): void {
	if (!fs.existsSync(filePath)) {
		console.error(`File not found: ${filePath}`);
		process.exit(1);
	}

	const entries = Journal.readFrom(filePath);
	if (entries.length === 0) {
		console.error(`No entries found in ${filePath}`);
		process.exit(0);
	}

	let totalFindings = 0;
	for (const entry of entries) {
		const event = entry.event;
		if (event.type !== 'message') continue;
		const findings = scanForSecrets(event.text);
		if (findings.length > 0) {
			totalFindings += findings.length;
			console.error(`[${entry.event.timestamp}] ${findings.length} finding(s) in message from ${event.from}:`);
			for (const finding of findings) {
				console.error(`  - ${finding.category}: ${finding.masked}`);
			}
		}
	}

	if (totalFindings === 0) {
		console.error('No secrets detected.');
		process.exit(0);
	} else {
		console.error(`\n${totalFindings} potential secret(s) found. Review before sharing.`);
		process.exit(1);
	}
}

function printSanitizationReport(report: SanitizationReport, outputPath: string): void {
	console.error(`Exported: ${path.basename(outputPath)} (sanitized)`);
	console.error(`  Events: ${report.eventsTotal}`);
	console.error(`  Secrets redacted: ${report.secretsRedacted} messages`);
	console.error(`  Agents anonymized: ${report.agentsAnonymized} → ${Object.values(report.pseudonymMap).join(', ')}`);
	console.error(`  Paths stripped: ${report.pathsStripped} occurrences`);
	console.error(`  Duration: ${formatDurationMs(report.durationMs)}`);
}

function formatDurationMs(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${minutes}m ${secs}s`;
}
