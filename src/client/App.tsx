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

		const groupToggle = container.querySelector<HTMLButtonElement>(
			`[data-task-ids~="${taskId}"]`
		);
		if (groupToggle?.getAttribute('aria-expanded') === 'false') {
			groupToggle.click();
		}

		const targetEl = container.querySelector<HTMLElement>(
			`[data-task-id="${taskId}"], [data-task-ids~="${taskId}"]`
		);
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

					<div className="tc-thread-indicator-shell">
						<NewMessageIndicator
							show={showIndicator}
							onClick={scrollToBottom}
						/>
					</div>
				</section>

				<aside className="tc-right-rail" aria-label="Team and task panel">
					<DesktopWorkbench
						state={state}
						onTaskClick={handleTaskClick}
					/>
				</aside>
			</div>

			{!workbenchOpen && (
				<button
					type="button"
					className="tc-sheet-peek"
					onClick={() => setWorkbenchOpen(true)}
					aria-controls="tc-workbench-sheet"
					aria-expanded={workbenchOpen}
				>
					<span className="tc-sheet-peek-handle" aria-hidden="true" />
					<span className="tc-sheet-peek-copy">
						<span className="tc-sheet-peek-title">Pull up team + tasks</span>
						<span className="tc-sheet-peek-meta">
							{state.tasks.length} tasks · {onlineCount} online
						</span>
					</span>
				</button>
			)}

			{workbenchOpen && (
				<div className="tc-bottom-sheet-backdrop" onClick={closeWorkbench}>
					<div
						id="tc-workbench-sheet"
						className="tc-bottom-sheet animate-sheet-in"
						onClick={(event) => event.stopPropagation()}
						role="dialog"
						aria-modal="true"
						aria-labelledby="tc-bottom-sheet-title"
						aria-describedby="tc-bottom-sheet-description"
					>
						<div className="tc-bottom-sheet-handle" />
						<div className="tc-bottom-sheet-header">
							<div>
								<div
									id="tc-bottom-sheet-title"
									className="tc-bottom-sheet-title"
								>
									Team panel
								</div>
								<div
									id="tc-bottom-sheet-description"
									className="tc-bottom-sheet-subtitle"
								>
									Tasks, team status, and session metrics
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
							<SheetWorkbench
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

function DesktopWorkbench({
	state,
	onTaskClick,
}: {
	state: ReturnType<typeof useChatReducer>[0];
	onTaskClick: (taskId: string) => void;
}) {
	return (
		<div className="tc-rail-frame">
			<div className="tc-rail-section is-top">
				<PresenceRoster team={state.team} presence={state.presence} />
			</div>
			<div className="tc-rail-section is-middle">
				<TaskSidebar tasks={state.tasks} onTaskClick={onTaskClick} />
			</div>
			<div className="tc-rail-section is-bottom">
				<SessionStats
					events={state.events}
					tasks={state.tasks}
					sessionStart={state.sessionStart}
					memberCount={state.team?.members.length ?? 0}
				/>
			</div>
		</div>
	);
}

function SheetWorkbench({
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
