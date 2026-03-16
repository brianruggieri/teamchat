import { createContext, useContext, useMemo } from 'react';
import type { AvatarMark, AgentEntry } from '../avatar-marks.js';
import { resolveMarks } from '../avatar-marks.js';

const AvatarMarkContext = createContext<Map<string, AvatarMark>>(new Map());

export function AvatarMarkProvider({
	agents,
	children,
}: {
	agents: AgentEntry[];
	children: React.ReactNode;
}) {
	// Stabilize on serialized roster key to avoid re-resolving on every render
	const rosterKey = agents.map(a => `${a.name}:${a.color}`).join(',');
	const markMap = useMemo(() => resolveMarks(agents), [rosterKey]);
	return (
		<AvatarMarkContext.Provider value={markMap}>
			{children}
		</AvatarMarkContext.Provider>
	);
}

export function useAvatarMark(name: string): AvatarMark | undefined {
	const map = useContext(AvatarMarkContext);
	return map.get(name);
}
