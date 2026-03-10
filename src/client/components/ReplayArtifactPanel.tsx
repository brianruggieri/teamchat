import React, { useEffect, useMemo, useState } from 'react';
import type { ReplayArtifact } from '../../shared/replay.js';
import {
	formatArtifactDocumentText,
	getArtifactPreviewKicker,
	getArtifactPreviewMode,
	getArtifactRailExcerpt,
} from '../artifacts.js';

interface ReplayArtifactPanelProps {
	artifacts: ReplayArtifact[];
	artifactBaseUrl: string;
	selectedArtifactId: string | null;
	onSelectArtifact: (artifactId: string) => void;
	onExpandArtifact: (artifact: ReplayArtifact) => void;
}

export function ReplayArtifactPanel({
	artifacts,
	artifactBaseUrl,
	selectedArtifactId,
	onSelectArtifact,
	onExpandArtifact,
}: ReplayArtifactPanelProps) {
	const [previewContent, setPreviewContent] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);

	const selectedArtifact = useMemo(
		() => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null,
		[artifacts, selectedArtifactId],
	);
	const previewMode = selectedArtifact
		? getArtifactPreviewMode(selectedArtifact.file.mimeType)
		: 'external';
	const summaryExcerpt = selectedArtifact
		? getArtifactRailExcerpt(selectedArtifact, previewContent)
		: null;

	useEffect(() => {
		setPreviewContent(null);
		setPreviewError(null);

		if (!selectedArtifact) {
			return;
		}

		if (previewMode === 'text' || previewMode === 'json') {
			let cancelled = false;

			fetch(`${artifactBaseUrl}/${selectedArtifact.id}`)
				.then(async (response) => {
					if (!response.ok) {
						throw new Error(`Artifact unavailable (${response.status})`);
					}
					return response.text();
				})
				.then((text) => {
					if (!cancelled) {
						setPreviewContent(
							formatArtifactDocumentText(selectedArtifact.file.mimeType, text),
						);
					}
				})
				.catch((error) => {
					if (!cancelled) {
						setPreviewError(error instanceof Error ? error.message : 'Artifact unavailable');
					}
				});

			return () => {
				cancelled = true;
			};
		}
	}, [artifactBaseUrl, previewMode, selectedArtifact]);

	return (
		<section className="tc-sidecard tc-artifact-panel">
			<div className="tc-sidecard-header">
				<h3 className="tc-sidecard-title">Artifacts</h3>
				<span className="tc-sidecard-metric">{artifacts.length}</span>
			</div>
			{artifacts.length === 0 ? (
				<div className="tc-sidecard-empty">
					Reports and saved outputs appear here once replay reaches them.
				</div>
			) : (
				<>
					<div className="tc-artifact-list">
						{artifacts.map((artifact) => (
							<button
								key={artifact.id}
								type="button"
								className={`tc-artifact-item ${artifact.id === selectedArtifact?.id ? 'is-active' : ''}`}
								onClick={() => onSelectArtifact(artifact.id)}
							>
								<div className="tc-artifact-title">{artifact.title}</div>
								<div className="tc-artifact-meta">{artifact.summary ?? artifact.kind}</div>
							</button>
						))}
					</div>
					{selectedArtifact && (
						<div className="tc-artifact-preview">
							<div className="tc-artifact-preview-header">
								<div>
									<div className="tc-artifact-preview-title">{selectedArtifact.title}</div>
									<div className="tc-artifact-preview-meta">
										{selectedArtifact.file.mimeType}
									</div>
								</div>
							</div>
							<div className={`tc-artifact-summary-card is-${previewMode}`}>
								<div className="tc-artifact-summary-kicker">
									{getArtifactPreviewKicker(previewMode)}
								</div>
								<div className="tc-artifact-summary-body">
									{previewError ? (
										<div className="tc-sidecard-empty">{previewError}</div>
									) : previewMode === 'external' ? (
										<p className="tc-artifact-summary-text">
											Preview this artifact in a new tab. Binary and unsupported types are not rendered in-app yet.
										</p>
									) : (
										<p className="tc-artifact-summary-text">
											{summaryExcerpt}
										</p>
									)}
								</div>
								<div className="tc-artifact-summary-actions">
									{previewMode !== 'external' && (
										<button
											type="button"
											className="tc-replay-button"
											onClick={() => onExpandArtifact(selectedArtifact)}
										>
											Expand
										</button>
									)}
									<a
										href={`${artifactBaseUrl}/${selectedArtifact.id}`}
										target="_blank"
										rel="noreferrer"
										className="tc-replay-button is-subtle"
									>
										Open
									</a>
								</div>
							</div>
						</div>
					)}
				</>
			)}
		</section>
	);
}
