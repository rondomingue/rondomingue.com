(() => {
  const root = document.documentElement;
  const button = document.querySelector('[data-theme-toggle]');
  if (!button) return;

  const label = button.querySelector('[data-theme-toggle-text]');

  const applyTheme = theme => {
    const isLight = theme === 'light';
    root.dataset.theme = isLight ? 'light' : 'dark';
    button.setAttribute('aria-pressed', String(isLight));
    button.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    if (label) label.textContent = isLight ? 'Light' : 'Dark';
  };

  let initialTheme = 'dark';
  try {
    initialTheme = localStorage.getItem('rd-theme') === 'light' ? 'light' : 'dark';
  } catch (error) {}

  applyTheme(initialTheme);

  button.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    try {
      if (nextTheme === 'light') localStorage.setItem('rd-theme', 'light');
      else localStorage.removeItem('rd-theme');
    } catch (error) {}
  });
})();
