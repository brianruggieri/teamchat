// src/compare/types.ts
import type { ChatEvent } from '../shared/types.js';

export interface TerminalEntry {
	timestamp: string;
	agent: string;
	type: 'user-prompt' | 'assistant-text' | 'tool-call' | 'tool-result' | 'thinking';
	content: string;
	toolName?: string;
}

export interface TerminalTimeline {
	lead: TerminalEntry[];
	agents: Record<string, TerminalEntry[]>;
	merged: TerminalEntry[];
}

export interface ProtocolMessage {
	timestamp: string;
	from: string;
	to: string;
	content: string;
	isDM: boolean;
	isBroadcast: boolean;
}

export interface ProtocolTimeline {
	messages: ProtocolMessage[];
}

export interface TeamchatTimeline {
	events: ChatEvent[];
}

export interface ParsedSession {
	manifest: import('../capture/types.js').CaptureManifest;
	terminal: TerminalTimeline;
	protocol: ProtocolTimeline;
	teamchat: TeamchatTimeline;
}

export type KeyMomentType = 'dm' | 'cascade' | 'broadcast' | 'idle' | 'bottleneck' | 'coordination';

export interface KeyMoment {
	timestamp: string;
	type: KeyMomentType;
	description: string;
	terminalSummary: string;
	teamchatSummary: string;
	terminalLines: number;
	teamchatEvents: number;
	gapScore: number;
}

export interface ScorecardMetrics {
	terminalLinesLead: number;
	terminalLinesAll: number;
	hiddenMessages: number;
	teamchatEvents: number;
	idlePingsRaw: number;
	idleEventsShown: number;
	noiseSuppression: number;
	broadcastsRaw: number;
	broadcastsShown: number;
	broadcastDedup: number;
	coordinationSurfaced: number;
	terminalGap: number;
	terminalSignalRatio: number;
	teamchatSignalRatio: number;
}

export interface Scorecard {
	version: 1;
	session: {
		team: string;
		durationMs: number;
		agents: number;
		tasks: number;
		capturedAt: string;
	};
	metrics: ScorecardMetrics;
	keyMoments: KeyMoment[];
	generatedAt: string;
}

export interface BenchmarkResult {
	scorecard: Scorecard;
	viewport: {
		eventsPerScreen: number[];
		scrollDepth: number;
		renderCompleteness: number;
		whitespaceRatio: number;
	};
	generatedAt: string;
}
