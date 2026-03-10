import { useRef, useEffect, useState, useCallback } from 'react';

const SCROLL_THRESHOLD = 100;

export function useAutoScroll(deps: unknown[]) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [showIndicator, setShowIndicator] = useState(false);
	const isNearBottom = useRef(true);

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
		setShowIndicator(false);
	}, []);

	useEffect(() => {
		if (isNearBottom.current) {
			const el = containerRef.current;
			if (el) {
				el.scrollTop = el.scrollHeight;
			}
		} else {
			setShowIndicator(true);
		}
	}, deps);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		el.addEventListener('scroll', checkScroll, { passive: true });
		return () => el.removeEventListener('scroll', checkScroll);
	}, [checkScroll]);

	return { containerRef, showIndicator, scrollToBottom };
}
