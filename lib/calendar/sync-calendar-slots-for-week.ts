import "server-only";

import type { ContentStrategyBrief } from "@/lib/contracts/content-strategy";
import { contentStrategyBriefSchema } from "@/lib/contracts/content-strategy";
import type { CalendarPublishStatus } from "@/lib/contracts/calendar";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { loadOperatorClientsForStrategy } from "@/lib/content-strategy/load-operator-clients-for-strategy";
import { mapSlotScheduledDate } from "@/lib/calendar/map-slot-scheduled-date";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const CALENDAR_SLOTS_TABLE = "neuramark_content_calendar_slots" as const;

export type SyncCalendarSlotsForWeekResult = {
  clientsSynced: number;
  clientsWithoutApprovedStrategyCount: number;
  slotsUpserted: number;
  slotsDeleted: number;
};

type ExistingSlotRow = {
  slotIndex: number;
  publishStatus: CalendarPublishStatus;
};

async function loadReelScriptIdsForStrategy(params: {
  clientId: string;
  strategyId: string;
  slotIndexes: number[];
}): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!isSupabaseConfigured() || params.slotIndexes.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("id, slot_index")
    .eq("client_id", params.clientId)
    .eq("strategy_id", params.strategyId)
    .in("slot_index", params.slotIndexes);

  if (error || !data) {
    return result;
  }

  for (const raw of data) {
    const row = raw as { id?: unknown; slot_index?: unknown };
    if (typeof row.id === "string" && typeof row.slot_index === "number") {
      result.set(row.slot_index, row.id);
    }
  }

  return result;
}

async function loadExistingSlotsForClientWeek(params: {
  clientId: string;
  weekStart: string;
}): Promise<Map<number, ExistingSlotRow>> {
  const result = new Map<number, ExistingSlotRow>();
  if (!isSupabaseConfigured()) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(CALENDAR_SLOTS_TABLE)
    .select("slot_index, publish_status")
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart);

  if (error || !data) {
    return result;
  }

  for (const raw of data) {
    const row = raw as { slot_index?: unknown; publish_status?: unknown };
    if (typeof row.slot_index !== "number") {
      continue;
    }
    const publishStatus =
      row.publish_status === "published" ? "published" : "ready";
    result.set(row.slot_index, { slotIndex: row.slot_index, publishStatus });
  }

  return result;
}

function parseBrief(brief: unknown): ContentStrategyBrief | null {
  const parsed = contentStrategyBriefSchema.safeParse(brief);
  return parsed.success ? parsed.data : null;
}

/**
 * Idempotent sync from latest approved strategies for all active clients (US-12.1).
 * Operator-only caller — never accept client_id filter.
 */
export async function syncCalendarSlotsForWeek(
  weekStart: string,
): Promise<SyncCalendarSlotsForWeekResult> {
  const stats: SyncCalendarSlotsForWeekResult = {
    clientsSynced: 0,
    clientsWithoutApprovedStrategyCount: 0,
    slotsUpserted: 0,
    slotsDeleted: 0,
  };

  if (!isSupabaseConfigured()) {
    return stats;
  }

  const clients = await loadOperatorClientsForStrategy();
  const supabase = createServerSupabaseClient();

  for (const client of clients) {
    const approved = await getApprovedStrategyForWeek({
      clientId: client.id,
      weekStart,
    });

    if (!approved || approved.status !== "approved") {
      stats.clientsWithoutApprovedStrategyCount += 1;
      continue;
    }

    const brief = parseBrief(approved.brief);
    if (!brief) {
      stats.clientsWithoutApprovedStrategyCount += 1;
      continue;
    }

    stats.clientsSynced += 1;

    const slotIndexes = brief.slots.map((slot) => slot.slotIndex);
    const scriptIdsBySlot = await loadReelScriptIdsForStrategy({
      clientId: client.id,
      strategyId: approved.id,
      slotIndexes,
    });
    const existingBySlot = await loadExistingSlotsForClientWeek({
      clientId: client.id,
      weekStart,
    });

    const currentSlotIndexSet = new Set(slotIndexes);

    for (const slot of brief.slots) {
      const scheduledDate = mapSlotScheduledDate({
        weekStart,
        slotIndex: slot.slotIndex,
        dayOfWeek: slot.dayOfWeek,
      });
      const reelScriptId = scriptIdsBySlot.get(slot.slotIndex) ?? null;
      const existing = existingBySlot.get(slot.slotIndex);

      if (existing) {
        const { error } = await supabase
          .from(CALENDAR_SLOTS_TABLE)
          .update({
            strategy_id: approved.id,
            scheduled_date: scheduledDate,
            reel_script_id: reelScriptId,
          })
          .eq("client_id", client.id)
          .eq("week_start", weekStart)
          .eq("slot_index", slot.slotIndex);

        if (!error) {
          stats.slotsUpserted += 1;
        }
      } else {
        const { error } = await supabase.from(CALENDAR_SLOTS_TABLE).insert({
          client_id: client.id,
          week_start: weekStart,
          scheduled_date: scheduledDate,
          slot_index: slot.slotIndex,
          strategy_id: approved.id,
          reel_script_id: reelScriptId,
          publish_status: "ready",
          published_at: null,
          instagram_post_url: null,
        });

        if (!error) {
          stats.slotsUpserted += 1;
        }
      }
    }

    for (const [slotIndex] of existingBySlot) {
      if (!currentSlotIndexSet.has(slotIndex)) {
        const { error } = await supabase
          .from(CALENDAR_SLOTS_TABLE)
          .delete()
          .eq("client_id", client.id)
          .eq("week_start", weekStart)
          .eq("slot_index", slotIndex);

        if (!error) {
          stats.slotsDeleted += 1;
        }
      }
    }
  }

  return stats;
}
