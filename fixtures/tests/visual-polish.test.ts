import { describe, it, expect } from 'bun:test';
import { getAvatarAbbreviation, ROLE_ABBREVIATIONS } from '../../src/client/components/AgentAvatar.js';

describe('getAvatarAbbreviation', () => {
	it('returns role abbreviation for known prefixes', () => {
		expect(getAvatarAbbreviation('db-architect')).toBe('db');
		expect(getAvatarAbbreviation('ui-designer')).toBe('ui');
		expect(getAvatarAbbreviation('auth-engineer')).toBe('auth');
		expect(getAvatarAbbreviation('file-service')).toBe('file');
		expect(getAvatarAbbreviation('search-indexer')).toBe('srch');
		expect(getAvatarAbbreviation('frontend-dev')).toBe('fe');
		expect(getAvatarAbbreviation('backend-api')).toBe('be');
		expect(getAvatarAbbreviation('notification-worker')).toBe('ntf');
		expect(getAvatarAbbreviation('lead')).toBe('ld');
		expect(getAvatarAbbreviation('gateway-proxy')).toBe('gw');
	});

	it('falls back to first 2 chars for unknown prefixes', () => {
		expect(getAvatarAbbreviation('analytics-service')).toBe('an');
		expect(getAvatarAbbreviation('zookeeper')).toBe('zo');
		expect(getAvatarAbbreviation('x')).toBe('x');
	});

	it('handles names without hyphens using the whole name as segment', () => {
		expect(getAvatarAbbreviation('db')).toBe('db');
		expect(getAvatarAbbreviation('qa')).toBe('qa');
		expect(getAvatarAbbreviation('api')).toBe('api');
	});

	it('is case-insensitive for the segment lookup', () => {
		expect(getAvatarAbbreviation('DB-architect')).toBe('db');
		expect(getAvatarAbbreviation('Auth-Service')).toBe('auth');
	});
});

describe('TRUNCATE_LENGTH', () => {
	it('is 400 characters', async () => {
		// Dynamically import to avoid JSX transform issues in test runner
		const mod = await import('../../src/client/components/ChatMessage.js');
		// The constant is not exported, but we verify behavior via the module loading.
		// The real check: ensure 400 is the value in source.
		const source = await Bun.file('src/client/components/ChatMessage.tsx').text();
		expect(source).toContain('const TRUNCATE_LENGTH = 400;');
	});
});
