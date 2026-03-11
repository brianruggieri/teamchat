import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { exportSession } from './exporter.js';

const fixtureDir = path.resolve(import.meta.dir ?? '.', '../../fixtures/replays/teamchat-build-session');

describe('Exporter', () => {
	test('exports a replay directory to a bundle', () => {
		const result = exportSession(fixtureDir, { sanitize: false, stripContent: false });
		expect(result.bundle.manifest.version).toBe(1);
		expect(result.bundle.entries.length).toBeGreaterThan(0);
		expect(result.bundle.team.members.length).toBeGreaterThan(0);
	});

	test('bundle has markers', () => {
		const result = exportSession(fixtureDir, { sanitize: false, stripContent: false });
		expect(result.bundle.markers.length).toBeGreaterThan(0);
		const kinds = result.bundle.markers.map(m => m.kind);
		expect(kinds).toContain('session-start');
	});

	test('sanitized export returns a report', () => {
		const result = exportSession(fixtureDir, { sanitize: true, stripContent: false });
		expect(result.report).toBeDefined();
		expect(result.report!.agentsAnonymized).toBeGreaterThan(0);
	});

	test('strip-content export clears message text', () => {
		const result = exportSession(fixtureDir, { sanitize: true, stripContent: true });
		for (const entry of result.bundle.entries) {
			if (entry.event.type === 'message') {
				expect(entry.event.text).toMatch(/\[message: \d+ words\]/);
			}
		}
	});
});
