import React, { useCallback, useEffect, useState } from 'react';
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
	const [workbenchOpen, setWorkbenchOpen] = useState(false);

	useWebSocket(dispatch);
	useRelativeTime(30000);

	const { containerRef, showIndicator, scrollToBottom } = useAutoScroll([
		state.events.length,
	]);

	const onlineCount = Object.values(state.presence).filter(
		(status) => status === 'working' || status === 'idle'
	).length + 1;

	useEffect(() => {
		if (!workbenchOpen) return undefined;

		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setWorkbenchOpen(false);
			}
		};

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	}, [workbenchOpen]);

	useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth >= 1024) {
				setWorkbenchOpen(false);
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	const closeWorkbench = useCallback(() => {
		setWorkbenchOpen(false);
	}, []);

	const handleTaskClick = useCallback((taskId: string) => {
		setWorkbenchOpen(false);
		const container = containerRef.current;
		if (!container) return;

		const targetEl = container.querySelector(`[data-task-id="${taskId}"]`);
		if (targetEl) {
			targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			targetEl.classList.add('ring-2', 'ring-indigo-500/50');
			setTimeout(() => {
				targetEl.classList.remove('ring-2', 'ring-indigo-500/50');
			}, 2000);
		}
	}, [containerRef]);

	const hasEvents = state.events.length > 0;

	return (
		<div className="tc-app-shell">
			<Header
				team={state.team}
				connected={state.connected}
				onlineCount={onlineCount}
				onOpenWorkbench={() => setWorkbenchOpen(true)}
			/>

			<div className="tc-app-body">
				<section className="tc-thread-pane">
					<div ref={containerRef} className="tc-thread-scroll">
						<div className="tc-thread-column">
							{!state.connected && !hasEvents && (
								<StatusPanel
									title="Connecting to server"
									description="Waiting for the live event stream to attach."
									spinner
								/>
							)}

							{state.connected && !hasEvents && (
								<StatusPanel
									title="Waiting for messages"
									description="Connect a team or load a replay to populate the conversation."
								/>
							)}

							{!state.connected && hasEvents && (
								<div className="tc-status-banner">
									<div className="tc-status-banner-dot" />
									<span>Connection lost. Rejoining the session stream.</span>
								</div>
							)}

							<MessageList
								events={state.events}
								reactions={state.reactions}
							/>
						</div>
					</div>

					<NewMessageIndicator
						show={showIndicator}
						onClick={scrollToBottom}
					/>
				</section>

				<aside className="tc-right-rail">
					<div className="tc-rail-scroll">
						<WorkbenchContent
							state={state}
							onTaskClick={handleTaskClick}
						/>
					</div>
				</aside>
			</div>

			{workbenchOpen && (
				<div className="tc-bottom-sheet-backdrop" onClick={closeWorkbench}>
					<div
						className="tc-bottom-sheet animate-sheet-in"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="tc-bottom-sheet-handle" />
						<div className="tc-bottom-sheet-header">
							<div>
								<div className="tc-bottom-sheet-title">Workbench</div>
								<div className="tc-bottom-sheet-subtitle">
									Tasks, roster, and session health
								</div>
							</div>
							<button
								type="button"
								onClick={closeWorkbench}
								className="tc-bottom-sheet-close"
							>
								Close
							</button>
						</div>
						<div className="tc-bottom-sheet-content">
							<WorkbenchContent
								state={state}
								onTaskClick={handleTaskClick}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function WorkbenchContent({
	state,
	onTaskClick,
}: {
	state: ReturnType<typeof useChatReducer>[0];
	onTaskClick: (taskId: string) => void;
}) {
	return (
		<div className="tc-workbench-stack">
			<TaskSidebar tasks={state.tasks} onTaskClick={onTaskClick} />
			<PresenceRoster team={state.team} presence={state.presence} />
			<SessionStats
				events={state.events}
				tasks={state.tasks}
				sessionStart={state.sessionStart}
				memberCount={state.team?.members.length ?? 0}
			/>
		</div>
	);
}

function StatusPanel({
	title,
	description,
	spinner = false,
}: {
	title: string;
	description: string;
	spinner?: boolean;
}) {
	return (
		<div className="tc-status-panel">
			{spinner && <div className="tc-status-spinner" />}
			<h2 className="tc-status-title">{title}</h2>
			<p className="tc-status-description">{description}</p>
		</div>
	);
}

const root = document.getElementById('root');
if (root) {
	createRoot(root).render(<App />);
}
