// Attic window: a sheer curtain (verlet cloth) hanging in front of a night skylight.
// Pull it around; its motion is turned into reverberant ambient sound (fabric breath,
// a dark drone that brightens as the window opens, and glass chimes).
(() => {
  const sec = document.querySelector('.attic');
  if (!sec) return;
  const cv = sec.querySelector('.attic__scene');
  let ctx = cv.getContext('2d');
  const fab = document.createElement('canvas'), fctx = fab.getContext('2d');   // curtain layer
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLS = 11, ROWS = 22, ITER = 6, GRAB_R = 46;

  let W, H, win, rod, P = [], C = [], stars = [], drops = [], clouds = [];
  let visible = false, grabbed = null, gx = 0, gy = 0, lastX = 0, lastY = 0, speed = 0, travel = 0, openness = 0, played = false;

  // ---------- layout + cloth ----------
  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ww = Math.min(W * 0.62, 460), wh = Math.min(ww * 1.3, H * 0.6);
    win = { x: W / 2 - ww / 2, y: H * (W < 600 ? 0.25 : 0.16), w: ww, h: wh, inset: ww * 0.09 };   // lower on phones, clear of the label
    rod = { y: win.y - 16, x0: win.x - ww * 0.22, x1: win.x + ww * 1.22 };
    buildCloth(); buildSky();
  }

  function buildCloth() {
    P = []; C = [];
    const pw = win.w * 0.62, sx = pw / (COLS - 1), sy = (win.h + 70) / (ROWS - 1);
    [win.x - win.w * 0.08, win.x + win.w * 0.46].forEach((x0, panel) => {
      const base = P.length;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const x = x0 + c * sx, y = rod.y + r * sy;
        P.push({ x, y, px: x, py: y, ring: r === 0, panel, r, c });
      }
      const at = (r, c) => P[base + r * COLS + c];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) C.push([at(r, c), at(r, c + 1), sx]);
        if (r < ROWS - 1) C.push([at(r, c), at(r + 1, c), sy]);
      }
    });
  }

  function buildSky() {
    const rnd = (a, b) => a + Math.random() * (b - a);
    stars = Array.from({ length: 70 }, () => ({ x: rnd(win.x, win.x + win.w), y: rnd(win.y, win.y + win.h * 0.85), s: rnd(.4, 1.4), p: rnd(0, 6.3), f: rnd(.6, 2) }));
    drops = Array.from({ length: 16 }, () => ({ x: rnd(win.x, win.x + win.w), y: rnd(win.y, win.y + win.h), v: rnd(.15, .6), l: rnd(4, 14) }));
    clouds = Array.from({ length: 5 }, () => ({ x: rnd(win.x - 100, win.x + win.w), y: rnd(win.y + win.h * .2, win.y + win.h * .8), r: rnd(60, 140), v: rnd(.05, .18) }));
  }

  // ---------- physics ----------
  function step(t) {
    const wind = reduce ? 0 : 0.035;
    for (const p of P) {
      if (p === grabbed) { p.px = p.x; p.py = p.y; p.x += (gx - p.x) * .5; p.y += (gy - p.y) * .5; continue; }
      const vx = (p.x - p.px) * (p.ring ? .8 : .985), vy = (p.y - p.py) * .985;
      p.px = p.x; p.py = p.y;
      if (p.ring) { p.x += vx; p.y = rod.y; continue; }           // rings slide along the rod
      const breeze = Math.sin(t * .0007 + p.r * .25 + p.panel * 2) * Math.sin(t * .00023 + p.c) * wind * (p.r / ROWS);
      p.x += vx + breeze; p.y += vy + .32;
    }
    for (let k = 0; k < ITER; k++) {
      for (const [a, b, rest] of C) {
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .001;
        if (d <= rest) continue;                                   // fabric resists stretch, folds freely
        const f = (d - rest) / d * .5;
        const ma = a === grabbed ? 0 : 1, mb = b === grabbed ? 0 : 1, s = ma + mb || 1;
        a.x += dx * f * 2 * ma / s; b.x -= dx * f * 2 * mb / s;
        if (!a.ring) a.y += dy * f * 2 * ma / s;
        if (!b.ring) b.y -= dy * f * 2 * mb / s;
      }
      for (const p of P) if (p.ring) p.x = Math.min(rod.x1, Math.max(rod.x0, p.x));
    }
    // how much of the window is uncovered (gap between the panels at mid height)
    const mid = Math.floor(ROWS * .45), L = P.filter(p => p.panel === 0 && p.r === mid), R = P.filter(p => p.panel === 1 && p.r === mid);
    const gap = Math.min(...R.map(p => p.x)) - Math.max(...L.map(p => p.x));
    openness += (Math.min(1, Math.max(0, gap / win.w)) - openness) * .1;
  }

  // ---------- drawing ----------
  const winPath = () => {
    ctx.beginPath();
    ctx.moveTo(win.x + win.inset, win.y); ctx.lineTo(win.x + win.w - win.inset, win.y);
    ctx.lineTo(win.x + win.w, win.y + win.h); ctx.lineTo(win.x, win.y + win.h); ctx.closePath();
  };

  function drawRoom(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0e10'); g.addColorStop(1, '#16171a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // sloped ceiling beams
    ctx.strokeStyle = 'rgba(216,213,207,.045)'; ctx.lineWidth = 1;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(W / 2 + i * W * .12, 0); ctx.lineTo(W / 2 + i * W * .3, H * .9); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, H * .9, W, H * .1);   // floor
    // moonlight spilling into the room, stronger when the curtain is open
    const a = .05 + openness * .16;
    const sg = ctx.createLinearGradient(0, win.y + win.h, 0, H);
    sg.addColorStop(0, `rgba(170,190,220,${a})`); sg.addColorStop(1, 'rgba(170,190,220,0)');
    ctx.fillStyle = sg; ctx.beginPath();
    ctx.moveTo(win.x, win.y + win.h); ctx.lineTo(win.x + win.w, win.y + win.h);
    ctx.lineTo(win.x + win.w * 1.35, H); ctx.lineTo(win.x - win.w * .35, H); ctx.fill();
  }

  function drawSky(t) {
    ctx.save(); winPath(); ctx.clip();
    const g = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
    g.addColorStop(0, '#05070d'); g.addColorStop(.65, '#121a2c'); g.addColorStop(1, '#2a1418');
    ctx.fillStyle = g; ctx.fillRect(win.x, win.y, win.w, win.h);
    for (const s of stars) {
      ctx.globalAlpha = .35 + .65 * (reduce ? .7 : (Math.sin(t * .001 * s.f + s.p) * .5 + .5));
      ctx.fillStyle = '#e8e6f0'; ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    const mx = win.x + win.w * .68, my = win.y + win.h * .26, mr = win.w * .065;
    const mg = ctx.createRadialGradient(mx, my, mr * .6, mx, my, mr * 5);
    mg.addColorStop(0, 'rgba(220,225,235,.35)'); mg.addColorStop(1, 'rgba(220,225,235,0)');
    ctx.fillStyle = mg; ctx.fillRect(win.x, win.y, win.w, win.h);
    ctx.fillStyle = '#e6e4dc'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = '#080b15'; ctx.beginPath(); ctx.arc(mx + mr * .45, my - mr * .2, mr * .95, 0, 7); ctx.fill(); // crescent (sky-coloured shadow)
    for (const c of clouds) {
      if (!reduce) { c.x += c.v; if (c.x - c.r > win.x + win.w) c.x = win.x - c.r; }
      const cg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      cg.addColorStop(0, 'rgba(150,160,190,.08)'); cg.addColorStop(1, 'rgba(150,160,190,0)');
      ctx.fillStyle = cg; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    }
    ctx.strokeStyle = 'rgba(200,210,230,.22)'; ctx.lineWidth = 1;
    for (const d of drops) {
      if (!reduce) { d.y += d.v; if (d.y > win.y + win.h) { d.y = win.y - 10; d.x = win.x + Math.random() * win.w; } }
      ctx.beginPath(); ctx.moveTo(d.x, d.y - d.l); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.restore();
    // frame + mullions
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 14; winPath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(216,213,207,.12)'; ctx.lineWidth = 1; winPath(); ctx.stroke();
    ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(win.x + win.w / 2, win.y); ctx.lineTo(win.x + win.w / 2, win.y + win.h);
    ctx.moveTo(win.x + win.inset * .45, win.y + win.h * .5); ctx.lineTo(win.x + win.w - win.inset * .45, win.y + win.h * .5); ctx.stroke();
  }

  function drawCurtain() {
    // rod + rings
    ctx.strokeStyle = '#3a342d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(rod.x0 - 10, rod.y); ctx.lineTo(rod.x1 + 10, rod.y); ctx.stroke();
    // Fabric is painted opaque on its own layer, then laid over the scene as one sheer sheet
    // (painting translucent quads directly shows their seams as a grid).
    const dpr = cv.width / W;
    if (fab.width !== cv.width || fab.height !== cv.height) { fab.width = cv.width; fab.height = cv.height; }
    const out = ctx; ctx = fctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    for (let panel = 0; panel < 2; panel++) {
      const base = panel * ROWS * COLS, at = (r, c) => P[base + r * COLS + c];
      for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
        const a = at(r, c), b = at(r, c + 1), d = at(r + 1, c + 1), e = at(r + 1, c);
        const restW = (win.w * .62) / (COLS - 1);
        const squeeze = Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / restW);   // <1 where gathered into folds
        const cx = (a.x + d.x) / 2, cy = (a.y + d.y) / 2;
        const backlit = cx > win.x && cx < win.x + win.w && cy > win.y && cy < win.y + win.h ? 28 : 0;
        const fold = (c % 2 ? 1 : -1) * (1 - squeeze) * 70;
        const l = Math.max(60, Math.min(235, 175 + backlit + fold - r * 1.2));
        ctx.fillStyle = ctx.strokeStyle = `rgb(${l},${l + 1},${l + 4})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
    ctx = out;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .48; ctx.drawImage(fab, 0, 0); ctx.restore();
    ctx.fillStyle = '#8a8075';
    for (const p of P) if (p.ring && p.c % 2 === 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7); ctx.fill(); }
    if (grabbed) {                                                  // a faint glow where the fabric is held
      const gg = ctx.createRadialGradient(grabbed.x, grabbed.y, 0, grabbed.x, grabbed.y, 40);
      gg.addColorStop(0, 'rgba(200,50,58,.35)'); gg.addColorStop(1, 'rgba(200,50,58,0)');
      ctx.fillStyle = gg; ctx.fillRect(grabbed.x - 40, grabbed.y - 40, 80, 80);
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  // ---------- sound ----------
  const S = {};
  const SCALE = [50, 53, 55, 57, 60, 62, 65, 67, 69, 72, 74, 77, 79, 81];   // D minor pentatonic, three octaves

  function impulse(ac, secs, decay) {
    const len = ac.sampleRate * secs, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function audioInit() {
    if (S.ac) { if (S.ac.state === 'suspended') S.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = new AC();
    const master = ac.createGain(); master.gain.value = .9;
    const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
    const verb = ac.createConvolver(); verb.buffer = impulse(ac, 6, 2.8);
    const wet = ac.createGain(); wet.gain.value = 1; verb.connect(wet); wet.connect(master);
    const dry = ac.createGain(); dry.gain.value = .18; dry.connect(master);
    const bus = ac.createGain(); bus.connect(verb); bus.connect(dry);
    // fabric breath: looped noise through a moving band-pass
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
    let last = 0; for (let i = 0; i < nd.length; i++) { last = (last + .04 * (Math.random() * 2 - 1)) / 1.04; nd[i] = last * 3.5; } // brown-ish
    const noise = ac.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .9; bp.frequency.value = 500;
    const ng = ac.createGain(); ng.gain.value = 0;
    noise.connect(bp); bp.connect(ng); ng.connect(bus); noise.start();
    // dark drone: D2 · D2 · A2 · D3, warm low-pass that opens with the window
    const padF = ac.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 260; padF.Q.value = .6;
    const padG = ac.createGain(); padG.gain.value = 0;
    [[73.42, -7], [73.42, 6], [110, 0], [146.83, -3]].forEach(([f, det]) => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(padF); o.start();
    });
    padF.connect(padG); padG.connect(bus);
    Object.assign(S, { ac, bus, ng, bp, padG, padF, lastChime: 0 });
  }

  function chime(note, vel, pan) {
    const ac = S.ac, t = ac.currentTime;
    if (t - S.lastChime < .07) return; S.lastChime = t;
    const f = 440 * Math.pow(2, (note - 69) / 12);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.11 * vel, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 4);
    [[1, 1], [2.01, .3], [3.98, .1]].forEach(([m, amp]) => {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = amp;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 4.1);
    });
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(S.bus); } else g.connect(S.bus);
  }

  function updateSound() {
    if (!S.ac) return;
    const t = S.ac.currentTime;
    const breath = grabbed ? Math.min(.24, speed * .014) : 0;
    S.ng.gain.setTargetAtTime(breath, t, grabbed ? .08 : .5);
    S.bp.frequency.setTargetAtTime(280 + Math.min(speed, 40) * 45 + (1 - gy / H) * 700, t, .1);
    S.padG.gain.setTargetAtTime(grabbed ? .07 : 0, t, grabbed ? .8 : 2.2);
    S.padF.frequency.setTargetAtTime(220 + openness * 1600, t, .4);
    if (grabbed && speed > 1.5) {
      travel += speed;
      if (travel > 65) {
        travel = 0;
        const idx = Math.round((1 - Math.min(1, Math.max(0, gy / H))) * (SCALE.length - 1));
        chime(SCALE[idx], Math.min(1, .25 + speed / 30), Math.max(-1, Math.min(1, (gx / W) * 2 - 1)));
      }
    }
  }

  // ---------- input ----------
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = local(e);
    let best = null, bd = GRAB_R * GRAB_R;
    for (const p of P) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
    if (!best) return;
    grabbed = best; gx = lastX = x; gy = lastY = y; travel = 0;
    cv.setPointerCapture(e.pointerId); sec.classList.add('attic--holding');
    audioInit();
    if (!played) { played = true; window.track?.('curtain-play'); }
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (grabbed) { gx = x; gy = y; return; }
    let near = false;                                                 // grab cursor when hovering the fabric
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
    step(t); updateSound();
    drawRoom(t); drawSky(t); drawCurtain();
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(sec);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 200); });
  layout();
  for (let i = 0; i < 90; i++) step(i * 16);                         // let the cloth settle before first view
  requestAnimationFrame(frame);
})();
