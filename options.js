const $ = (id) => document.getElementById(id);

const els = {
  pill: $('pill'),
  hero: $('hero'),
  ready: $('ready'),
  setup: $('setup'),
  setupSummary: $('setupSummary'),
  form: $('form'),
  key: $('key'),
  msg: $('msg'),
  save: $('save'),
  quotaLeft: $('quotaLeft'),
  quotaNote: $('quotaNote'),
  meter: $('meter'),
  meterFill: $('meterFill'),
  clearCache: $('clearCache'),
  removeKey: $('removeKey'),
  actionMsg: $('actionMsg'),
  debug: $('debug'),
  ver: $('ver')
};

// A paste can be the bare key, the "Here is your key: ..." line, the whole email,
// or a URL. Pull the key out of whichever, and catch the one wrong thing people
// copy: the activation code in the verify link.
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function parseKey(raw) {
  const text = String(raw || '').trim();
  if (!text) return { error: 'empty' };

  const fromUrl = text.match(/apikey\s*=\s*([a-z0-9]{6,12})\b/i);
  if (fromUrl) return { key: fromUrl[1] };

  const labelled = text.match(/your key\s*[:=]?\s*([a-z0-9]{6,12})\b/i);
  if (labelled) return { key: labelled[1] };

  if (GUID.test(text) || /verifykey/i.test(text)) return { error: 'activation' };

  if (/^[a-z0-9]{6,12}$/i.test(text)) return { key: text };

  return { error: 'malformed' };
}

const PARSE_MESSAGES = {
  empty: 'Paste your key first.',
  activation: 'That’s the activation code from the link, not your key. Your key is the 8 letters and numbers after “Here is your key:”.',
  malformed: 'That doesn’t look like an OMDb key. It’s 8 letters and numbers, like a1b2c3d4.'
};

// ---------------------------------------------------------------- verifying

async function verifyKey(key) {
  let res;
  try {
    res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=tt0133093`);
  } catch (e) {
    return { ok: false, kind: 'network' };
  }

  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON error page */ }
  const error = (body && body.Error) || '';

  if (res.ok && body && body.Response === 'True') {
    return { ok: true, title: body.Title, rating: body.imdbRating };
  }
  if (/limit/i.test(error)) return { ok: true, limited: true };
  if (res.status === 401 || /invalid api key/i.test(error)) return { ok: false, kind: 'invalid' };
  return { ok: false, kind: 'other', detail: error || `HTTP ${res.status}` };
}

// ---------------------------------------------------------------- rendering

function setTicket(state, message) {
  els.form.dataset.state = state;
  els.msg.textContent = message || '';
  els.save.disabled = state === 'checking';
  els.save.textContent =
    state === 'checking' ? 'Checking' :
    state === 'ok' ? 'Saved' : 'Save key';
}

function render(hasKey) {
  els.pill.dataset.tone = hasKey ? 'ok' : 'warn';
  els.pill.textContent = hasKey ? 'Ratings are on' : 'Needs a key';

  els.ready.hidden = !hasKey;
  els.hero.hidden = hasKey;
  for (const id of ['step1', 'step2', 'step3']) {
    const step = $(id);
    if (hasKey) step.setAttribute('data-done', '');
    else step.removeAttribute('data-done');
  }
  els.setupSummary.textContent = hasKey ? 'Setup steps' : 'Set up in three steps';
}

async function refreshQuota() {
  let stats = null;
  try { stats = await chrome.runtime.sendMessage({ type: 'stats' }); } catch (e) { /* worker asleep */ }
  if (!stats) return;

  const share = stats.limit ? stats.remaining / stats.limit : 0;
  els.quotaLeft.textContent = String(stats.remaining);
  els.quotaNote.textContent = `of ${stats.limit} lookups left today`;
  els.meterFill.style.width = Math.round(share * 100) + '%';
  els.meter.dataset.level = share > 0.5 ? 'ok' : share > 0.2 ? 'mid' : 'low';
}

// ---------------------------------------------------------------- actions

async function submit() {
  const parsed = parseKey(els.key.value);
  if (parsed.error) {
    setTicket('error', PARSE_MESSAGES[parsed.error]);
    return;
  }

  els.key.value = parsed.key;
  setTicket('checking', 'Checking with OMDb…');

  const result = await verifyKey(parsed.key);

  if (!result.ok) {
    const text =
      result.kind === 'invalid'
        ? 'OMDb doesn’t recognise that key. If you just signed up, click the activation link in the email first, then save again.'
      : result.kind === 'network'
        ? 'Couldn’t reach OMDb. Check your connection and try again.'
        : `OMDb returned an error: ${result.detail}`;
    setTicket('error', text);
    return;
  }

  await chrome.storage.local.set({ apiKey: parsed.key });

  setTicket('ok', result.limited
    ? 'Saved. This key has used today’s 1,000 lookups, so ratings will return tomorrow.'
    : `Connected. OMDb found “${result.title}”, rated ${result.rating} on IMDb.`);

  render(true);
  refreshQuota();
  setTimeout(() => { els.setup.open = false; }, 1600);
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  submit();
});

// Editing after a result clears it, so a stale "Saved" never sits next to new text.
els.key.addEventListener('input', () => {
  if (els.form.dataset.state !== 'idle') setTicket('idle', '');
});

// Pasting a clean key is the whole job, so check it without another click.
// Read the clipboard itself, not the input: a single-line input strips newlines,
// which would glue the key to the next word of the email ("good1234Please...").
els.key.addEventListener('paste', (e) => {
  const raw = e.clipboardData ? e.clipboardData.getData('text') : els.key.value;
  const parsed = parseKey(raw);

  if (parsed.key) {
    e.preventDefault();
    els.key.value = parsed.key;
    submit();
  } else if (raw.trim()) {
    e.preventDefault();
    els.key.value = raw.replace(/\s+/g, ' ').trim();
    setTicket('error', PARSE_MESSAGES[parsed.error]);
  }
});

els.clearCache.addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith('r:'));
  await chrome.storage.local.remove(keys);
  els.actionMsg.textContent = keys.length
    ? `Cleared ${keys.length} saved rating${keys.length === 1 ? '' : 's'}. They will be fetched again as you browse.`
    : 'Nothing saved yet.';
});

els.removeKey.addEventListener('click', async () => {
  await chrome.storage.local.remove('apiKey');
  els.key.value = '';
  setTicket('idle', '');
  render(false);
  els.setup.open = true;
  els.actionMsg.textContent = 'Key removed. Badges on Netflix will ask for a new one.';
});

els.debug.addEventListener('change', () => {
  chrome.storage.local.set({ debug: els.debug.checked });
});

// ---------------------------------------------------------------- start

async function init() {
  els.ver.textContent = 'v' + chrome.runtime.getManifest().version;

  const { apiKey, debug } = await chrome.storage.local.get(['apiKey', 'debug']);
  els.debug.checked = !!debug;

  if (apiKey) {
    els.key.value = apiKey;
    els.setup.open = false;
  }
  render(!!apiKey);
  refreshQuota();
}

init();
