const keyInput = document.getElementById('key');
const statusEl = document.getElementById('status');
const quotaEl = document.getElementById('quota');

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status ' + (cls || '');
}

async function refreshQuota() {
  const stats = await chrome.runtime.sendMessage({ type: 'stats' });
  if (!stats) return;
  quotaEl.textContent = `${stats.remaining} of ${stats.limit} lookups left today.`;
}

async function load() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (apiKey) keyInput.value = apiKey;
  refreshQuota();
}

document.getElementById('save').addEventListener('click', async () => {
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    setStatus('Enter a key first.', 'err');
    return;
  }
  await chrome.storage.local.set({ apiKey });
  setStatus('Saved. Reload any open Netflix tab.', 'ok');
});

document.getElementById('test').addEventListener('click', async () => {
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    setStatus('Enter a key first.', 'err');
    return;
  }
  setStatus('Testing…');
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&t=Inception&y=2010`);
    const json = await res.json();
    if (json.Response === 'True') {
      setStatus(`Key works — got "${json.Title}" (${json.Year}), IMDb ${json.imdbRating}.`, 'ok');
    } else {
      setStatus('OMDb rejected it: ' + (json.Error || 'unknown error'), 'err');
    }
  } catch (e) {
    setStatus('Request failed: ' + e.message, 'err');
  }
});

document.getElementById('clearCache').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith('r:'));
  await chrome.storage.local.remove(keys);
  setStatus(`Cleared ${keys.length} cached ratings.`, 'ok');
});

load();
