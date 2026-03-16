import { useAvatarMark } from './AvatarMarkContext.js';
import { renderAvatarMark } from '../avatar-marks.js';
import { getAgentColor } from '../types.js';

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
					{name.charAt(0).toUpperCase()}
				</div>
			)}
			{isLead && (
				<span className="tc-avatar-badge" title="Team Lead">👑</span>
			)}
		</div>
	);
}
