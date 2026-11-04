/** Distance (px) from the bottom within which we treat the user as "stuck". */
export const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/** How far the viewport is from the scrollable bottom (never negative). */
export function distanceFromBottom(el: ScrollMetrics): number {
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}

/** True when the user is within `thresholdPx` of the bottom. */
export function isNearBottom(
  el: ScrollMetrics,
  thresholdPx: number = STICK_TO_BOTTOM_THRESHOLD_PX,
): boolean {
  return distanceFromBottom(el) <= thresholdPx;
}

/**
 * Whether content growth should auto-scroll.
 * Force (e.g. user just sent) always sticks; otherwise only if already stuck.
 */
export function shouldAutoScroll(options: {
  force?: boolean;
  stuck: boolean;
}): boolean {
  return options.force === true || options.stuck;
}
