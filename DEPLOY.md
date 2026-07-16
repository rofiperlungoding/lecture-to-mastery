# Deployment Guide — Lecture to Mastery

## Production URL

**Live site:** [https://papaya-dieffenbachia-d3871b.netlify.app](https://papaya-dieffenbachia-d3871b.netlify.app)

---

## Build

```bash
npm ci
npm run build
# Output → dist/
```

Build command (`npm run build`) runs `tsc -b && vite build`.

---

## Deploy

### Option A: Git-based continuous deploy (recommended)

Every push to `main` auto-deploys. PRs get unique Deploy Preview URLs.

**Setup** (one-time):
1. [Netlify Dashboard](https://app.netlify.com) → **Add new site → Import existing project → Deploy with GitHub**
2. Select `rofiperlungoding/lecture-to-mastery`
3. Build settings auto-detect from `netlify.toml` ✅
4. Set these environment variables in **Site settings → Environment variables**:
   - `VITE_SUPABASE_URL` = `https://xjsukouwsymcqxfhajyv.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<your-anon-key>`
5. Deploy

### Option B: CLI deploy

```bash
npx netlify deploy --build          # Draft (preview URL)
npx netlify deploy --build --prod    # Production
```

---

## Environment Variables

| Variable | Set Where | When Changed |
|---|---|---|
| `VITE_SUPABASE_URL` | Netlify UI/CLI | Requires redeploy (embedded at build time) |
| `VITE_SUPABASE_ANON_KEY` | Netlify UI/CLI | Requires redeploy (embedded at build time) |
| `MISTRAL_API_KEY` | ❌ NOT on Netlify — set via `supabase secrets set` | Supabase only |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ NOT on Netlify — auto-injected by Supabase | Supabase only |

---

## Rollback Playbook

### Symptom
A deploy breaks the app (blank page, JS error, API calls failing).

### Recovery (30 seconds)

1. Go to **Netlify Dashboard → Deploys** tab
   → [https://app.netlify.com/sites/papaya-dieffenbachia-d3871b/deploys](https://app.netlify.com/sites/papaya-dieffenbachia-d3871b/deploys)

2. Find the **last known-good deploy** (green "Published" badge)

3. Click the three dots (`⋮`) on the right → **Publish deploy**

   Or click into the deploy → **Publish deploy** button in the top-right

4. ✅ **Site is restored in ~5 seconds.** The old JS/CSS/assets were already cached on the CDN — only `index.html` refreshes.

### Prevention: Keep auto-publish off

When making risky changes:
1. Enable **Deploy context → Branch `main` → Deploy log → "Stop auto publishing"**
2. Deploy to a preview branch first
3. Only promote to production after smoke-test passes

### Rollback: What to expect

- **index.html** reverts instantly — users get the old page on next load
- **JS/CSS/assets** were already cached (immutable, 1 year) on the CDN from the good deploy
- **Supabase edge functions** are NOT reverted — roll them separately if needed:
  ```bash
  supabase functions deploy <function-name>  # from a git checkout of the working commit
  ```
- **Database** is NOT affected — only frontend code is rolled back

---

## CORS

Edge functions allowlist:
- `*.netlify.app` (production + deploy previews)
- `*.lecture-to-mastery.pages.dev` (Cloudflare Workers fallback)
- `localhost:5173` (local development)
- `localhost:54321` (local Supabase)
- `lecture-to-mastery.local` (local preview)

If adding a staging domain, add it to `isAllowedOrigin()` in each edge function.

---

## Verify Deploy

```bash
# Check HTTP status
curl -s -o /dev/null -w "%{http_code}" https://papaya-dieffenbachia-d3871b.netlify.app/

# Verify SPA routing (must return 200, not 404)
curl -s -o /dev/null -w "%{http_code}" https://papaya-dieffenbachia-d3871b.netlify.app/doc/test-id

# Check cache headers
curl -sI https://papaya-dieffenbachia-d3871b.netlify.app/ | grep -i cache
curl -sI https://papaya-dieffenbachia-d3871b.netlify.app/assets/ | grep -i cache

# Check security headers
curl -sI https://papaya-dieffenbachia-d3871b.netlify.app/ | grep -iE "x-frame|x-content|referrer"
```
