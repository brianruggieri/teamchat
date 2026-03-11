import { describe, expect, test } from 'bun:test';
import { scanForSecrets, type SecretFinding } from './secret-scanner.js';

describe('Secret Scanner', () => {
	describe('AWS credentials', () => {
		test('detects AWS access key IDs', () => {
			const result = scanForSecrets('configured with AKIAIOSFODNN7EXAMPLE key');
			expect(result.length).toBe(1);
			expect(result[0]!.category).toBe('aws-credentials');
		});

		test('detects aws_secret_access_key pattern', () => {
			const result = scanForSecrets('aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(result.some(f => f.category === 'aws-credentials')).toBe(true);
		});
	});

	describe('API tokens', () => {
		test('detects sk- prefixed tokens', () => {
			const result = scanForSecrets('using key sk-proj-abc123def456ghi789');
			expect(result.length).toBe(1);
			expect(result[0]!.category).toBe('api-token');
		});

		test('detects Bearer tokens', () => {
			const result = scanForSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.sig');
			expect(result.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('private keys', () => {
		test('detects RSA private key headers', () => {
			const result = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEpA...');
			expect(result.length).toBe(1);
			expect(result[0]!.category).toBe('private-key');
		});

		test('detects OPENSSH private key headers', () => {
			const result = scanForSecrets('-----BEGIN OPENSSH PRIVATE KEY-----');
			expect(result.length).toBe(1);
		});
	});

	describe('connection strings', () => {
		test('detects postgres connection strings', () => {
			const result = scanForSecrets('DATABASE_URL=postgres://user:pass@host:5432/db');
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(result.some(f => f.category === 'connection-string')).toBe(true);
		});

		test('detects mongodb connection strings', () => {
			const result = scanForSecrets('mongodb+srv://admin:secret@cluster.mongodb.net/mydb');
			expect(result.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('JWTs', () => {
		test('detects JWT tokens', () => {
			const result = scanForSecrets('token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(result.some(f => f.category === 'jwt')).toBe(true);
		});
	});

	describe('GitHub/GitLab tokens', () => {
		test('detects GitHub personal access tokens', () => {
			const result = scanForSecrets('GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh');
			expect(result.length).toBeGreaterThanOrEqual(1);
			expect(result.some(f => f.category === 'github-token')).toBe(true);
		});

		test('detects GitLab tokens', () => {
			const result = scanForSecrets('token: glpat-xxxxxxxxxxxxxxxxxxxx');
			expect(result.length).toBe(1);
			expect(result[0]!.category).toBe('gitlab-token');
		});
	});

	describe('.env patterns', () => {
		test('detects KEY=value patterns', () => {
			const result = scanForSecrets('API_KEY=sk_live_abcdef123456');
			expect(result.length).toBeGreaterThanOrEqual(1);
		});

		test('detects SECRET=value patterns', () => {
			const result = scanForSecrets('DATABASE_SECRET=mysupersecretvalue123');
			expect(result.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('generic secrets', () => {
		test('detects password assignments', () => {
			const result = scanForSecrets('password: "hunter2"');
			expect(result.length).toBe(1);
			expect(result[0]!.category).toBe('generic-secret');
		});

		test('detects credentials assignments', () => {
			const result = scanForSecrets('credentials = "abc123secret"');
			expect(result.length).toBe(1);
		});
	});

	describe('false positives', () => {
		test('does not flag normal code', () => {
			const result = scanForSecrets('function processTask(taskId: string) { return taskId; }');
			expect(result.length).toBe(0);
		});

		test('does not flag normal chat messages', () => {
			const result = scanForSecrets('I finished implementing the API endpoint for user registration.');
			expect(result.length).toBe(0);
		});

		test('does not flag short strings', () => {
			const result = scanForSecrets('token count: 1500');
			expect(result.length).toBe(0);
		});
	});

	describe('masking', () => {
		test('maskSecret partially redacts the value', () => {
			const result = scanForSecrets('key: AKIAIOSFODNN7EXAMPLE');
			expect(result.length).toBe(1);
			expect(result[0]!.masked).toContain('AKIA');
			expect(result[0]!.masked).toContain('████');
		});
	});
});
