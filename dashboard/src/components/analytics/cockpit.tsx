import { useEffect, useState, type RefObject } from "react";

/**
 * "Cockpit mode": the Analytics page fits one screen with no page scroll.
 * Only on windows that are both wide AND tall enough; everywhere else the page
 * scrolls and cards take their natural (or explicit) height.
 * Keep in sync with the `[@media(min-width:1024px)_and_(min-height:760px)]:` classes.
 */
export const COCKPIT_QUERY = "(min-width: 1024px) and (min-height: 760px)";

/** True while the media query matches; updates when the window is resized. */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

export function useCockpitMode(): boolean {
  return useMediaQuery(COCKPIT_QUERY);
}

/** Height (px) of an element, kept up to date with a ResizeObserver. */
export function useElementHeight(ref: RefObject<HTMLElement | null>, enabled = true): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setHeight(Math.floor(entry.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return height;
}
