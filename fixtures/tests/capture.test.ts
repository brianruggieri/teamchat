import { describe, test, expect } from 'bun:test';
import { finalizeCaptureBundle } from '../../src/capture/finalizer';
import { getCapturePaths } from '../../src/capture/types';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const TMP_DIR = '/tmp/teamchat-capture-test';
const OUTPUT_DIR = '/tmp/teamchat-capture-test-output';

describe('finalizeCaptureBundle', () => {
	test('creates a valid capture bundle from session data', async () => {
		// Setup: create mock source data
		rmSync(TMP_DIR, { recursive: true, force: true });
		rmSync(OUTPUT_DIR, { recursive: true, force: true });
		mkdirSync(join(TMP_DIR, 'subagents'), { recursive: true });

		writeFileSync(join(TMP_DIR, 'lead.jsonl'), '{"type":"user","message":{"role":"user","content":"test"},"uuid":"1","timestamp":"2026-03-31T17:00:00Z"}\n');
		writeFileSync(join(TMP_DIR, 'subagents/agent-sub1.jsonl'), '{"type":"user","message":{"role":"user","content":"sub task"},"uuid":"2","timestamp":"2026-03-31T17:00:01Z"}\n');
		writeFileSync(join(TMP_DIR, 'subagents/agent-sub1.meta.json'), '{"agentType":"general-purpose","description":"test"}');

		const result = await finalizeCaptureBundle({
			sessionId: 'test-123',
			team: 'test-team',
			projectPath: '/tmp/test',
			leadLogPath: join(TMP_DIR, 'lead.jsonl'),
			subagentDir: join(TMP_DIR, 'subagents'),
			inboxSnapshotsDir: null,
			journalPath: null,
			tasksDir: null,
			outputDir: OUTPUT_DIR,
		});

		const paths = getCapturePaths(result);
		expect(existsSync(paths.manifest)).toBe(true);
		expect(existsSync(paths.leadLog)).toBe(true);
		expect(existsSync(join(paths.subagentsDir, 'agent-sub1.jsonl'))).toBe(true);

		const manifest = JSON.parse(await Bun.file(paths.manifest).text());
		expect(manifest.team).toBe('test-team');
		expect(manifest.sessionId).toBe('test-123');
		expect(manifest.version).toBe(1);

		// Cleanup
		rmSync(TMP_DIR, { recursive: true, force: true });
		rmSync(OUTPUT_DIR, { recursive: true, force: true });
	});
});
