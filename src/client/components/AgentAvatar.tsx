import { useAvatarMark } from './AvatarMarkContext.js';
import { renderAvatarMark } from '../avatar-marks.js';
import { getAgentColor } from '../types.js';

export const ROLE_ABBREVIATIONS: Record<string, string> = {
	'db': 'db',
	'ui': 'ui',
	'fe': 'fe',
	'frontend': 'fe',
	'backend': 'be',
	'sv': 'sv',
	'server': 'sv',
	'ch': 'ch',
	'chat': 'ch',
	'msg': 'msg',
	'message': 'msg',
	'auth': 'auth',
	'perm': 'perm',
	'permission': 'perm',
	'rt': 'rt',
	'route': 'rt',
	'file': 'file',
	'vc': 'vc',
	'voice': 'vc',
	'srch': 'srch',
	'search': 'srch',
	'ntf': 'ntf',
	'notification': 'ntf',
	'qa': 'qa',
	'test': 'tst',
	'privacy': 'prv',
	'gateway': 'gw',
	'api': 'api',
	'lead': 'ld',
};

export function getAvatarAbbreviation(name: string): string {
	const firstSegment = name.split('-')[0]?.toLowerCase() ?? '';
	const abbrev = ROLE_ABBREVIATIONS[firstSegment];
	if (abbrev) return abbrev;
	return name.slice(0, 2).toLowerCase();
}

interface AgentAvatarProps {
	name: string;
	color: string;
	isLead?: boolean;
	size?: 'xs' | 'sm' | 'md';
}

const SIZE_PX = { xs: 16, sm: 28, md: 36 } as const;

export function AgentAvatar({
	name,
	color,
	isLead = false,
	size = 'md',
}: AgentAvatarProps) {
	const identity = useAvatarMark(name);
	const sizeClass = size === 'xs' ? 'is-xs' : size === 'sm' ? 'is-sm' : '';

	return (
		<div className={`tc-avatar ${sizeClass}`}>
			{identity ? (
				<div
					className="tc-avatar-mark"
					dangerouslySetInnerHTML={{
						__html: renderAvatarMark(name, color, SIZE_PX[size], identity),
					}}
				/>
			) : (
				<div className={`tc-avatar-core ${getAgentColor(color).dot}`}>
					{getAvatarAbbreviation(name)}
				</div>
			)}
			{isLead && (
				<span className="tc-avatar-badge" title="Team Lead">👑</span>
			)}
		</div>
	);
}
