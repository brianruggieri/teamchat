import { describe, test, expect } from 'bun:test';
import { hashName, hashName2, hashName3, resolveMarks, renderAvatarMark, pairScore } from '../../src/client/avatar-marks';

describe('identity hash functions', () => {
	test('hashName is deterministic', () => {
		expect(hashName('schema')).toBe(hashName('schema'));
		expect(hashName('auth')).toBe(hashName('auth'));
	});

	test('hashName produces different values for different names', () => {
		expect(hashName('schema')).not.toBe(hashName('auth'));
	});

	test('hashName is case-insensitive', () => {
		expect(hashName('Schema')).toBe(hashName('schema'));
	});

	test('all three hash functions produce different values', () => {
		const h1 = hashName('schema');
		const h2 = hashName2('schema');
		const h3 = hashName3('schema');
		const unique = new Set([h1, h2, h3]);
		expect(unique.size).toBe(3);
	});
});

describe('resolveMarks', () => {
	const agents = [
		{ name: 'lead', color: 'gold' },
		{ name: 'schema', color: 'blue' },
		{ name: 'auth', color: 'green' },
		{ name: 'gateway', color: 'purple' },
		{ name: 'api', color: 'yellow' },
		{ name: 'billing', color: 'red' },
		{ name: 'dashboard', color: 'orange' },
		{ name: 'testing', color: 'cyan' },
	];

	test('produces unique quadrant pattern for each agent', () => {
		const map = resolveMarks(agents);
		const quads = new Set([...map.values()].map(id => id.quadBits));
		expect(quads.size).toBe(agents.length);
	});

	test('produces unique accent for each agent', () => {
		const map = resolveMarks(agents);
		const accents = new Set([...map.values()].map(id => id.accentIdx));
		expect(accents.size).toBe(agents.length);
	});

	test('is deterministic — same input produces same output', () => {
		const map1 = resolveMarks(agents);
		const map2 = resolveMarks(agents);
		for (const agent of agents) {
			const id1 = map1.get(agent.name)!;
			const id2 = map2.get(agent.name)!;
			expect(id1.quadBits).toBe(id2.quadBits);
			expect(id1.accentIdx).toBe(id2.accentIdx);
			expect(id1.edgeIdx).toBe(id2.edgeIdx);
			expect(id1.cornerIdx).toBe(id2.cornerIdx);
			expect(id1.gradAngle).toBe(id2.gradAngle);
		}
	});

	test('all pairwise scores are >= 50', () => {
		const map = resolveMarks(agents);
		const names = agents.map(a => a.name);
		for (let i = 0; i < names.length; i++) {
			for (let j = i + 1; j < names.length; j++) {
				const score = pairScore(map.get(names[i])!, map.get(names[j])!);
				expect(score).toBeGreaterThanOrEqual(50);
			}
		}
	});

	test('works with small teams (2 agents)', () => {
		const small = [{ name: 'a', color: 'blue' }, { name: 'b', color: 'green' }];
		const map = resolveMarks(small);
		expect(map.size).toBe(2);
	});

	test('works with NATO-style names', () => {
		const nato = [
			{ name: 'Alpha', color: 'blue' },
			{ name: 'Bravo', color: 'green' },
			{ name: 'Charlie', color: 'purple' },
			{ name: 'Delta', color: 'yellow' },
			{ name: 'Echo', color: 'red' },
		];
		const map = resolveMarks(nato);
		const quads = new Set([...map.values()].map(id => id.quadBits));
		expect(quads.size).toBe(nato.length);
	});
});

describe('renderAvatarMark', () => {
	test('returns an SVG string', () => {
		const agents = [{ name: 'schema', color: 'blue' }];
		const map = resolveMarks(agents);
		const svg = renderAvatarMark('schema', 'blue', 36, map.get('schema')!);
		expect(svg).toContain('<svg');
		expect(svg).toContain('</svg>');
	});

	test('includes letter at size >= 16', () => {
		const agents = [{ name: 'schema', color: 'blue' }];
		const map = resolveMarks(agents);
		const svg16 = renderAvatarMark('schema', 'blue', 16, map.get('schema')!);
		expect(svg16).toContain('>S<');
	});

	test('omits letter at size < 14', () => {
		const agents = [{ name: 'schema', color: 'blue' }];
		const map = resolveMarks(agents);
		const svg10 = renderAvatarMark('schema', 'blue', 10, map.get('schema')!);
		expect(svg10).not.toContain('>S<');
	});

	test('respects size parameter', () => {
		const agents = [{ name: 'schema', color: 'blue' }];
		const map = resolveMarks(agents);
		const svg = renderAvatarMark('schema', 'blue', 28, map.get('schema')!);
		expect(svg).toContain('width="28"');
		expect(svg).toContain('height="28"');
	});
});

describe('pairScore', () => {
	test('identical identities score 0', () => {
		const id = { quadBits: 0b1010, accentIdx: 0, edgeIdx: 0, cornerIdx: 0, gradAngle: 0 };
		expect(pairScore(id, id)).toBe(0);
	});

	test('very different identities score high', () => {
		const a = { quadBits: 0b0000, accentIdx: 0, edgeIdx: 0, cornerIdx: 0, gradAngle: 0 };
		const b = { quadBits: 0b1111, accentIdx: 1, edgeIdx: 1, cornerIdx: 1, gradAngle: 90 };
		expect(pairScore(a, b)).toBeGreaterThanOrEqual(80);
	});
});
