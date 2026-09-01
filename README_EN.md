# Automotive Sales Conversation Decision Intelligence System

[简体中文](README.md) | [English](README_EN.md)

A traceable decision intelligence system for automotive sales conversations. It accepts audio recordings or ASR transcripts, invokes a large language model only once to extract structured facts, and runs diagnosis, customer insight, strategy, generation, and feedback through configurable rules.

Core workflow: `Audio/Transcript -> Fact Extraction -> SOP QA and Customer Insight -> Diagnosis -> Strategy -> Generation -> Feedback and Re-evaluation`.

## Documentation

- [安全说明（中文）](SECURITY.md)
- [Security Policy (English)](SECURITY_EN.md)

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Default frontend URL: `http://localhost:5173/`

Default backend URL: `http://127.0.0.1:8787/`

## Secret Configuration

Cloud credentials must only be stored in the server-side `.env` file or injected through the deployment platform's secret or environment-variable management:

- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`
- `ALIYUN_NLS_APP_KEY`
- `LLM_API_KEY`
- `MANAGER_WECHAT_WEBHOOK`

The browser does not read, accept, or expose these values. Never place secrets in React source code, `VITE_*` environment variables, configuration JSON, screenshots, or sample data.

Run the following checks before pushing to GitHub:

```bash
npm run security:check
npm run build
```

## GitHub Publishing Checklist

- Commit source code and `.env.example` only. Never commit `.env`.
- `data/`, `uploads/`, `outputs/`, audio recordings, and original customer documents are ignored by default.
- If a credential has ever entered Git history, rotate it immediately on the corresponding cloud platform. Removing it from the latest revision does not remove it from history.
- Inject production secrets through GitHub Actions Secrets, a cloud secret manager, or server-side environment variables.

## Data Boundaries

Quality deductions, important customer profiles, high-risk findings, and won/lost outcomes must retain source evidence and a human-review path. Test data and model-generated candidates must not be presented externally as verified business outcomes.

---

[切换到简体中文](README.md)
