const $ = (id) => document.getElementById(id);

function openSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}

$('setup').addEventListener('click', openSettings);
$('settings').addEventListener('click', openSettings);

async function init() {
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;

  let stats = null;
  try { stats = await chrome.runtime.sendMessage({ type: 'stats' }); } catch (e) { /* worker asleep */ }

  const hasKey = !!(stats && stats.hasKey);
  $('needsKey').hidden = hasKey;
  $('isOn').hidden = !hasKey;
  if (!hasKey) return;

  const share = stats.limit ? stats.remaining / stats.limit : 0;
  $('left').textContent = String(stats.remaining);
  $('note').textContent = `of ${stats.limit} lookups left today`;
  $('fill').style.width = Math.round(share * 100) + '%';
  $('meter').dataset.level = share > 0.5 ? 'ok' : share > 0.2 ? 'mid' : 'low';
}

init();
