export interface SecretFinding {
	category: SecretCategory;
	pattern: string;
	matchStart: number;
	matchEnd: number;
	masked: string;
}

export type SecretCategory =
	| 'aws-credentials'
	| 'api-token'
	| 'private-key'
	| 'connection-string'
	| 'env-pattern'
	| 'jwt'
	| 'github-token'
	| 'gitlab-token'
	| 'high-entropy'
	| 'generic-secret';

interface PatternDef {
	category: SecretCategory;
	pattern: RegExp;
	label: string;
}

const PATTERNS: PatternDef[] = [
	// AWS
	{ category: 'aws-credentials', pattern: /AKIA[A-Z0-9]{16}/g, label: 'AWS access key' },
	{ category: 'aws-credentials', pattern: /aws_secret_access_key\s*[=:]\s*\S+/gi, label: 'AWS secret key' },

	// API tokens
	{ category: 'api-token', pattern: /sk-[a-zA-Z0-9_-]{20,}/g, label: 'API token (sk-)' },
	{ category: 'api-token', pattern: /Bearer\s+[a-zA-Z0-9._\-]{20,}/g, label: 'Bearer token' },

	// Private keys
	{ category: 'private-key', pattern: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----/g, label: 'Private key' },

	// Connection strings
	{ category: 'connection-string', pattern: /(postgres|postgresql|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s]+@[^\s]+/gi, label: 'Connection string' },

	// JWTs
	{ category: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'JWT' },

	// GitHub/GitLab tokens
	{ category: 'github-token', pattern: /gh[ps]_[A-Za-z0-9_]{30,}/g, label: 'GitHub token' },
	{ category: 'gitlab-token', pattern: /glpat-[A-Za-z0-9_-]{20,}/g, label: 'GitLab token' },

	// .env patterns
	{ category: 'env-pattern', pattern: /^[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)S?\s*[=:]\s*\S+/gm, label: 'Environment variable' },

	// High-entropy base64 blobs (likely secrets or keys)
	{ category: 'high-entropy', pattern: /(?<![a-zA-Z0-9/:.@_-])[A-Za-z0-9+/_-]{40,}={0,2}(?![a-zA-Z0-9/:.@_-])/g, label: 'High-entropy string' },

	// Generic
	{ category: 'generic-secret', pattern: /(api[_-]?key|secret|password|passwd|credentials?)\s*[=:]\s*["']?[^\s"']{6,}/gi, label: 'Generic secret' },
];

/** Calculate Shannon entropy in bits per character. */
export function shannonEntropy(s: string): number {
	const freq = new Map<string, number>();
	for (const c of s) {
		freq.set(c, (freq.get(c) ?? 0) + 1);
	}
	let entropy = 0;
	for (const count of freq.values()) {
		const p = count / s.length;
		entropy -= p * Math.log2(p);
	}
	return entropy;
}

export function scanForSecrets(text: string): SecretFinding[] {
	const findings: SecretFinding[] = [];
	const seen = new Set<string>();

	for (const def of PATTERNS) {
		const regex = new RegExp(def.pattern.source, def.pattern.flags);
		let match: RegExpExecArray | null;
		while ((match = regex.exec(text)) !== null) {
			if (def.category === 'high-entropy') {
				const matched = match[0];
				// Skip git SHAs (40 or 64 hex chars)
				if (/^[a-fA-F0-9]{40}$/.test(matched) || /^[a-fA-F0-9]{64}$/.test(matched)) {
					continue;
				}
				// Require actual high entropy (random base64 ≈ 5.17 bits/char)
				if (shannonEntropy(matched) < 4.0) {
					continue;
				}
			}

			const key = `${def.category}:${match.index}:${match[0].length}`;
			if (seen.has(key)) continue;
			seen.add(key);

			findings.push({
				category: def.category,
				pattern: def.label,
				matchStart: match.index,
				matchEnd: match.index + match[0].length,
				masked: maskSecret(match[0]),
			});
		}
	}

	return deduplicateFindings(findings);
}

export function maskSecret(value: string): string {
	if (value.length <= 8) return '████████';
	const visiblePrefix = Math.min(4, Math.floor(value.length * 0.2));
	const visibleSuffix = Math.min(3, Math.floor(value.length * 0.1));
	const masked = value.slice(0, visiblePrefix) + '████████████████' + value.slice(-visibleSuffix);
	return masked;
}

// Catch-all categories that should yield to specific pattern matches
const CATCHALL_CATEGORIES = new Set<SecretCategory>(['high-entropy', 'generic-secret']);

function deduplicateFindings(findings: SecretFinding[]): SecretFinding[] {
	// Sort: specific categories first, then by match length ascending, then by start position
	findings.sort((a, b) => {
		const aIsCatchall = CATCHALL_CATEGORIES.has(a.category) ? 1 : 0;
		const bIsCatchall = CATCHALL_CATEGORIES.has(b.category) ? 1 : 0;
		if (aIsCatchall !== bIsCatchall) return aIsCatchall - bIsCatchall;
		const lenA = a.matchEnd - a.matchStart;
		const lenB = b.matchEnd - b.matchStart;
		return lenA - lenB || a.matchStart - b.matchStart;
	});

	const result: SecretFinding[] = [];
	for (const finding of findings) {
		const overlapping = result.find(
			(existing) => finding.matchStart < existing.matchEnd && finding.matchEnd > existing.matchStart,
		);
		if (!overlapping) {
			result.push(finding);
		}
	}

	// Re-sort result by start position for consistent output
	result.sort((a, b) => a.matchStart - b.matchStart);
	return result;
}

export function textContainsSecrets(text: string): boolean {
	return scanForSecrets(text).length > 0;
}
