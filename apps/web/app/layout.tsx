import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IntegraGuard — API Integration Preflight",
  description: "Agentic API integration preflight with evidence-grounded readiness packs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">IntegraGuard</h1>
            <p className="text-sm text-[var(--muted)]">Agentic API Integration Preflight</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <a href="/" className="text-[var(--accent)] hover:underline">New Analysis</a>
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
