import "server-only";

import type { ContentStrategyView } from "@/lib/contracts/content-strategy";
import type { ContentStrategyRow } from "@/lib/content-strategy/map-strategy-row";
import { loadClientDisplayName } from "@/lib/content-strategy/load-client-display-name";
import {
  isStrategyLockAfterScriptsEnabled,
  strategyHasScripts,
} from "@/lib/content-strategy/strategy-has-scripts";

export async function toContentStrategyView(
  row: ContentStrategyRow,
): Promise<ContentStrategyView> {
  const locked = await strategyHasScripts(row.id);
  const isEditable = row.status === "draft" && !(locked && isStrategyLockAfterScriptsEnabled());

  const view: ContentStrategyView = {
    id: row.id,
    clientId: row.clientId,
    weekStart: row.weekStart,
    version: row.version,
    status: row.status,
    brief: row.brief,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isEditable,
  };

  if (row.status === "approved" && row.approvedBy && row.approvedAt) {
    const displayName = (await loadClientDisplayName(row.approvedBy)) ?? "Operator";
    view.approvedBy = {
      id: row.approvedBy,
      displayName,
    };
    view.approvedAt = row.approvedAt;
  }

  return view;
}
