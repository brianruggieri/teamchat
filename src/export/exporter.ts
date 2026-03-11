import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadReplaySource } from '../server/replay.js';
import { sanitizeBundle, type SanitizationOptions, type SanitizationReport } from '../security/sanitizer.js';
import type { ReplayBundle } from '../shared/replay.js';

export interface ExportResult {
	bundle: ReplayBundle;
	report?: SanitizationReport;
}

export function exportSession(inputPath: string, options: SanitizationOptions): ExportResult {
	const loaded = loadReplaySource(inputPath);
	const bundle = loaded.bundle;

	if (options.sanitize) {
		const { bundle: sanitized, report } = sanitizeBundle(bundle, options);
		return { bundle: sanitized, report };
	}

	return { bundle };
}

export function writeBundle(bundle: ReplayBundle, outputPath: string): void {
	fs.writeFileSync(outputPath, JSON.stringify(bundle, null, '\t'), 'utf-8');
}

export function findLatestSession(): string | null {
	const sessionDir = path.join(os.homedir(), '.teamchat', 'sessions');
	if (!fs.existsSync(sessionDir)) return null;

	const files = fs.readdirSync(sessionDir)
		.filter(f => f.endsWith('.jsonl'))
		.map(f => ({
			name: f,
			path: path.join(sessionDir, f),
			mtime: fs.statSync(path.join(sessionDir, f)).mtimeMs,
		}))
		.sort((a, b) => b.mtime - a.mtime);

	return files[0]?.path ?? null;
}
