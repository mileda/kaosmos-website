// Live gallery lightbox: click (or Enter) a photo to see it full screen.
// Arrows / swipe to move through the set, Esc or a click outside the photo to close.
// window.kaosmosLightbox(root) wires up any gallery added later (the galaxy page's chapters).
(() => {
  let photos = [], box = null, im, cap, count, openAt = null;
  function build() {
  box = document.createElement('div');
  box.className = 'lb';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Photo viewer');
  box.hidden = true;
  box.innerHTML = `
    <figure class="lb__fig"><img class="lb__img" alt=""><figcaption class="lb__cap label"></figcaption></figure>
    <button class="lb__btn lb__close" type="button" aria-label="Close">×</button>
    <button class="lb__btn lb__prev" type="button" aria-label="Previous photo">←</button>
    <button class="lb__btn lb__next" type="button" aria-label="Next photo">→</button>
    <span class="lb__count label" aria-live="polite"></span>`;
  document.body.appendChild(box);
  im = box.querySelector('.lb__img'); cap = box.querySelector('.lb__cap'); count = box.querySelector('.lb__count');

  let at = 0, last = null;
  function show(i) {
    at = (i + photos.length) % photos.length;
    const p = photos[at];
    im.classList.remove('in');
    im.onload = () => requestAnimationFrame(() => im.classList.add('in'));
    im.removeAttribute('srcset');
    if (p.srcset) { im.sizes = '100vw'; im.srcset = p.srcset; }
    im.src = p.jpg; im.alt = p.alt;
    if (im.complete) im.onload();
    cap.textContent = p.alt;
    count.textContent = `${String(at + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}`;
    // warm the neighbours so arrows feel instant
    [at - 1, at + 1].forEach(j => { const q = photos[(j + photos.length) % photos.length]; const pre = new Image(); if (q.srcset) { pre.sizes = '100vw'; pre.srcset = q.srcset; } pre.src = q.jpg; });
  }
  function open(i) {
    last = document.activeElement;
    show(i);
    box.hidden = false;
    document.documentElement.classList.add('lb-open');
    requestAnimationFrame(() => box.classList.add('on'));
    box.querySelector('.lb__close').focus({ preventScroll: true });
    window.track?.('photo', { n: i + 1 });
  }
  function close() {
    box.classList.remove('on');
    document.documentElement.classList.remove('lb-open');
    setTimeout(() => { box.hidden = true; }, 350);
    last?.focus?.({ preventScroll: true });
  }

  openAt = open;
  box.querySelector('.lb__close').addEventListener('click', close);
  box.querySelector('.lb__prev').addEventListener('click', () => show(at - 1));
  box.querySelector('.lb__next').addEventListener('click', () => show(at + 1));
  box.addEventListener('click', e => { if (e.target === box || e.target.classList.contains('lb__fig')) close(); });
  addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(at - 1);
    else if (e.key === 'ArrowRight') show(at + 1);
    else if (e.key === 'Tab') {                                     // keep focus inside the viewer
      const b = [...box.querySelectorAll('button')], i = b.indexOf(document.activeElement);
      e.preventDefault(); b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus();
    }
  });
  let sx = null, sy = 0;                                              // swipe on phones
  box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(at + (dx < 0 ? 1 : -1));
    else if (dy > 90) close();                                         // pull down to close
  });
  }

  function init(root = document) {
    const figs = [...root.querySelectorAll('.gallery .g')];
    if (!figs.length) return;
    if (!box) build();
    const set = figs.map(f => {
      const img = f.querySelector('img'), src = f.querySelector('source');
      return { srcset: src ? src.srcset : '', jpg: img.src, alt: img.alt };
    });
    figs.forEach((f, i) => {
      f.tabIndex = 0;
      f.setAttribute('role', 'button');
      f.setAttribute('aria-label', `Open photo: ${set[i].alt}`);
      const go = () => { photos = set; openAt(i); };
      f.addEventListener('click', go);
      f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  window.kaosmosLightbox = init;
  init();
})();
