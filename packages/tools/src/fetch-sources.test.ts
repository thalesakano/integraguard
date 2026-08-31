import { describe, expect, it } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { loadDocumentationSource } from "./fetch-sources.js";

describe("loadDocumentationSource", () => {
  it("loads a local markdown file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ig-docs-"));
    const path = join(dir, "api.md");
    writeFileSync(path, "# Orders\n\nPOST /v1/orders\ncustomerId required.\n");
    const loaded = await loadDocumentationSource(path);
    expect(loaded.documentation).toContain("POST /v1/orders");
    expect(loaded.documentation).not.toContain("POST /v1/resource");
  });

  it("fetches real HTTP docs and never invents POST /v1/resource", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/markdown" });
      res.end("# Payments API\n\nPOST /v1/payments\namount is required.\n");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    try {
      const loaded = await loadDocumentationSource(`http://127.0.0.1:${port}/docs.md`, {
        allowedHosts: ["127.0.0.1"],
        egressPolicy: {
          allowedHosts: ["127.0.0.1"],
          allowPrivateNetwork: true,
          allowedPorts: [port, 80, 443],
        },
      });
      expect(loaded.documentation).toContain("POST /v1/payments");
      expect(loaded.documentation).not.toMatch(/POST \/v1\/resource/);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("fails explicitly when path and URL are invalid", async () => {
    await expect(loadDocumentationSource("does-not-exist-anywhere.md")).rejects.toThrow(
      /not found|not an http/i
    );
  });
});
