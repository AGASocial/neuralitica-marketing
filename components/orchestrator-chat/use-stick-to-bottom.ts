"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type UIEventHandler,
} from "react";

import {
  STICK_TO_BOTTOM_THRESHOLD_PX,
  isNearBottom,
  shouldAutoScroll,
} from "@/lib/orchestrator-chat/stick-to-bottom";

export type UseStickToBottomOptions = {
  thresholdPx?: number;
  /** Content fingerprint — when it changes, scroll if stuck (or force). */
  contentKey?: string | number;
};

export type UseStickToBottomResult = {
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Inner content wrapper — ResizeObserver target for streaming/card growth. */
  contentRef: RefObject<HTMLDivElement | null>;
  isStuck: boolean;
  onScroll: UIEventHandler<HTMLDivElement>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Force stick (e.g. user sent a message). */
  stickOnSend: () => void;
};

/**
 * Stick-to-bottom for a chat transcript: auto-scroll on new content while near
 * the bottom; pause when the user scrolls up; resume when they return.
 */
export function useStickToBottom(
  options: UseStickToBottomOptions = {},
): UseStickToBottomResult {
  const thresholdPx = options.thresholdPx ?? STICK_TO_BOTTOM_THRESHOLD_PX;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stuckRef = useRef(true);
  const forceNextRef = useRef(false);
  const [isStuck, setIsStuck] = useState(true);

  const setStuck = useCallback((next: boolean) => {
    stuckRef.current = next;
    setIsStuck(next);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      el.scrollTo({ top: el.scrollHeight, behavior });
      setStuck(true);
    },
    [setStuck],
  );

  const stickOnSend = useCallback(() => {
    forceNextRef.current = true;
    setStuck(true);
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [setStuck]);

  const onScroll: UIEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      const el = event.currentTarget;
      setStuck(isNearBottom(el, thresholdPx));
    },
    [setStuck, thresholdPx],
  );

  const applyStick = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const force = forceNextRef.current;
    if (!shouldAutoScroll({ force, stuck: stuckRef.current })) {
      return;
    }
    forceNextRef.current = false;
    el.scrollTop = el.scrollHeight;
    setStuck(true);
  }, [setStuck]);

  useEffect(() => {
    applyStick();
  }, [options.contentKey, applyStick]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (stuckRef.current || forceNextRef.current) {
        applyStick();
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [applyStick]);

  return {
    scrollRef,
    contentRef,
    isStuck,
    onScroll,
    scrollToBottom,
    stickOnSend,
  };
}
