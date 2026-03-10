import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayArtifact } from '../../shared/replay.js';
import {
	formatArtifactDocumentText,
	getArtifactPreviewMode,
} from '../artifacts.js';

interface ArtifactViewerModalProps {
	artifact: ReplayArtifact;
	artifactBaseUrl: string;
	onClose: () => void;
}

export function ArtifactViewerModal({
	artifact,
	artifactBaseUrl,
	onClose,
}: ArtifactViewerModalProps) {
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const closeButtonRef = useRef<HTMLButtonElement | null>(null);
	const previewMode = getArtifactPreviewMode(artifact.file.mimeType);
	const artifactUrl = `${artifactBaseUrl}/${artifact.id}`;

	useEffect(() => {
		closeButtonRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
			}
		};

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	}, [onClose]);

	useEffect(() => {
		if (previewMode !== 'text' && previewMode !== 'json') {
			setContent(null);
			setError(null);
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setContent(null);
		setError(null);

		fetch(artifactUrl)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Artifact unavailable (${response.status})`);
				}
				return response.text();
			})
			.then((text) => {
				if (!cancelled) {
					setContent(formatArtifactDocumentText(artifact.file.mimeType, text));
					setLoading(false);
				}
			})
			.catch((fetchError) => {
				if (!cancelled) {
					setError(fetchError instanceof Error ? fetchError.message : 'Artifact unavailable');
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [artifact.file.mimeType, artifactUrl, previewMode]);

	const body = useMemo(() => {
		if (previewMode === 'html') {
			return (
				<iframe
					title={artifact.title}
					src={artifactUrl}
					className="tc-artifact-modal-frame"
				/>
			);
		}

		if (previewMode === 'text' || previewMode === 'json') {
			if (loading) {
				return <div className="tc-sidecard-empty">Loading artifact preview…</div>;
			}
			if (error) {
				return <div className="tc-sidecard-empty">{error}</div>;
			}
			if (content != null) {
				return (
					<pre className="tc-artifact-modal-text">
						{content}
					</pre>
				);
			}
		}

		return (
			<div className="tc-sidecard-empty">
				This artifact type is not rendered in-app yet. Open it in a new tab instead.
			</div>
		);
	}, [artifact.title, artifactUrl, content, error, loading, previewMode]);

	return (
		<div className="tc-artifact-modal-backdrop" onClick={onClose}>
			<div
				className="tc-artifact-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="tc-artifact-modal-title"
				aria-describedby="tc-artifact-modal-description"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="tc-artifact-modal-header">
					<div className="tc-artifact-modal-copy">
						<div className="tc-artifact-modal-kicker">Artifact viewer</div>
						<div id="tc-artifact-modal-title" className="tc-artifact-modal-title">
							{artifact.title}
						</div>
						<div id="tc-artifact-modal-description" className="tc-artifact-modal-meta">
							{artifact.file.mimeType}
						</div>
					</div>
					<div className="tc-artifact-modal-actions">
						<a
							href={artifactUrl}
							target="_blank"
							rel="noreferrer"
							className="tc-replay-button is-subtle"
						>
							Open in new tab
						</a>
						<button
							ref={closeButtonRef}
							type="button"
							className="tc-replay-button"
							onClick={onClose}
						>
							Close
						</button>
					</div>
				</div>
				<div className="tc-artifact-modal-body">
					{body}
				</div>
			</div>
		</div>
	);
}
