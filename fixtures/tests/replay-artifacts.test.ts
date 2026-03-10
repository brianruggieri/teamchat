import { describe, expect, test } from 'bun:test';
import type { ReplayArtifact } from '../../src/shared/replay.js';
import {
	formatArtifactDocumentText,
	getArtifactPreviewMode,
	getArtifactRailExcerpt,
	resolveSelectedArtifactId,
} from '../../src/client/artifacts.js';

const htmlArtifact: ReplayArtifact = {
	id: 'artifact-html',
	kind: 'report',
	title: 'Build Session Summary',
	createdAtMs: 1000,
	createdBy: 'team-lead',
	sourceEventIds: ['evt-001'],
	summary: 'Saved wrap-up report for the teamchat build session.',
	file: {
		relativePath: 'artifacts/build-session-summary.html',
		mimeType: 'text/html',
	},
};

const jsonArtifact: ReplayArtifact = {
	id: 'artifact-json',
	kind: 'report',
	title: 'Session Data',
	createdAtMs: 2000,
	createdBy: 'team-lead',
	sourceEventIds: ['evt-002'],
	file: {
		relativePath: 'artifacts/session-data.json',
		mimeType: 'application/json',
	},
};

describe('Replay Artifacts', () => {
	test('maps artifact mime types to preview modes', () => {
		expect(getArtifactPreviewMode('text/html')).toBe('html');
		expect(getArtifactPreviewMode('text/plain')).toBe('text');
		expect(getArtifactPreviewMode('application/json')).toBe('json');
		expect(getArtifactPreviewMode('application/octet-stream')).toBe('external');
	});

	test('formats structured artifact text for modal display', () => {
		expect(formatArtifactDocumentText('application/json', '{"ok":true}')).toContain('\n');
		expect(
			formatArtifactDocumentText('application/x-ndjson', '{"a":1}\n{"b":2}\n'),
		).toContain('\n\n');
		expect(formatArtifactDocumentText('text/plain', '  hello world  ')).toBe('hello world');
	});

	test('prefers artifact summaries for the rail excerpt and falls back to preview text', () => {
		expect(getArtifactRailExcerpt(htmlArtifact, null)).toBe(
			'Saved wrap-up report for the teamchat build session.',
		);
		expect(getArtifactRailExcerpt(jsonArtifact, '{ "hello": "world" }')).toContain('hello');
		expect(getArtifactRailExcerpt(jsonArtifact, null)).toBe('Expand to read the saved artifact.');
	});

	test('keeps the selected artifact if still visible and otherwise falls back to newest visible', () => {
		expect(resolveSelectedArtifactId([], null)).toBeNull();
		expect(resolveSelectedArtifactId([htmlArtifact, jsonArtifact], null)).toBe('artifact-json');
		expect(resolveSelectedArtifactId([htmlArtifact, jsonArtifact], 'artifact-html')).toBe('artifact-html');
		expect(resolveSelectedArtifactId([htmlArtifact], 'artifact-json')).toBe('artifact-html');
	});
});
