/** Filler phrases to strip from the beginning of summaries. */
const FILLER_PREFIXES = [
	/^sure,?\s+/i, /^great\s+question\.?\s+/i, /^here'?s?\s+what\s+/i,
	/^got\s+it\.?\s+/i, /^thanks\.?\s+/i, /^yes,?\s+/i, /^no,?\s+/i,
	/^absolutely\.?\s+/i, /^right,?\s+/i, /^ok,?\s+/i,
];

/**
 * Distill a message into a one-line summary (max ~80 chars).
 * Prefers an existing summary if available and short enough.
 * Strips filler prefixes and markdown formatting.
 */
export function distillSummary(text: string, existingSummary?: string | null): string {
	// Prefer existing summary if available and under limit
	let source = existingSummary && existingSummary.length <= 80 ? existingSummary : text;

	// Strip filler prefixes
	for (const pattern of FILLER_PREFIXES) {
		source = source.replace(pattern, '');
	}

	// Strip markdown formatting
	source = source.replace(/```[\s\S]*?```/g, '[code]').replace(/\n+/g, ' ').trim();

	// Truncate at word boundary
	if (source.length > 80) {
		const truncated = source.slice(0, 80);
		const lastSpace = truncated.lastIndexOf(' ');
		source = (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated) + '\u2026';
	}

	return source;
}
