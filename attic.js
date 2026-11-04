// Attic window: a heavy sheer curtain (verlet cloth) in front of a night skylight over Istanbul.
// Moonlight shines through the fabric, leaks round its edges and throws beams into the room
// that change as the curtain moves. Pulling it plays reverberant ambient sound; presets change the voice.
(() => {
  const sec = document.querySelector('.attic');
  if (!sec) return;
  const cv = sec.querySelector('.attic__scene');
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const fab = mk(1, 1), fctx = fab.getContext('2d', { willReadFrequently: true });   // curtain layer (also read back for light coverage)

  let W, H, dpr, win, rod, moon, COLS, ROWS, P = [], C = [], restW;
  let bgCan, skyCan, cloudCan, moonCan, glassCan, frameCan, vigCan;
  let twinkle = [], drops = [], shoot = null, cover = new Float32Array(32);
  let visible = false, grabbed = null, gx = 0, gy = 0, lastX = 0, lastY = 0, speed = 0, travel = 0, openness = 0, played = false;

  // ---------- noise ----------
  let seed = 7;
  const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const PERM = new Uint8Array(512); { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
  const hash = (i, j) => PERM[(PERM[i & 255] + j) & 255] / 255;
  function vn(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, o = 5) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vn(x * f, y * f); f *= 2.03; a *= .5; } return s; };
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- layout ----------
  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const phone = W < 700;
    COLS = phone ? 14 : 22; ROWS = phone ? 28 : 38;
    const ww = Math.min(W * (phone ? .7 : .5), 480), wh = Math.min(ww * 1.32, H * (phone ? .55 : .6));
    win = { x: W / 2 - ww / 2, y: H * (phone ? .25 : .16), w: ww, h: wh, inset: ww * .07, ft: Math.max(10, ww * .045) };
    rod = { y: win.y - win.ft - 12, x0: win.x - ww * .24, x1: win.x + ww * 1.24 };
    moon = { x: win.x + win.w * .7, y: win.y + win.h * .24, r: win.w * .062 };
    seed = 7;
    buildRoom(); buildSky(); buildClouds(); buildMoon(); buildGlass(); buildFrame(); buildVignette(); buildCloth();
    twinkle = Array.from({ length: 36 }, () => ({ x: win.x + rand() * win.w, y: win.y + rand() * win.h * .7, s: .8 + rand() * 1.2, p: rand() * 6.3, f: .5 + rand() * 1.8 }));
    drops = Array.from({ length: 9 }, () => ({ x: win.x + rand() * win.w, y: win.y + rand() * win.h, v: .2 + rand() * .5, l: 6 + rand() * 16 }));
  }

  // window glass shape: skylight trapezoid (top slightly narrower, it sits in the roof slope)
  const winPath = (c, o = 0) => {
    c.beginPath();
    c.moveTo(win.x + win.inset - o, win.y - o); c.lineTo(win.x + win.w - win.inset + o, win.y - o);
    c.lineTo(win.x + win.w + o, win.y + win.h + o); c.lineTo(win.x - o, win.y + win.h + o); c.closePath();
  };
  const inWindow = (x, y) => {                          // soft 0..1, how far inside the glass a point is
    if (y < win.y || y > win.y + win.h) return 0;
    const t = (y - win.y) / win.h, l = win.x + win.inset * (1 - t), r = win.x + win.w - win.inset * (1 - t);
    return sstep(0, 18, Math.min(x - l, r - x, y - win.y, win.y + win.h - y));
  };

  // ---------- static textures ----------
  function noiseCanvas(w, h, fn) {                      // fill a low-res canvas from fn(nx, ny) -> [r,g,b,a]
    const c = mk(w, h), cx = c.getContext('2d'), id = cx.createImageData(c.width, c.height), d = id.data;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const [r, g, b, a] = fn(x / c.width, y / c.height), i = (y * c.width + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
    cx.putImageData(id, 0, 0); return c;
  }

  function buildRoom() {
    bgCan = mk(W * dpr, H * dpr); const c = bgCan.getContext('2d'); c.scale(dpr, dpr);
    const plaster = noiseCanvas(W / 4, H / 4, (x, y) => { const n = fbm(x * 9, y * 9, 4) * 14; return [14 + n, 15 + n, 18 + n, 255]; });
    c.imageSmoothingEnabled = true; c.drawImage(plaster, 0, 0, W, H);
    const floorY = H * .86, vx = W / 2, vy = win.y + win.h * .55;   // vanishing point
    // sloped ceiling rafters converging to the window
    c.lineCap = 'round';
    for (let i = -7; i <= 7; i++) {
      if (!i) continue;
      const x0 = vx + i * W * .16;
      const g = c.createLinearGradient(x0, 0, vx, vy); g.addColorStop(0, 'rgba(40,32,26,.9)'); g.addColorStop(1, 'rgba(40,32,26,0)');
      c.strokeStyle = g; c.lineWidth = 10 + Math.abs(i) * 2;
      c.beginPath(); c.moveTo(x0, -10); c.lineTo(vx + i * win.w * .52, win.y - win.ft * 1.5); c.stroke();
      c.strokeStyle = 'rgba(160,170,190,.05)'; c.lineWidth = 1;          // moonlit edge of each rafter
      c.beginPath(); c.moveTo(x0 + (i < 0 ? 6 : -6), -10); c.lineTo(vx + i * win.w * .52 + (i < 0 ? 3 : -3), win.y - win.ft * 1.5); c.stroke();
    }
    // floor planks
    const fg = c.createLinearGradient(0, floorY, 0, H); fg.addColorStop(0, '#0d0c0c'); fg.addColorStop(1, '#151210');
    c.fillStyle = fg; c.fillRect(0, floorY, W, H - floorY);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1;
    for (let i = -14; i <= 14; i++) { c.beginPath(); c.moveTo(vx + i * 12, floorY); c.lineTo(vx + i * W * .12, H); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, floorY - 2, W, 3);
  }

  function buildSky() {
    const sw = win.w, sh = win.h;
    // band of the Milky Way crossing the window diagonally, with dust lanes
    const lowres = noiseCanvas(sw / 2, sh / 2, (x, y) => {
      const t = y;
      let r = 4 + 10 * t, g = 6 + 16 * t, b = 14 + 34 * t;                         // deep blue gradient
      const dx = .9, dy = -.95, len = Math.hypot(dx, dy), d = Math.abs((x - .08) * dy - (y - .95) * dx) / len;
      const band = Math.exp(-((d / .16) ** 2)), n = fbm(x * 5 + 2, y * 5, 5), dust = fbm(x * 16 + 7, y * 16 + 3, 4);
      let mw = band * (.3 + .7 * n) - band * sstep(.52, .7, dust) * .55; mw = Math.max(0, mw);
      const core = Math.exp(-(((x - .55) / .22) ** 2 + ((y - .42) / .22) ** 2)) * band;
      r += 75 * mw + 40 * core; g += 72 * mw + 26 * core; b += 98 * mw + 14 * core;
      const hz = sstep(.62, 1, y);                                                // city glow near the horizon
      r += 70 * hz; g += 34 * hz; b += 26 * hz;
      return [r, g, b, 255];
    });
    skyCan = mk(sw * dpr, sh * dpr); const c = skyCan.getContext('2d');
    c.imageSmoothingEnabled = true; c.drawImage(lowres, 0, 0, skyCan.width, skyCan.height); c.scale(dpr, dpr);
    // star field: denser inside the Milky Way, varied colour temperature
    const cols = ['255,255,255', '200,215,255', '255,236,210', '255,214,180', '220,230,255'];
    for (let i = 0; i < 1100; i++) {
      const x = rand() * sw, y = rand() * sh * .85, nx = x / sw, ny = y / sh;
      const d = Math.abs((nx - .08) * -.95 - (ny - .95) * .9) / 1.31, band = Math.exp(-((d / .16) ** 2));
      if (rand() > .3 + band * .7) continue;
      const s = rand() ** 3 * 1.6 + .35, a = .25 + rand() * .75;
      c.fillStyle = `rgba(${cols[(rand() * cols.length) | 0]},${a})`; c.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 14; i++) {                                                 // a few bright stars with halos
      const x = rand() * sw, y = rand() * sh * .7, r = 1 + rand() * 1.5;
      const g = c.createRadialGradient(x, y, 0, x, y, r * 6); g.addColorStop(0, 'rgba(235,240,255,.9)'); g.addColorStop(.2, 'rgba(200,215,255,.25)'); g.addColorStop(1, 'rgba(200,215,255,0)');
      c.fillStyle = g; c.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    }
    // Istanbul silhouette: rooftops, a mosque with domes and minarets, scattered lit windows
    const base = sh * .92;
    c.fillStyle = '#05060a'; c.beginPath(); c.moveTo(0, sh);
    for (let x = 0; x < sw;) { const w = 10 + rand() * 30, h = 6 + rand() * sh * .06; c.lineTo(x, base - h); c.lineTo(x + w, base - h); x += w; }
    c.lineTo(sw, sh); c.fill();
    const mx = sw * .3, dr = sw * .085;
    c.beginPath(); c.ellipse(mx, base - sh * .05, dr, dr * .78, 0, Math.PI, 0); c.fill();                    // main dome
    c.fillRect(mx - dr * 1.3, base - sh * .05, dr * 2.6, sh * .06);
    [-1, 1].forEach(s => { c.beginPath(); c.ellipse(mx + s * dr * .95, base - sh * .045, dr * .45, dr * .38, 0, Math.PI, 0); c.fill(); });
    [-1.6, -1.25, 1.25, 1.6].forEach((o, k) => {                                                            // minarets
      const x = mx + o * dr, top = base - sh * (.2 + (k % 2) * .03);
      c.fillRect(x - 2, top, 4, base - top); c.beginPath(); c.moveTo(x - 3, top); c.lineTo(x, top - 12); c.lineTo(x + 3, top); c.fill();
      c.fillRect(x - 3.5, top + (base - top) * .3, 7, 2);
    });
    c.fillRect(mx - 1, base - sh * .05 - dr * .78 - 8, 2, 8);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,${170 + rand() * 50},${100 + rand() * 40},${.25 + rand() * .5})`; c.fillRect(rand() * sw, base - rand() * sh * .05, 1.2, 1.2); }
  }

  function buildClouds() {
    cloudCan = noiseCanvas(win.w, win.h * .5, (x, y) => {
      const n = fbm(x * 4 + 11, y * 7, 6), a = sstep(.48, .78, n) * Math.sin(Math.PI * y) ** 1.2;
      const lit = 1 - y * .6;                                                        // moon lights cloud tops
      return [60 + 70 * lit, 66 + 74 * lit, 86 + 84 * lit, a * 150];
    });
  }

  function buildMoon() {
    const R = moon.r, S = Math.ceil(R * 2 * dpr) + 4;
    moonCan = mk(S, S); const c = moonCan.getContext('2d'), m = (S) / 2, r = R * dpr;
    const tex = noiseCanvas(S, S, (x, y) => {
      const dx = (x - .5) * 2, dy = (y - .5) * 2, rr = dx * dx + dy * dy;
      if (rr > 1) return [0, 0, 0, 0];
      const maria = sstep(.5, .66, fbm(x * 4 + 30, y * 4, 5)), crater = fbm(x * 22, y * 22, 3);
      const limb = Math.sqrt(1 - rr) * .35 + .65, v = (232 - maria * 55 - crater * 18) * limb;
      return [v, v * .985, v * .94, 255];
    });
    c.save(); c.beginPath(); c.arc(m, m, r, 0, 7); c.clip(); c.drawImage(tex, 0, 0);
    // waxing crescent: shadow over most of the disc, earthshine keeps the dark side faintly visible
    c.globalCompositeOperation = 'source-atop'; c.filter = `blur(${Math.max(1, r * .06)}px)`;
    c.fillStyle = 'rgba(8,10,18,.9)'; c.beginPath(); c.ellipse(m - r * .42, m + r * .1, r * 1.02, r * 1.05, -.25, 0, 7); c.fill();
    c.restore();
  }

  function buildGlass() {
    glassCan = mk(win.w * dpr, win.h * dpr); const c = glassCan.getContext('2d'); c.scale(dpr, dpr);
    const w = win.w, h = win.h;
    // condensation creeping in from the frame, heavier at the bottom
    const fog = noiseCanvas(w / 3, h / 3, (x, y) => {
      const edge = Math.min(x, 1 - x, y * 1.4, (1 - y) * .6), n = fbm(x * 8, y * 8, 4);
      return [150, 165, 190, sstep(.16, 0, edge - n * .08) * 60];
    });
    c.drawImage(fog, 0, 0, w, h);
    // diagonal reflection on the pane
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(.25, 'rgba(255,255,255,0)'); g.addColorStop(.32, 'rgba(255,255,255,.035)'); g.addColorStop(.4, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // beaded droplets: dark body, refracted bright rim, specular dot
    for (let i = 0; i < 190; i++) {
      const x = rand() * w, y = rand() * h, r = .5 + rand() ** 2 * 2.6;
      c.fillStyle = 'rgba(6,9,16,.32)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(190,205,235,.18)'; c.lineWidth = .6; c.beginPath(); c.arc(x, y, r, .4, 2.6); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x - r * .35, y - r * .45, .8, .8);
    }
  }

  function buildFrame() {
    frameCan = mk(W * dpr, H * dpr); const c = frameCan.getContext('2d'); c.scale(dpr, dpr);
    const ft = win.ft;
    const wood = noiseCanvas(256, 48, (x, y) => {                                   // dark walnut grain
      const g = fbm(x * 3, y * 26, 4), ring = Math.sin((y * 40 + g * 10) * 1.3) * .5 + .5, v = 34 + g * 22 + ring * 8;
      return [v * 1.05, v * .82, v * .62, 255];
    });
    const pat = c.createPattern(wood, 'repeat');
    // shadow the frame casts on the wall
    c.save(); c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 24; c.shadowOffsetY = 8;
    c.fillStyle = pat; winPath(c, ft); c.fill(); c.restore();
    c.globalCompositeOperation = 'destination-out'; winPath(c, 0); c.fill(); c.globalCompositeOperation = 'source-over';   // open the glass
    // inner reveal lit by the moon on the left/top, dark on the right
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(190,205,235,.28)'; c.beginPath(); c.moveTo(win.x + 1, win.y + win.h); c.lineTo(win.x + win.inset + 1, win.y + 1); c.lineTo(win.x + win.w - win.inset, win.y + 1); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.moveTo(win.x + win.w - win.inset - 1, win.y); c.lineTo(win.x + win.w - 1, win.y + win.h); c.stroke();
    c.strokeStyle = 'rgba(255,230,200,.06)'; c.lineWidth = 1; winPath(c, ft); c.stroke();
    // mullions
    const mw = Math.max(4, ft * .45);
    c.fillStyle = pat;
    c.fillRect(win.x + win.w / 2 - mw / 2, win.y, mw, win.h);
    c.fillRect(win.x + win.inset * .5, win.y + win.h * .5 - mw / 2, win.w - win.inset, mw);
    c.fillStyle = 'rgba(190,205,235,.18)'; c.fillRect(win.x + win.w / 2 - mw / 2, win.y, 1, win.h); c.fillRect(win.x + win.inset * .5, win.y + win.h * .5 - mw / 2, win.w - win.inset, 1);
    // sill
    const sy = win.y + win.h + ft;
    c.fillStyle = pat; c.beginPath(); c.moveTo(win.x - ft * 1.6, sy); c.lineTo(win.x + win.w + ft * 1.6, sy); c.lineTo(win.x + win.w + ft * 2.2, sy + ft * .9); c.lineTo(win.x - ft * 2.2, sy + ft * .9); c.fill();
    c.fillStyle = 'rgba(190,205,235,.12)'; c.fillRect(win.x - ft * 1.6, sy, win.w + ft * 3.2, 1.5);
  }

  function buildVignette() {
    vigCan = mk(W, H); const c = vigCan.getContext('2d');
    const g = c.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .25, W / 2, H * .5, Math.max(W, H) * .78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.72)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  // ---------- cloth ----------
  function buildCloth() {
    P = []; C = [];
    const pw = win.w * .66; restW = pw / (COLS - 1);
    const sy = (win.h + win.ft * 2 + 64) / (ROWS - 1);
    [win.x - win.w * .12, win.x + win.w * .46].forEach((x0, panel) => {
      const base = P.length;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const x = x0 + c * restW, y = rod.y + r * sy;
        P.push({ x, y, px: x, py: y, ring: r === 0, panel, r, c, m: r >= ROWS - 3 ? 1.7 : 1 });   // weighted hem
      }
      const at = (r, c) => P[base + r * COLS + c];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) C.push([at(r, c), at(r, c + 1), restW]);
        if (r < ROWS - 1) C.push([at(r, c), at(r + 1, c), sy]);
        if (r < ROWS - 2) C.push([at(r, c), at(r + 2, c), sy * 2]);          // bend resistance: heavier, smoother drape
      }
    });
    for (let i = 0; i < 160; i++) step(i * 16);                                  // settle before first view
  }

  function step(t) {
    const wind = reduce ? 0 : .03;
    for (const p of P) {
      if (p === grabbed) { p.px = p.x; p.py = p.y; p.x += (gx - p.x) * .2; p.y += (gy - p.y) * .2; continue; }   // weight: lags the hand
      const vx = (p.x - p.px) * (p.ring ? .7 : .972), vy = (p.y - p.py) * .972;
      p.px = p.x; p.py = p.y;
      if (p.ring) { p.x += vx; p.y = rod.y; continue; }
      const breeze = Math.sin(t * .0006 + p.r * .18 + p.panel * 2) * Math.sin(t * .00021 + p.c * .7) * wind * (p.r / ROWS);
      p.x += vx + breeze; p.y += vy + .42 * p.m;
    }
    for (let k = 0; k < 8; k++) {
      for (const [a, b, rest] of C) {
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .001;
        if (d <= rest) continue;                                                   // resists stretch, folds freely
        const f = (d - rest) / d;
        const ma = a === grabbed ? 0 : 1 / a.m, mb = b === grabbed ? 0 : 1 / b.m, s = ma + mb || 1;
        a.x += dx * f * ma / s; b.x -= dx * f * mb / s;
        if (!a.ring) a.y += dy * f * ma / s;
        if (!b.ring) b.y -= dy * f * mb / s;
      }
      for (const p of P) if (p.ring) p.x = Math.min(rod.x1, Math.max(rod.x0, p.x));
    }
    const mid = Math.floor(ROWS * .45);
    const Lx = Math.max(...P.filter(p => p.panel === 0 && p.r === mid).map(p => p.x));
    const Rx = Math.min(...P.filter(p => p.panel === 1 && p.r === mid).map(p => p.x));
    openness += (Math.min(1, Math.max(0, (Rx - Lx) / win.w)) - openness) * .1;
  }

  // ---------- per-frame drawing ----------
  function drawSky(t) {
    ctx.save(); winPath(ctx); ctx.clip();
    ctx.drawImage(skyCan, win.x, win.y, win.w, win.h);
    for (const s of twinkle) {
      ctx.globalAlpha = reduce ? .6 : .25 + .75 * (Math.sin(t * .0011 * s.f + s.p) * .5 + .5) ** 2;
      ctx.fillStyle = '#eef2ff'; ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // moon halo + disc
    const halo = ctx.createRadialGradient(moon.x, moon.y, moon.r * .8, moon.x, moon.y, moon.r * 9);
    halo.addColorStop(0, 'rgba(215,225,245,.32)'); halo.addColorStop(.25, 'rgba(160,180,220,.1)'); halo.addColorStop(1, 'rgba(160,180,220,0)');
    ctx.fillStyle = halo; ctx.fillRect(win.x, win.y, win.w, win.h);
    ctx.drawImage(moonCan, moon.x - moonCan.width / dpr / 2, moon.y - moonCan.height / dpr / 2, moonCan.width / dpr, moonCan.height / dpr);
    // drifting clouds (two passes for parallax)
    const off = reduce ? 0 : (t * .006) % win.w;
    ctx.globalAlpha = .75;
    ctx.drawImage(cloudCan, win.x + off, win.y + win.h * .12, win.w, win.h * .5);
    ctx.drawImage(cloudCan, win.x + off - win.w, win.y + win.h * .12, win.w, win.h * .5);
    ctx.globalAlpha = 1;
    if (!reduce) {                                                               // occasional shooting star
      if (!shoot && Math.random() < .0015) shoot = { x: win.x + Math.random() * win.w * .6, y: win.y + Math.random() * win.h * .3, life: 1 };
      if (shoot) {
        const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - 60, shoot.y - 22);
        g.addColorStop(0, `rgba(255,255,255,${shoot.life})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - 60, shoot.y - 22); ctx.stroke();
        shoot.x += 6; shoot.y += 2.2; shoot.life -= .03; if (shoot.life <= 0) shoot = null;
      }
    }
    ctx.drawImage(glassCan, win.x, win.y, win.w, win.h);
    for (const d of drops) {                                                      // drops running down the glass
      if (!reduce) { d.y += d.v; if (d.y > win.y + win.h) { d.y = win.y - 10; d.x = win.x + Math.random() * win.w; } }
      const g = ctx.createLinearGradient(d.x, d.y - d.l, d.x, d.y);
      g.addColorStop(0, 'rgba(190,205,235,0)'); g.addColorStop(1, 'rgba(190,205,235,.35)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(d.x, d.y - d.l); ctx.lineTo(d.x, d.y); ctx.stroke();
      ctx.fillStyle = 'rgba(230,240,255,.6)'; ctx.fillRect(d.x - .6, d.y - 1, 1.2, 1.2);
    }
    ctx.restore();
  }

  // how much fabric covers each vertical slice of the window (read back from last frame's curtain layer)
  function measureCover() {
    if (!fab.width) return;
    const y = Math.round((win.y + win.h * .62) * dpr), x0 = Math.round(win.x * dpr), w = Math.round(win.w * dpr);
    let data; try { data = fctx.getImageData(x0, y, w, 1).data; } catch { return; }
    const n = cover.length, per = w / n;
    for (let i = 0; i < n; i++) {
      let s = 0, k = 0;
      for (let x = Math.floor(i * per); x < Math.floor((i + 1) * per); x += 2, k++) s += data[x * 4 + 3];
      cover[i] += ((k ? s / k / 255 : 0) - cover[i]) * .35;
    }
  }

  function drawLight() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const n = cover.length, top = win.y + win.h * .35, bottom = win.y + win.h, floor = H * .97, shift = -win.w * .42;
    for (let i = 0; i < n; i++) {
      const x0 = win.x + win.w * i / n, x1 = win.x + win.w * (i + 1) / n;
      const pass = 1 - cover[i] * .78;                                             // the curtain dims what passes
      const mullion = Math.abs((x0 + x1) / 2 - (win.x + win.w / 2)) < win.w / n * .6 ? .35 : 1;
      const a = .045 * pass * mullion;
      // volumetric shaft through the room
      const g = ctx.createLinearGradient(0, top, 0, floor);
      g.addColorStop(0, `rgba(150,172,215,${a})`); g.addColorStop(1, 'rgba(150,172,215,0)');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(x0, bottom); ctx.lineTo(x1 + .5, bottom); ctx.lineTo(x1 + shift * 1.1, floor); ctx.lineTo(x0 + shift * 1.1, floor); ctx.fill();
      // pool of moonlight on the floor, the window's shape skewed across the planks
      ctx.fillStyle = `rgba(165,185,225,${.11 * pass * mullion})`;
      const fy0 = H * .875, fy1 = H * .975;
      ctx.beginPath(); ctx.moveTo(x0 + shift * .8, fy0); ctx.lineTo(x1 + shift * .8 + .5, fy0); ctx.lineTo(x1 + shift * 1.2, fy1); ctx.lineTo(x0 + shift * 1.2, fy1); ctx.fill();
    }
    ctx.restore();
  }

  function drawCurtain() {
    // rod
    const rg = ctx.createLinearGradient(0, rod.y - 4, 0, rod.y + 4);
    rg.addColorStop(0, '#6a6158'); rg.addColorStop(.5, '#2b2621'); rg.addColorStop(1, '#141210');
    ctx.fillStyle = rg; ctx.fillRect(rod.x0 - 12, rod.y - 3.5, rod.x1 - rod.x0 + 24, 7);
    ctx.fillStyle = '#1a1714'; [rod.x0 - 14, rod.x1 + 14].forEach(x => { ctx.beginPath(); ctx.arc(x, rod.y, 6, 0, 7); ctx.fill(); });

    if (fab.width !== cv.width || fab.height !== cv.height) { fab.width = cv.width; fab.height = cv.height; }
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.clearRect(0, 0, W, H);
    const reach = win.w * .6;
    for (let panel = 0; panel < 2; panel++) {
      const base = panel * ROWS * COLS, at = (r, c) => P[base + r * COLS + c];
      for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
        const a = at(r, c), b = at(r, c + 1), d = at(r + 1, c + 1), e = at(r + 1, c);
        const cx = (a.x + b.x + d.x + e.x) / 4, cy = (a.y + b.y + d.y + e.y) / 4;
        const sq = Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / restW);           // <1: gathered into folds
        const thick = 1 / (.3 + .7 * sq);                                        // folds stack fabric → less light through
        const back = (.22 + .78 * inWindow(cx, cy)) * (.35 + .65 * Math.exp(-Math.hypot(cx - moon.x, cy - moon.y) / reach));
        const trans = Math.min(1, back / thick);
        const tilt = (b.y - a.y) / restW;                                         // fold faces turn towards/away from light
        const fold = (1 - sq) * ((c % 2) ? .6 : -.6) + tilt * .35;
        let l = .14 + trans * .92 + fold * .22;
        if (r >= ROWS - 4) l *= .82;                                             // doubled hem
        l *= 1 + .035 * Math.sin(c * 2.3 + r * .15);                             // weave
        l = Math.max(.04, Math.min(1.05, l));
        const R = 30 + l * 192, G = 32 + l * 196, B = 38 + l * 204;              // cool moonlit white
        fctx.fillStyle = fctx.strokeStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
        fctx.lineWidth = 1;
        fctx.beginPath(); fctx.moveTo(a.x, a.y); fctx.lineTo(b.x, b.y); fctx.lineTo(d.x, d.y); fctx.lineTo(e.x, e.y); fctx.closePath();
        fctx.fill(); fctx.stroke();
      }
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .62; ctx.drawImage(fab, 0, 0); ctx.restore();

    // light leaking round the fabric's edges where they cross the window
    // Only edges that border open glass leak light (not where the panels overlap each other).
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'butt';
    // glow = a wide faint stroke under a thin bright one (cheaper than shadowBlur)
    const span = [0, 1].map(panel => Array.from({ length: ROWS }, (_, r) => {
      let lo = Infinity, hi = -Infinity;
      for (let c = 0; c < COLS; c++) { const x = P[panel * ROWS * COLS + r * COLS + c].x; if (x < lo) lo = x; if (x > hi) hi = x; }
      return [lo, hi];
    }));
    for (let panel = 0; panel < 2; panel++) {
      const base = panel * ROWS * COLS, at = (r, c) => P[base + r * COLS + c], other = span[1 - panel];
      const edge = [];                                                           // [point, outward dx, outward dy]
      for (let r = 0; r < ROWS; r++) edge.push([at(r, 0), -1, 0]);
      for (let c = 1; c < COLS; c++) edge.push([at(ROWS - 1, c), 0, 1]);
      for (let r = ROWS - 2; r >= 0; r--) edge.push([at(r, COLS - 1), 1, 0]);
      for (let i = 0; i < edge.length - 1; i++) {
        const [p, nx, ny] = edge[i], q = edge[i + 1][0], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, w = inWindow(mx, my);
        if (w < .05) continue;
        const ox = mx + nx * 10, [lo, hi] = other[Math.min(ROWS - 1, p.r)];
        if (!ny && ox > lo && ox < hi) continue;                                  // the other panel covers this side
        if (inWindow(ox, my + ny * 10) < .05) continue;                           // nothing but frame/wall beyond it
        const a = .5 * w * (.3 + .7 * Math.exp(-Math.hypot(mx - moon.x, my - moon.y) / (win.w * .7)));
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
        ctx.lineWidth = 9; ctx.strokeStyle = `rgba(150,180,240,${a * .22})`; ctx.stroke();
        ctx.lineWidth = 1.8; ctx.strokeStyle = `rgba(195,212,248,${a})`; ctx.stroke();
      }
    }
    ctx.restore();
    // rings
    for (const p of P) if (p.ring && p.c % 2 === 0) {
      const g = ctx.createRadialGradient(p.x - 1.2, p.y - 1.5, .5, p.x, p.y, 4.5);
      g.addColorStop(0, '#a29789'); g.addColorStop(1, '#2a2520');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill();
    }
    if (grabbed) {
      const gg = ctx.createRadialGradient(grabbed.x, grabbed.y, 0, grabbed.x, grabbed.y, 40);
      gg.addColorStop(0, 'rgba(200,50,58,.3)'); gg.addColorStop(1, 'rgba(200,50,58,0)');
      ctx.fillStyle = gg; ctx.fillRect(grabbed.x - 40, grabbed.y - 40, 80, 80);
    }
  }

  // ---------- sound ----------
  const PRESETS = {
    mist:  { en: 'Mist',  tr: 'Sis',    scale: [50, 53, 55, 57, 60, 62, 65, 67, 69, 72, 74, 77, 79, 81], drone: [[73.42, -7], [73.42, 6], [110, 0], [146.83, -3]], wave: 'sawtooth', cut: [220, 1800], partials: [[1, 1], [2.01, .3], [3.98, .1]], cwave: 'sine', decay: 4, verb: [6, 2.8], noise: [280, .9], breath: .24, gain: .07 },
    glass: { en: 'Glass', tr: 'Cam',    scale: [64, 66, 68, 71, 73, 76, 78, 80, 83, 85, 88, 90], drone: [[164.81, -4], [164.81, 5], [246.94, 0]], wave: 'triangle', cut: [700, 3400], partials: [[1, 1], [2.76, .45], [5.4, .2], [8.93, .08]], cwave: 'sine', decay: 2.6, verb: [4, 3.4], noise: [1500, 2.6], breath: .12, gain: .05 },
    abyss: { en: 'Abyss', tr: 'Derin',  scale: [38, 41, 43, 45, 48, 50, 53, 55, 57, 60], drone: [[55, -6], [55, 5], [82.41, 0], [27.5, 0]], wave: 'sawtooth', cut: [110, 650], partials: [[1, 1], [2, .18], [3, .05]], cwave: 'triangle', decay: 6.5, verb: [10, 2.1], noise: [150, .7], breath: .32, gain: .1 },
    wind:  { en: 'Wind',  tr: 'Rüzgâr', scale: [62, 64, 67, 69, 71, 74, 76, 79, 81, 83, 86], drone: [[98, -3], [147, 3]], wave: 'sine', cut: [400, 1300], partials: [[1, 1], [3, .12]], cwave: 'triangle', decay: 3.2, verb: [7, 2.4], noise: [900, 4], breath: .4, gain: .05, vibrato: true },
  };
  let preset = 'mist';
  try { preset = PRESETS[localStorage.getItem('curtainPreset')] ? localStorage.getItem('curtainPreset') : 'mist'; } catch {}
  const S = {};

  function impulse(ac, secs, decay) {
    const len = Math.floor(ac.sampleRate * secs), buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }

  function audioInit() {
    if (S.ac) { if (S.ac.state === 'suspended') S.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = new AC();
    const master = ac.createGain(); master.gain.value = .9;
    const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
    const verb = ac.createConvolver();
    const wet = ac.createGain(); wet.gain.value = 1; verb.connect(wet); wet.connect(master);
    const dry = ac.createGain(); dry.gain.value = .18; dry.connect(master);
    const bus = ac.createGain(); bus.connect(verb); bus.connect(dry);
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
    let last = 0; for (let i = 0; i < nd.length; i++) { last = (last + .04 * (Math.random() * 2 - 1)) / 1.04; nd[i] = last * 3.5; }
    const noise = ac.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    const ng = ac.createGain(); ng.gain.value = 0;
    noise.connect(bp); bp.connect(ng); ng.connect(bus); noise.start();
    const padF = ac.createBiquadFilter(); padF.type = 'lowpass'; padF.Q.value = .6;
    const padG = ac.createGain(); padG.gain.value = 0; padF.connect(padG); padG.connect(bus);
    Object.assign(S, { ac, bus, verb, ng, bp, padG, padF, drone: [], lastChime: 0 });
    applyPreset();
  }

  function applyPreset() {
    if (!S.ac) return;
    const pr = PRESETS[preset], ac = S.ac;
    S.verb.buffer = impulse(ac, pr.verb[0], pr.verb[1]);
    S.bp.Q.value = pr.noise[1];
    S.drone.forEach(o => { try { o.stop(); } catch {} o.disconnect(); });
    S.drone = pr.drone.map(([f, det]) => {
      const o = ac.createOscillator(); o.type = pr.wave; o.frequency.value = f; o.detune.value = det;
      if (pr.vibrato) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = .2 + Math.random() * .2; lg.gain.value = 6; l.connect(lg); lg.connect(o.detune); l.start(); }
      o.connect(S.padF); o.start(); return o;
    });
  }

  function chime(note, vel, pan) {
    const ac = S.ac, t = ac.currentTime, pr = PRESETS[preset];
    if (t - S.lastChime < .07) return; S.lastChime = t;
    const f = 440 * Math.pow(2, (note - 69) / 12), g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.11 * vel, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + pr.decay);
    pr.partials.forEach(([m, amp]) => {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = pr.cwave; o.frequency.value = f * m; og.gain.value = amp;
      if (pr.vibrato) o.frequency.linearRampToValueAtTime(f * m * 1.004, t + pr.decay);
      o.connect(og); og.connect(g); o.start(t); o.stop(t + pr.decay + .1);
    });
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(S.bus); } else g.connect(S.bus);
  }

  function updateSound() {
    if (!S.ac) return;
    const t = S.ac.currentTime, pr = PRESETS[preset];
    S.ng.gain.setTargetAtTime(grabbed ? Math.min(pr.breath, speed * .014) : 0, t, grabbed ? .08 : .5);
    S.bp.frequency.setTargetAtTime(pr.noise[0] + Math.min(speed, 40) * 45 + (1 - gy / H) * 700, t, .1);
    S.padG.gain.setTargetAtTime(grabbed ? pr.gain : 0, t, grabbed ? .8 : 2.2);
    S.padF.frequency.setTargetAtTime(pr.cut[0] + openness * (pr.cut[1] - pr.cut[0]), t, .4);
    if (grabbed && speed > 1.5) {
      travel += speed;
      if (travel > 65) {
        travel = 0;
        const idx = Math.round((1 - Math.min(1, Math.max(0, gy / H))) * (pr.scale.length - 1));
        chime(pr.scale[idx], Math.min(1, .25 + speed / 30), Math.max(-1, Math.min(1, (gx / W) * 2 - 1)));
      }
    }
  }

  // ---------- preset buttons ----------
  const bar = sec.querySelector('.attic__presets');
  const btns = Object.keys(PRESETS).map(k => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'attic__preset'; b.dataset.k = k;
    b.addEventListener('click', () => {
      preset = k; try { localStorage.setItem('curtainPreset', k); } catch {}
      audioInit(); applyPreset(); paint();
      const pr = PRESETS[k];                                                      // short preview so the change is heard
      [0, 2, 4].forEach((s, i) => setTimeout(() => S.ac && chime(pr.scale[s + 3], .6, (i - 1) * .4), i * 140));
      window.track?.('curtain-preset', { preset: k });
    });
    bar.appendChild(b); return b;
  });
  function paint() {
    const tr = document.documentElement.lang === 'tr';
    btns.forEach(b => { b.textContent = PRESETS[b.dataset.k][tr ? 'tr' : 'en']; b.setAttribute('aria-pressed', b.dataset.k === preset); });
  }
  paint(); document.addEventListener('langchange', paint);

  // ---------- input ----------
  const GRAB_R = 44;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = local(e);
    let best = null, bd = GRAB_R * GRAB_R;
    for (const p of P) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
    if (!best) return;
    grabbed = best; gx = lastX = x; gy = lastY = y; travel = 0;
    cv.setPointerCapture(e.pointerId); sec.classList.add('attic--holding');
    audioInit();
    if (!played) { played = true; window.track?.('curtain-play', { preset }); }
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (grabbed) { gx = x; gy = y; return; }
    let near = false;
    for (const p of P) if ((p.x - x) ** 2 + (p.y - y) ** 2 < GRAB_R * GRAB_R) { near = true; break; }
    sec.classList.toggle('attic--near', near);
  });
  const release = () => { grabbed = null; sec.classList.remove('attic--holding'); };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);

  // ---------- loop ----------
  function frame(t) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const v = Math.hypot(gx - lastX, gy - lastY); lastX = gx; lastY = gy;
    speed += ((grabbed ? v : 0) - speed) * .3;
    step(t); updateSound(); measureCover();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bgCan, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(frameCan, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLight(); drawCurtain();
    ctx.drawImage(vigCan, 0, 0, W, H);
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '200px' }).observe(sec);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 250); });
  layout();
  requestAnimationFrame(frame);
})();
