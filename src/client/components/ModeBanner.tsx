import React from 'react';

interface ModeBannerProps {
	mode: 'live' | 'replay';
	eyebrow: string;
	title: string;
	description: string;
	meta?: string[];
	isDemo?: boolean;
	children?: React.ReactNode;
}

export function ModeBanner({
	mode,
	eyebrow,
	title,
	description,
	meta = [],
	isDemo = false,
	children,
}: ModeBannerProps) {
	const modeClass = isDemo ? 'is-demo' : `is-${mode}`;
	const ariaLabel = isDemo ? 'demo session banner' : `${mode} session banner`;

	return (
		<section className={`tc-mode-banner ${modeClass}`} aria-label={ariaLabel}>
			<div className="tc-mode-banner-head">
				<div className="tc-mode-banner-copy">
					<div className="tc-mode-banner-eyebrow">{eyebrow}</div>
					<h2 className="tc-mode-banner-title">{title}</h2>
					<p className="tc-mode-banner-description">{description}</p>
				</div>
				{meta.length > 0 && (
					<div className="tc-mode-banner-meta" aria-label={isDemo ? 'demo session metadata' : `${mode} session metadata`}>
						{meta.map((item) => (
							<span key={item} className="tc-mode-chip">
								{item}
							</span>
						))}
					</div>
				)}
			</div>
			{children ? <div className="tc-mode-banner-body">{children}</div> : null}
		</section>
	);
}
