"use client";

import { track } from "@vercel/analytics";

import { recordUxEvent } from "@/lib/analytics/actions/record-ux-event";
import type { UxEventName } from "@/lib/contracts/ux-analytics";

type TrackableProps = Record<string, string | number | boolean | null>;

function toTrackable(props: Record<string, unknown>): TrackableProps {
  const out: TrackableProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    } else {
      out[key] = JSON.stringify(value).slice(0, 255);
    }
  }
  return out;
}

/**
 * Dual-write UX events: Vercel Analytics `track()` + server persist to
 * `neuramark_ux_events`. Never throws to callers.
 */
export function trackUxEvent(
  event: UxEventName,
  props: Record<string, unknown> = {},
): void {
  const flat = toTrackable(props);
  try {
    track(event, flat);
  } catch {
    // Analytics may be unavailable offline / in test
  }
  void recordUxEvent({ event, props: flat }).catch(() => {
    // best-effort
  });
}

export function detectApprovalDevice(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  try {
    if (window.matchMedia("(pointer: coarse)").matches) {
      return "mobile";
    }
  } catch {
    // ignore
  }
  const ua = navigator.userAgent || "";
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}
