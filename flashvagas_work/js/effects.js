(() => {
  'use strict';
  const root = document.documentElement;
  const body = document.body;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Animated counters: slower, smooth and driven only by values already loaded by the app.
  const selector = '#coordOpps, #coordApps, #coordStudents, #statOpportunities, #statApplications, #statCertificates, #notificationCount, .count-up';
  const frames = new WeakMap();
  const lastValues = new WeakMap();
  const parseNumber = el => {
    const raw = (el?.textContent || '0').trim().replace(/[^0-9.-]/g, '');
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  };
  function animate(el, target, startValue) {
    if (!el || !Number.isFinite(target)) return;
    const oldFrame = frames.get(el);
    if (oldFrame) cancelAnimationFrame(oldFrame);
    const from = Number.isFinite(startValue) ? startValue : parseNumber(el);
    if (reduced || from === target) {
      el.textContent = String(target);
      frames.delete(el);
      lastValues.set(el, target);
      return;
    }
    el.classList.add('count-animating');
    const start = performance.now();
    // 2.4–3.2 seconds: slower for larger changes, with gentle ease-out.
    const duration = Math.min(3200, Math.max(2400, Math.abs(target - from) * 90));
    const tick = now => {
      const p = Math.min(1, (now - start) / duration);
      const eased = p < .5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3)/2;
      el.textContent = String(Math.round(from + (target - from) * eased));
      if (p < 1) frames.set(el, requestAnimationFrame(tick));
      else {
        el.textContent = String(target);
        el.classList.remove('count-animating');
        frames.delete(el);
        lastValues.set(el, target);
      }
    };
    frames.set(el, requestAnimationFrame(tick));
  }
  function observeCounter(el) {
    if (!el || el.classList.contains('count-animating')) return;
    const target = parseNumber(el);
    const previous = lastValues.has(el) ? lastValues.get(el) : 0;
    lastValues.set(el, target);
    animate(el, target, previous);
  }
  document.querySelectorAll(selector).forEach(el => {
    lastValues.set(el, 0);
    const target = parseNumber(el);
    if (target !== 0) animate(el, target, 0);
    else lastValues.set(el, 0);
  });
  // Counters are animated once after initial page load. Avoid observing their own
  // text mutations: doing so can restart animations repeatedly and freeze the page.


  // Decorative effects are limited to the login/landing screen. Dashboard controls
  // are intentionally left untransformed so mouse, keyboard and touch stay reliable.
  if (!body.classList.contains('app-page')) {
    if (!document.querySelector('.fx-ambient')) {
      const ambient = document.createElement('div');
      ambient.className = 'fx-ambient';
      ambient.setAttribute('aria-hidden', 'true');
      ambient.innerHTML = '<span class="fx-orb fx-orb-a"></span><span class="fx-orb fx-orb-b"></span><span class="fx-orb fx-orb-c"></span><span class="fx-grid"></span>';
      body.prepend(ambient);
    }
    const targets = document.querySelectorAll('main > section, .brand-panel, .login-card');
    if ('IntersectionObserver' in window && !reduced) {
      const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('story-visible');
          reveal.unobserve(entry.target);
        }
      }), {threshold: 0.08});
      targets.forEach((el, i) => {
        el.classList.add('story-reveal');
        el.style.setProperty('--story-delay', `${Math.min(i, 3) * 90}ms`);
        reveal.observe(el);
      });
    }
  }
  if (!document.querySelector('.scroll-progress') && !body.classList.contains('app-page')) {
    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    body.appendChild(progress);
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    };
    window.addEventListener('scroll', update, {passive:true});
    window.addEventListener('resize', update, {passive:true});
    update();
  }
})();
