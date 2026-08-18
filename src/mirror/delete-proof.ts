import { z } from "zod";

const GatewayRequestIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

const VerifiedMirrorAbsenceSchema = z
  .object({
    error: z
      .object({
        code: z.literal("JOB_NOT_FOUND"),
        message: z.literal("The Mirror job was not found."),
        retryable: z.literal(false),
        requestId: GatewayRequestIdSchema,
      })
      .strict(),
  })
  .strict();

/**
 * Accepts only an application response that proves the Mirror router handled
 * the deletion. Generic reverse-proxy 204/404 responses are deliberately not
 * evidence that a PX13 artifact is absent.
 */
export async function readVerifiedMirrorDeletionResponse(
  response: Response,
): Promise<"deleted" | "not_found" | null> {
  const requestId = GatewayRequestIdSchema.safeParse(
    response.headers.get("X-Request-Id"),
  );
  if (!requestId.success) return null;
  if (response.status === 204) return "deleted";
  if (response.status !== 404) return null;
  if (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLocaleLowerCase() !== "application/json"
  ) {
    return null;
  }
  try {
    const absence = VerifiedMirrorAbsenceSchema.parse(await response.json());
    return absence.error.requestId === requestId.data ? "not_found" : null;
  } catch {
    return null;
  }
}
