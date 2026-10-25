import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { legalRoutes } from "../src/routes/legal.ts";

describe("public legal pages", () => {
  it.each([
    ["/privacy", "Privacy Policy"],
    ["/data-deletion", "Data Deletion Instructions"],
  ])("GET %s serves HTML without auth", async (url, heading) => {
    const app = Fastify();
    await app.register(legalRoutes);
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain(heading);
    expect(res.body).toContain("ansifansif777@gmail.com");
    await app.close();
  });
});
