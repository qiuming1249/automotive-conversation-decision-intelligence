# Security Policy

[简体中文](SECURITY.md) | [English](SECURITY_EN.md) | [Back to README](README_EN.md)

## Credential Principles

Cloud credentials must exist only in server-side environment variables. They must never be exposed to the browser, hard-coded in source files, or committed to Git.

If a possible leak is discovered:

1. Disable and rotate the affected credential immediately in Alibaba Cloud or the corresponding platform.
2. Inspect Git history, build artifacts, logs, screenshots, and externally shared files.
3. Update the deployment secret. Never paste credentials into an Issue or commit message.
4. Run `npm run security:check` and a complete production build.

## Public Repository Scope

Audio recordings, raw ASR transcripts, databases, customer materials, exported results, and the local `.env` file do not belong in a public repository.

## Vulnerability Reporting

Do not submit credentials, recordings, customer information, or reproducible sensitive business data in a public Issue. Report security concerns through a private channel approved by the repository owner, and provide only the minimum information required to identify the problem.

---

[切换到简体中文](SECURITY.md)
