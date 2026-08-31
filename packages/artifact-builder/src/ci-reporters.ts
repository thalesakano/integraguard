import type { ReadinessPack, TrajectoryEvent } from "@integraguard/schemas";

export interface CiReportBundle {
  "report.json": string;
  "report.md": string;
  "report.junit.xml": string;
  "report.sarif.json": string;
}

export function buildMarkdownCiReport(pack: ReadinessPack): string {
  const drifts = pack.findings.filter((f) => f.status === "verified");
  let md = `# IntegraGuard Contract Drift Report\n\n`;
  md += `- Decision: **${pack.decision}**\n`;
  md += `- Score: ${pack.readinessScore}\n`;
  md += `- Run: \`${pack.runId}\`\n`;
  md += `- Generated: ${pack.generatedAt}\n\n`;
  md += `## Verified drifts\n\n`;
  if (drifts.length === 0) {
    md += `_No verified drift._\n`;
  } else {
    md += `| Endpoint mapping | Drift | Severity | Evidence |\n`;
    md += `|------------------|-------|----------|----------|\n`;
    for (const d of drifts) {
      const mapping = pack.mappings.find((m) => m.requirementId === d.requirementId);
      const ep = mapping ? `${mapping.method} ${mapping.endpoint}` : "—";
      md += `| ${ep} | ${d.description.replace(/\|/g, "/")} | ${d.severity} | ${d.evidenceIds.join(", ")} |\n`;
    }
  }
  return md;
}

export function buildJunitReport(pack: ReadinessPack): string {
  const drifts = pack.findings.filter((f) => f.status === "verified");
  const failures = drifts
    .map(
      (d) =>
        `    <testcase classname="integraguard.contract" name="${escapeXml(d.blockerType ?? d.id)}" time="0">\n` +
        `      <failure message="${escapeXml(d.description)}">${escapeXml(d.description)}</failure>\n` +
        `    </testcase>`
    )
    .join("\n");
  const passes =
    drifts.length === 0
      ? `    <testcase classname="integraguard.contract" name="no_verified_drift" time="0"/>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="IntegraGuard" tests="${Math.max(drifts.length, 1)}" failures="${drifts.length}" errors="0">
${failures || passes}
</testsuite>
`;
}

export function buildSarifReport(pack: ReadinessPack): string {
  const drifts = pack.findings.filter((f) => f.status === "verified");
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "IntegraGuard",
            informationUri: "https://github.com/YOUR_ORG/integraguard",
            rules: drifts.map((d) => ({
              id: d.blockerType ?? d.id,
              shortDescription: { text: d.description.slice(0, 120) },
              fullDescription: { text: d.description },
              defaultConfiguration: {
                level: d.severity === "critical" ? "error" : "warning",
              },
            })),
          },
        },
        results: drifts.map((d) => ({
          ruleId: d.blockerType ?? d.id,
          level: d.severity === "critical" ? "error" : "warning",
          message: { text: d.description },
          properties: {
            evidenceIds: d.evidenceIds,
            requirementId: d.requirementId,
          },
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

export function buildCiReports(
  pack: ReadinessPack,
  trajectories: TrajectoryEvent[] = []
): CiReportBundle {
  return {
    "report.json": JSON.stringify({ pack, trajectories }, null, 2),
    "report.md": buildMarkdownCiReport(pack),
    "report.junit.xml": buildJunitReport(pack),
    "report.sarif.json": buildSarifReport(pack),
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
