import express from "express";
import type { ErrorRequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { AppError } from "./errors.js";
import {
  createAuthenticationMiddleware,
  createDeviceSessionAuthentication,
  requirePrincipal,
} from "./auth.js";

const token = "a".repeat(64);

function testApp(now: () => Date) {
  const sessions = createDeviceSessionAuthentication(token, {
    now,
    lifetimeSeconds: 60,
    createNonce: () => "controlled-nonce",
  });
  const app = express();
  app.post(
    "/pair",
    createAuthenticationMiddleware(sessions.pairAuthenticator),
    (incoming, response) => {
      response.setHeader("Set-Cookie", sessions.issueCookie(incoming));
      response.status(204).end();
    },
  );
  app.get(
    "/protected",
    createAuthenticationMiddleware(sessions.authenticate),
    (incoming, response) => {
      response
        .status(200)
        .json({ subject: requirePrincipal(incoming).subject });
    },
  );
  app.delete("/pair", (incoming, response) => {
    response.setHeader("Set-Cookie", sessions.clearCookie(incoming));
    response.status(204).end();
  });
  const errors: ErrorRequestHandler = (
    error: unknown,
    _incoming,
    response,
    next,
  ) => {
    void next;
    const status = error instanceof AppError ? error.status : 500;
    response.status(status).json({ status });
  };
  app.use(errors);
  return app;
}

describe("HttpOnly QCTP device sessions", () => {
  it("exchanges the pairing bearer for a same-site cookie and authenticates after app relaunch", async () => {
    const app = testApp(() => new Date("2026-08-17T20:00:00.000Z"));
    const paired = await request(app)
      .post("/pair")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
    const cookie = paired.headers["set-cookie"]?.[0];

    expect(cookie).toContain("qctp_device_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api");
    expect(cookie).toContain("Max-Age=60");
    expect(cookie).not.toContain("Secure");

    await request(app)
      .get("/protected")
      .set("Cookie", cookie ?? "")
      .expect(200, { subject: "qctp-single-user" });
  });

  it("sets Secure on a private HTTPS-facing hostname and supports explicit disconnect", async () => {
    const app = testApp(() => new Date("2026-08-17T20:00:00.000Z"));
    const paired = await request(app)
      .post("/pair")
      .set("Host", "qctp.private.example")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
    expect(paired.headers["set-cookie"]?.[0]).toContain("Secure");

    const cleared = await request(app)
      .delete("/pair")
      .set("Host", "qctp.private.example")
      .expect(204);
    expect(cleared.headers["set-cookie"]?.[0]).toContain("Max-Age=0");
    expect(cleared.headers["set-cookie"]?.[0]).toContain("Secure");
  });

  it("rejects missing, tampered, and expired sessions", async () => {
    let clock = new Date("2026-08-17T20:00:00.000Z");
    const app = testApp(() => clock);
    await request(app).get("/protected").expect(401);

    const paired = await request(app)
      .post("/pair")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
    const cookie = paired.headers["set-cookie"]?.[0] ?? "";
    await request(app)
      .get("/protected")
      .set("Cookie", cookie.replace("controlled-nonce", "changed-nonce"))
      .expect(401);

    clock = new Date("2026-08-17T20:01:01.000Z");
    await request(app).get("/protected").set("Cookie", cookie).expect(401);
  });

  it("never permits a session cookie to pair another device", async () => {
    const app = testApp(() => new Date("2026-08-17T20:00:00.000Z"));
    const paired = await request(app)
      .post("/pair")
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
    await request(app)
      .post("/pair")
      .set("Cookie", paired.headers["set-cookie"]?.[0] ?? "")
      .expect(401);
  });
});
