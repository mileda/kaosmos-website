// Event tracking. Everything goes through track(name, data), which forwards to Umami
// (cookieless) once its script is on the page. Swap the body of send() to use another provider.
(() => {
  const queue = [];
  const dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const send = (name, data) => window.umami.track(name, data);

  window.track = (name, data) => {
    if (dev) console.debug('[track]', name, data || '');
    if (window.umami?.track) send(name, data); else if (queue.length < 50) queue.push([name, data]);
  };
  // Umami loads with `defer`; flush anything tracked before it arrived.
  const flush = setInterval(() => {
    if (!window.umami?.track) return;
    clearInterval(flush); queue.splice(0).forEach(([n, d]) => send(n, d));
  }, 500);
  setTimeout(() => clearInterval(flush), 15000);

  document.addEventListener('DOMContentLoaded', () => {
    // Which sections people actually reach (once each per visit).
    const seen = new Set();
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      const id = e.target.dataset.track;
      if (e.isIntersecting && !seen.has(id)) { seen.add(id); track('section-view', { section: id }); }
    }), { threshold: 0.35 });
    [['.manifest', 'manifest'], ['.portal', 'portal'], ['.latest', 'latest-release'], ['.disco', 'discography'],
     ['.live', 'live'], ['.about', 'about'], ['.contact', 'contact']].forEach(([sel, id]) => {
      const el = document.querySelector(sel); if (el) { el.dataset.track = id; io.observe(el); }
    });

    // Outbound clicks: Bandcamp albums, SoundCloud, email.
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]'); if (!a) return;
      const href = a.getAttribute('href');
      const where = a.closest('[data-track]')?.dataset.track || a.closest('section, header, footer')?.className.split(' ')[0] || 'page';
      if (href.startsWith('mailto:')) track('email-click', { where });
      else if (href.includes('bandcamp.com')) track('bandcamp-click', { album: href.split('/album/')[1] || 'profile', where });
      else if (href.includes('soundcloud.com')) track('soundcloud-click', { where });
      else if (href.startsWith('#')) track('nav-click', { to: href.slice(1) || 'top' });
    });

    // How far down the page people get.
    const marks = [25, 50, 75, 100], hit = new Set();
    addEventListener('scroll', () => {
      const pct = (scrollY + innerHeight) / document.documentElement.scrollHeight * 100;
      marks.forEach(m => { if (pct >= m - 1 && !hit.has(m)) { hit.add(m); track('scroll-depth', { percent: m }); } });
    }, { passive: true });
  });
})();
