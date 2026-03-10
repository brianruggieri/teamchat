import type { ParsedSystemEvent } from './types.js';

const LEAD_NAMES = ['team-lead', 'teamlead', 'lead'];

/**
 * Attempt to parse the `text` field of an inbox message as a system event.
 * Returns null if the text is not valid JSON or lacks a `type` field.
 */
export function tryParseSystemEvent(text: string): ParsedSystemEvent | null {
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		if (parsed !== null && typeof parsed === 'object' && typeof parsed.type === 'string') {
			return parsed as unknown as ParsedSystemEvent;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Check if an agent name refers to the team lead.
 */
export function isLeadAgent(name: string): boolean {
	return LEAD_NAMES.includes(name.toLowerCase());
}

/**
 * Generate a unique event ID using crypto.randomUUID.
 */
export function generateEventId(): string {
	return crypto.randomUUID();
}

/**
 * Parse an ISO8601 timestamp string to epoch milliseconds.
 */
export function parseTimestamp(ts: string): number {
	return new Date(ts).getTime();
}

/**
 * Check if two timestamps are within a given window (in milliseconds).
 */
export function isWithinWindow(ts1: string, ts2: string, windowMs: number): boolean {
	return Math.abs(parseTimestamp(ts1) - parseTimestamp(ts2)) <= windowMs;
}
