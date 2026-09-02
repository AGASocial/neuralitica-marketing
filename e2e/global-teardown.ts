import { restoreInterviewState } from "./helpers/interview-db";

export default async function globalTeardown(): Promise<void> {
  await restoreInterviewState();
}
