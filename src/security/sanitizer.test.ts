import { describe, expect, it } from 'bun:test';
import {
	anonymizeAgentNames,
	cleanMetadata,
	redactSecrets,
	sanitizeBundle,
	stripContent,
	stripPaths,
} from './sanitizer.js';
import type { ReplayBundle } from '../shared/replay.js';
import type { ContentMessage, TaskInfo } from '../shared/types.js';

// ---- Fixture helpers ----

function makeBundle(overrides?: Partial<ReplayBundle>): ReplayBundle {
	const base: ReplayBundle = {
		manifest: {
			version: 1,
			sessionId: 'sess-abc123',
			teamName: 'my-team',
			startedAt: '2024-01-01T10:00:00.000Z',
			endedAt: '2024-01-01T10:05:00.000Z',
			durationMs: 300_000,
			eventCount: 3,
			memberCount: 3,
			taskCount: 1,
			hasArtifacts: false,
			source: { kind: 'bundle', pathLabel: '/Users/alice/project' },
		},
		team: {
			name: 'my-team',
			members: [
				{ name: 'alice', agentId: 'agent-1', agentType: 'lead', color: '#ff0000' },
				{ name: 'bob', agentId: 'agent-2', agentType: 'worker', color: '#00ff00' },
				{ name: 'carol', agentId: 'agent-3', agentType: 'worker', color: '#0000ff' },
			],
		},
		entries: [
			{
				seq: 1,
				atMs: 1_704_103_200_000, // 2024-01-01T10:00:00Z
				event: {
					type: 'message',
					id: 'msg-1',
					from: 'alice',
					fromColor: '#ff0000',
					text: 'Hello world from /Users/alice/projects/my-app/src/index.ts',
					summary: null,
					timestamp: '2024-01-01T10:00:00.000Z',
					isBroadcast: true,
					isDM: false,
					dmParticipants: null,
					isLead: true,
					replyToId: null,
				} satisfies ContentMessage,
			},
			{
				seq: 2,
				atMs: 1_704_103_260_000, // 2024-01-01T10:01:00Z
				event: {
					type: 'message',
					id: 'msg-2',
					from: 'bob',
					fromColor: '#00ff00',
					text: 'Here is my API key: sk-1234567890abcdefghijklmnop',
					summary: null,
					timestamp: '2024-01-01T10:01:00.000Z',
					isBroadcast: false,
					isDM: false,
					dmParticipants: null,
					isLead: false,
					replyToId: null,
				} satisfies ContentMessage,
			},
			{
				seq: 3,
				atMs: 1_704_103_320_000, // 2024-01-01T10:02:00Z
				event: {
					type: 'message',
					id: 'msg-3',
					from: 'carol',
					fromColor: '#0000ff',
					text: 'Working on /home/carol/workspace/project/main.py',
					summary: null,
					timestamp: '2024-01-01T10:02:00.000Z',
					isBroadcast: false,
					isDM: false,
					dmParticipants: null,
					isLead: false,
					replyToId: null,
				} satisfies ContentMessage,
			},
		],
		initialTasks: [
			{
				id: 'task-1',
				subject: 'Build the feature',
				description: 'Work in /Users/alice/projects/my-app to build X',
				status: 'in_progress',
				owner: 'bob',
				blockedBy: null,
				activeForm: null,
				created: '2024-01-01T10:00:00.000Z',
				updated: '2024-01-01T10:00:00.000Z',
			},
		],
		finalTasks: [
			{
				id: 'task-1',
				subject: 'Build the feature',
				description: 'Completed work in /Users/alice/projects/my-app',
				status: 'completed',
				owner: 'bob',
				blockedBy: null,
				activeForm: null,
				created: '2024-01-01T10:00:00.000Z',
				updated: '2024-01-01T10:02:00.000Z',
			},
		],
		artifacts: [],
		markers: [
			{
				id: 'marker-1',
				kind: 'session-start',
				atMs: 1_704_103_200_000,
				seq: 0,
				label: 'Session started',
			},
		],
	};

	return { ...base, ...overrides };
}

// ---- anonymizeAgentNames ----

describe('anonymizeAgentNames', () => {
	it('renames lead to "Lead" and others to Alpha/Bravo/Charlie', () => {
		const bundle = makeBundle();
		const { bundle: result, pseudonymMap } = anonymizeAgentNames(bundle);

		// Lead (alice) → Lead
		expect(pseudonymMap['alice']).toBe('Lead');
		expect(pseudonymMap['bob']).toBe('Alpha');
		expect(pseudonymMap['carol']).toBe('Bravo');

		// Team members renamed
		const memberNames = result.team.members.map((m) => m.name);
		expect(memberNames).toContain('Lead');
		expect(memberNames).toContain('Alpha');
		expect(memberNames).toContain('Bravo');
		expect(memberNames).not.toContain('alice');
		expect(memberNames).not.toContain('bob');
	});

	it('renames event.from in message entries', () => {
		const bundle = makeBundle();
		const { bundle: result } = anonymizeAgentNames(bundle);

		const msg1 = result.entries[0].event as ContentMessage;
		const msg2 = result.entries[1].event as ContentMessage;
		expect(msg1.from).toBe('Lead');
		expect(msg2.from).toBe('Alpha');
	});

	it('renames task owner in initialTasks and finalTasks', () => {
		const bundle = makeBundle();
		const { bundle: result } = anonymizeAgentNames(bundle);

		expect(result.initialTasks[0].owner).toBe('Alpha');
		expect(result.finalTasks[0].owner).toBe('Alpha');
	});

	it('uses first member as lead when no agentType=lead is present', () => {
		const bundle = makeBundle();
		bundle.team.members = bundle.team.members.map((m) => ({ ...m, agentType: 'worker' }));

		const { pseudonymMap } = anonymizeAgentNames(bundle);
		// First member (alice) should be Lead
		expect(pseudonymMap['alice']).toBe('Lead');
	});
});

// ---- stripPaths ----

describe('stripPaths', () => {
	it('replaces /Users/... paths in message text', () => {
		const bundle = makeBundle();
		const { bundle: result } = stripPaths(bundle);

		const msg1 = result.entries[0].event as ContentMessage;
		expect(msg1.text).not.toMatch(/\/Users\/alice/);
		expect(msg1.text).toContain('./project/');
	});

	it('replaces /home/... paths in message text', () => {
		const bundle = makeBundle();
		const { bundle: result } = stripPaths(bundle);

		const msg3 = result.entries[2].event as ContentMessage;
		expect(msg3.text).not.toMatch(/\/home\/carol/);
		expect(msg3.text).toContain('./project/');
	});

	it('replaces paths in task descriptions', () => {
		const bundle = makeBundle();
		const { bundle: result } = stripPaths(bundle);

		expect(result.initialTasks[0].description).not.toMatch(/\/Users\/alice/);
		expect(result.initialTasks[0].description).toContain('./project/');
		expect(result.finalTasks[0].description).not.toMatch(/\/Users\/alice/);
	});

	it('preserves the final filename after substitution', () => {
		const bundle = makeBundle();
		const { bundle: result } = stripPaths(bundle);

		const msg1 = result.entries[0].event as ContentMessage;
		expect(msg1.text).toContain('./project/index.ts');
	});

	it('returns a count of substitutions made', () => {
		const bundle = makeBundle();
		const { count } = stripPaths(bundle);
		// msg-1 has one path, msg-3 has one path, initialTask desc, finalTask desc = 4
		expect(count).toBeGreaterThanOrEqual(4);
	});
});

// ---- cleanMetadata ----

describe('cleanMetadata', () => {
	it('replaces team name with "demo-team"', () => {
		const bundle = makeBundle();
		const result = cleanMetadata(bundle);

		expect(result.team.name).toBe('demo-team');
		expect(result.manifest.teamName).toBe('demo-team');
	});

	it('replaces session ID', () => {
		const bundle = makeBundle();
		const result = cleanMetadata(bundle);

		expect(result.manifest.sessionId).not.toBe('sess-abc123');
		expect(result.manifest.sessionId).toBe('demo-session-0000');
	});

	it('shifts timestamps so the first entry is at epoch', () => {
		const bundle = makeBundle();
		const result = cleanMetadata(bundle);

		// Earliest event should be at atMs = 0
		expect(result.entries[0].atMs).toBe(0);

		// Event timestamp string should reflect epoch
		const msg1 = result.entries[0].event as ContentMessage;
		expect(msg1.timestamp).toBe('1970-01-01T00:00:00.000Z');
	});

	it('preserves relative spacing between events', () => {
		const bundle = makeBundle();
		const result = cleanMetadata(bundle);

		// Original spacing: 60s between each entry
		const t0 = result.entries[0].atMs;
		const t1 = result.entries[1].atMs;
		const t2 = result.entries[2].atMs;

		expect(t1 - t0).toBe(60_000);
		expect(t2 - t1).toBe(60_000);
	});

	it('does not mutate the original bundle', () => {
		const bundle = makeBundle();
		cleanMetadata(bundle);
		expect(bundle.team.name).toBe('my-team');
		expect(bundle.entries[0].atMs).toBe(1_704_103_200_000);
	});
});

// ---- stripContent ----

describe('stripContent', () => {
	it('replaces message text with [message: N words] placeholder', () => {
		const bundle = makeBundle();
		const result = stripContent(bundle);

		const msg1 = result.entries[0].event as ContentMessage;
		// "Hello world from /Users/alice/projects/my-app/src/index.ts" = 4 words
		expect(msg1.text).toMatch(/^\[message: \d+ words\]$/);
		expect(msg1.text).toContain('4');
	});

	it('sets task description to null', () => {
		const bundle = makeBundle();
		const result = stripContent(bundle);

		expect(result.initialTasks[0].description).toBeNull();
		expect(result.finalTasks[0].description).toBeNull();
	});

	it('sets task subject to "Task #N"', () => {
		const bundle = makeBundle();
		const result = stripContent(bundle);

		expect(result.initialTasks[0].subject).toMatch(/^Task #\d+$/);
	});

	it('uses consistent task subject across initialTasks and finalTasks', () => {
		const bundle = makeBundle();
		const result = stripContent(bundle);

		// Same task ID should get same pseudonym
		expect(result.initialTasks[0].subject).toBe(result.finalTasks[0].subject);
	});
});

// ---- redactSecrets ----

describe('redactSecrets', () => {
	it('replaces message text containing secrets with redaction notice', () => {
		const bundle = makeBundle();
		const { bundle: result, count } = redactSecrets(bundle);

		const msg2 = result.entries[1].event as ContentMessage;
		expect(msg2.text).toBe('[content redacted — potential secret detected]');
		expect(count).toBe(1);
	});

	it('leaves messages without secrets unchanged', () => {
		const bundle = makeBundle();
		const { bundle: result } = redactSecrets(bundle);

		const msg1 = result.entries[0].event as ContentMessage;
		expect(msg1.text).toBe('Hello world from /Users/alice/projects/my-app/src/index.ts');
	});
});

// ---- sanitizeBundle full pipeline ----

describe('sanitizeBundle', () => {
	it('returns unchanged bundle when sanitize=false', () => {
		const bundle = makeBundle();
		const { bundle: result, report } = sanitizeBundle(bundle, { sanitize: false, stripContent: false });

		expect(result).toBe(bundle); // same reference
		expect(report.secretsRedacted).toBe(0);
		expect(report.agentsAnonymized).toBe(0);
	});

	it('redacts secrets, anonymizes names, and strips paths when sanitize=true, stripContent=false', () => {
		const bundle = makeBundle();
		const { bundle: result, report } = sanitizeBundle(bundle, { sanitize: true, stripContent: false });

		// Secrets redacted
		expect(report.secretsRedacted).toBe(1);
		const msg2 = result.entries[1].event as ContentMessage;
		expect(msg2.text).toBe('[content redacted — potential secret detected]');

		// Names anonymized
		expect(report.agentsAnonymized).toBeGreaterThan(0);
		const msg1 = result.entries[0].event as ContentMessage;
		expect(msg1.from).toBe('Lead');

		// Paths stripped
		expect(report.pathsStripped).toBeGreaterThan(0);
		expect(msg1.text).not.toMatch(/\/Users\/alice/);

		// Metadata cleaned
		expect(result.team.name).toBe('demo-team');
		expect(result.entries[0].atMs).toBe(0);

		// Content NOT stripped (messages still have real text, not word-count placeholders)
		expect(msg1.text).not.toMatch(/^\[message:/);
	});

	it('also strips content when sanitize=true, stripContent=true', () => {
		const bundle = makeBundle();
		const { bundle: result } = sanitizeBundle(bundle, { sanitize: true, stripContent: true });

		const msg1 = result.entries[0].event as ContentMessage;
		expect(msg1.text).toMatch(/^\[message: \d+ words\]$/);

		expect(result.initialTasks[0].description).toBeNull();
		expect(result.initialTasks[0].subject).toMatch(/^Task #\d+$/);
	});

	it('report includes eventsTotal and pseudonymMap', () => {
		const bundle = makeBundle();
		const { report } = sanitizeBundle(bundle, { sanitize: true, stripContent: false });

		expect(report.eventsTotal).toBe(3);
		expect(typeof report.durationMs).toBe('number');
		expect(report.pseudonymMap['alice']).toBe('Lead');
		expect(report.pseudonymMap['bob']).toBe('Alpha');
	});
});
