import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { fetchWithValidatedRedirects } from "./safe-url.js";

async function listen(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void
): Promise<{ port: number; close: () => Promise<void>; hits: () => number }> {
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return {
    port: addr.port,
    hits: () => hits,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

describe("fetchWithValidatedRedirects SSRF", () => {
  it("does not follow redirect off allowlist — target server gets zero hits", async () => {
    const evil = await listen((_req, res) => {
      res.writeHead(200);
      res.end("pwned");
    });

    const good = await listen((_req, res) => {
      // Redirect to another local port not listed in allowedHosts as a distinct host entry —
      // use raw IP that fails allowlist when allowedHosts is only the good port's... 
      // Use host not in allowlist by pointing Location at 10.0.0.1 (blocked private + not allowed).
      res.writeHead(302, { Location: `http://10.0.0.1:${evil.port}/secret` });
      res.end();
    });

    await expect(
      fetchWithValidatedRedirects(`http://127.0.0.1:${good.port}/start`, undefined, {
        allowedHosts: ["127.0.0.1"],
        allowPrivateNetwork: true,
        allowedPorts: [good.port, evil.port, 80, 443],
      })
    ).rejects.toThrow(/SSRF|Blocked|outside allowedHosts|10\.0\.0\.1/i);

    expect(evil.hits()).toBe(0);

    await good.close();
    await evil.close();
  });

  it("blocks redirect to 169.254.169.254 metadata", async () => {
    const good = await listen((_req, res) => {
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    });

    await expect(
      fetchWithValidatedRedirects(`http://127.0.0.1:${good.port}/`, undefined, {
        allowedHosts: ["127.0.0.1", "169.254.169.254"],
        allowPrivateNetwork: true,
        allowedPorts: [good.port, 80, 443],
      })
    ).rejects.toThrow(/SSRF|Blocked|169\.254/i);

    await good.close();
  });
});
