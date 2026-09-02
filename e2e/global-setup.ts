import { assertInterviewSubmitSchema, snapshotInterviewState } from "./helpers/interview-db";

export default async function globalSetup(): Promise<void> {
  await assertInterviewSubmitSchema();
  await snapshotInterviewState();
}
