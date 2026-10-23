(() => {
  'use strict';

  // ==========================================================================
  // SELECTORS — every Netflix-specific string lives here.
  //
  // Netflix regenerates its obfuscated CSS class names every few releases, which
  // is what kills most extensions like this. So we anchor on things Netflix
  // cannot churn without breaking itself: routing hrefs and data-uia test hooks.
  // When it does eventually break, fix it here and nowhere else.
  // ==========================================================================
  const SELECTORS = {
    // Routing links — stable, these ARE the navigation.
    cardLink: 'a[href*="/watch/"], a[href*="jbv="]',
    // Climb from the link to the visual card so the badge sits in the right box.
    cardContainer: '.title-card, .slider-item, [data-uia*="card"], [class*="title-card"]',
    // Detail overlay and the full title page.
    detailContainer: '[data-uia="previewModal--container"], [data-uia="detail-modal"], .previewModal--container, .jawBoneContainer',
    detailTitle: [
      '[data-uia="previewModal--player-titleTreatment-logo"]',
      '[data-uia="video-title"]',
      '.previewModal--player-titleTreatment-logo',
      '.title-title'
    ].join(', '),
    detailMetadata: '[data-uia="videoMetadata--container"], .videoMetadata--container, [data-uia="previewModal--detailsMetadata"]',
    detailAnchor: '[data-uia="previewModal--detailsMetadata"], [data-uia="videoMetadata--container"], .previewModal--detailsMetadata'
  };

  let DEBUG = false;
  try { DEBUG = localStorage.getItem('nfimdb:debug') === '1'; } catch (e) { /* storage blocked */ }
  chrome.storage.local.get('debug').then((v) => { if (v.debug) DEBUG = true; });
  const log = (...a) => DEBUG && console.log('[nfimdb]', ...a);

  let sawAnyCard = false;
  let brokenWarned = false;

  // ------------------------------------------------------------- extraction

  function cleanTitle(raw) {
    return String(raw || '')
      .replace(/\s*\b(watch\s+)?now\b\s*$/i, '')
      .replace(/^\s*play\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function titleFromCard(link, container) {
    const img = container.querySelector('img[alt]:not([alt=""])') || link.querySelector('img[alt]:not([alt=""])');
    const candidates = [
      img && img.getAttribute('alt'),
      link.getAttribute('aria-label'),
      container.querySelector('.fallback-text') && container.querySelector('.fallback-text').textContent,
      container.querySelector('[data-uia*="title"]') && container.querySelector('[data-uia*="title"]').textContent
    ];
    for (const c of candidates) {
      const t = cleanTitle(c);
      if (t && t.length > 1) return t;
    }
    return null;
  }

  function titleFromDetail(root) {
    const el = root.querySelector(SELECTORS.detailTitle);
    if (el) {
      const t = cleanTitle(el.getAttribute('alt') || el.textContent);
      if (t) return t;
    }
    const heading = root.querySelector('h1, h2, h3, strong');
    return heading ? cleanTitle(heading.textContent) : null;
  }

  function yearFromDetail(root) {
    const meta = root.querySelector(SELECTORS.detailMetadata);
    const text = meta ? meta.textContent : root.textContent.slice(0, 600);
    const m = text && text.match(/\b(19[2-9]\d|20[0-4]\d)\b/);
    return m ? m[1] : null;
  }

  // ------------------------------------------------------------- rendering

  function ratingClass(value) {
    const n = parseFloat(value);
    if (isNaN(n)) return 'nfimdb-unknown';
    if (n >= 7.5) return 'nfimdb-good';
    if (n >= 6.0) return 'nfimdb-ok';
    return 'nfimdb-bad';
  }

  function imdbSearchUrl(title) {
    return 'https://www.imdb.com/find/?q=' + encodeURIComponent(title) + '&s=tt';
  }

  function imdbTitleUrl(id) {
    return 'https://www.imdb.com/title/' + id + '/';
  }

  function openSettings(e) {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'openOptions' });
  }

  function typeLabel(type) {
    return type === 'series' ? 'TV series' : type === 'movie' ? 'Movie' : type === 'episode' ? 'Episode' : '';
  }

  // ---- hover card
  // One element on <body>, positioned from the badge. Inside a card it would be
  // clipped by Netflix's overflow rules. Everything is set with textContent: the
  // strings come from a third-party API.

  const tips = new WeakMap();
  let tipEl = null;

  function showTip(badge) {
    const data = tips.get(badge);
    if (!data) return;

    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'nfimdb-tip';
      tipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tipEl);
    }
    const tip = tipEl;
    tip.replaceChildren();

    const add = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      n.textContent = text;
      tip.appendChild(n);
    };

    add('h4', '', data.heading);
    if (data.sub) add('div', 'nfimdb-sub', data.sub);
    if (data.rows && data.rows.length) {
      const dl = document.createElement('dl');
      for (const [label, value, cls] of data.rows) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        if (cls) dd.className = cls;
        dl.append(dt, dd);
      }
      tip.appendChild(dl);
    }
    if (data.note) add('div', 'nfimdb-note', data.note);

    tip.style.left = '0px';
    tip.style.top = '0px';
    const r = badge.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let top = r.top - h - 10;
    if (top < 8) top = r.bottom + 10;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.setAttribute('data-show', '');
  }

  function hideTip() {
    if (tipEl) tipEl.removeAttribute('data-show');
  }

  window.addEventListener('scroll', hideTip, true);

  function bindTip(badge) {
    badge.addEventListener('mouseenter', () => showTip(badge));
    badge.addEventListener('mouseleave', hideTip);
    badge.addEventListener('focus', () => showTip(badge));
    badge.addEventListener('blur', hideTip);
  }

  // ---- badge
  // A badge never lies. If the lookup was uncertain or failed, it says so and
  // links to an IMDb search instead of printing a confident wrong number.

  function renderBadge(el, result, title) {
    el.className = 'nfimdb-badge';
    el.replaceChildren();
    el.removeAttribute('title');
    el.onclick = null;
    tips.delete(el);

    const fill = (cls, text, o) => {
      el.classList.add(cls);
      if (o.star) {
        const star = document.createElement('span');
        star.className = 'nfimdb-star';
        star.setAttribute('aria-hidden', 'true');
        star.textContent = '★';
        el.appendChild(star);
      }
      const score = document.createElement('span');
      score.className = 'nfimdb-score';
      score.textContent = text;
      el.appendChild(score);

      el.href = o.href;
      el.setAttribute('aria-label', o.label);
      tips.set(el, o.tip);
      if (o.onClick) el.onclick = o.onClick;
    };

    switch (result.status) {
      case 'ok': {
        if (!result.confident) {
          fill('nfimdb-uncertain', '?', {
            href: imdbSearchUrl(title),
            label: `Not sure which IMDb title matches ${title}. Search IMDb.`,
            tip: {
              heading: 'Not sure about this match',
              sub: `The closest IMDb result is “${result.title}” (${result.year}), which may be a different title.`,
              note: 'Click to search IMDb.'
            }
          });
          break;
        }

        const kind = typeLabel(result.type);
        const sub = [result.year, kind].filter(Boolean).join(', ');

        if (!result.imdb) {
          const rows = [];
          if (result.rotten) rows.push(['Rotten Tomatoes', result.rotten]);
          if (result.metacritic) rows.push(['Metacritic', result.metacritic + '/100']);
          fill('nfimdb-unknown', 'N/A', {
            star: true,
            href: imdbTitleUrl(result.imdbId),
            label: `${result.title} has no IMDb rating yet. Open on IMDb.`,
            tip: { heading: result.title, sub, rows, note: 'No IMDb rating yet. Click to open it on IMDb.' }
          });
          break;
        }

        const cls = ratingClass(result.imdb);
        const rows = [['IMDb', result.imdb + '/10', cls]];
        if (result.votes) rows.push(['Votes', result.votes]);
        if (result.rotten) rows.push(['Rotten Tomatoes', result.rotten]);
        if (result.metacritic) rows.push(['Metacritic', result.metacritic + '/100']);
        fill(cls, result.imdb, {
          star: true,
          href: imdbTitleUrl(result.imdbId),
          label: `IMDb ${result.imdb} for ${result.title}. Open on IMDb.`,
          tip: { heading: result.title, sub, rows, note: 'Click to open on IMDb.' }
        });
        break;
      }

      case 'nomatch':
        fill('nfimdb-uncertain', '?', {
          href: imdbSearchUrl(title),
          label: `No IMDb match for ${title}. Search IMDb.`,
          tip: {
            heading: 'No IMDb match found',
            sub: `Nothing on IMDb matched “${title}”.`,
            note: 'Click to search IMDb.'
          }
        });
        break;

      case 'nokey':
        fill('nfimdb-setup', 'Set up', {
          star: true,
          href: '#',
          onClick: openSettings,
          label: 'Add your free OMDb key to see ratings.',
          tip: {
            heading: 'Add your free OMDb key',
            sub: 'Ratings need a key. Setup takes about a minute.',
            note: 'Click to open setup.'
          }
        });
        break;

      case 'badkey':
        fill('nfimdb-setup', 'Fix key', {
          star: true,
          href: '#',
          onClick: openSettings,
          label: 'OMDb rejected the API key. Open settings.',
          tip: {
            heading: 'OMDb rejected your key',
            sub: 'Make sure you clicked the activation link in the OMDb email, or paste the key again.',
            note: 'Click to open settings.'
          }
        });
        break;

      case 'limit':
        fill('nfimdb-unknown', '–', {
          href: imdbSearchUrl(title),
          label: 'Daily lookup limit reached. Search IMDb instead.',
          tip: {
            heading: 'Daily limit reached',
            sub: 'The free key allows 1,000 lookups a day. Ratings return tomorrow.',
            note: 'Click to search IMDb instead.'
          }
        });
        break;

      default:
        fill('nfimdb-unknown', '–', {
          href: imdbSearchUrl(title),
          label: `Could not load a rating for ${title}. Search IMDb.`,
          tip: {
            heading: 'Couldn’t load this rating',
            sub: result.message || 'Something went wrong talking to OMDb.',
            note: 'Click to search IMDb.'
          }
        });
    }
  }

  // ---- detail panel

  function panelLink(el, text, href, cls) {
    const a = document.createElement('a');
    a.className = cls;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.href = href;
    a.textContent = text;
    el.appendChild(a);
    return a;
  }

  function renderPanel(el, result, title) {
    el.className = 'nfimdb-panel';
    el.textContent = '';

    if (result.status === 'nokey' || result.status === 'badkey') {
      const a = panelLink(el, result.status === 'nokey'
        ? 'Add your free OMDb key to see ratings here'
        : 'OMDb rejected your key. Open settings', '#', 'nfimdb-panel-note');
      a.addEventListener('click', openSettings);
      return;
    }

    if (result.status === 'limit') {
      panelLink(el, 'Daily lookup limit reached. Search IMDb instead', imdbSearchUrl(title), 'nfimdb-panel-note');
      return;
    }

    if (result.status !== 'ok') {
      panelLink(el, `No IMDb match for “${title}”. Search IMDb`, imdbSearchUrl(title), 'nfimdb-panel-note');
      return;
    }

    if (!result.confident) {
      panelLink(el, `Closest IMDb result is “${result.title}”, which may be a different title. Search IMDb`,
        imdbSearchUrl(title), 'nfimdb-panel-note');
      return;
    }

    const scores = [
      result.imdb ? { label: 'IMDb', value: result.imdb + '/10', cls: ratingClass(result.imdb) } : null,
      result.rotten ? { label: 'Rotten Tomatoes', value: result.rotten, cls: '' } : null,
      result.metacritic ? { label: 'Metacritic', value: result.metacritic + '/100', cls: '' } : null
    ].filter(Boolean);

    for (const s of scores) {
      const chip = document.createElement('span');
      chip.className = 'nfimdb-chip ' + s.cls;
      const label = document.createElement('span');
      label.className = 'nfimdb-chip-label';
      label.textContent = s.label;
      const value = document.createElement('strong');
      value.textContent = s.value;
      chip.append(label, value);
      el.appendChild(chip);
    }

    if (result.votes) {
      const votes = document.createElement('span');
      votes.className = 'nfimdb-votes';
      votes.textContent = result.votes + ' votes';
      el.appendChild(votes);
    }

    panelLink(el, 'Open on IMDb', imdbTitleUrl(result.imdbId), 'nfimdb-panel-link');
  }

  // ------------------------------------------------------------- lookups

  function requestRating(title, year) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'rating', title, year }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ status: 'error', message: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { status: 'error', message: 'no response' });
      });
    });
  }

  // Only spend an API call on a card the user can actually see.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      fillCard(entry.target);
    }
  }, { rootMargin: '200px' });

  async function fillCard(container) {
    const title = container.dataset.nfimdbTitle;
    const badge = container.querySelector(':scope > .nfimdb-badge');
    if (!title || !badge) return;
    const result = await requestRating(title, null);
    log('card', title, result.status, result.title || '');
    renderBadge(badge, result, title);
  }

  function attachCard(link) {
    const container = link.closest(SELECTORS.cardContainer) || link.parentElement;
    if (!container || container.dataset.nfimdb) return false;

    const title = titleFromCard(link, container);
    if (!title) return false;

    container.dataset.nfimdb = '1';
    container.dataset.nfimdbTitle = title;
    container.classList.add('nfimdb-host');

    const badge = document.createElement('a');
    badge.className = 'nfimdb-badge nfimdb-pending';
    badge.textContent = '·';
    badge.target = '_blank';
    badge.rel = 'noreferrer';
    badge.addEventListener('click', (e) => e.stopPropagation());
    bindTip(badge);
    container.appendChild(badge);

    observer.observe(container);
    return true;
  }

  async function attachDetail(root) {
    const title = titleFromDetail(root);
    if (!title) return;

    // The overlay is reused across titles, so re-render whenever the title changes.
    if (root.dataset.nfimdbTitle === title) return;
    root.dataset.nfimdbTitle = title;

    const year = yearFromDetail(root);
    let panel = root.querySelector(':scope .nfimdb-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'nfimdb-panel';
      const anchor = root.querySelector(SELECTORS.detailAnchor);
      if (anchor && anchor.parentElement) {
        anchor.parentElement.insertBefore(panel, anchor);
      } else {
        root.appendChild(panel);
      }
    }
    panel.textContent = 'Loading ratings…';
    panel.className = 'nfimdb-panel nfimdb-panel-loading';

    const result = await requestRating(title, year);
    log('detail', title, year, result.status, result.title || '');
    if (root.dataset.nfimdbTitle !== title) return; // user moved on mid-flight
    renderPanel(panel, result, title);
  }

  // ------------------------------------------------------------- scanning

  function scan() {
    const links = document.querySelectorAll(SELECTORS.cardLink);
    let attached = 0;
    for (const link of links) {
      if (attachCard(link)) attached++;
    }
    if (links.length > 0) sawAnyCard = true;

    for (const root of document.querySelectorAll(SELECTORS.detailContainer)) {
      attachDetail(root);
    }

    if (attached) log('attached', attached, 'of', links.length, 'links');
    return links.length;
  }

  // If Netflix changes its DOM out from under us, say so loudly and exactly once.
  // This is the difference between "extension silently rotted" and "one-line fix".
  function checkBroken() {
    if (sawAnyCard || brokenWarned) return;
    if (!/\/(browse|latest|title|search|Kids)/.test(location.pathname)) return;
    brokenWarned = true;
    console.warn(
      '[nfimdb] Found 0 title cards on a browse page. Netflix likely changed its DOM.\n' +
      'Fix SELECTORS.cardLink / SELECTORS.cardContainer at the top of content.js.\n' +
      'Enable verbose logs with: localStorage.setItem("nfimdb:debug","1")'
    );
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      setTimeout(() => {
        scheduled = false;
        scan();
      }, 150);
    });
  }

  // ------------------------------------------------------------- first-run nudge
  // Until a key is saved every badge says "Set up". This adds one quiet,
  // dismissible message so nobody has to guess what that means.

  let toast = null;

  function removeToast() {
    if (toast) toast.remove();
    toast = null;
  }

  async function maybeShowSetupToast() {
    try { if (sessionStorage.getItem('nfimdb:toast') === '1') return; } catch (e) { /* storage blocked */ }

    const stats = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'stats' }, (res) => resolve(chrome.runtime.lastError ? null : res));
    });
    if (!stats || stats.hasKey || toast) return;

    toast = document.createElement('div');
    toast.className = 'nfimdb-toast';
    toast.setAttribute('role', 'dialog');
    toast.setAttribute('aria-label', 'Netflix IMDb Ratings setup');

    const mark = document.createElement('div');
    mark.className = 'nfimdb-toast-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '★';

    const text = document.createElement('div');
    text.className = 'nfimdb-toast-text';
    const head = document.createElement('strong');
    head.textContent = 'One more step to see ratings';
    const body = document.createElement('p');
    body.textContent = 'Add your free OMDb key. Setup takes about a minute.';
    text.append(head, body);

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'nfimdb-toast-go';
    go.textContent = 'Set up';
    go.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openOptions' }));

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'nfimdb-toast-x';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', () => {
      try { sessionStorage.setItem('nfimdb:toast', '1'); } catch (e) { /* storage blocked */ }
      removeToast();
    });

    toast.append(mark, text, go, close);
    document.body.appendChild(toast);
  }

  // ------------------------------------------------------------- live refresh
  // Saving or removing a key on the setup page updates Netflix tabs that are
  // already open, so nobody has to reload to see it work.

  function resetAll() {
    hideTip();
    for (const n of document.querySelectorAll('.nfimdb-badge, .nfimdb-panel')) n.remove();
    for (const n of document.querySelectorAll('[data-nfimdb-title], [data-nfimdb]')) {
      delete n.dataset.nfimdb;
      delete n.dataset.nfimdbTitle;
      n.classList.remove('nfimdb-host');
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.debug) DEBUG = !!changes.debug.newValue;
    if (changes.apiKey) {
      removeToast();
      resetAll();
      scan();
      if (!changes.apiKey.newValue) setTimeout(maybeShowSetupToast, 300);
    }
  });

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

  scan();
  setTimeout(scan, 1500);
  setTimeout(checkBroken, 6000);
  setTimeout(maybeShowSetupToast, 1200);
  log('ready');
})();
