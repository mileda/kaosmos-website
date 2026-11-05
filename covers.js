// Discography as a pinned WebGL stage: covers dissolve into each other through a noisy,
// chromatic wave as you scroll; the cursor ripples the surface. Falls back to the card grid.
(() => {
  const sec = document.querySelector('.disco');
  const cards = [...sec.querySelectorAll('.card')];
  const n = cards.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // file:// pages can't upload images to WebGL (tainted), so the stage needs http(s).
  if (reduce || !window.gsap || !window.ScrollTrigger || !location.protocol.startsWith('http')) return;
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  if (!gl) return;
  sec.classList.add('webgl'); // decided synchronously so main.js skips the horizontal track

  // ---------- markup ----------
  const stage = document.createElement('div');
  stage.className = 'cover-stage';
  stage.innerHTML = `
    <ol class="cs-list" lang="en" translate="no">${cards.map((c, i) => `<li><button type="button" data-i="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${c.querySelector('.card__title').textContent}</button></li>`).join('')}</ol>
    <a class="cs-view" target="_blank" rel="noopener"></a>
    <div class="cs-meta">
      <p class="cs-idx"><b>01</b> / ${String(n).padStart(2, '0')}</p>
      <h3 class="cs-title" lang="en" translate="no"></h3>
      <p class="cs-sub label"></p>
      <p class="cs-cta label">bandcamp ↗</p>
    </div>`;
  stage.querySelector('.cs-view').appendChild(cv);
  sec.appendChild(stage);
  const view = stage.querySelector('.cs-view'), btns = [...stage.querySelectorAll('.cs-list button')];
  const elIdx = stage.querySelector('.cs-idx b'), elTitle = stage.querySelector('.cs-title'), elSub = stage.querySelector('.cs-sub');

  // ---------- GL ----------
  const vs = `attribute vec2 a; varying vec2 uv; void main(){ uv = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }`;
  const fs = `precision mediump float;
  uniform sampler2D ta, tb; uniform float p, time, vel, hover; uniform vec2 mouse; varying vec2 uv;
  float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 q){ vec2 i = floor(q), f = fract(q); f = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 q){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*noise(q); q *= 2.; a *= .5; } return v; }
  vec3 rgb(sampler2D t, vec2 u, vec2 o){ return vec3(texture2D(t, u + o).r, texture2D(t, u).g, texture2D(t, u - o).b); }
  void main(){
    vec2 u = uv;
    float d = distance(u, mouse);                                   // cursor ripple
    u += (u - mouse) * hover * .05 * sin(d * 30. - time * 4.) * exp(-d * 5.);
    float nz = fbm(u * 3. + time * .04);
    float s = sin(p * 3.14159);
    vec2 dir = normalize(u - .5 + 1e-4);
    float edge = length(u - .5) * 1.25 + (nz - .5) * .9;             // noisy radial wipe
    float th = mix(-.45, 1.45, p);
    float m = 1. - smoothstep(th - .18, th, edge);                   // 1 → next cover
    vec2 wob = vec2(0., vel * .06 * (nz - .5));                      // scroll-speed jitter (halved)
    vec2 ua = u + dir * s * .16 * nz + wob, ub = u - dir * s * .16 * (1. - nz) + wob;
    vec2 off = dir * (s * .012 + vel * .015 + hover * .002);         // RGB split: subtle; the warp above stays full
    vec3 col = mix(rgb(ta, ua, off), rgb(tb, ub, off), m);
    col += vec3(.78, .2, .23) * smoothstep(.12, 0., abs(edge - th)) * s * .9;   // red seam
    col += (hash(uv * 900. + time) - .5) * .03;                                  // grain
    gl_FragColor = vec4(col, 1.);
  }`;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fail();
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ['ta', 'tb', 'p', 'time', 'vel', 'hover', 'mouse'].forEach(k => U[k] = gl.getUniformLocation(prog, k));
  gl.uniform1i(U.ta, 0); gl.uniform1i(U.tb, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  function fail() { sec.classList.remove('webgl'); sec.classList.add('grid'); stage.remove(); return null; }

  const tex = cards.map(() => null);
  function loadTex(i) {
    if (tex[i] !== null || i >= n) return;
    tex[i] = false;                                               // loading
    const img = new Image();
    img.onload = () => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); } catch { return fail(); }
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      tex[i] = t;
      if (i + 1 < n) loadTex(i + 1);                              // then the next one, so they stream in order without a burst
    };
    const jpg = cards[i].querySelector('img').src;               // stage texture: the 1200px WebP (a third of the JPEG), JPEG if it fails
    img.onerror = () => { img.onerror = null; img.src = jpg; };
    img.src = jpg.replace(/\.jpg$/, '-1200.webp');
  }
  // the 13 covers are ~2 MB: fetch them when the visitor heads towards the discography, not with the first page load
  const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); loadTex(0); } }, { rootMargin: '150% 0px' });
  near.observe(sec);

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    gl.viewport(0, 0, cv.width, cv.height);
  }
  addEventListener('resize', resize); resize();

  // ---------- state ----------
  let target = 0, cur = 0, shown = -1, hover = 0, hoverT = 0, visible = false;
  const mouse = [.5, .5];
  view.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mouse[0] = (e.clientX - r.left) / r.width; mouse[1] = 1 - (e.clientY - r.top) / r.height; hoverT = 1; });
  view.addEventListener('pointerleave', () => { hoverT = 0; });

  const seenAlbums = new Set();
  function setMeta(i) {
    const c = cards[i];
    elIdx.textContent = String(i + 1).padStart(2, '0');
    elTitle.textContent = c.querySelector('.card__title').textContent;
    elSub.textContent = `${c.querySelector('.card__year').textContent} · ${c.querySelector('.card__type').textContent}`;
    view.href = c.href; view.setAttribute('aria-label', elTitle.textContent + ' — Bandcamp');
    btns.forEach((b, j) => b.classList.toggle('on', j === i));
    gsap.fromTo([elTitle, elSub], { y: 18, opacity: 0, filter: 'blur(6px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: .6, stagger: .06, ease: 'power3.out', overwrite: true });
  }
  document.addEventListener('langchange', () => shown >= 0 && setMeta(shown));

  // ScrollTriggers must be created in page order (pins shift everything below them),
  // so main.js calls this between the portal and the gallery.
  let st;
  window.initCoverStage = () => {
    st = ScrollTrigger.create({
      trigger: sec, start: 'top top', end: () => '+=' + innerHeight * .75 * (n - 1), pin: true, scrub: true,
      onUpdate: self => { target = self.progress * (n - 1); },
      onRefresh: resize,
    });
  };
  btns.forEach(b => b.addEventListener('click', () => {
    if (st) scrollTo({ top: st.start + (b.dataset.i / (n - 1)) * (st.end - st.start), behavior: 'smooth' });
  }));
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(sec);

  const t0 = performance.now();
  (function loop() {
    requestAnimationFrame(loop);
    const vel = Math.min(Math.abs(target - cur) * 1.5, 1);
    cur += (target - cur) * .09;
    hover += (hoverT - hover) * .08;
    const i = Math.min(Math.floor(cur), n - 1), f = cur - i;
    const eased = Math.min(Math.max((f - .12) / .76, 0), 1); // rest on each cover a moment
    const k = Math.round(cur);
    if (k !== shown) { shown = k; setMeta(k); }
    if (visible && !seenAlbums.has(k)) { seenAlbums.add(k); window.track?.('album-seen', { album: cards[k].querySelector('.card__title').textContent, position: k + 1 }); }
    if (visible) { loadTex(i); loadTex(Math.min(i + 1, n - 1)); }   // a click on the list can jump ahead of the stream
    if (!visible || !tex[i]) return;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[i]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[Math.min(i + 1, n - 1)] || tex[i]);
    gl.uniform1f(U.p, eased * eased * (3 - 2 * eased));
    gl.uniform1f(U.time, (performance.now() - t0) / 1000);
    gl.uniform1f(U.vel, vel);
    gl.uniform1f(U.hover, hover);
    gl.uniform2f(U.mouse, mouse[0], mouse[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  })();
})();
