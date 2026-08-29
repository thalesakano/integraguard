import { describe, it, expect } from "vitest";
import { htmlToText } from "./docs-crawler.js";

describe("htmlToText", () => {
  it("extracts title, text, and links from API-style docs HTML", () => {
    const html = `
      <html><head><title>Payments API</title></head>
      <body>
        <nav><a href="/api/charges">Charges</a><a href="/blog">Blog</a></nav>
        <main>
          <h1>Charges</h1>
          <p>Create a charge with <code>POST /v1/charges</code>.</p>
          <a href="/api/refunds">Refunds</a>
        </main>
      </body></html>`;
    const { title, text, links } = htmlToText(html);
    expect(title).toBe("Payments API");
    expect(text).toContain("POST /v1/charges");
    expect(links).toContain("/api/charges");
    expect(links).toContain("/api/refunds");
  });
});
