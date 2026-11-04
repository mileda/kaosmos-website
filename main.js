// KAOSMOS — chaos → cosmos.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
document.getElementById('year').textContent = new Date().getFullYear();

// Shared pointer state. `hold` grows 0→1 while pressed; release triggers a shockwave.
const mouse = { x: -9999, y: -9999, active: false, down: false, hold: 0, blast: null };
const field = { order: 0, alpha: 1 };

if (!reduce) {
  const ignore = '.nav, p, h2, a, button, iframe, dl, .card, figure, input';
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });
  document.addEventListener('pointerleave', () => { mouse.active = false; });
  addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest(ignore)) return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; mouse.down = true;
  });
  addEventListener('pointerup', e => {
    if (mouse.down) mouse.blast = { x: mouse.x, y: mouse.y, power: 0.4 + mouse.hold };
    mouse.down = false;
    if (e.pointerType !== 'mouse') mouse.active = false;  // a lifted finger shouldn't keep repelling
  });
  addEventListener('pointercancel', () => { mouse.down = false; mouse.active = false; }); // touch turned into a scroll
}

// ---------- Particle field: drift (kaos) → orbiting disk (kosmos), with pointer physics ----------
(() => {
  const cv = document.getElementById('field');
  const ctx = cv.getContext('2d');
  let W, H, P = [];

  function init() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(1000, Math.round(W * H / 1500));
    const maxR = Math.max(W, H) * 0.55;
    P = Array.from({ length: n }, () => {
      const r = 40 + Math.pow(Math.random(), 0.8) * maxR;
      return {
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
        r, a: Math.random() * Math.PI * 2, w: 0.9 / Math.sqrt(r), // keplerian: inner rings spin faster
        s: Math.random() * 1.3 + .3, red: r < maxR * 0.22 && Math.random() < .6,
        ox: 0, oy: 0, ovx: 0, ovy: 0,                               // physics offset from the base path
      };
    });
  }

  function frame() {
    const o = field.order, e = o * o * (3 - 2 * o);
    mouse.hold += ((mouse.down ? 1 : 0) - mouse.hold) * (mouse.down ? 0.02 : 0.15);
    const { x: mx, y: my, active, down, hold } = mouse;
    const blast = mouse.blast; mouse.blast = null;

    ctx.fillStyle = 'rgba(23,24,26,0.32)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, tilt = 0.32;

    for (const p of P) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x += W; if (p.x > W) p.x -= W;
      if (p.y < 0) p.y += H; if (p.y > H) p.y -= H;
      p.a += p.w * (0.15 + e);
      const bx = p.x + (cx + Math.cos(p.a) * p.r - p.x) * e;
      const by = p.y + (cy + Math.sin(p.a) * p.r * tilt - p.y) * e;
      let px = bx + p.ox, py = by + p.oy;

      if (active || blast) {
        const dx = px - (blast ? blast.x : mx), dy = py - (blast ? blast.y : my);
        const d = Math.hypot(dx, dy) + 0.01;
        if (blast && d < 800) {
          const f = 30 * blast.power * (1 - d / 800);
          p.ovx += dx / d * f; p.ovy += dy / d * f;
        } else if (down && d < 520) {
          const f = (1 - d / 520) * (0.9 + hold * 1.6);        // gravity well…
          p.ovx += (-dx / d + -dy / d * 0.9) * f;               // …with a swirl, like an accretion vortex
          p.ovy += (-dy / d + dx / d * 0.9) * f;
        } else if (!down && d < 130) {
          const f = (1 - d / 130) * 2.4;                        // gentle repel on hover
          p.ovx += dx / d * f; p.ovy += dy / d * f;
        }
      }
      const k = down ? 0.002 : 0.014;                           // spring back to the path
      p.ovx = (p.ovx - p.ox * k) * 0.92; p.ovy = (p.ovy - p.oy * k) * 0.92;
      p.ox += p.ovx; p.oy += p.ovy;
      px = bx + p.ox; py = by + p.oy;

      const sp = Math.min(Math.hypot(p.ovx, p.ovy), 12);
      ctx.globalAlpha = field.alpha * Math.min(1, (p.red ? .9 : .55) + sp * 0.05);
      ctx.fillStyle = p.red || sp > 6 ? '#c8323a' : '#d8d5cf';
      ctx.fillRect(px, py, p.s + sp * 0.25, p.s + sp * 0.25);
    }

    // the singularity under the cursor while holding
    if (hold > 0.02 && active) {
      const r = 6 + hold * 26;
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(mx, my, r * .6, mx, my, r * 2.4);
      g.addColorStop(0, 'rgba(200,50,58,.55)'); g.addColorStop(1, 'rgba(200,50,58,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, r * 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    tickLetters(blast);
    tickCursor();
    if (!reduce) requestAnimationFrame(frame);
  }

  init(); requestAnimationFrame(frame);
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(init, 200); });
})();

// ---------- Hero letters: springs pushed by the cursor (CSS `translate`, so GSAP transforms stay intact) ----------
const letters = [...document.querySelectorAll('.hero__title span')].map(el => ({ el, x: 0, y: 0, vx: 0, vy: 0 }));
function tickLetters(blast) {
  if (reduce || scrollY > innerHeight) return;
  for (const L of letters) {
    const r = L.el.getBoundingClientRect();
    const cx = r.left + r.width / 2 - L.x, cy = r.top + r.height / 2 - L.y;
    const px = cx + L.x, py = cy + L.y;
    const src = blast || (mouse.active && mouse);
    if (src) {
      const dx = px - src.x, dy = py - src.y, d = Math.hypot(dx, dy) + 0.01;
      if (blast) { const f = 40 * blast.power * Math.max(0, 1 - d / 900); L.vx += dx / d * f; L.vy += dy / d * f; }
      else if (mouse.down) { const f = Math.max(0, 1 - d / 600) * 1.4; L.vx -= dx / d * f; L.vy -= dy / d * f; }
      else if (d < 200) { const f = (1 - d / 200) * 5; L.vx += dx / d * f; L.vy += dy / d * f; }
    }
    L.vx = (L.vx - L.x * 0.06) * 0.85; L.vy = (L.vy - L.y * 0.06) * 0.85;
    L.x += L.vx; L.y += L.vy;
    L.el.style.translate = `${L.x.toFixed(1)}px ${L.y.toFixed(1)}px`;
  }
}

// ---------- Custom cursor (mouse only) ----------
const cur = document.querySelector('.cursor');
const cp = { x: 0, y: 0 };
if (finePointer && !reduce) {
  document.documentElement.classList.add('has-cursor');
  document.addEventListener('pointerover', e => cur.classList.toggle('cursor--link', !!e.target.closest('a, button')));
}
function tickCursor() {
  if (!finePointer || reduce) return;
  cp.x += (mouse.x - cp.x) * 0.2; cp.y += (mouse.y - cp.y) * 0.2;
  cur.style.translate = `${cp.x}px ${cp.y}px`;
  cur.classList.toggle('cursor--hold', mouse.down);
}

// ---------- Card tilt + magnetic buttons ----------
if (finePointer && !reduce) {
  document.querySelectorAll('.card').forEach(c => {
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.transform = `perspective(900px) rotateX(${(-y * 16).toFixed(2)}deg) rotateY(${(x * 16).toFixed(2)}deg)`;
      c.style.setProperty('--gx', `${(x + .5) * 100}%`); c.style.setProperty('--gy', `${(y + .5) * 100}%`);
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  });
  document.querySelectorAll('.btn').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.translate = `${(e.clientX - r.left - r.width / 2) * .3}px ${(e.clientY - r.top - r.height / 2) * .4}px`;
    });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  });
}

// ---------- Scroll choreography (static and readable if GSAP fails to load) ----------
if (window.gsap && window.ScrollTrigger && !reduce) {
  gsap.registerPlugin(ScrollTrigger);

  gsap.from('.hero__title span', {
    x: () => gsap.utils.random(-300, 300), y: () => gsap.utils.random(-200, 200),
    rotate: () => gsap.utils.random(-90, 90), opacity: 0, filter: 'blur(12px)',
    duration: 2.2, ease: 'expo.out', stagger: { each: .08, from: 'random' },
  });
  gsap.from('.hero__content .label, .hero__sub, .hero__cue', { opacity: 0, y: 20, duration: 1.4, delay: 1.2, stagger: .15 });

  // Hero: zoom through the title into the dark.
  gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
    .to('.hero__photo img', { scale: 1.6, opacity: 0, ease: 'none' }, 0)
    .to('.hero__content', { scale: 2.2, opacity: 0, filter: 'blur(10px)', ease: 'power1.in' }, 0)
    .to('.hero__cue', { opacity: 0, ease: 'none' }, 0);

  gsap.to(field, { order: 1, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', endTrigger: '.manifest', end: 'center center', scrub: 1 } });
  gsap.to(field, { alpha: .35, ease: 'none', scrollTrigger: { trigger: '.latest', start: 'top bottom', end: 'top center', scrub: true } });

  // Manifest: words light up and settle from a slight zoom. Rebuilt when the language changes.
  let manST;
  function buildManifest() {
    manST?.scrollTrigger?.kill(); manST?.kill();
    const mt = document.querySelector('.manifest__text');
    mt.innerHTML = mt.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
    manST = gsap.fromTo('.manifest__text .w', { opacity: .12, scale: 1.25, filter: 'blur(4px)' },
      { opacity: 1, scale: 1, filter: 'blur(0px)', stagger: .1, ease: 'none',
        scrollTrigger: { trigger: '.manifest', start: 'top 70%', end: 'bottom 70%', scrub: true } });
  }
  buildManifest();
  document.addEventListener('langchange', () => { buildManifest(); ScrollTrigger.refresh(); });

  // Portal: a pinned circle opens onto a live photo while a word rushes past the camera.
  gsap.set('.portal__media', { clipPath: 'circle(6% at 50% 50%)' });
  gsap.timeline({ scrollTrigger: { trigger: '.portal', start: 'top top', end: '+=180%', pin: true, scrub: 1 } })
    .fromTo('.portal__media img', { scale: 1.9 }, { scale: 1, ease: 'none' }, 0)
    .to('.portal__media', { clipPath: 'circle(75% at 50% 50%)', ease: 'power2.in' }, 0)
    .fromTo('.portal__word', { scale: .4, opacity: 0 }, { scale: 1, opacity: 1, ease: 'power1.out', duration: .45 }, 0)
    .to('.portal__word', { scale: 6, opacity: 0, filter: 'blur(14px)', ease: 'power2.in', duration: .55 }, .45)
    .to(field, { alpha: .1, ease: 'none' }, 0);

  // Zoom reveals: clip opens while the image zooms out.
  gsap.utils.toArray('.zoom').forEach(el => {
    gsap.timeline({ scrollTrigger: { trigger: el, start: 'top bottom', end: 'center center', scrub: 1 } })
      .fromTo(el, { clipPath: 'inset(18% 18% 18% 18%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none' }, 0)
      .fromTo(el.querySelector('img'), { scale: 1.6 }, { scale: 1, ease: 'none' }, 0);
  });

  gsap.utils.toArray('.reveal').forEach(el => gsap.from(el, {
    y: 60, opacity: 0, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' },
  }));

  // Discography: pinned horizontal timeline; covers zoom up as they reach the middle.
  gsap.matchMedia().add('(min-width: 861px)', () => {
    const track = document.querySelector('.disco__track');
    const dist = () => track.scrollWidth - innerWidth;
    const h = gsap.to(track, { x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: '.disco', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true } });
    gsap.utils.toArray('.card img').forEach(img => gsap.fromTo(img, { scale: .78 }, { scale: 1, ease: 'none',
      scrollTrigger: { trigger: img, containerAnimation: h, start: 'left right', end: 'center center', scrub: true } }));
  });

  // Gallery: parallax + slow zoom-out.
  gsap.utils.toArray('.g').forEach(g => {
    const s = parseFloat(g.dataset.speed) || 0;
    gsap.fromTo(g.querySelector('img'), { yPercent: -s * 100, scale: 1.45 }, { yPercent: s * 100, scale: 1.1, ease: 'none',
      scrollTrigger: { trigger: g, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from(g, { opacity: 0, y: 80, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: g, start: 'top 90%' } });
  });

  // Contact: the address zooms in from the distance.
  gsap.fromTo('.contact__mail', { scale: .45, opacity: 0, filter: 'blur(8px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', ease: 'none',
    scrollTrigger: { trigger: '.contact', start: 'top bottom', end: 'center center', scrub: true } });

  addEventListener('load', () => ScrollTrigger.refresh());
}
