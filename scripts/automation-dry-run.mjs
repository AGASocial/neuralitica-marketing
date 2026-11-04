#!/usr/bin/env node
/**
 * KAN-108 F0 dry-run: evaluate pending approvals against automation rules
 * without approving, spending, or publishing.
 *
 * Usage (from repo root, with env loaded for Supabase):
 *   node --env-file=.env.local scripts/automation-dry-run.mjs
 *   # or rely on linked supabase + service role in process env
 *
 * Never calls decideApproval. Never touches Instagram.
 */
import { createClient } from "@supabase/supabase-js";

function shouldAutoApprove(settings, itemCostCents, weeklySpendCents) {
  if (!settings || settings.preset === "review_all") return false;
  if (settings.preset !== "auto_pilot") return false;
  const maxItem = settings.max_auto_approve_cost_cents;
  if (maxItem != null && (itemCostCents == null || itemCostCents > maxItem)) {
    return false;
  }
  const weeklyCap = settings.weekly_spend_cap_cents;
  if (weeklyCap != null) {
    const next = (weeklySpendCents ?? 0) + (itemCostCents ?? 0);
    if (next > weeklyCap) return false;
  }
  return true;
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "Missing SUPABASE_URL or SUPABASE_SECRET_KEY",
          note: "Dry-run aborted; no mutations attempted.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pending, error } = await supabase
    .from("neuramark_approvals")
    .select("id, client_id, created_at, status")
    .eq("status", "pending_client")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.log(
      JSON.stringify(
        { ok: false, error: error.message, code: error.code },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const rows = pending ?? [];
  const results = [];

  for (const row of rows) {
    const { data: settings } = await supabase
      .from("neuramark_automation_settings")
      .select("*")
      .eq("client_id", row.client_id)
      .maybeSingle();

    const preset = settings?.preset ?? "review_all";
    const eligible = shouldAutoApprove(settings, null, null);
    results.push({
      approvalId: row.id,
      clientId: row.client_id,
      createdAt: row.created_at,
      preset,
      decision: eligible ? "would_auto_approve" : "notify",
      dryRun: true,
      executedApproval: false,
      publishedInstagram: false,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned: results.length,
        wouldAutoApprove: results.filter((r) => r.decision === "would_auto_approve")
          .length,
        wouldNotify: results.filter((r) => r.decision === "notify").length,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exitCode = 1;
});
