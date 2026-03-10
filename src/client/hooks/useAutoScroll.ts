import { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';

const SCROLL_THRESHOLD = 100;

export function useAutoScroll(deps: unknown[]) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [showIndicator, setShowIndicator] = useState(false);
	const isNearBottom = useRef(true);

	const snapToBottom = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
		isNearBottom.current = true;
		setShowIndicator(false);
	}, []);

	const checkScroll = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		isNearBottom.current = distanceFromBottom < SCROLL_THRESHOLD;
		setShowIndicator(!isNearBottom.current);
	}, []);

	const scrollToBottom = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
		isNearBottom.current = true;
		setShowIndicator(false);
	}, []);

	useLayoutEffect(() => {
		let frameA = 0;
		let frameB = 0;

		if (isNearBottom.current) {
			frameA = requestAnimationFrame(() => {
				snapToBottom();
				frameB = requestAnimationFrame(() => {
					snapToBottom();
				});
			});
		} else {
			setShowIndicator(true);
		}
		return () => {
			cancelAnimationFrame(frameA);
			cancelAnimationFrame(frameB);
		};
	}, [snapToBottom, ...deps]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		el.addEventListener('scroll', checkScroll, { passive: true });
		return () => el.removeEventListener('scroll', checkScroll);
	}, [checkScroll]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return undefined;

		const observer = new ResizeObserver(() => {
			if (isNearBottom.current) {
				snapToBottom();
			} else {
				checkScroll();
			}
		});

		observer.observe(el);
		if (el.firstElementChild instanceof HTMLElement) {
			observer.observe(el.firstElementChild);
		}

		return () => observer.disconnect();
	}, [checkScroll, snapToBottom]);

	return { containerRef, showIndicator, scrollToBottom };
}
