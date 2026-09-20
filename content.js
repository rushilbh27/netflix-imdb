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

  const DEBUG = localStorage.getItem('nfimdb:debug') === '1';
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

  // A badge never lies. If the lookup was uncertain or failed, it says so and
  // links to an IMDb search instead of printing a confident wrong number.
  function renderBadge(el, result, title) {
    el.className = 'nfimdb-badge';
    el.textContent = '';
    el.removeAttribute('title');

    const set = (cls, text, href, tooltip) => {
      el.classList.add(cls);
      el.textContent = text;
      el.title = tooltip;
      el.href = href;
    };

    switch (result.status) {
      case 'ok':
        if (!result.confident) {
          set('nfimdb-uncertain', '?', imdbSearchUrl(title),
            `Uncertain match: Netflix "${title}" vs IMDb "${result.title}". Click to search IMDb.`);
        } else if (!result.imdb) {
          set('nfimdb-unknown', 'N/A', imdbTitleUrl(result.imdbId),
            `${result.title} (${result.year}) — no IMDb rating yet`);
        } else {
          const bits = [`${result.title} (${result.year})`, `IMDb ${result.imdb}${result.votes ? ' · ' + result.votes + ' votes' : ''}`];
          if (result.rotten) bits.push('Rotten Tomatoes ' + result.rotten);
          if (result.metacritic) bits.push('Metacritic ' + result.metacritic);
          set(ratingClass(result.imdb), result.imdb, imdbTitleUrl(result.imdbId), bits.join('\n'));
        }
        break;
      case 'nomatch':
        set('nfimdb-uncertain', '?', imdbSearchUrl(title), `No IMDb match for "${title}". Click to search.`);
        break;
      case 'nokey':
        set('nfimdb-setup', '⚙', '#', 'No OMDb API key set. Click to open settings.');
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: 'openOptions' });
        });
        break;
      case 'badkey':
        set('nfimdb-setup', '⚙', '#', 'OMDb rejected the API key. Click to open settings.');
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: 'openOptions' });
        });
        break;
      case 'limit':
        set('nfimdb-unknown', '–', imdbSearchUrl(title), 'Daily OMDb quota reached. Resets at midnight UTC.');
        break;
      default:
        set('nfimdb-unknown', '–', imdbSearchUrl(title), 'Lookup failed: ' + (result.message || 'unknown error'));
    }
  }

  function renderPanel(el, result, title) {
    el.className = 'nfimdb-panel';
    el.textContent = '';

    if (result.status !== 'ok') {
      const note = document.createElement('a');
      note.className = 'nfimdb-panel-note';
      note.target = '_blank';
      note.rel = 'noreferrer';
      note.href = imdbSearchUrl(title);
      note.textContent =
        result.status === 'nokey' || result.status === 'badkey' ? 'Set your OMDb API key →'
        : result.status === 'limit' ? 'Daily OMDb quota reached'
        : `No confident IMDb match for "${title}" — search IMDb →`;
      if (result.status === 'nokey' || result.status === 'badkey') {
        note.href = '#';
        note.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.runtime.sendMessage({ type: 'openOptions' });
        });
      }
      el.appendChild(note);
      return;
    }

    if (!result.confident) {
      const warn = document.createElement('a');
      warn.className = 'nfimdb-panel-note';
      warn.target = '_blank';
      warn.rel = 'noreferrer';
      warn.href = imdbSearchUrl(title);
      warn.textContent = `Closest IMDb match was "${result.title}" — probably wrong. Search IMDb →`;
      el.appendChild(warn);
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

    const link = document.createElement('a');
    link.className = 'nfimdb-panel-link';
    link.href = imdbTitleUrl(result.imdbId);
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'IMDb ↗';
    el.appendChild(link);
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

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

  scan();
  setTimeout(scan, 1500);
  setTimeout(checkBroken, 6000);
  log('ready');
})();
