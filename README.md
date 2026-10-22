# OP site scripts

Custom JavaScript for Official Partner's Webflow sites. One folder per site.
Served by Cloudflare Pages from this repo.

## Links (they never change)

- Production (branch `main`): `https://op-site-scripts.pages.dev/<site>/site.min.js`
- Staging (branch `staging`): `https://staging.op-site-scripts.pages.dev/<site>/site.min.js`

A push updates its link within about a minute. Browsers re-check the file
every 60 seconds (`_headers`). Nothing to change or publish in Webflow.

## How a change goes live

1. Commit to `staging`. Test on the site's webflow.io address.
2. Merge `staging` into `main`. The production domain picks it up.
3. Something broke: Cloudflare Pages, Deployments, roll back to the previous one.

## Rules

- `site.js` is the source, `site.min.js` is what sites load. Both are committed.
- Run `node --check` on both before every commit.
- Never put a secret (API key, password, token) in a file: browsers download it.

## Webflow (paste once, in Site settings > Custom code > Footer)

Loads the staging file on `*.webflow.io` and the production file everywhere else.
Replace `<site>` with the folder name.

```html
<script>
(function () {
  var stg = /\.webflow\.io$/.test(location.hostname);
  var s = document.createElement('script');
  s.src = 'https://' + (stg ? 'staging.' : '') + 'op-site-scripts.pages.dev/<site>/site.min.js';
  s.async = false;
  document.body.appendChild(s);
})();
</script>
```
