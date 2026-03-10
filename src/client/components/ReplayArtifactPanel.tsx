import React, { useEffect, useMemo, useState } from 'react';
import type { ReplayArtifact } from '../../shared/replay.js';

interface ReplayArtifactPanelProps {
	artifacts: ReplayArtifact[];
	artifactBaseUrl: string;
}

export function ReplayArtifactPanel({
	artifacts,
	artifactBaseUrl,
}: ReplayArtifactPanelProps) {
	const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
	const [previewContent, setPreviewContent] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);

	useEffect(() => {
		if (!selectedArtifactId && artifacts.length > 0) {
			setSelectedArtifactId(artifacts[artifacts.length - 1]!.id);
			return;
		}

		if (selectedArtifactId && !artifacts.some((artifact) => artifact.id === selectedArtifactId)) {
			setSelectedArtifactId(artifacts[artifacts.length - 1]?.id ?? null);
		}
	}, [artifacts, selectedArtifactId]);

	const selectedArtifact = useMemo(
		() => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null,
		[artifacts, selectedArtifactId],
	);

	useEffect(() => {
		setPreviewContent(null);
		setPreviewError(null);

		if (!selectedArtifact) {
			return;
		}

		const mimeType = selectedArtifact.file.mimeType;
		if (
			mimeType.startsWith('text/')
			|| mimeType === 'application/json'
			|| mimeType === 'application/x-ndjson'
		) {
			fetch(`${artifactBaseUrl}/${selectedArtifact.id}`)
				.then(async (response) => {
					if (!response.ok) {
						throw new Error(`Artifact unavailable (${response.status})`);
					}
					return response.text();
				})
				.then((text) => {
					setPreviewContent(text);
				})
				.catch((error) => {
					setPreviewError(error instanceof Error ? error.message : 'Artifact unavailable');
				});
		}
	}, [artifactBaseUrl, selectedArtifact]);

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
								onClick={() => setSelectedArtifactId(artifact.id)}
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
								<a
									href={`${artifactBaseUrl}/${selectedArtifact.id}`}
									target="_blank"
									rel="noreferrer"
									className="tc-replay-button is-subtle"
								>
									Open
								</a>
							</div>
							{selectedArtifact.file.mimeType === 'text/html' ? (
								<iframe
									title={selectedArtifact.title}
									src={`${artifactBaseUrl}/${selectedArtifact.id}`}
									className="tc-artifact-frame"
								/>
							) : previewError ? (
								<div className="tc-sidecard-empty">{previewError}</div>
							) : previewContent != null ? (
								<pre className="tc-artifact-text-preview">
									{previewContent}
								</pre>
							) : (
								<div className="tc-sidecard-empty">
									Preview unavailable. Open the saved artifact instead.
								</div>
							)}
						</div>
					)}
				</>
			)}
		</section>
	);
}
