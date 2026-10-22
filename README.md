# OP site scripts

Custom JavaScript for Official Partner's Webflow sites. One folder per site.
Served by Cloudflare Workers (static assets) from this repo, account `samuel-3f4`.

## Sites

| Folder | Webflow site | Staging address |
| --- | --- | --- |
| `saint-urbain/` | Saint-Urbain (ID `69a094ccd1d488d0b58d8549`) | sainturbain.webflow.io |

Each folder holds `site.js` (the source we edit) and `site.min.js` (the file sites load).

## Links (they never change)

- Production (branch `main`): `https://op-site-scripts.samuel-3f4.workers.dev/<site>/site.min.js`
- Staging (branch `staging`): `https://staging-op-site-scripts.samuel-3f4.workers.dev/<site>/site.min.js`

Saint-Urbain:

- Production: https://op-site-scripts.samuel-3f4.workers.dev/saint-urbain/site.min.js
- Staging: https://staging-op-site-scripts.samuel-3f4.workers.dev/saint-urbain/site.min.js

A push updates its link within about a minute. Browsers re-check the file
every 60 seconds (`_headers`). No link to change and nothing to publish in Webflow.

## How a change goes live

1. Edit `<site>/site.js`, minify it into `site.min.js`, check both (commands below).
2. Commit to `staging`. Test on the site's webflow.io address.
3. Once it works, merge `staging` into `main`. Production picks it up.
4. Something broke in production: Cloudflare dashboard, Workers, `op-site-scripts`,
   Deployments, roll back to the previous version. Then fix on `staging`.

## Commands (run from the repo root on every change)

```sh
npx terser <site>/site.js -c -m -o <site>/site.min.js
node --check <site>/site.js
node --check <site>/site.min.js
```

## Cloudflare setup (already done, for reference)

- Worker `op-site-scripts`, connected to this repo with Workers Builds.
- Branch `main` runs `wrangler deploy`: production link.
- Any other branch runs `wrangler preview`: its own preview link, named
  `<branch>-op-site-scripts.samuel-3f4.workers.dev`. That is how `staging` gets its link.
- `wrangler.jsonc`: assets directory `.`, `preview_urls: true`, and `"previews": {}`
  (required, or the staging build fails).
- `.assetsignore` keeps `README.md`, `wrangler.jsonc` and `.git` from being served.
- `_headers`: 60 second cache with revalidation, and CORS open so any site can load the files.

## Rules

- `site.js` is the source, `site.min.js` is what sites load. Both are committed, always in sync.
- Minify with terser and run `node --check` on both files before every commit.
- Never commit straight to `main`. Staging first, tested on webflow.io, then merge.
- Never put a secret (API key, password, token) in a file: browsers download it.
- No Webflow native interactions. All motion and functionality lives in `site.js`.
- Code follows the op-site-js and op-motion skills: one init per feature, idempotent
  (safe to run twice), torn down on Barba page leave, animate transforms and opacity only,
  respect reduced motion, refactors keep behaviour, motion recipes editable in the tune panel.
- Any change to code inside Webflow (head, footer, embeds) needs Sam's OK first.
- Never publish a Webflow site without Sam's OK.

## Webflow (paste once, in Site settings > Custom code > Footer)

Must be the last script, after Barba, Lenis and Finsweet. Loads the staging file on
`*.webflow.io` and the production file everywhere else. Replace `<site>` with the folder name.

```html
<script>
(function () {
  var stg = /\.webflow\.io$/.test(location.hostname);
  var s = document.createElement('script');
  s.src = 'https://' + (stg ? 'staging-' : '') + 'op-site-scripts.samuel-3f4.workers.dev/<site>/site.min.js';
  s.async = false;
  document.body.appendChild(s);
})();
</script>
```

## Adding a new site

1. Create a folder named after the site, with its `site.js`, then minify and check.
2. Commit to `staging`, then merge to `main`.
3. Paste the footer block above in that site's Webflow settings (with Sam's OK), using the folder name.
4. Add the site to the table at the top of this file.
