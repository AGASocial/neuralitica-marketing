/**
 * Pure helpers for orchestrator chat composer keyboard + autosize.
 */

export type ComposerKeyLike = {
  key: string;
  shiftKey: boolean;
  /** Legacy IME signal (229) still used by some browsers during composition. */
  keyCode?: number;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
};

export type ComposerSendGuards = {
  busy: boolean;
  hasText: boolean;
};

/**
 * Whether Enter should submit the chat composer.
 * Shift+Enter → newline; IME composing / keyCode 229 → ignore;
 * empty or busy → do not send.
 */
export function shouldSendOnEnterKey(
  event: ComposerKeyLike,
  guards: ComposerSendGuards,
): boolean {
  if (event.key !== "Enter") {
    return false;
  }
  if (event.shiftKey) {
    return false;
  }
  const composing =
    event.nativeEvent?.isComposing === true ||
    event.keyCode === 229 ||
    event.nativeEvent?.keyCode === 229;
  if (composing) {
    return false;
  }
  if (guards.busy || !guards.hasText) {
    return false;
  }
  return true;
}

const COMPOSER_TEXTAREA_MAX_PX = 160;

/** Grow/shrink a chat textarea to its content up to a max height. */
export function autosizeComposerTextarea(
  el: HTMLTextAreaElement | null,
  maxPx = COMPOSER_TEXTAREA_MAX_PX,
): void {
  if (!el) {
    return;
  }
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
}
