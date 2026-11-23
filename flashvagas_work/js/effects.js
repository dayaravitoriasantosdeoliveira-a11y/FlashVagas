(() => {
  'use strict';
  const body = document.body;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal dashboard sections and login content once, as they enter the viewport.
  const targets = body.classList.contains('app-page')
    ? document.querySelectorAll('main.dashboard > section')
    : document.querySelectorAll('main > section, .brand-panel, .login-card');

  if ('IntersectionObserver' in window && !reduced) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('story-visible');
        reveal.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });

    targets.forEach((el, i) => {
      el.classList.add('story-reveal');
      el.style.setProperty('--story-delay', `${Math.min(i, 3) * 70}ms`);
      reveal.observe(el);
    });
  } else {
    targets.forEach(el => el.classList.add('story-visible'));
  }

  // Keep ambient decoration only on the login/landing page.
  if (!body.classList.contains('app-page') && !document.querySelector('.fx-ambient')) {
    const ambient = document.createElement('div');
    ambient.className = 'fx-ambient';
    ambient.setAttribute('aria-hidden', 'true');
    ambient.innerHTML = '<span class="fx-orb fx-orb-a"></span><span class="fx-orb fx-orb-b"></span><span class="fx-orb fx-orb-c"></span><span class="fx-grid"></span>';
    body.prepend(ambient);
  }

  if (!document.querySelector('.scroll-progress')) {
    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    body.appendChild(progress);
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }
})();
