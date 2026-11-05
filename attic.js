// Attic window: a heavy curtain (verlet cloth) in front of a night skylight over the city rooftops.
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
  let bgCan, skyCan, cloudCan, moonCan, glassCan, frameCan, vigCan, grainCan, beacons = [];
  let twinkle = [], drops = [], motes = [], shoot = null, cover = new Float32Array(48), backCan;
  let gust = 0, gusted = false, visible = false, grabbed = null, gx = 0, gy = 0, lastX = 0, lastY = 0, speed = 0, travel = 0, openness = 0, played = false;

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
    COLS = phone ? 18 : 30; ROWS = phone ? 34 : 52;
    const ww = Math.min(W * (phone ? .7 : .5), 480), wh = Math.min(ww * 1.32, H * (phone ? .55 : .6));
    win = { x: W / 2 - ww / 2, y: H * (phone ? .25 : .16), w: ww, h: wh, inset: ww * .07, ft: Math.max(10, ww * .045) };
    rod = { y: win.y - win.ft - 12, x0: win.x - ww * .24, x1: win.x + ww * 1.24 };
    moon = { x: win.x + win.w * .7, y: win.y + win.h * .24, r: win.w * .05 };
    seed = 7;
    buildRoom(); buildSky(); buildClouds(); buildMoon(); buildGlass(); buildFrame(); buildVignette(); buildGrain(); buildCloth(); buildBacklight(); buildGLMesh();
    twinkle = Array.from({ length: 16 }, () => ({ x: win.x + rand() * win.w, y: win.y + rand() * win.h * .5, s: .6 + rand() * .7, p: rand() * 6.3, f: .5 + rand() * 1.8 }));
    motes = Array.from({ length: phone ? 40 : 90 }, () => ({ x: win.x - win.w * .55 + rand() * win.w * 1.5, y: win.y + win.h + rand() * (H * .97 - win.y - win.h), v: .04 + rand() * .12, ph: rand() * 6.3, s: .6 + rand() * 1.1, b: .4 + rand() * .6 }));
    drops = Array.from({ length: 5 }, () => ({ x: win.x + rand() * win.w, y: win.y + rand() * win.h, v: .2 + rand() * .5, l: 6 + rand() * 16 }));
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
    const sw = win.w, sh = win.h, mx = (moon.x - win.x) / sw, my = (moon.y - win.y) / sh, asp = sh / sw;
    // night sky as a camera sees it over a big city: deep navy zenith, sodium/LED light dome at the horizon,
    // moonlight scattered by the air, a Milky Way almost washed out by light pollution
    const lowres = noiseCanvas(sw / 2, sh / 2, (x, y) => {
      const lp = sstep(.18, .95, y) ** 1.7;
      let r = 2 + 7 * y, g = 5 + 10 * y, b = 13 + 21 * y;
      r += 98 * lp; g += 66 * lp; b += 48 * lp;
      const d = Math.abs((x - .08) * -.95 - (y - .95) * .9) / 1.31, band = Math.exp(-((d / .2) ** 2)) * (1 - lp);
      const mw = Math.max(0, band * (.25 + .75 * fbm(x * 5 + 2, y * 5, 5)) - band * sstep(.55, .72, fbm(x * 14 + 7, y * 14 + 3, 4)) * .6);
      r += 15 * mw; g += 17 * mw; b += 25 * mw;
      const md = Math.hypot(x - mx, (y - my) * asp), sc = Math.exp(-md / .22) * .5 + Math.exp(-md / .06) * .45;
      r += 42 * sc; g += 50 * sc; b += 64 * sc;
      const n = (fbm(x * 40, y * 40, 2) - .5) * 4;                                   // break up 8-bit banding
      return [r + n, g + n, b + n, 255];
    });
    skyCan = mk(sw * dpr, sh * dpr); const c = skyCan.getContext('2d');
    c.imageSmoothingEnabled = true; c.drawImage(lowres, 0, 0, skyCan.width, skyCan.height); c.scale(dpr, dpr);
    // stars: mostly faint, fading out into the glow near the horizon
    const cols = ['255,250,245', '205,218,255', '255,232,205', '255,212,178'];
    for (let i = 0; i < 520; i++) {
      const x = rand() * sw, y = rand() * sh * .8, m = rand() ** 4, a = (.16 + .84 * m) * (1 - sstep(.3, .74, y / sh));
      if (a < .05) continue;
      c.fillStyle = `rgba(${cols[(rand() * cols.length) | 0]},${a})`; c.beginPath(); c.arc(x, y, .3 + m * .65, 0, 7); c.fill();
    }
    for (let i = 0; i < 7; i++) {
      const x = rand() * sw, y = rand() * sh * .5, r = 2.5 + rand() * 2.5;
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(240,244,255,.85)'); g.addColorStop(.18, 'rgba(210,222,255,.22)'); g.addColorStop(1, 'rgba(210,222,255,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // ---- city: three depth layers of apartment blocks, softened by haze, with lit windows ----
    beacons = [];
    const HAZE = [96, 70, 60];
    const veil = (y0, a) => {
      const g = c.createLinearGradient(0, y0 - sh * .1, 0, y0 + sh * .02);
      g.addColorStop(0, `rgba(${HAZE},0)`); g.addColorStop(1, `rgba(${HAZE},${a})`);
      c.fillStyle = g; c.fillRect(0, y0 - sh * .1, sw, sh);
    };
    const layer = (base, hMin, hMax, wMin, wMax, shade, haze, litP, ws) => {
      const lights = [];
      for (let x = -rand() * 20; x < sw + 10;) {
        const w = wMin + rand() * (wMax - wMin), h = hMin + rand() * (hMax - hMin), top = base - h, rt = rand(), tv = (rand() - .5) * 7;
        c.fillStyle = `rgb(${shade.map((v, i) => Math.max(0, Math.round(v + tv + (HAZE[i] - v) * haze)))})`;   // each block a slightly different facade
        c.fillRect(x, top, w + .6, sh - top);
        if (rt < .3) { c.beginPath(); c.moveTo(x - .4, top + .2); c.lineTo(x + w * .5, top - w * (.14 + rand() * .16)); c.lineTo(x + w + .4, top + .2); c.fill(); }   // pitched roof
        else if (rt < .55) { const bw = w * (.18 + rand() * .3), bx = x + rand() * (w - bw), bh = 1.5 + h * .1; c.fillRect(bx, top - bh, bw, bh); }       // stair / lift housing
        if (rand() < .32) { const ax = x + 1 + rand() * (w - 2), ah = (3 + rand() * 8) * ws; c.fillRect(ax, top - ah, .6, ah); c.fillRect(ax - 1.8 * ws, top - ah * .72, 3.6 * ws, .5); }   // TV antenna
        if (rand() < .18) { const cx = x + rand() * w; c.fillRect(cx, top - 3 * ws, 1.6 * ws, 3 * ws); }                                            // chimney
        const fw = 1.05 * ws, fh = 1.45 * ws, gx = fw + 1.5 * ws, gy = fh + 2.1 * ws, p = litP * (.3 + rand() * 1.4);
        for (let yy = top + 2.5 * ws; yy < base - 1; yy += gy) for (let xx = x + 1.6 * ws; xx < x + w - fw - 1; xx += gx) if (rand() < p) lights.push([xx, yy, fw, fh]);
        x += w + (rand() < .14 ? 2 + rand() * 7 : 0);
      }
      for (const [lx, ly, fw, fh] of lights) {
        const k = rand(), col = k < .68 ? `255,${176 + rand() * 40 | 0},${104 + rand() * 50 | 0}` : k < .9 ? '232,236,250' : '150,186,255';   // tungsten, LED, a TV
        const a = (.3 + rand() * .6) * (1 - haze * .55);
        if (a > .55 && rand() < .35) {                                              // bright ones bloom a little, as on a photo
          const g = c.createRadialGradient(lx + fw / 2, ly + fh / 2, 0, lx + fw / 2, ly + fh / 2, fw * 3.5);
          g.addColorStop(0, `rgba(${col},${a * .28})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(lx - fw * 3, ly - fw * 3, fw * 7, fh + fw * 6);
        }
        c.fillStyle = `rgba(${col},${a})`; c.fillRect(lx, ly, fw, fh);
      }
    };
    layer(sh * .86, sh * .008, sh * .035, 5, 18, [22, 20, 24], .62, .11, .7);
    // a telecom mast on the far hills with an aviation light
    { const tx = sw * .17, ty = sh * .74, b0 = sh * .86; c.fillStyle = `rgb(${HAZE.map(v => v * .55 | 0)})`;
      c.beginPath(); c.moveTo(tx - 2.2, b0); c.lineTo(tx - .5, ty + 6); c.lineTo(tx + .5, ty + 6); c.lineTo(tx + 2.2, b0); c.fill();
      c.fillRect(tx - .35, ty, .7, 8); c.fillRect(tx - 1.6, ty + (b0 - ty) * .28, 3.2, 1.6);
      beacons.push({ x: win.x + tx, y: win.y + ty, p: 0 }, { x: win.x + tx, y: win.y + ty + (b0 - ty) * .28, p: .5 }); }
    veil(sh * .86, .38);
    layer(sh * .915, sh * .025, sh * .08, 12, 38, [13, 12, 15], .22, .09, 1.15);
    veil(sh * .915, .16);
    c.globalCompositeOperation = 'lighter';                                         // sodium street light rising between the blocks
    for (let i = 0; i < 7; i++) {
      const x = rand() * sw, y = sh * (.93 + rand() * .03), r = sw * (.04 + rand() * .05);
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(120,70,30,.22)'); g.addColorStop(1, 'rgba(120,70,30,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.globalCompositeOperation = 'source-over';
    // neighbouring tiled roofs right under the window
    const roof = (x0, x1, eave, ridge, tilt) => {
      c.fillStyle = '#08080b'; c.beginPath();
      c.moveTo(x0, sh); c.lineTo(x0, eave); c.lineTo(x0 + (x1 - x0) * tilt, ridge); c.lineTo(x1, ridge + (eave - ridge) * .35); c.lineTo(x1, sh); c.fill();
      c.save(); c.clip();
      for (let k = 1; k < 14; k++) {                                                 // tile courses catching moonlight
        const yy = ridge + k * (sh - ridge) / 12;
        c.strokeStyle = `rgba(150,165,195,${.05 - k * .002})`; c.lineWidth = .7;
        c.beginPath(); c.moveTo(x0, yy + (eave - ridge) * .4); c.lineTo(x1, yy); c.stroke();
      }
      c.restore();
      c.strokeStyle = 'rgba(175,190,220,.22)'; c.lineWidth = 1;                      // ridge rim-lit from the moon side
      c.beginPath(); c.moveTo(x0 + (x1 - x0) * tilt, ridge); c.lineTo(x1, ridge + (eave - ridge) * .35); c.stroke();
    };
    roof(-4, sw * .46, sh * .965, sh * .925, .55);
    roof(sw * .58, sw + 4, sh * .975, sh * .945, .25);
    { const cx = sw * .3, cy = sh * .9, cw = sw * .04, chh = sh * .045;               // brick chimney with two pots
      c.fillStyle = '#0b0a0c'; c.fillRect(cx, cy, cw, chh); c.fillRect(cx - 1.5, cy - 2, cw + 3, 2.5);
      c.fillRect(cx + cw * .15, cy - 7, cw * .25, 5); c.fillRect(cx + cw * .58, cy - 6, cw * .25, 4);
      c.fillStyle = 'rgba(170,185,215,.2)'; c.fillRect(cx + cw - 1, cy - 2, 1, chh + 2); }
    { const ax = sw * .78, ay = sh * .9;                                           // rooftop antenna
      c.fillStyle = '#09090c'; c.fillRect(ax, ay, .9, sh * .05); [0, 4, 8].forEach((o, i) => c.fillRect(ax - 7 + i, ay + o, 15 - i * 2, .7)); }
  }

  function buildClouds() {
    // moonlit stratocumulus: domain-warped fbm, seamless in x so it can drift forever
    const cw = Math.round(win.w / 1.4), ch = Math.round(win.h * .55 / 1.4);
    cloudCan = noiseCanvas(cw, ch, (x, y) => {
      const f = u => { const w = fbm(u * 3 + 5, y * 3, 3) * .7; return fbm((u + w) * 3.1 + 11, y * 6.2 + w * 2, 6); };
      let n = f(x) * (1 - x) + f(x - 1) * x; n = .5 + (n - .5) * (1 + .5 * Math.sin(Math.PI * x));
      const dens = sstep(.47, .76, n) * Math.sin(Math.PI * y) ** 1.1;
      if (dens <= .002) return [0, 0, 0, 0];
      const v = .18 + .26 * (1 - y) + .4 * (1 - dens), city = y * dens;          // thin edges glow, bellies warmed by the city
      return [26 + 92 * v + 34 * city, 29 + 96 * v + 18 * city, 40 + 104 * v + 8 * city, dens * 225];
    });
  }

  function buildMoon() {
    const R = moon.r, S = Math.ceil(R * 2 * dpr) + 4;
    moonCan = mk(S, S); const c = moonCan.getContext('2d'), m = S / 2, r = R * dpr;
    const tex = noiseCanvas(S, S, (x, y) => {
      const dx = (x - .5) * 2, dy = (y - .5) * 2, rr = dx * dx + dy * dy;
      if (rr > 1) return [0, 0, 0, 0];
      const maria = sstep(.47, .6, fbm(x * 3 + 30, y * 3 + 4, 5)), crater = fbm(x * 26, y * 26, 3), fine = fbm(x * 70, y * 70, 2);
      const limb = .82 + .18 * Math.sqrt(1 - rr), v = (240 - maria * 72 - (crater - .5) * 34 - (fine - .5) * 16) * limb;
      return [v, v * .978, v * .93, 255];
    });
    c.save(); c.beginPath(); c.arc(m, m, r, 0, 7); c.clip(); c.drawImage(tex, 0, 0);
    c.fillStyle = 'rgba(255,255,250,.5)'; c.beginPath(); c.arc(m + r * .35, m + r * .55, Math.max(.6, r * .05), 0, 7); c.fill();   // bright young crater
    // waxing crescent: soft terminator, earthshine keeps the dark side faintly visible
    c.globalCompositeOperation = 'source-atop'; c.filter = `blur(${Math.max(1, r * .08)}px)`;
    c.fillStyle = 'rgba(10,13,22,.93)'; c.beginPath(); c.ellipse(m - r * .42, m + r * .1, r * 1.02, r * 1.05, -.25, 0, 7); c.fill();
    c.restore();
  }

  function buildGlass() {
    glassCan = mk(win.w * dpr, win.h * dpr); const c = glassCan.getContext('2d'); c.scale(dpr, dpr);
    const w = win.w, h = win.h;
    // condensation creeping in from the frame, heavier at the bottom
    const fog = noiseCanvas(w / 3, h / 3, (x, y) => {
      const edge = Math.min(x, 1 - x, y * 1.4, (1 - y) * .55), n = fbm(x * 8, y * 8, 4);
      return [150, 162, 185, sstep(.13, 0, edge - n * .07) * 46];
    });
    c.drawImage(fog, 0, 0, w, h);
    // dust and dried rain spots, only faintly visible
    const dust = noiseCanvas(w / 1.5, h / 1.5, (x, y) => [175, 185, 205, sstep(.6, .82, fbm(x * 22 + 3, y * 22, 4)) * sstep(.42, .7, fbm(x * 3 + 40, y * 3, 3)) * 20]);
    c.drawImage(dust, 0, 0, w, h);
    // faint reflection sweep across the pane
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(.22, 'rgba(255,255,255,0)'); g.addColorStop(.3, 'rgba(220,230,255,.025)'); g.addColorStop(.42, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // small beaded droplets: dark lens, refracted bright lower rim, specular glint
    for (let i = 0; i < 110; i++) {
      const x = rand() * w, y = rand() * h, r = .4 + rand() ** 2.5 * 2.1;
      c.fillStyle = 'rgba(6,9,16,.26)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(190,205,235,.16)'; c.lineWidth = .5; c.beginPath(); c.arc(x, y, r * .9, .5, 2.6); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(x - r * .35, y - r * .45, .7, .7);
    }
  }

  function buildGrain() {
    grainCan = noiseCanvas(220, 220, () => { const v = 128 + (rand() - .5) * 120; return [v, v, v, 255]; });
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
    c.save(); winPath(c, 0); c.clip();                                            // ambient occlusion where the glass meets the frame
    c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = ft * 1.3; c.strokeStyle = '#000'; c.lineWidth = ft * 2; winPath(c, ft); c.stroke(); c.restore();
    // inner reveal lit by the moon on the left/top, dark on the right
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(190,205,235,.28)'; c.beginPath(); c.moveTo(win.x + 1, win.y + win.h); c.lineTo(win.x + win.inset + 1, win.y + 1); c.lineTo(win.x + win.w - win.inset, win.y + 1); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.moveTo(win.x + win.w - win.inset - 1, win.y); c.lineTo(win.x + win.w - 1, win.y + win.h); c.stroke();
    c.strokeStyle = 'rgba(255,230,200,.06)'; c.lineWidth = 1; winPath(c, ft); c.stroke();
    // mullions
    const mw = Math.max(4, ft * .45);
    c.save(); winPath(c, 0); c.clip(); c.fillStyle = pat; c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = mw * 1.6;
    c.fillRect(win.x + win.w / 2 - mw / 2, win.y, mw, win.h);
    c.fillRect(win.x, win.y + win.h * .5 - mw / 2, win.w, mw);
    c.restore();
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(win.x + win.w / 2 + mw / 2 - 1.5, win.y, 1.5, win.h); c.fillRect(win.x, win.y + win.h * .5 + mw / 2 - 1.5, win.w, 1.5);
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
    const gather = .8, pw = win.w * .66 / gather; restW = pw / (COLS - 1);   // hung with fullness: soft folds even when closed
    const sy = (win.h + win.ft * 2 + 64) / (ROWS - 1);
    [win.x - win.w * .12, win.x + win.w * .46].forEach((x0, panel) => {
      const base = P.length;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const x = x0 + c * restW * gather + Math.sin(c * 1.9) * restW * .05, y = rod.y + r * sy;
        P.push({ x, y, px: x, py: y, ring: r === 0, panel, r, c, m: r >= ROWS - 3 ? 2.2 : 1.1 });   // weighted hem
      }
      const at = (r, c) => P[base + r * COLS + c];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) C.push([at(r, c), at(r, c + 1), restW]);
        if (r < ROWS - 1) C.push([at(r, c), at(r + 1, c), sy]);
        if (r < ROWS - 2) C.push([at(r, c), at(r + 2, c), sy * 2]);          // bend resistance: heavier, smoother drape
      }
    });
    for (let i = 0; i < 220; i++) step(i * 16);                                  // settle before first view
  }

  function step(t) {
    const wind = reduce ? 0 : .045 + gust * .22;
    for (const p of P) {
      if (p === grabbed) { p.px = p.x; p.py = p.y; p.x += (gx - p.x) * .2; p.y += (gy - p.y) * .2; continue; }   // weight: lags the hand
      const vx = (p.x - p.px) * (p.ring ? .7 : .972), vy = (p.y - p.py) * .972;
      p.px = p.x; p.py = p.y;
      if (p.ring) { p.x += vx; p.y = rod.y; continue; }
      const k = p.r / ROWS, w = Math.sin(t * .0011 + p.r * .09 - p.c * .35 + p.panel * 2.1) * .7 + Math.sin(t * .00047 + p.c * .6 + p.panel) * .3;
      const breeze = w * wind * k * (1 + .4 * Math.sin(t * .0003 + p.panel * 3));   // travelling ripples, stronger towards the hem
      p.x += vx + breeze; p.y += vy + .42 * p.m - Math.abs(w) * wind * k * .25;     // the draught lifts the hem a little
    }
    for (let k = 0; k < 12; k++) {
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
    for (const s of twinkle) {                                                    // atmospheric scintillation
      ctx.globalAlpha = reduce ? .35 : .1 + .45 * (Math.sin(t * .0013 * s.f + s.p) * .5 + .5) ** 3;
      ctx.fillStyle = '#eef2ff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.s * .5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const b of beacons) {                                                    // aviation lights on the mast
      const on = reduce ? .6 : Math.max(0, Math.sin(t * .0028 + b.p * 6.28)) ** 6;
      if (on < .02) continue;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 6); g.addColorStop(0, `rgba(255,70,50,${on})`); g.addColorStop(.25, `rgba(255,40,30,${on * .35})`); g.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.fillStyle = g; ctx.fillRect(b.x - 6, b.y - 6, 12, 12);
    }
    const md = moonCan.width / dpr;
    ctx.drawImage(moonCan, moon.x - md / 2, moon.y - md / 2, md, md);
    // drifting clouds (seamless tile), then the moon's aureole lights whatever cloud is near it
    const off = reduce ? 0 : (t * .004) % win.w;
    ctx.globalAlpha = .92;
    ctx.drawImage(cloudCan, win.x + off, win.y + win.h * .1, win.w, win.h * .55);
    ctx.drawImage(cloudCan, win.x + off - win.w, win.y + win.h * .1, win.w, win.h * .55);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(moon.x, moon.y, moon.r * .9, moon.x, moon.y, moon.r * 7);
    halo.addColorStop(0, 'rgba(190,205,230,.22)'); halo.addColorStop(.3, 'rgba(120,140,180,.06)'); halo.addColorStop(1, 'rgba(120,140,180,0)');
    ctx.fillStyle = halo; ctx.fillRect(moon.x - moon.r * 7, moon.y - moon.r * 7, moon.r * 14, moon.r * 14);
    ctx.globalAlpha = .07; ctx.drawImage(moonCan, moon.x - md / 2 + 2.5, moon.y - md / 2 + 4, md, md);   // ghost from the second pane of the double glazing
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (!reduce) {                                                               // rare meteor
      if (!shoot && Math.random() < .0008) shoot = { x: win.x + Math.random() * win.w * .6, y: win.y + Math.random() * win.h * .3, life: 1 };
      if (shoot) {
        const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - 50, shoot.y - 18);
        g.addColorStop(0, `rgba(255,255,255,${shoot.life * .8})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - 50, shoot.y - 18); ctx.stroke();
        shoot.x += 7; shoot.y += 2.5; shoot.life -= .04; if (shoot.life <= 0) shoot = null;
      }
    }
    ctx.drawImage(glassCan, win.x, win.y, win.w, win.h);
    for (const d of drops) {                                                      // drops running down the glass
      if (!reduce) { d.y += d.v; if (d.y > win.y + win.h) { d.y = win.y - 10; d.x = win.x + Math.random() * win.w; } }
      const g = ctx.createLinearGradient(d.x, d.y - d.l, d.x, d.y);
      g.addColorStop(0, 'rgba(190,205,235,0)'); g.addColorStop(1, 'rgba(190,205,235,.22)');
      ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(d.x, d.y - d.l); ctx.lineTo(d.x, d.y); ctx.stroke();
      ctx.fillStyle = 'rgba(230,240,255,.5)'; ctx.fillRect(d.x - .5, d.y - 1, 1, 1);
    }
    ctx.restore();
  }

  // how much fabric covers each vertical slice of the window, from the cloth geometry at ~2/3 window height
  function measureCover() {
    const n = cover.length, yM = win.y + win.h * .62, spans = [];
    for (let panel = 0; panel < 2; panel++) {
      const b = panel * ROWS * COLS; let best = 0, bd = 1e9;
      for (let r = 0; r < ROWS; r++) { const d = Math.abs(P[b + r * COLS].y - yM); if (d < bd) { bd = d; best = r; } }
      let lo = Infinity, hi = -Infinity;
      for (let c = 0; c < COLS; c++) { const x = P[b + best * COLS + c].x; if (x < lo) lo = x; if (x > hi) hi = x; }
      spans.push([lo, hi]);
    }
    for (let i = 0; i < n; i++) {
      const x = win.x + win.w * (i + .5) / n;
      let c = 0; for (const [lo, hi] of spans) c += sstep(lo - 3, lo + 3, x) * (1 - sstep(hi - 3, hi + 3, x));
      cover[i] += (Math.min(1, c) - cover[i]) * .35;
    }
  }

  function drawLight(t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const n = cover.length, top = win.y + win.h * .35, bottom = win.y + win.h, floor = H * .97, shift = -win.w * .42;
    let avg = 0;
    for (let i = 0; i < n; i++) {
      const x0 = win.x + win.w * i / n, x1 = win.x + win.w * (i + 1) / n;
      const pass = 1 - cover[i] * .72; avg += pass / n;                            // the curtain dims what passes
      const mullion = Math.abs((x0 + x1) / 2 - (win.x + win.w / 2)) < win.w / n * .9 ? .25 : 1;
      const a = .075 * pass * mullion;
      // volumetric shaft through the room
      const g = ctx.createLinearGradient(0, top, 0, floor);
      g.addColorStop(0, `rgba(150,172,215,${a})`); g.addColorStop(.7, `rgba(150,172,215,${a * .35})`); g.addColorStop(1, 'rgba(150,172,215,0)');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(x0, bottom); ctx.lineTo(x1 + .5, bottom); ctx.lineTo(x1 + shift * 1.1, floor); ctx.lineTo(x0 + shift * 1.1, floor); ctx.fill();
      // pool of moonlight on the floor: the window's panes skewed across the planks, split by the transom's shadow
      const fy0 = H * .875, fy1 = H * .975, fg = ctx.createLinearGradient(0, fy0, 0, fy1);
      fg.addColorStop(0, `rgba(170,190,228,${.11 * pass * mullion})`); fg.addColorStop(.6, `rgba(170,190,228,${.055 * pass * mullion})`); fg.addColorStop(1, 'rgba(170,190,228,0)');
      ctx.fillStyle = fg;
      const quad = (ta, tb) => {
        const ya = fy0 + (fy1 - fy0) * ta, yb = fy0 + (fy1 - fy0) * tb, sa = shift * (.8 + .4 * ta), sb = shift * (.8 + .4 * tb);
        ctx.beginPath(); ctx.moveTo(x0 + sa, ya); ctx.lineTo(x1 + sa + .5, ya); ctx.lineTo(x1 + sb + .5, yb); ctx.lineTo(x0 + sb, yb); ctx.fill();
      };
      quad(0, .44); quad(.54, 1);
    }
    // moonlight bouncing off the wall around the window, and its blurred reflection on the varnished floor
    const cx = win.x + win.w / 2, cy = win.y + win.h / 2;
    const wg = ctx.createRadialGradient(cx, cy, win.w * .35, cx, cy, win.w * 1.5);
    wg.addColorStop(0, `rgba(110,128,170,${.07 * avg})`); wg.addColorStop(1, 'rgba(110,128,170,0)');
    ctx.fillStyle = wg; ctx.fillRect(cx - win.w * 1.5, cy - win.w * 1.5, win.w * 3, win.w * 3);
    const fl = H * .86, rg = ctx.createLinearGradient(0, fl, 0, H);
    rg.addColorStop(0, `rgba(150,170,210,${.06 * avg})`); rg.addColorStop(1, 'rgba(150,170,210,0)');
    ctx.fillStyle = rg; ctx.fillRect(win.x + win.w * .08, fl, win.w * .84, H - fl);
    // dust drifting through the beams, lit only where the light reaches it
    for (const m of motes) {
      if (!reduce) { m.x += Math.sin(t * .0003 + m.ph) * .07; m.y += m.v; if (m.y > floor) { m.y = bottom; m.x = win.x - win.w * .55 + Math.random() * win.w * 1.5; } }
      const tt = (m.y - bottom) / (floor - bottom), sx = m.x - shift * 1.1 * tt, i = Math.floor((sx - win.x) / win.w * n);
      if (i < 0 || i >= n) continue;
      const a = (1 - cover[i] * .72) * (1 - tt) * .55 * m.b * (.6 + .4 * Math.sin(t * .002 + m.ph));
      if (a < .02) continue;
      ctx.fillStyle = `rgba(205,218,245,${a})`; ctx.beginPath(); ctx.arc(m.x, m.y, m.s * .5, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawCurtain() {
    // rod
    const rg = ctx.createLinearGradient(0, rod.y - 4, 0, rod.y + 4);
    rg.addColorStop(0, '#6a6158'); rg.addColorStop(.5, '#2b2621'); rg.addColorStop(1, '#141210');
    ctx.fillStyle = rg; ctx.fillRect(rod.x0 - 12, rod.y - 3.5, rod.x1 - rod.x0 + 24, 7);
    ctx.fillStyle = '#1a1714'; [rod.x0 - 14, rod.x1 + 14].forEach(x => { ctx.beginPath(); ctx.arc(x, rod.y, 6, 0, 7); ctx.fill(); });

    if (G) { renderGL(); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(gcv, 0, 0); ctx.restore(); } else {
    if (fab.width !== cv.width || fab.height !== cv.height) { fab.width = cv.width; fab.height = cv.height; }
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.clearRect(0, 0, W, H);
    const reach = win.w * .6, L = new Float32Array(ROWS * COLS);
    const shade = l => `rgb(${26 + l * 178 | 0},${28 + l * 182 | 0},${34 + l * 190 | 0})`;   // heavy linen in cool moonlight
    fctx.lineJoin = 'round';
    for (let panel = 0; panel < 2; panel++) {
      const base = panel * ROWS * COLS, at = (r, c) => P[base + r * COLS + c];
      // lightness per vertex, then smooth gradients across each quad: soft rounded pleats instead of flat facets
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p = at(r, c), last = c === COLS - 1, q = at(r, last ? c - 1 : c + 1);
        const sq = Math.min(1, Math.hypot(q.x - p.x, q.y - p.y) / restW);           // <1: gathered into folds
        const thick = 1 / (.22 + .78 * sq);                                      // folds stack fabric → less light through
        const back = (.18 + .82 * inWindow(p.x, p.y)) * (.35 + .65 * Math.exp(-Math.hypot(p.x - moon.x, p.y - moon.y) / reach));
        const trans = Math.min(1, back / thick) * .58;                          // dense weave: only part of the light gets through
        const tilt = (q.y - p.y) / restW * (last ? -1 : 1);
        const fold = (1 - sq) * ((c % 2) ? .75 : -.75) + tilt * .35;
        let l = .1 + trans + fold * .2;
        if (r >= ROWS - 4) l *= .8;                                              // doubled hem
        l *= 1 + .03 * Math.sin(c * 2.3 + r * .15);
        L[r * COLS + c] = Math.max(.03, Math.min(1, l));
      }
      fctx.lineWidth = .9;
      for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
        const a = at(r, c), b = at(r, c + 1), d = at(r + 1, c + 1), e = at(r + 1, c);
        const la = (L[r * COLS + c] + L[(r + 1) * COLS + c]) / 2, lb = (L[r * COLS + c + 1] + L[(r + 1) * COLS + c + 1]) / 2;
        const g = fctx.createLinearGradient((a.x + e.x) / 2, (a.y + e.y) / 2, (b.x + d.x) / 2, (b.y + d.y) / 2);
        g.addColorStop(0, shade(la)); g.addColorStop(1, shade(lb));
        fctx.fillStyle = fctx.strokeStyle = g;
        fctx.beginPath(); fctx.moveTo(a.x, a.y); fctx.lineTo(b.x, b.y); fctx.lineTo(d.x, d.y); fctx.lineTo(e.x, e.y); fctx.closePath();
        fctx.fill(); fctx.stroke();
      }
      // stitched side hems and the weighted bottom hem read as a thicker edge
      fctx.strokeStyle = 'rgba(0,0,0,.28)'; fctx.lineWidth = 2.2;
      [0, COLS - 1].forEach(c => { fctx.beginPath(); for (let r = 0; r < ROWS; r++) { const p = at(r, c); r ? fctx.lineTo(p.x, p.y) : fctx.moveTo(p.x, p.y); } fctx.stroke(); });
      fctx.lineWidth = 3; fctx.beginPath(); for (let c = 0; c < COLS; c++) { const p = at(ROWS - 1, c); c ? fctx.lineTo(p.x, p.y) : fctx.moveTo(p.x, p.y); } fctx.stroke();
      fctx.strokeStyle = 'rgba(0,0,0,.14)'; fctx.lineWidth = 1; fctx.beginPath();
      for (let c = 0; c < COLS; c++) { const p = at(ROWS - 4, c); c ? fctx.lineTo(p.x, p.y) : fctx.moveTo(p.x, p.y); } fctx.stroke();
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .78; ctx.drawImage(fab, 0, 0); ctx.restore();
    }

    // light leaking round the fabric's edges where they cross the window (2D fallback only)
    // Only edges that border open glass leak light (not where the panels overlap each other).
    if (!G) {
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
        const a = .28 * w * (.3 + .7 * Math.exp(-Math.hypot(mx - moon.x, my - moon.y) / (win.w * .7)));
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
        ctx.lineWidth = 9; ctx.strokeStyle = `rgba(150,180,240,${a * .22})`; ctx.stroke();
        ctx.lineWidth = 1.8; ctx.strokeStyle = `rgba(195,212,248,${a})`; ctx.stroke();
      }
    }
    ctx.restore();
    }
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

  // ---------- fabric in WebGL: real per-pixel normals, light transmitted through the weave ----------
  // Depth comes from gathering: a segment shorter than its rest width must have turned in z, alternating into pleats.
  // What shines through is a blurred copy of the real scene behind (sky, moon, frame and mullion shadows), attenuated
  // by the light's path length in the fabric, so fold walls seen edge-on go dark exactly like a backlit curtain.
  const gcv = document.createElement('canvas');
  const gl = gcv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
  let G = null;
  const PLEAT = 1.6;
  const VS = `attribute vec2 aP; attribute vec3 aN; attribute vec3 aT; uniform vec2 uRes;
    varying vec3 vN; varying vec2 vUV; varying vec2 vP; varying float vAO;
    void main(){ vN = aN; vUV = aT.xy; vAO = aT.z; vP = aP; gl_Position = vec4(aP.x / uRes.x * 2. - 1., 1. - aP.y / uRes.y * 2., 0., 1.); }`;
  const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec3 vN; varying vec2 vUV; varying vec2 vP; varying float vAO;
    uniform sampler2D uBack; uniform vec2 uView; uniform vec2 uThreads; uniform float uHem;
    float h(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
    float vn(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.), f * f * (3. - 2. * f)); }
    void main(){
      vec3 n = normalize(vN); float facing = clamp(abs(n.z), 0., 1.);
      vec2 t = vUV * uThreads;                                     // linen: warp, weft and irregular slub threads, carried by the cloth
      float weave = vn(t.x * .5) * .8 + vn(t.y * .5 + 31.) * .2;
      float slub = vn(t.x * .3 + vn(t.y * .004 + t.x * .01) * 2.) * .8 + vn(t.y * .02 + 9.) * .2;
      float hem = smoothstep(uHem - .01, uHem + .01, vUV.y) + (1. - smoothstep(.0, .02, vUV.x)) * .4 + smoothstep(.98, 1., vUV.x) * .4;
      float dens = 1.0 + .18 * slub - .05 * weave + hem * .7;
      float path = min(1. / max(facing, .2), 4.);                   // oblique fabric = longer path through it (bounded: no black quads)
      vec3 back = texture2D(uBack, vP / uView).rgb;
      back = mix(vec3(dot(back, vec3(.3, .55, .15))), back, .55);     // dense linen scatters and mutes the colour behind it
      // semi-sheer linen: the more fabric along the line of sight (folds, stacked layers, hems), the more window light it
      // scatters towards us and the less of the view gets through, so folds glow brighter instead of going black
      float amount = 1. - exp(-dens * path * 1.15);
      vec3 glow = back * amount * vec3(1., .97, .93) * 2.3;
      vec3 L = normalize(vec3(-.35, .5, .8));
      vec3 front = vec3(.07, .072, .08) * (.35 + .65 * max(dot(n, L), 0.)) * amount;
      float sheen = pow(1. - facing, 2.);
      vec3 col = (glow * (1. + sheen * .6) + front) * (1. - vAO * .25) * (.94 + .06 * weave);
      float a = clamp(amount * 1.04, .62, .96);
      a = max(a, max(col.r, max(col.g, col.b)));                    // keep the output validly premultiplied
      gl_FragColor = vec4(col, a);
    }`;

  function initGL() {
    if (!gl) return;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    try {
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const u = k => gl.getUniformLocation(pr, k), at = k => gl.getAttribLocation(pr, k);
      G = { pr, vb: gl.createBuffer(), ib: gl.createBuffer(), tex: gl.createTexture(), aP: at('aP'), aN: at('aN'), aT: at('aT'),
            uRes: u('uRes'), uView: u('uView'), uBack: u('uBack'), uThreads: u('uThreads'), uHem: u('uHem') };
    } catch (e) { console.warn('attic: WebGL fabric unavailable, using 2D', e); G = null; }
  }

  function buildBacklight() {                                     // what the fabric is lit by: the scene behind it, diffused
    if (!G) return;
    let c0 = mk(W / 2, H / 2); const c = c0.getContext('2d'); c.scale(.5, .5);
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.save(); winPath(c); c.clip(); c.drawImage(skyCan, win.x, win.y, win.w, win.h);
    const md = moonCan.width / dpr; c.drawImage(moonCan, moon.x - md / 2, moon.y - md / 2, md, md);
    const g = c.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, moon.r * 6);
    g.addColorStop(0, 'rgba(230,236,250,.9)'); g.addColorStop(.25, 'rgba(170,185,220,.25)'); g.addColorStop(1, 'rgba(170,185,220,0)');
    c.fillStyle = g; c.fillRect(moon.x - moon.r * 6, moon.y - moon.r * 6, moon.r * 12, moon.r * 12);
    c.restore();
    c.globalCompositeOperation = 'destination-out'; c.drawImage(frameCan, 0, 0, W, H); c.globalCompositeOperation = 'destination-over';
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';   // frame and mullions cast a shadow onto the curtain
    while (c0.width > W / 20) { const nx = mk(c0.width / 2, c0.height / 2); nx.getContext('2d').drawImage(c0, 0, 0, nx.width, nx.height); c0 = nx; }
    for (let k = 0; k < 2; k++) {                                   // up and down again: bilinear passes smooth away the blockiness
      const up = mk(c0.width * 2, c0.height * 2), uc = up.getContext('2d'); uc.imageSmoothingQuality = 'high'; uc.drawImage(c0, 0, 0, up.width, up.height);
      const dn = mk(c0.width, c0.height); dn.getContext('2d').drawImage(up, 1, 1, up.width - 2, up.height - 2, 0, 0, dn.width, dn.height); c0 = dn;
    }
    const fin = mk(c0.width * 4, c0.height * 4), fc = fin.getContext('2d'); fc.imageSmoothingQuality = 'high'; fc.drawImage(c0, 0, 0, fin.width, fin.height);
    backCan = fin;
  }

  function buildGLMesh() {
    if (!G) return;
    gcv.width = cv.width; gcv.height = cv.height;
    G.data = new Float32Array(P.length * 8); G.z = new Float32Array(P.length); G.z2 = new Float32Array(P.length); G.zt = new Float32Array(P.length); G.idx = new Uint16Array(2 * (ROWS - 1) * (COLS - 1) * 6);
    const idx = [];
    for (let panel = 0; panel < 2; panel++) {
      const b = panel * ROWS * COLS;
      for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) { const i = b + r * COLS + c; idx.push(i, i + 1, i + COLS, i + 1, i + COLS + 1, i + COLS); }
    }
    G.count = idx.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, G.idx.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.vb); gl.bufferData(gl.ARRAY_BUFFER, G.data.byteLength, gl.DYNAMIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, G.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backCan);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const pw = restW * (COLS - 1), ph = P[ROWS * COLS - 1].y - rod.y;
    G.threads = [pw / 2.2, ph / 2.2];
  }

  function renderGL() {
    const d = G.data, z = G.z, z2 = G.z2;
    for (let panel = 0; panel < 2; panel++) {
      const b = panel * ROWS * COLS;
      // pleat depth at each point: how much the neighbouring cloth is gathered (a segment shorter than its rest width
      // must have turned in z) times an alternating pleat profile. Local and bounded, so rows agree with each other.
      const seg = c0 => { const p = P[b + c0], q = P[b + c0 + 1], dd = Math.hypot(q.x - p.x, q.y - p.y); return Math.sqrt(Math.max(0, restW * restW - dd * dd)); };
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const o = r * COLS + c, g = (c > 0 ? seg(o - 1) : seg(o)) + (c < COLS - 1 ? seg(o) : seg(o - 1));
        z[b + o] = g * .5 * Math.cos(Math.PI * c / PLEAT) * PLEAT * .5;
      }
      for (let pass = 0; pass < 2; pass++) {                       // soften down and across the cloth, then ease over time
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const i = b + r * COLS + c, ru = Math.max(0, r - 1), rd = Math.min(ROWS - 1, r + 1);
          G.zt[i] = (z[b + ru * COLS + c] + 2 * z[i] + z[b + rd * COLS + c]) / 4;
        }
        z.set(G.zt.subarray(b, b + ROWS * COLS), b);
      }
      for (let i = b; i < b + ROWS * COLS; i++) z2[i] += (z[i] - z2[i]) * .5;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const i = b + r * COLS + c, cl = Math.max(0, c - 1), cr = Math.min(COLS - 1, c + 1), ru = Math.max(0, r - 1), rd = Math.min(ROWS - 1, r + 1);
        const A = P[b + r * COLS + cl], B = P[b + r * COLS + cr], U = P[b + ru * COLS + c], D = P[b + rd * COLS + c];
        const ux = B.x - A.x, uy = B.y - A.y, uz = z2[b + r * COLS + cr] - z2[b + r * COLS + cl];
        const vx = D.x - U.x, vy = D.y - U.y, vz = z2[b + rd * COLS + c] - z2[b + ru * COLS + c];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1; if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const ao = Math.min(1, Math.max(0, ((z2[b + r * COLS + cl] + z2[b + r * COLS + cr]) / 2 - z2[i]) / restW * 1.2));   // crease valleys
        const o = i * 8, p = P[i];
        d[o] = p.x; d[o + 1] = p.y; d[o + 2] = nx / l; d[o + 3] = ny / l; d[o + 4] = nz / l;
        d[o + 5] = c / (COLS - 1); d[o + 6] = r / (ROWS - 1); d[o + 7] = ao;
      }
    }
    if (gcv.width !== cv.width || gcv.height !== cv.height) { gcv.width = cv.width; gcv.height = cv.height; }
    gl.viewport(0, 0, gcv.width, gcv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(G.pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d);
    let k = 0; const ix = G.idx;
    for (let panel = 0; panel < 2; panel++) {
      const b = panel * ROWS * COLS;
      for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
        const i = b + r * COLS + c, A = P[i], B = P[i + 1], C2 = P[i + COLS + 1], D = P[i + COLS];
        if ((A.x - C2.x) ** 2 + (A.y - C2.y) ** 2 <= (B.x - D.x) ** 2 + (B.y - D.y) ** 2) { ix[k++] = i; ix[k++] = i + 1; ix[k++] = i + COLS + 1; ix[k++] = i; ix[k++] = i + COLS + 1; ix[k++] = i + COLS; }
        else { ix[k++] = i; ix[k++] = i + 1; ix[k++] = i + COLS; ix[k++] = i + 1; ix[k++] = i + COLS + 1; ix[k++] = i + COLS; }
      }
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.ib); gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, ix);
    gl.enableVertexAttribArray(G.aP); gl.vertexAttribPointer(G.aP, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(G.aN); gl.vertexAttribPointer(G.aN, 3, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(G.aT); gl.vertexAttribPointer(G.aT, 3, gl.FLOAT, false, 32, 20);
    gl.uniform2f(G.uRes, W, H); gl.uniform2f(G.uView, W, H); gl.uniform2f(G.uThreads, G.threads[0], G.threads[1]); gl.uniform1f(G.uHem, 1 - 3.5 / (ROWS - 1));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.tex); gl.uniform1i(G.uBack, 0);
    gl.drawElements(gl.TRIANGLES, G.count, gl.UNSIGNED_SHORT, 0);
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
    gust *= .992;                                                                // the first draught dies down over a few seconds
    step(t); updateSound(); measureCover();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bgCan, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(frameCan, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLight(t); drawCurtain();
    ctx.drawImage(vigCan, 0, 0, W, H);
    // photographic grain over the whole frame (keeps the dark gradients from banding)
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .09;
    const gp = ctx.createPattern(grainCan, 'repeat'), ox = reduce ? 0 : Math.random() * 220 | 0, oy = reduce ? 0 : Math.random() * 220 | 0;
    ctx.translate(-ox, -oy); ctx.fillStyle = gp; ctx.fillRect(0, 0, cv.width + 220, cv.height + 220); ctx.restore();
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '200px' }).observe(sec);
  new IntersectionObserver(([e]) => { if (e.isIntersecting && !gusted) { gusted = true; gust = 1; } }, { threshold: .4 }).observe(sec);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 250); });
  initGL();
  layout();
  requestAnimationFrame(frame);
})();
