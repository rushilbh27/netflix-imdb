# Contributing

No build step, no dependencies, no test framework. Clone it, load it unpacked, edit a
file, hit reload on `chrome://extensions`.

## Setup

1. Fork and clone
2. `chrome://extensions` → Developer mode → **Load unpacked** → select the folder
3. Click the extension icon and add your own free [OMDb key](https://www.omdbapi.com/apikey.aspx)
4. Enable verbose logs in the Netflix console: `localStorage.setItem('nfimdb:debug', '1')`

## The most useful contribution: selector fixes

Netflix changes its DOM every few months, which breaks card detection. This is the single
most valuable PR anyone can send.

All Netflix-specific strings live in the `SELECTORS` object at the top of `content.js`.
A fix should only touch that object. If you find yourself editing logic elsewhere to make
card detection work, something is off — open an issue first.

**Rules for selectors**, in priority order:

1. Routing attributes — `href` patterns like `/watch/`, `jbv=`. Netflix cannot change
   these without breaking its own navigation.
2. `data-uia` attributes — Netflix's own test hooks. Stable across visual redesigns.
3. ARIA attributes and semantic elements.
4. **Never** obfuscated CSS class names. They are regenerated on Netflix's release
   schedule and are exactly why the extensions this replaced are dead.

## Testing a change

There is no automated suite — Netflix needs a logged-in session. Check manually:

- [ ] Badges appear on row cards on the browse page
- [ ] Badges appear after scrolling (lazy loading still fires)
- [ ] The detail panel appears when you open a title
- [ ] Opening a second title updates the panel rather than showing stale data
- [ ] A title with no IMDb match shows a grey `?`, not a wrong number
- [ ] Clearing the cache in options and reloading re-fetches correctly
- [ ] No errors in the console

Test with non-English and regional titles too — that is where matching is weakest.

## Style

Match what is there. Plain JS, no frameworks, no dependencies. Comments explain *why*, not
*what*. Keep `SELECTORS` as the only place Netflix specifics live.

## Scope

Welcome:

- Selector fixes
- Matching improvements, especially for regional and renamed titles
- Other streaming platforms, kept behind the same architecture
- Accessibility and clarity fixes

Please open an issue before building:

- A backend or hosted proxy of any kind — deliberately out of scope, it is what made the
  predecessor untrustworthy
- Anything that collects, transmits or aggregates viewing data
- Build tooling or a dependency chain
- Shipping an API key in the repo

## Reporting a break

Open an issue with your Chrome version, your region, the page it happened on, and any
`[nfimdb]` console output with debug logging on. A screenshot of the inspected card
element helps enormously.
