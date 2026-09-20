# Netflix IMDb Ratings

Personal Chrome extension. Puts IMDb / Rotten Tomatoes / Metacritic ratings on Netflix
cards and detail pages, because Netflix hides them.

Built after the two popular Chrome Web Store extensions (Trim, IMDb Ratings for Netflix™)
both broke around August 2026 and stayed broken.

## Install

1. Get a free OMDb key: https://www.omdbapi.com/apikey.aspx (click the activation link they email).
2. Chrome → `chrome://extensions` → enable **Developer mode** (top right).
3. **Load unpacked** → select this folder.
4. Click the extension icon → paste the key → **Save** → **Test key**.
5. Reload Netflix.

## What you get

- A rating badge on every title card, colour-coded: green ≥7.5, yellow ≥6.0, orange below.
- A fuller panel (IMDb + RT + Metacritic + vote count) on the detail overlay.
- Every badge links to the IMDb page.

## Design notes

**No confident wrong numbers.** Netflix exposes no IMDb ID, so matching is title-based
and imperfect. When the closest OMDb result doesn't look like the Netflix title
(bigram similarity < 0.6), the badge shows a grey `?` linking to an IMDb search instead
of a rating. This is the single biggest complaint about the alternatives.

**Built to survive Netflix churn.** Netflix regenerates its obfuscated CSS class names
every few releases — that is what killed the other extensions. Nothing here keys off a
class name. Cards are found via routing hrefs (`/watch/`, `jbv=`) and `data-uia` test
hooks. Every Netflix-specific string lives in the `SELECTORS` object at the top of
`content.js`, so a breakage is a one-line fix, not an investigation.

**Quota.** OMDb free tier is 1000 lookups/day. Results are cached 30 days (misses 7 days),
lookups only fire for cards scrolled into view, and the worker stops at 950/day. Normal
browsing does not come close.

## When it breaks

Netflix will change its DOM eventually. You will see this in the console on a browse page:

```
[nfimdb] Found 0 title cards on a browse page. Netflix likely changed its DOM.
```

Then:

```js
localStorage.setItem('nfimdb:debug', '1')  // run in the Netflix console, reload
```

Inspect a card, find a stable attribute, update `SELECTORS` in `content.js`, reload
the extension.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 config, permissions |
| `content.js` | DOM scanning, badge/panel injection, `SELECTORS` |
| `background.js` | OMDb fetches, cache, rate limit, queue, match confidence |
| `options.html/js` | API key entry, key test, cache clear |
| `styles.css` | Badge and panel styling |

## Privacy

The API key lives in `chrome.storage.local` for this browser profile. Not synced.
The only network destination is `omdbapi.com`, which receives title strings. No analytics,
no telemetry, no backend.
