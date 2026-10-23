// Two small things: a copy button, and tap-to-open for the demo cards (touch screens have no hover).
const btn = document.getElementById('copy');
if (btn) {
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch (e) {
      // Clipboard API blocked (insecure context, permissions): select the text instead.
      const pre = btn.closest('.clone').querySelector('pre');
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
  });
}

const cells = document.querySelectorAll('.cell');
cells.forEach((cell) => {
  cell.addEventListener('click', () => {
    const wasOpen = cell.classList.contains('open');
    cells.forEach((c) => c.classList.remove('open'));
    if (!wasOpen) cell.classList.add('open');
  });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.cell')) cells.forEach((c) => c.classList.remove('open'));
});
