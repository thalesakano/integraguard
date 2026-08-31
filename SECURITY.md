# Security Policy

## Supported versions

This repository is a hackathon / early developer-tool release. Security fixes land on the default branch.

## Reporting a vulnerability

Email or open a private report to the maintainer (`thalesakano` on GitHub). Do not file public issues for probe/SSRF bypasses before coordinated disclosure.

## Deployment posture

- **Local / CI sandbox:** intended for synthetic fixtures on localhost.
- **Public demo:** set `INTEGRAGUARD_DEMO_MODE=1` — rejects arbitrary docs/target URLs.
- **Real API:** staging only, Human Gate on by default for mutating methods, explicit `allowedHosts`.

See [security-model.md](docs/security-model.md) and [dependency-advisories.md](docs/dependency-advisories.md).
