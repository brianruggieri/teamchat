import { readFileSync } from 'fs';
import type { TerminalEntry } from './types.js';

interface SessionJsonlEntry {
	type: string;
	message?: {
		role: string;
		content: string | ContentBlock[];
	};
	toolUseId?: string;
	content?: string;
	uuid?: string;
	timestamp?: string;
}

interface ContentBlock {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
}

function parseJsonlFile(filePath: string): SessionJsonlEntry[] {
	const text = readFileSync(filePath, 'utf-8');
	return text
		.split('\n')
		.filter(line => line.trim())
		.map(line => JSON.parse(line));
}

function extractEntries(entries: SessionJsonlEntry[], agentName: string): TerminalEntry[] {
	const result: TerminalEntry[] = [];
	let lastTimestamp: string | null = null;

	for (const entry of entries) {
		const timestamp: string = entry.timestamp ?? lastTimestamp ?? '1970-01-01T00:00:00.000Z';
		lastTimestamp = timestamp;

		if (entry.type === 'user' && entry.message) {
			const content = typeof entry.message.content === 'string'
				? entry.message.content
				: entry.message.content
					?.filter((b): b is ContentBlock & { text: string } => b.type === 'text' && !!b.text)
					.map(b => b.text)
					.join('\n') ?? '';
			if (content) {
				result.push({ timestamp, agent: agentName, type: 'user-prompt', content });
			}
		}

		if (entry.type === 'assistant' && entry.message) {
			const blocks = entry.message.content;
			if (typeof blocks === 'string') {
				if (blocks) {
					result.push({ timestamp, agent: agentName, type: 'assistant-text', content: blocks });
				}
			} else if (Array.isArray(blocks)) {
				for (const block of blocks) {
					if (block.type === 'thinking' && block.thinking) {
						result.push({ timestamp, agent: agentName, type: 'thinking', content: block.thinking });
					}
					if (block.type === 'text' && block.text) {
						result.push({ timestamp, agent: agentName, type: 'assistant-text', content: block.text });
					}
					if (block.type === 'tool_use') {
						const toolContent = block.name
							? `${block.name}(${JSON.stringify(block.input ?? {}).slice(0, 200)})`
							: 'unknown tool';
						result.push({
							timestamp, agent: agentName, type: 'tool-call',
							content: toolContent, toolName: block.name,
						});
					}
				}
			}
		}

		if (entry.type === 'tool_result') {
			const content = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content ?? '');
			result.push({ timestamp, agent: agentName, type: 'tool-result', content });
		}
	}

	return result;
}

export function parseSessionLog(filePath: string, agentName: string): TerminalEntry[] {
	const entries = parseJsonlFile(filePath);
	return extractEntries(entries, agentName);
}

export function parseSubagentLog(filePath: string, agentName: string): TerminalEntry[] {
	return parseSessionLog(filePath, agentName);
}
