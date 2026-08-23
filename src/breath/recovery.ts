import type { QctpRepository } from "../data";

export async function recoverInterruptedBreathSessions(
  repository: QctpRepository,
  now = new Date().toISOString(),
): Promise<string[]> {
  const sessions = await repository.listBreathSessions();
  const interrupted: string[] = [];
  for (const session of sessions) {
    if (session.status !== "in_progress") continue;
    await repository.saveBreathSession({
      ...session,
      status: "interrupted",
      updatedAt: now,
    });
    interrupted.push(session.id);
  }
  return interrupted;
}
