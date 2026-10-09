# Netflix IMDb Ratings

A Chrome extension that puts IMDb, Rotten Tomatoes and Metacritic ratings directly on
Netflix — on the row cards and on the detail page — so you can judge something before
you commit two hours to it.

Netflix hides external ratings on purpose. This puts them back.

![badge: manifest v3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)
![badge: license](https://img.shields.io/badge/license-MIT-green)
![badge: no backend](https://img.shields.io/badge/backend-none-lightgrey)

---

## About

There were already two popular extensions that did this — **Trim** (50k users) and
**IMDb Ratings for Netflix™** (10k users). Around August 2026 both of them broke, within
weeks of each other, and stayed broken. Their review pages turned into a wall of
"doesn't work anymore".

They broke for the same reason almost every Netflix extension eventually breaks: they
anchored to Netflix's obfuscated CSS class names, and Netflix regenerates those every few
releases. One of them also routed every lookup through a third-party server that went
down and later got flagged by an endpoint-security vendor.

This is a rebuild that takes both of those failure modes seriously:

- **No backend.** Your browser talks to the OMDb API directly with your own key. There is
  no server in the middle to go down, get flagged, or quietly collect what you watch.
- **No CSS class selectors.** Cards are located through routing hrefs (`/watch/`, `jbv=`)
  and `data-uia` test attributes — things Netflix cannot churn without breaking its own
  site and test suite.
- **No confident wrong answers.** See [Matching](#matching) below.

It is small on purpose: five files, zero dependencies, zero build step.

---

## Features

- Rating badge on every title card, colour-coded at a glance — green ≥ 7.5, yellow ≥ 6.0,
  orange below that
- Fuller panel on the detail view: IMDb score, vote count, Rotten Tomatoes, Metacritic
- Every badge links straight to the IMDb page
- Hover tooltip with the matched title, year and all three scores
- Ratings cached 30 days locally, so browsing stays fast and well inside the API quota
- Honest `?` badge when the match is uncertain, instead of a wrong number

---

## Install

No Chrome Web Store listing — load it unpacked. Takes about two minutes.

**1. Get a free OMDb API key**

Request one at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx) (pick the
free tier), then **click the activation link in the email they send you**. Lookups fail
silently until you do.

**2. Get the code**

```bash
git clone https://github.com/rushilbh27/netflix-imdb.git
```

Or download the ZIP from the green **Code** button and unzip it.

**3. Load it into Chrome**

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the folder you just cloned

**4. Add your key**

Click the extension icon, paste your key, hit **Save**, then **Test key** — it should
confirm with a known title. Reload any open Netflix tab.

Works in any Chromium browser: Chrome, Edge, Brave, Arc, Opera.

---

## How it works

```
Netflix page
    │
    │  content.js — finds cards via hrefs + data-uia, injects badges
    │               only requests ratings for cards scrolled into view
    ▼
background.js — holds the key, queues and rate-limits requests,
    │           caches results for 30 days, scores match confidence
    ▼
OMDb API
```

The content script never sees your API key and never touches the network. All requests go
through the service worker, which is also where caching, the daily cap and the queue live.

### Matching

Netflix does not expose IMDb IDs anywhere in its DOM, so titles have to be matched by
name. This is genuinely imperfect — it is the single most common complaint about every
extension in this category ("matches the wrong movie so many times").

The approach here:

1. Strip Netflix's suffixes — `The Crown: Season 5` becomes `The Crown`, which is what
   OMDb actually knows it as
2. Query OMDb, with the year when the page gives one, retrying without it on a miss
3. Score the returned title against the Netflix title using bigram (Dice) similarity
4. **Below 0.6, refuse to show a rating** — the badge turns grey, shows `?`, and links to
   an IMDb search instead

A grey `?` means "I'm not confident this is the right title", not "this title has no
rating". That trade is deliberate: a wrong number you trust is worse than no number.

### API quota

OMDb's free tier allows 1000 lookups per day. In practice you will not get near it:

- Lookups only fire for cards actually scrolled into view
- Results cache for 30 days, misses for 7
- Identical in-flight lookups are deduplicated
- The worker stops at 950/day on its own

The options page shows how many you have left today.

---

## When it breaks

It will, eventually — Netflix ships DOM changes on its own schedule. The extension is
built so that this is a two-minute fix rather than an investigation.

On a browse page with no badges, open the console. You should see:

```
[nfimdb] Found 0 title cards on a browse page. Netflix likely changed its DOM.
```

Then turn on verbose logging:

```js
localStorage.setItem('nfimdb:debug', '1')  // run in the Netflix tab, then reload
```

Inspect a card, find a stable attribute on it, and update the `SELECTORS` object at the
top of `content.js`. Every Netflix-specific string in the codebase lives in that one
object — nothing else needs to change.

If you fix it, please open a PR. That is the main way this stays alive.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| Red ⚙ badge | No API key saved, or OMDb rejected it. Click it to open settings. |
| Grey `?` badge | No confident IMDb match. Click to search IMDb manually. |
| Grey `–` badge | Daily quota hit, or the request failed. Resets at midnight UTC. |
| `N/A` badge | Matched correctly, but IMDb has no rating yet (common for brand-new titles). |
| No badges at all | Netflix DOM change — see [When it breaks](#when-it-breaks). |

---

## Privacy

- Your API key is stored in `chrome.storage.local`, scoped to your browser profile. Not
  synced, not transmitted anywhere except to OMDb as part of your own lookups.
- The only network destination is `omdbapi.com`. It receives title strings, nothing else.
- No analytics, no telemetry, no backend, no third-party scripts.
- Host permissions are limited to `netflix.com` and `omdbapi.com`.

Everything is readable — it is five unminified files. Check for yourself.

---

## Contributing

PRs welcome, especially selector fixes when Netflix changes things. See
[CONTRIBUTING.md](CONTRIBUTING.md).

Good first contributions:

- Selector updates after a Netflix change
- Support for Prime Video / Disney+ / Hotstar (the architecture allows it; it is not built)
- A toggle to dim or hide titles below a rating threshold
- Better matching for regional titles that Netflix renames

---

## Project layout

| File | Role |
|---|---|
| `manifest.json` | MV3 config and permissions |
| `content.js` | DOM scanning, badge and panel injection, the `SELECTORS` block |
| `background.js` | OMDb requests, cache, rate limiting, queue, match confidence |
| `options.html` / `options.js` | Key entry, key test, cache clearing |
| `styles.css` | Badge and panel styles |

No build step, no dependencies, no bundler. Edit a file, hit reload on the extensions
page, done.

---

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with Netflix, IMDb, or OMDb. Netflix is a trademark of Netflix, Inc.
Ratings data comes from the [OMDb API](https://www.omdbapi.com/), an independent service.
