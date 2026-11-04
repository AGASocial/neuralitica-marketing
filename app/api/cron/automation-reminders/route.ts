import { handleAutomationRemindersCron } from "@/lib/automation/handle-automation-reminders-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return handleAutomationRemindersCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleAutomationRemindersCron(request);
}
