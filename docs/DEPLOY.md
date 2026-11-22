# Deploying LearnLayla

State of 2026-11-22. Two things run: the **Next.js app** (player, upload, generation pipeline, MP4 export)
and the **Python backend** (`lumina/`: accounts, job queue, tutor, practice). Generation needs a model key
(Amazon Bedrock), Piper (voice), ffmpeg and a headless Chromium, and one run takes about a minute or more.

## What runs where

| Host | Cost | Next.js app | Live generation + MP4 | Python backend | Status |
|---|---|---|---|---|---|
| **Netlify** (`netlify.toml`) | free | yes | no: function time limits, no Piper/ffmpeg/Chromium | no (no Python server) | **live**: https://paperscenes.netlify.app, deploys `main` automatically |
| **Netcup VPS** (`deploy/backend/`, `deploy/hf-space/Dockerfile`) | already paid | yes (Docker) | yes | yes (Docker + Caddy, HTTPS) | blocked: needs SSH access to the server |
| **Hugging Face Space** (`deploy/hf-space/`) | paid plan | yes | yes | — | blocked: "Gradio and Docker Spaces require a paid plan" (new-space form, 2026-11-22); free Spaces are static only |
| **Render free** | free | too small | no: 512 MB RAM, 0.1 CPU, sleeps after 15 min | possible (mock model) | not used |
| **Laptop + tunnel** (Cloudflare Tunnel / Tailscale Funnel) | free | yes | yes, while the laptop runs | yes | for the live demo only |

## Recommended

1. **Public showcase:** Netlify (examples, three shorts with MP4, upload page that explains generation is not configured there).
2. **Live generation and backend:** one Docker host. On the Netcup VPS:
   ```bash
   git clone https://github.com/trungminhdo4-glitch/viedo-generation-.git && cd viedo-generation-
   # backend (FastAPI + Caddy with automatic HTTPS); <ip>.sslip.io works without a DNS record
   cd deploy/backend && BACKEND_HOST=api.<ip>.sslip.io docker compose up -d --build
   python3 smoke.py https://api.<ip>.sslip.io
   ```
   The web app image (`deploy/hf-space/Dockerfile`) runs the same way on the VPS (`docker build`, port 7860)
   behind the same Caddy. Model keys go into a `.env` next to the compose file, never into git.
3. **Before generation is public:** a per-visitor generation cap that survives restarts (today it is in memory),
   a spending limit on the model account, and deletion of uploads.

## Early-access emails

The start page form posts to Netlify Forms (`public/__forms.html`, form `early-access`). On Netlify,
**Forms → Enable form detection** must be on once (new projects have it off); submissions then appear under
Forms in the Netlify dashboard. Elsewhere the form falls back to `POST /api/signup`, which appends to
`signups.jsonl` next to the lesson store. Emails are personal data: a privacy notice and an imprint
(Impressum) are needed before this is promoted in Germany.
