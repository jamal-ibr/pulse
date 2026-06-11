/**
 * Motion effects: scroll-reveal on content blocks everywhere, and a
 * pointer-tracking 3D tilt on cards in the Sky and Lava themes.
 * Both are skipped entirely when the user prefers reduced motion.
 */

const REVEAL_SELECTOR =
  '.card, .now-item, .stat, .prose-block, .writing-item, .contact-row, .stack-group';
const TILT_THEMES = ['sky', 'lava'];
const TILT_MAX_DEG = 6;

const motionOk = () =>
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setupReveal() {
  if (!motionOk() || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('reveal-ready');

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll(REVEAL_SELECTOR).forEach((el) => {
    el.classList.add('reveal');
    io.observe(el);
  });
}

function setupTilt() {
  if (!motionOk()) return;

  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (!TILT_THEMES.includes(theme)) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${
        px * TILT_MAX_DEG
      }deg) rotateX(${-py * TILT_MAX_DEG}deg) translateY(-2px)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}

function init() {
  setupReveal();
  setupTilt();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

document.addEventListener('astro:after-swap', init);
