# Deploying the demo to dhan360.in

The demo is a **static, backend-free build** of the frontend (`VITE_DEMO=true`) that serves a
bundled sample portfolio. No server, no database, no user data — so it's safe and free to host.

## What's already set up
- `frontend` — `npm run build:demo` produces `frontend/dist/` (static site + `404.html` SPA fallback).
- `.github/workflows/deploy-demo.yml` — builds the demo and publishes to GitHub Pages on every
  push to `main` that touches `frontend/**`.
- The demo uses **relative asset paths (`--base=./`) + hash routing**, so it works unchanged at a
  project-site subpath (`anirudhgoel.github.io/dhan360/`) *or* at an apex custom domain — no rebuild
  needed when you switch. (No `CNAME` is committed yet — add the domain when DNS is ready, below.)

## One-time steps (yours — needs your accounts)

1. **Create the empty public repo** on github.com (`AnirudhGoel/dhan360`, no README/license/.gitignore),
   then push over SSH:
   ```bash
   git remote add origin git@github.com:AnirudhGoel/dhan360.git
   git push -u origin main
   ```
   If the repo ever moves (e.g. to a `dhan360` org), update the one constant `REPO_URL` in
   `frontend/src/lib/demo.ts` (used by the footer / demo banner links).

2. **Enable GitHub Pages via Actions:** repo → Settings → Pages → *Build and deployment* →
   Source = **GitHub Actions**. The workflow will run and publish on the next push (or trigger it
   manually from the Actions tab → "Deploy demo to GitHub Pages" → Run workflow).

   After this, the demo is live at **`https://anirudhgoel.github.io/dhan360/`** — verify it there first.

3. **Point the domain (when ready):** at your DNS provider for `dhan360.in`, add the GitHub Pages records:
   - Apex `dhan360.in` → four `A` records: `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153` (and/or the `AAAA` IPv6 equivalents).
   - `www` → `CNAME` to `AnirudhGoel.github.io`.
   Then repo → Settings → Pages → **Custom domain = `dhan360.in`** (GitHub writes the CNAME for you),
   and tick **Enforce HTTPS** once the certificate is issued. No rebuild needed — the relative-path +
   hash-routing build already works at the apex.

## Notes
- The demo build uses `--base=./` + hash routing, so the same artifact serves from a project-site
  subpath or an apex domain. URLs look like `…/dhan360/#/analytics` (hash routes) — expected and fine
  for a static demo.
- To refresh the demo's sample data after changing the seed: re-run
  `cd backend && DHAN360_DATA_DIR=./data python -m scripts.seed && python -m scripts.capture_demo`,
  which regenerates `frontend/src/demo/fixtures.json` (committed, so CI can build without a backend).
- Alternative hosts (Vercel/Netlify/Cloudflare Pages) work too: build command `npm run build:demo`,
  output dir `frontend/dist`, and they handle SPA fallback automatically.
