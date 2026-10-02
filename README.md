# Weaver

A modular, client-side workspace for structuring, refining, and generating
long-form creative writing. Combines user drafts, a finalized-text repository,
and AI generation in a synchronized three-panel interface with automatic
4-tier dynamic API fallback (Groq → OpenRouter → Gemini → Mistral).

## Live app
Deploys automatically to GitHub Pages on **every push to `main`** —
no manual workflow runs required.

## One-time repository setup
1. Repo → **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Done. All future commits deploy themselves.

## File structure
```text
.
├── .github/workflows/deploy-pages.yml   # Pages pipeline (create once)
├── index.html                           # Shell + view containers
├── css/
│   └── base.css                         # Tokens, reset, splash
├── js/
│   └── app.js                           # Bootstrap / entry point
└── README.md
