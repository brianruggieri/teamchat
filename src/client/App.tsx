import React, { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useChatReducer } from './hooks/useChatReducer.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useAutoScroll } from './hooks/useAutoScroll.js';
import { useRelativeTime } from './hooks/useRelativeTime.js';
import { Header } from './components/Header.jsx';
import { MessageList } from './components/MessageList.jsx';
import { TaskSidebar } from './components/TaskSidebar.jsx';
import { PresenceRoster } from './components/PresenceRoster.jsx';
import { SessionStats } from './components/SessionStats.jsx';
import { NewMessageIndicator } from './components/NewMessageIndicator.jsx';

function App() {
	const [state, dispatch] = useChatReducer();
	useWebSocket(dispatch);
	useRelativeTime(30000);

	const { containerRef, showIndicator, scrollToBottom } = useAutoScroll([
		state.events.length,
	]);

	const onlineCount = Object.values(state.presence).filter(
		(s) => s === 'working' || s === 'idle'
	).length + 1; // +1 for lead

	const handleTaskClick = useCallback((taskId: string) => {
		// Find messages related to this task and scroll to the first one
		const container = containerRef.current;
		if (!container) return;

		// Look for a system event or message mentioning this task
		const targetEl = container.querySelector(`[data-task-id="${taskId}"]`);
		if (targetEl) {
			targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			targetEl.classList.add('ring-2', 'ring-indigo-500/50');
			setTimeout(() => {
				targetEl.classList.remove('ring-2', 'ring-indigo-500/50');
			}, 2000);
		}
	}, [containerRef]);

	return (
		<div className="h-screen flex flex-col bg-surface-950">
			<Header
				team={state.team}
				connected={state.connected}
				onlineCount={onlineCount}
			/>

			<div className="flex flex-1 overflow-hidden">
				{/* Main chat area */}
				<div className="flex-1 flex flex-col overflow-hidden">
					<div
						ref={containerRef}
						className="flex-1 overflow-y-auto"
					>
						{state.events.length === 0 && state.connected && (
							<div className="flex items-center justify-center h-full text-gray-600">
								<div className="text-center">
									<p className="text-lg mb-2">Waiting for messages...</p>
									<p className="text-sm">
										Connect a team or load a session to get started.
									</p>
								</div>
							</div>
						)}

						{!state.connected && (
							<div className="flex items-center justify-center h-full text-gray-600">
								<div className="text-center">
									<div className="w-4 h-4 border-2 border-gray-600 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
									<p className="text-sm">Connecting to server...</p>
								</div>
							</div>
						)}

						<MessageList
							events={state.events}
							reactions={state.reactions}
						/>
					</div>

					<NewMessageIndicator
						show={showIndicator}
						onClick={scrollToBottom}
					/>
				</div>

				{/* Right sidebar */}
				<aside className="w-64 border-l border-surface-800 bg-surface-900/50 flex flex-col overflow-hidden">
					<div className="flex-1 overflow-y-auto px-4 py-4">
						<TaskSidebar
							tasks={state.tasks}
							onTaskClick={handleTaskClick}
						/>
						<PresenceRoster
							team={state.team}
							presence={state.presence}
						/>
					</div>
					<SessionStats
						events={state.events}
						tasks={state.tasks}
						sessionStart={state.sessionStart}
						memberCount={state.team?.members.length ?? 0}
					/>
				</aside>
			</div>
		</div>
	);
}

// Mount
const root = document.getElementById('root');
if (root) {
	createRoot(root).render(<App />);
}
