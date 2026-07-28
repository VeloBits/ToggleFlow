/** Light/dark theme switching — same convention as fixmytext (`body.dark`). */
const STORAGE_KEY = 'tf.theme';

export function initTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const dark = stored
    ? stored === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark', dark);
}

export function isDark() {
  return document.body.classList.contains('dark');
}

export function toggleTheme(): boolean {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  return dark;
}
