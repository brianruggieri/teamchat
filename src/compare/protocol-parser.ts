import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import type { ProtocolMessage, ProtocolTimeline } from './types.js';
import type { RawInboxMessage } from '../shared/types.js';

interface InboxEntry extends RawInboxMessage {
	_recipient: string;
}

function contentHash(text: string): string {
	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
	}
	return String(hash);
}

export function parseInboxes(inboxDir: string): ProtocolTimeline {
	const files = readdirSync(inboxDir).filter(f => f.endsWith('.json'));
	const allEntries: InboxEntry[] = [];

	for (const file of files) {
		const recipient = basename(file, '.json');
		const raw: RawInboxMessage[] = JSON.parse(readFileSync(join(inboxDir, file), 'utf-8'));
		for (const msg of raw) {
			allEntries.push({ ...msg, _recipient: recipient });
		}
	}

	// Detect broadcasts: same content hash + from within 1s across 2+ recipients
	const byHash = new Map<string, InboxEntry[]>();
	for (const entry of allEntries) {
		const key = `${contentHash(entry.text)}:${entry.from}`;
		const group = byHash.get(key) ?? [];
		group.push(entry);
		byHash.set(key, group);
	}

	const broadcastHashes = new Set<string>();
	for (const [key, group] of byHash) {
		if (group.length < 2) continue;
		const recipients = new Set(group.map(e => e._recipient));
		if (recipients.size < 2) continue;
		const timestamps = group.map(e => new Date(e.timestamp).getTime());
		const span = Math.max(...timestamps) - Math.min(...timestamps);
		if (span <= 1000) {
			broadcastHashes.add(key);
		}
	}

	const messages: ProtocolMessage[] = allEntries.map(entry => {
		const key = `${contentHash(entry.text)}:${entry.from}`;
		const isBroadcast = broadcastHashes.has(key);
		const isDM = !isBroadcast;
		return {
			timestamp: entry.timestamp,
			from: entry.from,
			to: entry._recipient,
			content: entry.text,
			isDM,
			isBroadcast,
		};
	});

	messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	return { messages };
}
