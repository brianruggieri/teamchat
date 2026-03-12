import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useChatReducer } from './hooks/useChatReducer.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useAutoScroll } from './hooks/useAutoScroll.js';
import { TimeProvider } from './hooks/useRelativeTime.js';
import { useReplayController } from './hooks/useReplayController.js';
import { Header } from './components/Header.jsx';
import { MessageList } from './components/MessageList.jsx';
import { TaskSidebar } from './components/TaskSidebar.jsx';
import { PresenceRoster } from './components/PresenceRoster.jsx';
import { SessionStats } from './components/SessionStats.jsx';
import { NewMessageIndicator } from './components/NewMessageIndicator.jsx';
import { ReplayControls } from './components/ReplayControls.jsx';
import { ReplayTimeline } from './components/ReplayTimeline.jsx';
import { ReplayArtifactPanel } from './components/ReplayArtifactPanel.jsx';
import { ArtifactViewerModal } from './components/ArtifactViewerModal.jsx';
import { ModeBanner } from './components/ModeBanner.jsx';
import { AgentProfile } from './components/AgentProfile.jsx';
import { ConfettiOverlay } from './components/ConfettiOverlay.jsx';
import { SessionPostMortem } from './components/SessionPostMortem.jsx';
import { derivePostMortem } from './postmortem.js';
import type { AppBootstrap, ReplayAppBootstrap, ReplayBundle, AutoAppBootstrap } from '../shared/replay.js';
import type { ReplayArtifact } from '../shared/replay.js';
import type { ChatState } from './types.js';
import { resolveSelectedArtifactId } from './artifacts.js';

function App() {
	const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isActive = true;

		fetch('/bootstrap')
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Bootstrap failed (${response.status})`);
				}
				return response.json() as Promise<AppBootstrap>;
			})
			.then((payload) => {
				if (isActive) {
					setBootstrap(payload);
				}
			})
			.catch((fetchError) => {
				if (isActive) {
					setError(fetchError instanceof Error ? fetchError.message : 'Bootstrap failed');
				}
			});

		return () => {
			isActive = false;
		};
	}, []);

	if (error) {
		return (
			<div className="tc-app-shell">
				<StatusPanel
					title="Unable to start teamchat"
					description={error}
				/>
			</div>
		);
	}

	if (!bootstrap) {
		return (
			<div className="tc-app-shell">
				<StatusPanel
					title="Loading teamchat"
					description="Fetching bootstrap state for the active session."
					spinner
				/>
			</div>
		);
	}

	if (bootstrap.mode === 'auto') {
		return (
			<AutoWorkspace
				bootstrap={bootstrap}
				onTeamReady={(state) => {
					setBootstrap({
						mode: 'live',
						initialState: state,
						wsUrl: bootstrap.wsUrl,
					});
				}}
			/>
		);
	}

	if (bootstrap.mode === 'live') {
		return <LiveWorkspace bootstrap={bootstrap} />;
	}

	return <ReplayWorkspace bootstrap={bootstrap} />;
}

const AUTO_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 10000];

function AutoWorkspace({
	bootstrap,
	onTeamReady,
}: {
	bootstrap: AutoAppBootstrap;
	onTeamReady: (state: import('./types.js').SessionState) => void;
}) {
	const onTeamReadyRef = React.useRef(onTeamReady);
	onTeamReadyRef.current = onTeamReady;

	useEffect(() => {
		let active = true;
		let ws: WebSocket | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let reconnectAttempt = 0;

		function connect() {
			if (!active) return;
			ws = new WebSocket(bootstrap.wsUrl);

			ws.onopen = () => {
				reconnectAttempt = 0;
			};

			ws.onmessage = (e: MessageEvent<string>) => {
				try {
					const msg = JSON.parse(e.data) as { type: string; state?: import('./types.js').SessionState };
					if (msg.type === 'team-ready' && msg.state) {
						onTeamReadyRef.current(msg.state);
					}
				} catch {
					// Ignore malformed messages
				}
			};

			ws.onclose = () => {
				if (!active) return;
				const delay = AUTO_RECONNECT_DELAYS[
					Math.min(reconnectAttempt, AUTO_RECONNECT_DELAYS.length - 1)
				]!;
				reconnectAttempt++;
				reconnectTimer = setTimeout(connect, delay);
			};

			ws.onerror = () => {
				ws?.close();
			};
		}

		connect();

		return () => {
			active = false;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (ws) ws.close();
		};
	}, [bootstrap.wsUrl]);

	return (
		<div className="tc-app-shell">
			<StatusPanel
				title="Waiting for team..."
				description="Create or start an Agent Team in Claude Code to begin."
				spinner
			/>
		</div>
	);
}

function LiveWorkspace({ bootstrap }: { bootstrap: Extract<AppBootstrap, { mode: 'live' }> }) {
	const [state, dispatch] = useChatReducer();

	useEffect(() => {
		dispatch({ type: 'HYDRATE', state: bootstrap.initialState });
	}, [bootstrap.initialState, dispatch]);

	useWebSocket(dispatch, bootstrap.wsUrl);

	return (
		<TimeProvider>
			<TeamChatScaffold
				state={state}
				mode="live"
				headerStatusText={state.connected ? 'following stream' : 'reconnecting'}
				topContent={(
					<ModeBanner
						mode="live"
						eyebrow="Live mode"
						title="Following the active team session"
						description={
							state.connected
								? 'Incoming events stream into the workspace in real time.'
								: 'Trying to reattach to the live event stream.'
						}
						meta={[
							state.connected ? 'Realtime websocket' : 'Reconnect in progress',
							`${bootstrap.initialState.team?.members.length ?? 0} agents configured`,
						]}
					/>
				)}
				emptyTitle="Waiting for messages"
				emptyDescription="Connect a team or load a replay to populate the conversation."
				dispatch={dispatch}
				renderPanels={(onTaskClick, onAgentClick) => [
					<PresenceRoster
						key="presence"
						mode="live"
						team={state.team}
						presence={state.presence}
						threadStatuses={state.threadStatuses}
						tasks={state.tasks}
						onAgentClick={onAgentClick}
					/>,
					<TaskSidebar key="tasks" tasks={state.tasks} onTaskClick={onTaskClick} />,
					<SessionStats
						key="stats"
						events={state.events}
						tasks={state.tasks}
						sessionStart={state.sessionStart}
						memberCount={state.team?.members.length ?? 0}
					/>,
				]}
			/>
		</TimeProvider>
	);
}

function ReplayWorkspace({ bootstrap }: { bootstrap: ReplayAppBootstrap }) {
	const [bundle, setBundle] = useState<ReplayBundle | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isActive = true;
		fetch(bootstrap.replayBundleUrl)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Replay bundle failed (${response.status})`);
				}
				return response.json() as Promise<ReplayBundle>;
			})
			.then((payload) => {
				if (isActive) {
					setBundle(payload);
				}
			})
			.catch((fetchError) => {
				if (isActive) {
					setError(fetchError instanceof Error ? fetchError.message : 'Replay bundle failed');
				}
			});

		return () => {
			isActive = false;
		};
	}, [bootstrap.replayBundleUrl]);

	if (error) {
		return (
			<div className="tc-app-shell">
				<StatusPanel
					title="Unable to load replay"
					description={error}
				/>
			</div>
		);
	}

	if (!bundle) {
		return (
			<div className="tc-app-shell">
				<StatusPanel
					title="Loading replay"
					description="Preparing the replay bundle and timeline markers."
					spinner
				/>
			</div>
		);
	}

	return <ReplayWorkspaceLoaded bootstrap={bootstrap} bundle={bundle} />;
}

function ReplayWorkspaceLoaded({
	bootstrap,
	bundle,
}: {
	bootstrap: ReplayAppBootstrap;
	bundle: ReplayBundle;
}) {
	const controller = useReplayController(bundle);
	const {
		toggle,
		nextMarker,
		prevMarker,
		stepForward,
		stepBack,
		restart,
		seek,
		setSpeed,
	} = controller;
	const visibleArtifacts = controller.derivedState.visibleArtifacts;
	const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
	const [artifactViewerOpen, setArtifactViewerOpen] = useState(false);
	const [activeAgentKey, setActiveAgentKey] = useState<string | null>(null);
	const handleSelectAgent = useCallback((action: { type: 'SELECT_AGENT'; agentName: string | null }) => {
		setActiveAgentKey(action.agentName);
	}, []);

	useEffect(() => {
		const handleKeydown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target
				&& ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName)
			) {
				return;
			}
			if (artifactViewerOpen) {
				return;
			}

			if (event.key === ' ') {
				event.preventDefault();
				toggle();
				return;
			}
			if (event.key === 'ArrowRight' && event.shiftKey) {
				event.preventDefault();
				nextMarker();
				return;
			}
			if (event.key === 'ArrowLeft' && event.shiftKey) {
				event.preventDefault();
				prevMarker();
				return;
			}
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				stepForward();
				return;
			}
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				stepBack();
				return;
			}
			if (event.key === '0') {
				event.preventDefault();
				restart();
				return;
			}
			if (event.key === '1') {
				setSpeed(1);
				return;
			}
			if (event.key === '2') {
				setSpeed(2);
				return;
			}
			if (event.key === '5') {
				setSpeed(5);
				return;
			}
			if (event.key === 'Home') {
				event.preventDefault();
				restart();
				return;
			}
			if (event.key === 'End') {
				event.preventDefault();
				seek(controller.state.durationMs);
			}
		};

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	}, [artifactViewerOpen, toggle, nextMarker, prevMarker, stepForward, stepBack, restart, seek, setSpeed, controller.state.durationMs]);

	useEffect(() => {
		const nextSelectedId = resolveSelectedArtifactId(visibleArtifacts, selectedArtifactId);
		const selectionLost = selectedArtifactId != null
			&& !visibleArtifacts.some((artifact) => artifact.id === selectedArtifactId);

		if (selectionLost && artifactViewerOpen) {
			setArtifactViewerOpen(false);
		}

		if (nextSelectedId !== selectedArtifactId) {
			setSelectedArtifactId(nextSelectedId);
		}
	}, [artifactViewerOpen, selectedArtifactId, visibleArtifacts]);

	const selectedArtifact = useMemo(
		() => visibleArtifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null,
		[selectedArtifactId, visibleArtifacts],
	);

	const handleExpandArtifact = useCallback((artifact: ReplayArtifact) => {
		setSelectedArtifactId(artifact.id);
		setArtifactViewerOpen(true);
	}, []);

	const replayStatusText = `${controller.state.status} · ${controller.state.speed}x`;
	const isDemo = bootstrap.isDemo === true;
	const replayTopContent = (
		<ModeBanner
			mode="replay"
			eyebrow={isDemo ? 'Demo Session' : 'Replay mode'}
			title={isDemo ? 'Demo Session — sample data' : 'Recorded session with local playback'}
			description={
				isDemo
					? 'This is sample data from a simulated teamchat session — not a real team session.'
					: 'Scrub, step, and inspect saved artifacts without affecting any other viewer.'
			}
			isDemo={isDemo}
			meta={[
				`${bundle.manifest.eventCount} events`,
				formatReplayStamp(bundle.manifest.startedAt),
				`${bundle.artifacts.length} artifact${bundle.artifacts.length === 1 ? '' : 's'}`,
			]}
		>
			<ReplayControls
				status={controller.state.status}
				speed={controller.state.speed}
				elapsedMs={controller.state.cursor.atMs}
				durationMs={controller.state.durationMs}
				onToggle={controller.toggle}
				onRestart={controller.restart}
				onStepBack={controller.stepBack}
				onStepForward={controller.stepForward}
				onPrevMarker={controller.prevMarker}
				onNextMarker={controller.nextMarker}
				onSpeedChange={controller.setSpeed}
			/>
			<ReplayTimeline
				elapsedMs={controller.state.cursor.atMs}
				durationMs={controller.state.durationMs}
				markers={bundle.markers}
				onSeek={controller.seek}
				onMarkerJump={(marker) => controller.seek(marker.atMs)}
			/>
		</ModeBanner>
	);

	return (
		<TimeProvider nowMs={controller.state.virtualNowMs}>
			<>
				<TeamChatScaffold
					state={{ ...controller.derivedState.chatState, activeAgentKey }}
					mode="replay"
					headerStatusText={replayStatusText}
					topContent={replayTopContent}
					emptyTitle="Replay ready"
					emptyDescription="Press play, step through the session, or scrub the timeline."
					dispatch={handleSelectAgent}
					renderPanels={(onTaskClick, onAgentClick) => [
						<ReplayArtifactPanel
							key="artifacts"
							artifacts={visibleArtifacts}
							artifactBaseUrl={bootstrap.artifactBaseUrl}
							selectedArtifactId={selectedArtifactId}
							onSelectArtifact={setSelectedArtifactId}
							onExpandArtifact={handleExpandArtifact}
						/>,
						<PresenceRoster
							key="presence"
							mode="replay"
							team={controller.derivedState.chatState.team}
							presence={controller.derivedState.chatState.presence}
							threadStatuses={controller.derivedState.chatState.threadStatuses}
							tasks={controller.derivedState.chatState.tasks}
							onAgentClick={onAgentClick}
						/>,
						<TaskSidebar key="tasks" tasks={controller.derivedState.chatState.tasks} onTaskClick={onTaskClick} />,
						<SessionStats
							key="stats"
							events={controller.derivedState.chatState.events}
							tasks={controller.derivedState.chatState.tasks}
							sessionStart={controller.derivedState.chatState.sessionStart}
							memberCount={controller.derivedState.chatState.team?.members.length ?? 0}
						/>,
					]}
				/>
				{artifactViewerOpen && selectedArtifact && (
					<ArtifactViewerModal
						artifact={selectedArtifact}
						artifactBaseUrl={bootstrap.artifactBaseUrl}
						onClose={() => setArtifactViewerOpen(false)}
					/>
				)}
			</>
		</TimeProvider>
	);
}

function TeamChatScaffold({
	state,
	mode,
	headerStatusText,
	headerChildren,
	topContent,
	emptyTitle,
	emptyDescription,
	renderPanels,
	dispatch,
}: {
	state: ChatState;
	mode: 'live' | 'replay';
	headerStatusText: string;
	headerChildren?: React.ReactNode;
	topContent?: React.ReactNode;
	emptyTitle: string;
	emptyDescription: string;
	renderPanels: (onTaskClick: (taskId: string) => void, onAgentClick?: (name: string) => void) => React.ReactNode[];
	dispatch?: (action: { type: 'SELECT_AGENT'; agentName: string | null }) => void;
}) {
	const [workbenchOpen, setWorkbenchOpen] = useState(false);
	const [confettiTriggered, setConfettiTriggered] = useState(false);
	const [showPostMortem, setShowPostMortem] = useState(false);
	const prevAllCompleted = useRef(false);
	const { containerRef, showIndicator, scrollToBottom } = useAutoScroll([
		state.events.length,
	]);

	const postMortem = useMemo(
		() => derivePostMortem(state),
		[state.events, state.tasks, state.threadStatuses, state.suppressionStats],
	);

	const allTasksCompleted = state.events.some(
		(e) => e.type === 'system' && e.subtype === 'all-tasks-completed'
	);

	useEffect(() => {
		if (allTasksCompleted && !prevAllCompleted.current) {
			setConfettiTriggered(true);
			// Auto-show post-mortem 2s after confetti
			const timer = setTimeout(() => setShowPostMortem(true), 2000);
			return () => clearTimeout(timer);
		}
		prevAllCompleted.current = allTasksCompleted;
	}, [allTasksCompleted]);

	const scrollToThread = useCallback((threadKey: string) => {
		const el = document.querySelector(`[data-thread-key="${threadKey}"]`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			const content = el.querySelector('.tc-thread-content');
			if (content && content.getAttribute('data-expanded') !== 'true') {
				const toggle = el.querySelector('.tc-thread-toggle') as HTMLElement;
				if (toggle) toggle.click();
			}
		}
		dispatch?.({ type: 'SELECT_AGENT', agentName: null });
	}, [dispatch]);

	const handleAgentClick = useCallback((name: string) => {
		dispatch?.({ type: 'SELECT_AGENT', agentName: name });
	}, [dispatch]);

	const handleAgentBack = useCallback(() => {
		dispatch?.({ type: 'SELECT_AGENT', agentName: null });
	}, [dispatch]);

	const handleTaskClick = useCallback((taskId: string) => {
		setWorkbenchOpen(false);
		const container = containerRef.current;
		if (!container) return;

		const groupToggle = container.querySelector<HTMLButtonElement>(
			`[data-task-ids~="${taskId}"]`,
		);
		if (groupToggle?.getAttribute('aria-expanded') === 'false') {
			groupToggle.click();
		}

		const targetEl = container.querySelector<HTMLElement>(
			`[data-task-id="${taskId}"], [data-task-ids~="${taskId}"]`,
		);
		if (targetEl) {
			targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			targetEl.classList.add('ring-2', 'ring-indigo-500/50');
			setTimeout(() => {
				targetEl.classList.remove('ring-2', 'ring-indigo-500/50');
			}, 2000);
		}
	}, [containerRef]);
	const desktopPanels = useMemo(
		() => renderPanels(handleTaskClick, dispatch ? handleAgentClick : undefined),
		[handleTaskClick, handleAgentClick, renderPanels, dispatch],
	);
	const sheetPanels = useMemo(
		() => renderPanels(handleTaskClick, dispatch ? handleAgentClick : undefined),
		[handleTaskClick, handleAgentClick, renderPanels, dispatch],
	);
	const onlineCount = getOnlineCount(state);
	const hasEvents = state.events.length > 0;

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

	return (
		<div className={`tc-app-shell is-${mode}`}>
			<Header
				team={state.team}
				connected={mode === 'live' ? state.connected : true}
				onlineCount={onlineCount}
				mode={mode}
				statusText={headerStatusText}
			>
				{headerChildren}
				{postMortem && (
					<button
						type="button"
						className="tc-recap-btn"
						onClick={() => setShowPostMortem(true)}
					>
						View Recap
					</button>
				)}
			</Header>

			{topContent && (
				<div className={`tc-top-content is-${mode}`}>
					{topContent}
				</div>
			)}

			<div className="tc-app-body">
				<section className="tc-thread-pane">
					<div ref={containerRef} className="tc-thread-scroll">
						<div className="tc-thread-column">
							{mode === 'live' && !state.connected && !hasEvents && (
								<StatusPanel
									title="Connecting to server"
									description="Waiting for the live event stream to attach."
									spinner
								/>
							)}

							{((mode === 'live' && state.connected && !hasEvents) || (mode === 'replay' && !hasEvents)) && (
								<StatusPanel
									title={emptyTitle}
									description={emptyDescription}
								/>
							)}

							{mode === 'live' && !state.connected && hasEvents && (
								<div className="tc-status-banner">
									<div className="tc-status-banner-dot" />
									<span>Connection lost. Rejoining the session stream.</span>
								</div>
							)}

							<MessageList
								events={state.events}
								reactions={state.reactions}
								team={state.team?.members}
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
					<div className="tc-rail-frame">
						{state.activeAgentKey && state.team ? (
							<div className="tc-rail-section">
								<AgentProfile
									agentName={state.activeAgentKey}
									team={state.team}
									presence={state.presence}
									threadStatuses={state.threadStatuses}
									tasks={state.tasks}
									onBack={handleAgentBack}
									onThreadClick={scrollToThread}
								/>
							</div>
						) : (
							desktopPanels.map((panel, index) => (
								<div
									key={index}
									className={`tc-rail-section${
										index === 1 ? ' is-growable' : ''
									}${
										index === desktopPanels.length - 1 ? ' is-pinned-bottom' : ''
									}`}
								>
									{panel}
								</div>
							))
						)}
					</div>
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
								<div id="tc-bottom-sheet-title" className="tc-bottom-sheet-title">
									Team panel
								</div>
								<div id="tc-bottom-sheet-description" className="tc-bottom-sheet-subtitle">
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
							<div className="tc-workbench-stack">
								{sheetPanels.map((panel, index) => (
									<div key={index}>{panel}</div>
								))}
							</div>
						</div>
					</div>
				</div>
			)}

			<ConfettiOverlay active={confettiTriggered} />
			{showPostMortem && postMortem && state.team && (
				<SessionPostMortem
					data={postMortem}
					team={state.team}
					onDismiss={() => setShowPostMortem(false)}
				/>
			)}
		</div>
	);
}

function formatReplayStamp(timestamp: string): string {
	return new Date(timestamp).toLocaleString([], {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

function getOnlineCount(state: ChatState): number {
	if (!state.team) {
		return 0;
	}

	return state.team.members.filter((member) => {
		if (member.name === 'team-lead') return true;
		return (state.presence[member.name] ?? 'offline') !== 'offline';
	}).length;
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
