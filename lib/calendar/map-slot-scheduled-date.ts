import type { ContentStrategyDayOfWeek } from "@/lib/contracts/content-strategy";

const DAY_OFFSET: Record<ContentStrategyDayOfWeek, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/**
 * Maps an approved strategy slot to a calendar column date (US-12.1).
 * Uses dayOfWeek when present; otherwise Mon/Wed/Fri/Sun pattern by slotIndex.
 */
export function mapSlotScheduledDate(params: {
  weekStart: string;
  slotIndex: number;
  dayOfWeek?: ContentStrategyDayOfWeek;
}): string {
  const offsetDays =
    params.dayOfWeek !== undefined
      ? DAY_OFFSET[params.dayOfWeek]
      : Math.min(params.slotIndex * 2, 6);

  const start = new Date(`${params.weekStart}T12:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + offsetDays);
  return start.toISOString().slice(0, 10);
}
