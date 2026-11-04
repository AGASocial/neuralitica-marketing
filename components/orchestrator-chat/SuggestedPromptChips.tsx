"use client";

import type { SuggestedPromptChip } from "@/lib/orchestrator-chat/select-suggested-prompt-chips";

export type SuggestedPromptChipsCopy = {
  listAriaLabel: string;
};

type SuggestedPromptChipsProps = {
  chips: SuggestedPromptChip[];
  copy: SuggestedPromptChipsCopy;
  onSelect: (chip: SuggestedPromptChip) => void;
  disabled?: boolean;
};

/**
 * Suggested prompt chips, ≥44px taps.
 * Mobile: single row, swipeable, scrollbar hidden, right-edge fade.
 * Desktop (md+): wraps onto at most 2 lines (overflow clipped), no scrollbar.
 */
export function SuggestedPromptChips({
  chips,
  copy,
  onSelect,
  disabled = false,
}: SuggestedPromptChipsProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div
      className="-mx-1 overflow-x-auto overscroll-x-contain px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_85%,transparent)] md:overflow-visible md:[mask-image:none]"
      role="group"
      aria-label={copy.listAriaLabel}
    >
      <ul className="flex min-w-0 flex-nowrap gap-2 pb-1 md:max-h-[6.25rem] md:flex-wrap md:overflow-hidden">
        {chips.map((chip) => (
          <li key={chip.id} className="max-w-[min(100%,18rem)] shrink-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(chip)}
              className="inline-flex min-h-11 max-w-full items-center rounded-lg border border-edge bg-panel/60 px-3 py-2 text-left text-sm text-fog transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fog/40 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="truncate">{chip.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
