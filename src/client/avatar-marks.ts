import { getAgentColorValues } from './types.js';

// ──────────── Types ────────────

export interface AvatarMark {
	quadBits: number;
	accentIdx: number;
	edgeIdx: number;
	cornerIdx: number;
	gradAngle: number;
}

export interface AgentEntry {
	name: string;
	color: string;
}

// ──────────── Hash Functions ────────────

export function hashName(name: string): number {
	let h = 0;
	for (let i = 0; i < name.length; i++)
		h = ((h << 5) - h + name.toLowerCase().charCodeAt(i)) | 0;
	return Math.abs(h);
}

export function hashName2(name: string): number {
	let h = 5381;
	for (let i = 0; i < name.length; i++)
		h = ((h << 5) + h + name.toLowerCase().charCodeAt(i)) | 0;
	return Math.abs(h);
}

export function hashName3(name: string): number {
	let h = 2166136261;
	for (let i = 0; i < name.length; i++) {
		h ^= name.toLowerCase().charCodeAt(i);
		h = (h * 16777619) | 0;
	}
	return Math.abs(h);
}

// ──────────── Layer Definitions ────────────

const QUAD_PATTERNS = [
	0b1010, 0b0101, 0b1100, 0b0011,
	0b1001, 0b0110, 0b1000, 0b0100,
	0b0010, 0b0001, 0b1110, 0b1101,
	0b1011, 0b0111,
];

type AccentDef = {
	name: string;
	draw: (s: number, hi: string) => string;
};

const ACCENTS: AccentDef[] = [
	{
		name: 'ring',
		draw: (s, hi) => {
			const r = s * 0.28, w = Math.max(1.2, s * 0.08);
			return `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${hi}" stroke-width="${w}"/>`;
		},
	},
	{
		name: 'slash',
		draw: (s, hi) => {
			const w = Math.max(1.5, s * 0.1), p = s * 0.18;
			return `<line x1="${p}" y1="${s - p}" x2="${s - p}" y2="${p}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/>`;
		},
	},
	{
		name: 'backslash',
		draw: (s, hi) => {
			const w = Math.max(1.5, s * 0.1), p = s * 0.18;
			return `<line x1="${p}" y1="${p}" x2="${s - p}" y2="${s - p}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/>`;
		},
	},
	{
		name: 'cross',
		draw: (s, hi) => {
			const w = Math.max(1.2, s * 0.08), p = s * 0.22;
			return `<line x1="${s / 2}" y1="${p}" x2="${s / 2}" y2="${s - p}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/><line x1="${p}" y1="${s / 2}" x2="${s - p}" y2="${s / 2}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/>`;
		},
	},
	{
		name: 'dot',
		draw: (s, hi) => {
			const r = Math.max(1.2, s * 0.13);
			return `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="${hi}"/>`;
		},
	},
	{
		name: 'band-h',
		draw: (s, hi) => {
			const h = Math.max(2, s * 0.18);
			return `<rect x="0" y="${(s - h) / 2}" width="${s}" height="${h}" fill="${hi}"/>`;
		},
	},
	{
		name: 'band-v',
		draw: (s, hi) => {
			const w = Math.max(2, s * 0.18);
			return `<rect x="${(s - w) / 2}" y="0" width="${w}" height="${s}" fill="${hi}"/>`;
		},
	},
	{
		name: 'x-mark',
		draw: (s, hi) => {
			const w = Math.max(1, s * 0.07), p = s * 0.22;
			return `<line x1="${p}" y1="${p}" x2="${s - p}" y2="${s - p}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/><line x1="${s - p}" y1="${p}" x2="${p}" y2="${s - p}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/>`;
		},
	},
];

const EDGES = ['top', 'right', 'bottom', 'left', 'none'] as const;
const CORNERS = ['tl', 'tr', 'bl', 'br', 'none'] as const;

function drawEdge(s: number, edge: string, hi: string): string {
	const w = Math.max(1.5, s * 0.1);
	const r = s <= 12 ? s * 0.2 : s * 0.3;
	switch (edge) {
		case 'top': return `<line x1="${r}" y1="${w / 2}" x2="${s - r}" y2="${w / 2}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/>`;
		case 'bottom': return `<line x1="${r}" y1="${s - w / 2}" x2="${s - r}" y2="${s - w / 2}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/>`;
		case 'left': return `<line x1="${w / 2}" y1="${r}" x2="${w / 2}" y2="${s - r}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/>`;
		case 'right': return `<line x1="${s - w / 2}" y1="${r}" x2="${s - w / 2}" y2="${s - r}" stroke="${hi}" stroke-width="${w}" stroke-linecap="round"/>`;
		default: return '';
	}
}

function drawCorner(s: number, corner: string, hi: string): string {
	const r = Math.max(1, s * 0.09);
	const p = s * 0.2;
	switch (corner) {
		case 'tl': return `<circle cx="${p}" cy="${p}" r="${r}" fill="${hi}"/>`;
		case 'tr': return `<circle cx="${s - p}" cy="${p}" r="${r}" fill="${hi}"/>`;
		case 'bl': return `<circle cx="${p}" cy="${s - p}" r="${r}" fill="${hi}"/>`;
		case 'br': return `<circle cx="${s - p}" cy="${s - p}" r="${r}" fill="${hi}"/>`;
		default: return '';
	}
}

// ──────────── Scoring ────────────

function hammingDist(a: number, b: number): number {
	let x = a ^ b, count = 0;
	while (x) { count += x & 1; x >>= 1; }
	return count;
}

export function pairScore(a: AvatarMark, b: AvatarMark): number {
	const quadDiff = (hammingDist(a.quadBits, b.quadBits) / 4) * 30;
	const accentDiff = a.accentIdx !== b.accentIdx ? 25 : 0;
	const edgeDiff = a.edgeIdx !== b.edgeIdx ? 15 : 0;
	const cornerDiff = a.cornerIdx !== b.cornerIdx ? 15 : 0;
	const gradDiff = a.gradAngle !== b.gradAngle ? 15 : 0;
	return Math.min(100, quadDiff + accentDiff + edgeDiff + cornerDiff + gradDiff);
}

// ──────────── Resolution ────────────

export function resolveMarks(agents: AgentEntry[]): Map<string, AvatarMark> {
	const map = new Map<string, AvatarMark>();
	const usedQuads = new Set<number>();
	const usedAccents = new Set<number>();

	const sorted = [...agents].sort((a, b) => hashName(a.name) - hashName(b.name));

	for (const agent of sorted) {
		const h1 = hashName(agent.name);
		const h2 = hashName2(agent.name);
		const h3 = hashName3(agent.name);

		let qi = h1 % QUAD_PATTERNS.length;
		let qAttempts = 0;
		while (usedQuads.has(qi) && qAttempts < QUAD_PATTERNS.length) {
			qi = (qi + 1) % QUAD_PATTERNS.length;
			qAttempts++;
		}
		usedQuads.add(qi);

		let ai = h2 % ACCENTS.length;
		let aAttempts = 0;
		while (usedAccents.has(ai) && aAttempts < ACCENTS.length) {
			ai = (ai + 1) % ACCENTS.length;
			aAttempts++;
		}
		usedAccents.add(ai);

		map.set(agent.name, {
			quadBits: QUAD_PATTERNS[qi],
			accentIdx: ai,
			edgeIdx: h3 % EDGES.length,
			cornerIdx: (h1 + h2) % CORNERS.length,
			gradAngle: ((h3 >> 4) % 4) * 90,
		});
	}

	// Optimization pass: swap secondary properties to maximize min pairwise score
	const names = [...map.keys()];
	const GRAD_OPTIONS = [0, 90, 180, 270];
	let improved = true;
	let iterations = 0;
	while (improved && iterations < 50) {
		improved = false;
		iterations++;
		let worstScore = 100, worstJ = -1;
		for (let i = 0; i < names.length; i++) {
			for (let j = i + 1; j < names.length; j++) {
				const s = pairScore(map.get(names[i])!, map.get(names[j])!);
				if (s < worstScore) { worstScore = s; worstJ = j; }
			}
		}
		if (worstScore >= 55) break;
		const nameB = names[worstJ];
		const idB = map.get(nameB)!;
		let bestChange: Partial<AvatarMark> | null = null;
		let bestMin = worstScore;

		for (let c = 0; c < CORNERS.length; c++) {
			if (c === idB.cornerIdx) continue;
			const test = { ...idB, cornerIdx: c };
			const minS = names.reduce((min, n) => n === nameB ? min : Math.min(min, pairScore(test, map.get(n)!)), 100);
			if (minS > bestMin) { bestMin = minS; bestChange = { cornerIdx: c }; }
		}
		for (const g of GRAD_OPTIONS) {
			if (g === idB.gradAngle) continue;
			const test = { ...idB, gradAngle: g };
			const minS = names.reduce((min, n) => n === nameB ? min : Math.min(min, pairScore(test, map.get(n)!)), 100);
			if (minS > bestMin) { bestMin = minS; bestChange = { gradAngle: g }; }
		}
		for (let e = 0; e < EDGES.length; e++) {
			if (e === idB.edgeIdx) continue;
			const test = { ...idB, edgeIdx: e };
			const minS = names.reduce((min, n) => n === nameB ? min : Math.min(min, pairScore(test, map.get(n)!)), 100);
			if (minS > bestMin) { bestMin = minS; bestChange = { edgeIdx: e }; }
		}

		if (bestChange && bestMin > worstScore) {
			map.set(nameB, { ...idB, ...bestChange });
			improved = true;
		}
	}

	return map;
}

// ──────────── SVG Renderer ────────────

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderAvatarMark(
	name: string,
	color: string,
	size: number,
	identity: AvatarMark,
): string {
	const c = getAgentColorValues(color);
	const id = `m${hashName(name)}${size}`;
	const { quadBits, accentIdx, edgeIdx, cornerIdx, gradAngle } = identity;

	const borderR = size <= 10 ? size * 0.2 : size <= 16 ? size * 0.22 : size * 0.3;
	const letter = escapeHtml(name.charAt(0).toUpperCase());
	const showText = size >= 14;
	const fontSize = size <= 16 ? size * 0.52 : size * 0.44;
	const clipId = `cl${id}`;
	const gradId = `gr${id}`;

	const hiOp = size <= 12 ? 0.38 : 0.24;
	const loOp = size <= 12 ? 0.22 : 0.14;
	const half = size / 2;
	const hi = `rgba(255,255,255,${size <= 12 ? 0.55 : 0.38})`;

	let quads = '';
	for (let q = 0; q < 4; q++) {
		const lit = (quadBits >> q) & 1;
		const x = (q % 2) * half;
		const y = Math.floor(q / 2) * half;
		quads += `<rect x="${x}" y="${y}" width="${half}" height="${half}" fill="${lit ? `rgba(255,255,255,${hiOp})` : `rgba(0,0,0,${loOp})`}"/>`;
	}

	const textEl = showText
		? `<text x="${size / 2}" y="${size / 2 + fontSize * 0.06}" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,'SF Pro',system-ui,sans-serif" font-size="${fontSize}" font-weight="700" fill="#f0f4f8" style="text-shadow:0 1px 3px rgba(0,0,0,0.7),0 0 6px rgba(0,0,0,0.4)">${letter}</text>`
		: '';

	return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${clipId}"><rect width="${size}" height="${size}" rx="${borderR}"/></clipPath><linearGradient id="${gradId}" gradientTransform="rotate(${gradAngle} 0.5 0.5)"><stop offset="0%" stop-color="${c.fill}"/><stop offset="100%" stop-color="${c.dark}"/></linearGradient></defs><g clip-path="url(#${clipId})"><rect width="${size}" height="${size}" fill="url(#${gradId})"/>${quads}${ACCENTS[accentIdx].draw(size, hi)}${drawEdge(size, EDGES[edgeIdx], hi)}${drawCorner(size, CORNERS[cornerIdx], hi)}</g><rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${borderR}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>${textEl}</svg>`;
}
