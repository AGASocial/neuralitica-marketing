import { runAutomationReminders } from "@/lib/automation/run-reminders";
import { verifyCronSecret } from "@/lib/orchestration/verify-cron-secret";

const headers = { "Cache-Control": "no-store" };

export type AutomationRemindersCronDependencies = {
  verify: typeof verifyCronSecret;
  run: typeof runAutomationReminders;
};

const defaults: AutomationRemindersCronDependencies = {
  verify: verifyCronSecret,
  run: runAutomationReminders,
};

export async function handleAutomationRemindersCron(
  request: Request,
  dependencies: AutomationRemindersCronDependencies = defaults,
): Promise<Response> {
  const auth = dependencies.verify(request);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers },
    );
  }
  const result = await dependencies.run();
  return Response.json({ ok: true, ...result }, { status: 200, headers });
}
