const KEY = 'jamal-theme';
const THEMES = ['editorial', 'code', 'print', 'sky', 'lava'];
const DEFAULT = 'editorial';

function classFor(t) {
  return 'theme-' + t;
}

function apply(theme) {
  const root = document.documentElement;
  THEMES.forEach((t) => root.classList.remove(classFor(t)));
  root.classList.add(classFor(theme));
  root.setAttribute('data-theme', theme);
  document
    .querySelectorAll('.theme-switch button')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.theme === theme))
    );
  try {
    localStorage.setItem(KEY, theme);
  } catch (e) {
    /* storage unavailable, in-memory only */
  }
  // Notify listeners (3D background scenes, effects) of the active theme
  window.dispatchEvent(new CustomEvent('jamal:theme', { detail: theme }));
}

function current() {
  const m = document.documentElement.className.match(/theme-(\w+)/);
  return m ? m[1] : DEFAULT;
}

function init() {
  let stored = DEFAULT;
  try {
    const v = localStorage.getItem(KEY);
    if (v && THEMES.includes(v)) stored = v;
  } catch (e) {
    /* ignore */
  }
  apply(stored);

  document.querySelectorAll('.theme-switch button').forEach((btn) => {
    btn.addEventListener('click', () => apply(btn.dataset.theme));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 't' && !/input|textarea/i.test(e.target.tagName)) {
      const next = THEMES[(THEMES.indexOf(current()) + 1) % THEMES.length];
      apply(next);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-apply + re-bind after Astro view transitions
document.addEventListener('astro:after-swap', init);
