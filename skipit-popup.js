// Skipping section of the popup. Separate from popup.js, which returns early
// when no OMDb key is set; skipping does not need a key.

(() => {
  const DEFAULTS = {
    sites: { youtube: true, netflix: true, prime: true },
    types: { ytAd: true, ytOverlay: true, intro: true, recap: true, credits: true },
  };

  chrome.storage.sync.get('skipit', ({ skipit }) => {
    const state = {
      sites: { ...DEFAULTS.sites, ...(skipit && skipit.sites) },
      types: { ...DEFAULTS.types, ...(skipit && skipit.types) },
    };

    document.querySelectorAll('.skip input[type="checkbox"]').forEach((box) => {
      const { group, key } = box.dataset;
      box.checked = state[group][key];
      box.addEventListener('change', () => {
        state[group][key] = box.checked;
        chrome.storage.sync.set({ skipit: state });
      });
    });
  });

  const renderStats = () => {
    chrome.storage.local.get('skipitStats', ({ skipitStats }) => {
      const today = new Date().toDateString();
      const s = skipitStats || { total: 0, day: today, today: 0 };
      document.getElementById('skToday').textContent = String(s.day === today ? s.today : 0);
    });
  };

  renderStats();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.skipitStats) renderStats();
  });
})();
