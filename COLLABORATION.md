# Collaboration & Deployment Workflow

How Pritika and Trung work on **LearnLayla** together, test previews, and ship to production.

---

## Current status (read this first)

| Thing | State |
|---|---|
| Hosting | Vercel project **`lumina-pipeline`** (team `pritika-timsinas-projects`) |
| Live production URL | https://lumina-pipeline.vercel.app |
| Custom domain `learnlayla.xyz` | **Not connected yet** (planned) |
| GitHub repo | `trungminhdo4-glitch/viedo-generation-` |
| **Vercel ↔ GitHub Git integration** | **NOT connected** — see blocker below |
| Deploys today | **Manual** (`vercel deploy --prod` from a machine that is logged in) |
| Env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | Present in **Production, Preview, Development** |

### ⚠️ Blocker for the automatic workflow
The intended workflow (automatic Preview per branch + auto-redeploy on merge) **requires the Vercel project to be connected to the GitHub repo.** That connection currently fails because the repo lives under **Trung's** GitHub account (`trungminhdo4-glitch`) and Pritika's Vercel team cannot access it.

**To enable automatic deploys, do ONE of these:**
- The **repo owner (Trung)** opens Vercel → project `lumina-pipeline` → **Settings → Git → Connect** and authorises the Vercel GitHub app on `viedo-generation-`; **or**
- Give the other collaborator's GitHub account access to the repo and install the Vercel GitHub app on it; **or**
- Move/fork the repo into an account/org both members and Vercel can access.

Until then, previews and production are published manually with the Vercel CLI (see below).

---

## 1. Create a feature branch
Work on your own branch — never commit directly to the production branch.
```bash
git checkout main          # or the current production branch
git pull
git checkout -b feat/your-change     # e.g. feat/pritika-waitlist-copy
```

## 2. Run the project locally
```bash
npm install
# create .env.local (NOT committed) with the two public Supabase values:
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
# (copy the names from .env.example; ask a teammate for the values)
npm run dev
```
Open **http://localhost:3000**. Useful checks before pushing:
```bash
npm run typecheck      # TypeScript
npm run build          # production build
npm run e2e            # Playwright end-to-end suite (uses system Chrome/Edge)
```

## 3. Push your changes
```bash
git add -A
git commit -m "Describe your change"
git push -u origin feat/your-change
```

## 4. Open a pull request
On GitHub (`trungminhdo4-glitch/viedo-generation-`): open a PR from your feature branch into the production branch. Add the other person as reviewer. **Do not self-merge** — wait for review.

## 5. Find the Vercel preview
- **Once Git integration is connected:** every pushed branch / PR gets its own **Preview URL** automatically. Vercel posts it as a comment on the PR and lists it under the project's **Deployments** tab. Test *that* URL before merging.
- **Until Git is connected (today):** generate a preview manually from the branch:
  ```bash
  vercel deploy            # prints a unique preview URL (not production)
  ```

## 6. How production deployment works
- **Once Git integration is connected:** merging the PR into the **production branch** auto-builds and redeploys **learnlayla.xyz**. The custom domain stays attached across deployments — you never re-point DNS per deploy.
- **Until then (today):** a logged-in maintainer publishes production manually:
  ```bash
  vercel deploy --prod
  ```

> **Production branch:** with Git connected, set it in Vercel → **Settings → Git → Production Branch** (default is the repo's default branch, `main`). Merges there = production deploys.

## 7. Files that must NEVER be committed (secrets)
- **`.env.local`** — contains environment values; already git-ignored. Do not force-add it.
- Any **`.env*`** file except **`.env.example`** (`.env.example` holds only empty variable names and is safe to commit).
- Any **secret key / service-role key / database password**. The app uses **only** the public Supabase *publishable* key, read from env vars. Never paste a service-role key into code, env files that get committed, or chat.
- Supabase keys/URLs are configured in the **Vercel dashboard** (Settings → Environment Variables), not in the repo.

---

## Quick reference
```bash
git checkout -b feat/x        # 1. branch
npm install && npm run dev    # 2. run locally → localhost:3000
git push -u origin feat/x     # 3. push
# 4. open PR on GitHub, get review
vercel deploy                 # 5. manual preview URL (until Git is connected)
# 6. merge → production (auto once Git connected; else: vercel deploy --prod)
```
