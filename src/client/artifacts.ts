import type { ReplayArtifact } from '../shared/replay.js';

export type ArtifactPreviewMode = 'html' | 'text' | 'json' | 'external';

const RAIL_EXCERPT_MAX_CHARS = 220;

export function getArtifactPreviewMode(mimeType: string): ArtifactPreviewMode {
	if (mimeType === 'text/html') {
		return 'html';
	}
	if (mimeType === 'application/json' || mimeType === 'application/x-ndjson') {
		return 'json';
	}
	if (mimeType.startsWith('text/')) {
		return 'text';
	}
	return 'external';
}

export function formatArtifactDocumentText(mimeType: string, text: string): string {
	if (mimeType === 'application/json') {
		try {
			return `${JSON.stringify(JSON.parse(text), null, '\t')}\n`;
		} catch {
			return text.trim();
		}
	}

	if (mimeType === 'application/x-ndjson') {
		return text
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				try {
					return JSON.stringify(JSON.parse(line), null, '\t');
				} catch {
					return line;
				}
			})
			.join('\n\n');
	}

	return text.trim();
}

export function getArtifactRailExcerpt(
	artifact: ReplayArtifact,
	formattedText: string | null,
): string {
	if (artifact.summary && artifact.summary.trim().length > 0) {
		return artifact.summary.trim();
	}

	if (!formattedText) {
		return getArtifactPreviewMode(artifact.file.mimeType) === 'external'
			? 'Preview this artifact in a new tab.'
			: 'Expand to read the saved artifact.';
	}

	const collapsed = formattedText
		.replace(/\s+/g, ' ')
		.trim();

	if (collapsed.length <= RAIL_EXCERPT_MAX_CHARS) {
		return collapsed;
	}

	return `${collapsed.slice(0, RAIL_EXCERPT_MAX_CHARS - 1).trimEnd()}…`;
}

export function getArtifactPreviewKicker(mode: ArtifactPreviewMode): string {
	switch (mode) {
		case 'html':
			return 'Saved report';
		case 'json':
			return 'Structured artifact';
		case 'text':
			return 'Readable artifact';
		case 'external':
			return 'External artifact';
	}
}

export function resolveSelectedArtifactId(
	artifacts: ReplayArtifact[],
	currentId: string | null,
): string | null {
	if (artifacts.length === 0) {
		return null;
	}

	if (currentId && artifacts.some((artifact) => artifact.id === currentId)) {
		return currentId;
	}

	return artifacts[artifacts.length - 1]!.id;
}
