(() => {
  'use strict';

  const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const app = document.querySelector('#app');
  if (!app || REDUCED || !Element.prototype.animate) return;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  // Closed-form underdamped step response. Small overshoot, no bouncy easing.
  function spring(t, omega = 10.5, zeta = 0.82) {
    if (t <= 0) return 0;
    if (t >= 1) t = 1;
    const wd = omega * Math.sqrt(Math.max(0.0001, 1 - zeta * zeta));
    return 1 - Math.exp(-zeta * omega * t) *
      (Math.cos(wd * t) + (zeta * omega / wd) * Math.sin(wd * t));
  }

  function springFrames(from, to, count = 16, omega = 10.5, zeta = 0.82) {
    return Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      const s = spring(t, omega, zeta);
      return from + (to - from) * s;
    });
  }

  function enterElement(el, delay = 0) {
    if (!el || el.dataset.aosMotionSeen === '1') return;
    el.dataset.aosMotionSeen = '1';
    el.classList.add('aos-motion-target');

    const ys = springFrames(13, 0, 15);
    const scales = springFrames(0.986, 1, 15);
    const opacities = springFrames(0, 1, 15, 11.5, 0.9).map(clamp);
    const blur = springFrames(5.5, 0, 15, 11.5, 0.9).map(v => Math.max(0, v));

    const frames = ys.map((y, i) => ({
      transform: `translate3d(0, ${y.toFixed(3)}px, 0) scale(${scales[i].toFixed(5)})`,
      opacity: opacities[i],
      filter: `blur(${blur[i].toFixed(3)}px)`,
      offset: i / (ys.length - 1)
    }));

    el.animate(frames, {
      duration: 480,
      delay,
      easing: 'linear',
      fill: 'both'
    }).finished.catch(() => {}).then(() => {
      el.style.removeProperty('filter');
      el.style.removeProperty('opacity');
    });
  }

  function revealProgress(root = app) {
    const bars = root.querySelectorAll('.premium-progress > i, .progress > span, .bar-fill, .chart-bar, .mini-bar, .income-bar, .home-week-bar > span');
    bars.forEach((bar, index) => {
      if (bar.dataset.aosProgressSeen === '1') return;
      bar.dataset.aosProgressSeen = '1';
      bar.classList.add('aos-progress-reveal');
      const values = springFrames(0.02, 1, 18, 10.8, 0.84);
      bar.animate(values.map((x, i) => ({
        transform: `scaleX(${Math.max(0.02, x).toFixed(4)})`,
        opacity: clamp(x * 1.15),
        offset: i / (values.length - 1)
      })), {
        duration: 610,
        delay: Math.min(index * 22, 180),
        easing: 'linear',
        fill: 'both'
      }).finished.catch(() => {});
    });
  }

  function animateScreen() {
    // Do not replay the whole scene on each keystroke in task search.
    if (document.activeElement?.id === 'taskSearch') return;

    const priority = [
      '.premium-home-welcome',
      '.home-premium-capital',
      '.finance-master-card',
      '.task-view-tabs',
      '.project-tabs',
      '.progress-period-tabs',
      '.progress-command-card'
    ];

    let delay = 0;
    priority.forEach(selector => {
      app.querySelectorAll(selector).forEach(el => {
        enterElement(el, delay);
        delay += 34;
      });
    });

    const items = app.querySelectorAll([
      '.home-goal-card', '.strategy-mini', '.home-week-expense-card', '.home-habit-preview',
      '.finance-tool', '.chart-card', '.category-list', '.item', '.project-card',
      '.progress-kpi-card', '.progress-streak-card', '.goal-card', '.habit-card',
      '.body-tracker-card', '.strategy-card', '.settings-row', '.settings-profile-card'
    ].join(','));

    items.forEach((el, index) => enterElement(el, 52 + Math.min(index, 10) * 27));
    revealProgress(app);
  }

  function press(el, down) {
    if (!el || el.disabled) return;
    el.getAnimations?.().forEach(anim => {
      if (anim.id === 'aosPress') anim.cancel();
    });

    if (down) {
      const a = el.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(.972)' }
      ], { duration: 90, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
      a.id = 'aosPress';
      return;
    }

    const values = springFrames(0.972, 1, 12, 12, 0.82);
    const a = el.animate(values.map((s, i) => ({
      transform: `scale(${s.toFixed(5)})`,
      offset: i / (values.length - 1)
    })), { duration: 330, easing: 'linear', fill: 'forwards' });
    a.id = 'aosPress';
    a.finished.catch(() => {}).then(() => el.style.removeProperty('transform'));
  }

  function isPressTarget(node) {
    return node?.closest?.('button, .card[data-go], .settings-row, .finance-tool, .task-ideas-link, .project-card .mini-btn');
  }

  document.addEventListener('pointerdown', event => {
    const target = isPressTarget(event.target);
    if (target) press(target, true);
  }, { passive: true });

  const release = event => {
    const target = isPressTarget(event.target);
    if (target) press(target, false);
  };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });

  // Checkbox feedback: fast direct manipulation, then a restrained spring settle.
  document.addEventListener('change', event => {
    const box = event.target.closest?.('.check, input[type="checkbox"]');
    if (!box) return;
    const values = springFrames(0.82, 1, 12, 13, 0.78);
    box.animate(values.map((s, i) => ({
      transform: `scale(${s.toFixed(4)})`,
      offset: i / (values.length - 1)
    })), { duration: 320, easing: 'linear' });
  });

  // Nav active icon morph. The page renderer changes .active synchronously.
  const nav = document.querySelector('.bottom-nav');
  nav?.addEventListener('click', event => {
    const item = event.target.closest('.nav-item');
    if (!item) return;
    requestAnimationFrame(() => {
      const active = nav.querySelector('.nav-item.active');
      if (!active) return;
      const icon = active.querySelector('svg');
      const frames = springFrames(0.78, 1, 13, 12.5, 0.8);
      icon?.animate(frames.map((s, i) => ({
        transform: `scale(${s.toFixed(4)})`,
        offset: i / (frames.length - 1)
      })), { duration: 360, easing: 'linear' });
    });
  });

  // Re-run only for fresh DOM nodes after screen/tab renders.
  let queued = false;
  const observer = new MutationObserver(mutations => {
    if (!mutations.some(m => m.addedNodes.length)) return;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      animateScreen();
    });
  });
  observer.observe(app, { childList: true, subtree: true });

  // Initial render.
  requestAnimationFrame(() => animateScreen());

  document.documentElement.classList.add('aos-motion-v15');
})();
