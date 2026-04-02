import type { TypingState } from '../types.js';
import { AgentAvatar } from './AgentAvatar.jsx';

interface TypingIndicatorProps {
	typing: TypingState;
}

export function TypingIndicator({ typing }: TypingIndicatorProps) {
	return (
		<div className={`tc-message-stack ${typing.isLead ? 'is-lead' : 'is-peer'}`}>
			<div className="tc-message-stack-shell">
				<AgentAvatar
					name={typing.agentName}
					color={typing.agentColor}
					isLead={typing.isLead}
					size="sm"
				/>
				<div className="tc-typing-indicator">
					<span className="tc-typing-dot" />
					<span className="tc-typing-dot" />
					<span className="tc-typing-dot" />
				</div>
			</div>
		</div>
	);
}
