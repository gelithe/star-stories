# Deploying Star Stories — Cloudflare Pages

The storefront deploys on **Cloudflare Pages, connected to Git** (the same
pattern proven by the sibling project Chart Compass at
`compass.sagemodeai.com`). There is **no CLI deploy and no build step** — Pages
watches this repo and publishes on every push. Nothing here runs `wrangler`;
the one-time connect and custom-domain steps are done in the Cloudflare
dashboard.

Live domain: **`star-stories.sagemodeai.com`** (the `sagemodeai.com` zone is
already on Cloudflare from Chart Compass, so the subdomain wires up
automatically).

## Branch model (chosen for long-term stability)

- **Production branch: `main`.** Production always tracks `main` so nothing
  changes underneath it when day-to-day work happens on other branches.
- **Feature branches → preview deploys.** Every pushed branch (e.g. the next
  one for `/api/generate`) gets its own `*.pages.dev` preview URL. Review the
  preview, merge to `main`, production updates.

## One-time setup (Cloudflare dashboard)

1. **Workers & Pages → Create → Pages → Connect to Git** → pick
   **`gelithe/star-stories`**.
2. **Build settings** (mirrors the working Chart Compass project; only the
   repository and Root directory differ):

   | Field | Value | Why |
   |---|---|---|
   | Git repository | `gelithe/star-stories` | this repo |
   | Production branch | `main` | production tracks a stable branch |
   | Build command | *(empty)* | no build step |
   | Build output | *(empty)* | empty + no build command → Pages serves the root directory as-is |
   | Root directory | *(empty / blank)* | the site is at the **repo root** |
   | Build comments | Enabled | same as Compass |
   | Build cache | Disabled | same as Compass |
   | Automatic deployments | Enabled | push-to-deploy |
   | Build watch — Include paths | `*` | same as Compass |
   | Build system version | Version 3 | same as Compass |

   > Note: Chart Compass sets **Root directory** to `cloudflare-app` because its
   > app lives in a subfolder of `gelithe/docs`. Here the site is at the repo
   > **root**, so Root directory is left **blank**. That blank root is also where
   > Pages will look for `functions/` when `/api/generate` is added.

3. **Environment variables:** the static configurator needs none, but the
   `/api/generate` Function does:
   - `ANTHROPIC_API_KEY` — **required** for `/api/generate` (set a spend cap).
     Set it for **both Production and Preview** environments, or the generator
     returns HTTP 500 on that deployment.
   - `GENERATE_MODEL` / `GENERATE_MAX_TOKENS` — optional overrides.
   - `ACCESS_CODES` — optional comma-separated codes to gate generation while
     the product is private (empty = open). Mirrors Chart Compass.
   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — later, for Checkout + the
     generation webhook.
4. **Deploy**, then open the `*.pages.dev` URL and test (see checklist below).
5. **Custom domains → Set up a domain →** `star-stories.sagemodeai.com`.

## Post-deploy test checklist

- [ ] Page loads in the house style (gold/ink, Georgia serif).
- [ ] Type a **birth date** → the sky preview lights up (Sun/Moon/Chinese/HD).
      If it stays on the empty orb, the CDN `astronomy-engine` is blocked — tell
      the maintainer to vendor it locally (removes the external dependency).
- [ ] Add **birth time + place** → the **rising sign** appears; place
      autocomplete (Nominatim) and timezone (Open-Meteo) resolve.
- [ ] Age bands switch the register + the language **mixing shape** text.
- [ ] Book-language picker enforces the **max of 4**; parents' page selectable.
- [ ] "Create this book" validates and shows the next-step message.

## Updating the live site

Merge to `main` → Pages redeploys automatically. The `_headers` file makes the
HTML shell revalidate immediately, so updates are picked up without a hard
refresh. No Cloudflare access required for routine updates — only the initial
connect and the env-var/secret changes touch the dashboard.
