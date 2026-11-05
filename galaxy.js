// KAOSMOS — the galaxy home page.
// A real-time 3D spiral galaxy (GPU particles, dust lanes, emission nebulae, bloom) with four worlds in it.
// Drag to orbit, scroll / pinch to change distance, click a world to fly into its chapter.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('space');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = Math.min(innerWidth, innerHeight) < 700 || matchMedia('(pointer: coarse)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
} catch (e) { location.replace('classic.html' + location.hash); throw e; }
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x020306, 1);
let DPR = Math.min(devicePixelRatio || 1, phone ? 1.25 : 1.75);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 2000);
const clock = new THREE.Clock();
const U = { uTime: { value: 0 }, uPR: { value: DPR }, uScale: { value: 1 } };   // shared uniforms

// ---------- deterministic randomness, noise ----------
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };
const GLSL_NOISE = `
  float hash3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * noise3(p); p = p * 2.03 + 11.7; a *= .5; } return s; }`;

// ---------- soft sprite textures drawn on a canvas ----------
function glowTexture(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function puffTexture(size = 256) {                              // irregular cloud puff for nebulae
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = size * (.3 + rnd() * .4), y = size * (.3 + rnd() * .4), r = size * (.12 + rnd() * .22);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  const mask = g.createRadialGradient(size / 2, size / 2, size * .2, size / 2, size / 2, size / 2);
  mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = mask; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); return t;
}
const GLOW = glowTexture([[0, 'rgba(255,255,255,1)'], [.08, 'rgba(255,245,230,.85)'], [.25, 'rgba(255,220,190,.25)'], [1, 'rgba(255,200,170,0)']]);
const SOFT = glowTexture([[0, 'rgba(255,255,255,.9)'], [.4, 'rgba(255,255,255,.25)'], [1, 'rgba(255,255,255,0)']]);
const PUFF = puffTexture();

// ---------- the galaxy ----------
const galaxy = new THREE.Group();
galaxy.rotation.z = .08;
scene.add(galaxy);
const R = 12;                                                   // disc radius

const STAR_VS = `
  attribute float aR, aTheta, aY, aSize, aSeed; attribute vec3 aColor;
  uniform float uTime, uPR, uScale, uSpin, uMouseK; uniform vec3 uMouse;
  varying vec3 vColor; varying float vFade;
  void main(){
    float omega = 1. / (2. + aR);                                // inner stars orbit faster: the arms wind slowly
    float th = aTheta + uTime * omega * uSpin;
    vec3 p = vec3(cos(th) * aR, aY, sin(th) * aR);
    vec2 dm = p.xz - uMouse.xz; float f = uMouseK * exp(-dot(dm, dm) / 5.);     // the pointer stirs the disc
    float sw = sin(uTime * 2.2 + aSeed * 6.283);
    p.xz += dm * f * .55 + vec2(-dm.y, dm.x) * f * .25; p.y += f * ((aSeed - .5) * 1.6 + sw * .25);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_Position = projectionMatrix * mv;
    float tw = .78 + .22 * sin(uTime * (1.3 + aSeed * 3.) + aSeed * 61.);
    float s = aSize * uPR * uScale * 150. / -mv.z;
    vFade = clamp(s / 1.6, 0., 1.);                              // sub-pixel stars dim instead of flickering
    gl_PointSize = clamp(s, 1.2, 70.);
    vColor = aColor * tw * (1. + f * 2.6);
  }`;
const STAR_FS = `
  uniform float uBright;
  varying vec3 vColor; varying float vFade;
  void main(){
    vec2 q = gl_PointCoord - .5; float d2 = dot(q, q);
    float a = exp(-d2 * 26.) + .12 * exp(-d2 * 6.);
    if (a < .01) discard;
    gl_FragColor = vec4(vColor * a * vFade * uBright, 1.);
  }`;
const DUST_FS = `
  varying vec3 vColor; varying float vFade;
  void main(){
    vec2 q = gl_PointCoord - .5; float d2 = dot(q, q);
    float a = exp(-d2 * 10.) * .13;
    if (a < .01) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

function galaxyLayer(n, fill, material) {
  const aR = new Float32Array(n), aT = new Float32Array(n), aY = new Float32Array(n), aS = new Float32Array(n), aSeed = new Float32Array(n), aC = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = fill(i); aR[i] = s.r; aT[i] = s.t; aY[i] = s.y; aS[i] = s.size; aSeed[i] = rnd();
    aC[i * 3] = s.c[0]; aC[i * 3 + 1] = s.c[1]; aC[i * 3 + 2] = s.c[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));   // real positions come from the shader
  g.setAttribute('aR', new THREE.BufferAttribute(aR, 1)); g.setAttribute('aTheta', new THREE.BufferAttribute(aT, 1));
  g.setAttribute('aY', new THREE.BufferAttribute(aY, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(aS, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(aC, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.3);
  const pts = new THREE.Points(g, material); pts.frustumCulled = false; return pts;
}
const ARMS = 2, PITCH = .32;                                     // logarithmic spiral: theta = ln(r) / tan(pitch)
const armTheta = (r, arm) => Math.log(Math.max(r, .3) / .9) / Math.tan(PITCH) + arm * Math.PI * 2 / ARMS;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const OLD = [1.0, .78, .52], YOUNG = [.62, .76, 1.0], WHITE = [1, .96, .9], HII = [1.0, .32, .36], CORE = [1, .86, .66];

// ---------- the photograph ----------
// A face-on spiral made with Nano Banana. It lights the disc, and it is the map the 3D stars, star-forming
// regions and dust are drawn from, so the volume and the photo line up exactly.
const DISC = 30;                                                 // world size of the photo square (the galaxy fills ~80%: radius ≈ R)
const galImg = await new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = 'img/universe/galaxy-1024.webp'; });
const PN = 256;
let photo = null;
if (galImg) {
  const c = document.createElement('canvas'); c.width = c.height = PN;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(galImg, 0, 0, PN, PN);
  let d0 = null; try { d0 = x.getImageData(0, 0, PN, PN).data; } catch (e) { /* a CDN without CORS: fall back to the procedural galaxy */ }
  if (d0) {
  const d = d0, n = PN * PN, lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .55 + d[i * 4 + 2] * .15) / 255;
  const blur = (src, k) => {                                     // separable box blur, for "darker than its surroundings"
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let y = 0; y < PN; y++) for (let x2 = 0; x2 < PN; x2++) { let t = 0, m = 0; for (let j = -k; j <= k; j++) { const xx = x2 + j; if (xx >= 0 && xx < PN) { t += src[y * PN + xx]; m++; } } a[y * PN + x2] = t / m; }
    for (let y = 0; y < PN; y++) for (let x2 = 0; x2 < PN; x2++) { let t = 0, m = 0; for (let j = -k; j <= k; j++) { const yy = y + j; if (yy >= 0 && yy < PN) { t += a[yy * PN + x2]; m++; } } b[y * PN + x2] = t / m; }
    return b;
  };
  const soft = blur(lum, 5);
  const cdf = w => { const c2 = new Float32Array(n); let t = 0; for (let i = 0; i < n; i++) { t += w(i); c2[i] = t; } return c2; };
  const rad = i => Math.hypot((i % PN) / PN - .5, ((i / PN) | 0) / PN - .5) * 2;
  photo = {
    d, lum,
    stars: cdf(i => lum[i] ** 1.5),
    hii: cdf(i => { const r = d[i * 4], g = d[i * 4 + 1]; return Math.max(0, r - g - 45) ** 2 * (rad(i) > .12 ? 1 : 0); }),
    dust: cdf(i => { const v = soft[i] - lum[i] - .025; return v > 0 && rad(i) < .85 && soft[i] > .06 ? v * v : 0; }),
  };
}
}
function fromPhoto(cdf) {                                        // a random point weighted by the given map
  const t = rnd() * cdf[cdf.length - 1]; let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < t) lo = m + 1; else hi = m; }
  const x = ((lo % PN) + rnd()) / PN - .5, z = (((lo / PN) | 0) + rnd()) / PN - .5;
  const d = photo.d, k = lo * 4, mx = Math.max(d[k], d[k + 1], d[k + 2], 1);
  return { r: Math.hypot(x, z) * DISC, t: Math.atan2(z, x), c: [d[k] / mx, d[k + 1] / mx, d[k + 2] / mx], l: photo.lum[lo] };
}

// star clusters strung along the arms: knots that make the arms look flocculent rather than drawn
const CLUSTERS = Array.from({ length: 520 }, () => { const r = 1.6 + rnd() * (R - 2.6), arm = (rnd() * ARMS) | 0; return { r, t: armTheta(r, arm) + gauss() * (.1 + r * .02), w: .06 + rnd() * .16 }; });
function starAt(kind) {
  if (kind === 'photo') {                                         // a star where the photograph is bright, lifted into a thin disc
    const p = fromPhoto(photo.stars), big = rnd() < .01 ? 2.4 : 1;
    return { r: p.r, t: p.t, y: gauss() * (.05 + .07 * Math.exp(-p.r / 3)), size: (.24 + rnd() ** 3 * 1.1) * big, c: p.c.map(v => v * (.22 + p.l * .5)) };
  }
  if (kind === 'bulge') {                                         // old yellow stars in a squashed sphere
    const r = Math.abs(gauss()) * .85, t = rnd() * 6.283, y = gauss() * .38 * Math.exp(-r * .5);
    return { r, t, y, size: .35 + rnd() * .6, c: mixc(CORE, OLD, Math.min(1, r / 2)).map(v => v * .42) };
  }
  if (kind === 'cluster') {
    const c = CLUSTERS[(rnd() * CLUSTERS.length) | 0], r = Math.max(.5, c.r + gauss() * c.w * 2.2);
    return { r, t: c.t + gauss() * c.w / Math.max(r, 1) * 2.2, y: gauss() * .05, size: .3 + rnd() ** 2 * 1.1, c: (rnd() < .5 ? YOUNG : WHITE).map(v => v * 1.1) };
  }
  let r = -Math.log(1 - rnd() * .985) * 3.1 + .4; if (r > R) r = rnd() * R;   // exponential disc
  const arm = (rnd() * ARMS) | 0, spread = (.12 + r * .035) * gauss();
  const inArm = kind === 'arm';
  let t = inArm ? armTheta(r, arm) + spread : rnd() * 6.283;
  if (inArm && rnd() < .18) t += .35 + rnd() * .55 + (r - 4) * .05;  // spurs and feathers branching off the arms
  const y = gauss() * (.06 + .04 * Math.exp(-r / 3)) * (inArm ? 1 : 1.6);
  const age = inArm ? rnd() * .7 : .35 + rnd() * .65;            // arms are young and blue, the disc between them older
  let c = mixc(YOUNG, OLD, age); if (rnd() < .2) c = WHITE;
  const bright = rnd() < .012 ? 2.6 : 1;
  return { r, t, y, size: (.28 + rnd() ** 3 * 1.3) * bright, c: c.map(v => v * (inArm ? 1 : .7) * (1 - r / (R * 1.6))) };
}
const NSTAR = reduce ? 60000 : phone ? 55000 : 160000;
const starMat = new THREE.ShaderMaterial({ uniforms: { ...U, uSpin: { value: .05 }, uMouse: { value: new THREE.Vector3(999, 0, 999) }, uMouseK: { value: 0 }, uBright: { value: 160000 / (reduce ? 60000 : phone ? 55000 : 160000) * .085 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
starMat.uniforms.uTime = U.uTime; starMat.uniforms.uPR = U.uPR; starMat.uniforms.uScale = U.uScale;
const stars = galaxyLayer(NSTAR, photo
  ? i => starAt(i < NSTAR * .06 ? 'bulge' : i < NSTAR * .74 ? 'photo' : 'disc')
  : i => starAt(i < NSTAR * .09 ? 'bulge' : i < NSTAR * .26 ? 'cluster' : i < NSTAR * .7 ? 'arm' : 'disc'), starMat);
galaxy.add(stars);

// emission nebulae (pink HII regions) beading the arms
const nebMat = new THREE.ShaderMaterial({ uniforms: starMat.uniforms, vertexShader: STAR_VS, fragmentShader: `
  varying vec3 vColor; varying float vFade; uniform sampler2D uMap;
  void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor * t.a, t.a * .9); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
nebMat.uniforms = { ...starMat.uniforms, uMap: { value: PUFF } };
const NNEB = phone ? 700 : 1600;
const nebulae = galaxyLayer(NNEB, () => {
  if (photo) { const p = fromPhoto(photo.hii); return { r: p.r, t: p.t, y: gauss() * .05, size: .9 + rnd() * 2.6, c: HII.map(v => v * (.008 + rnd() * .016)) }; }
  const r = 1.8 + rnd() * (R - 3), arm = (rnd() * ARMS) | 0;
  return { r, t: armTheta(r, arm) + gauss() * .14 + .08, y: gauss() * .05, size: 3 + rnd() * 9, c: (rnd() < .75 ? HII : [.45, .55, 1]).map(v => v * (.012 + rnd() * .022)) };
}, nebMat);
galaxy.add(nebulae);

// dust lanes on the inner edge of each arm (drawn after the stars, darkening them)
const dustMat = new THREE.ShaderMaterial({ uniforms: starMat.uniforms, vertexShader: STAR_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.NormalBlending });
const NDUST = photo ? (phone ? 9000 : 32000) : phone ? 14000 : 34000;
const lanePhase = Array.from({ length: ARMS * 3 }, () => rnd() * 6.283);
const laneDensity = (r, arm) => {                                 // patchy along the arm: gaps and thick knots
  const p = lanePhase.slice(arm * 3, arm * 3 + 3);
  return Math.max(0, .55 + .45 * Math.sin(r * 2.3 + p[0]) * Math.sin(r * 5.1 + p[1]) + .25 * Math.sin(r * 11.7 + p[2]));
};
const dust = galaxyLayer(NDUST, () => {                         // wispy filaments on the inner (leading) edge of the arms
  if (photo) { const p = fromPhoto(photo.dust); return { r: p.r, t: p.t, y: gauss() * (rnd() < .15 ? .35 : .09), size: .3 + rnd() * .8, c: [.03, .02, .015] }; }
  let r, arm, tries = 0;
  do { r = 1.2 + rnd() * 9; arm = (rnd() * ARMS) | 0; } while (rnd() > laneDensity(r, arm) ** 2 && ++tries < 12);
  const off = -(.1 + rnd() * .26), feather = rnd() < .2 ? (rnd() - .5) * .5 : 0;
  return { r: r + feather * .6, t: armTheta(r, arm) + off + gauss() * .02 + feather * .15, y: gauss() * .025, size: .5 + rnd() * 1.4, c: [.01, .007, .006] };
}, dustMat);
dust.renderOrder = 2;
galaxy.add(dust);

// thick dark clouds floating above and below the lanes: they slide over the disc as the view turns
if (photo) {
  const puffMat = new THREE.ShaderMaterial({ uniforms: { ...starMat.uniforms, uMap: { value: PUFF } }, vertexShader: STAR_VS, transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    fragmentShader: `uniform sampler2D uMap; varying vec3 vColor; void main(){ float a = texture2D(uMap, gl_PointCoord).a * .42; if (a < .01) discard; gl_FragColor = vec4(vColor, a); }` });
  const clouds = galaxyLayer(phone ? 500 : 1100, () => { const p = fromPhoto(photo.dust); return { r: p.r, t: p.t, y: gauss() * .22, size: 2 + rnd() * 4.5, c: [.035, .025, .02] }; }, puffMat);
  clouds.renderOrder = 3; galaxy.add(clouds);
}
// a loose haze of faint stars and motes through the whole volume, above and below the disc: depth when moving
galaxy.add(galaxyLayer(phone ? 2500 : 6000, () => {
  const r = Math.sqrt(rnd()) * 26, c = mixc(YOUNG, OLD, rnd());
  return { r, t: rnd() * 6.283, y: gauss() * 3.5, size: .2 + rnd() ** 4 * .9, c: c.map(v => v * (.25 + rnd() * .5)) };
}, starMat));

// the core: a hot glow that blooms
const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(1, .82, .62).multiplyScalar(.55), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
coreGlow.scale.setScalar(4.2); galaxy.add(coreGlow);
const coreHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: new THREE.Color(.9, .55, .35).multiplyScalar(.09), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
coreHalo.scale.setScalar(16); galaxy.add(coreHalo);
if (photo) { coreGlow.material.color.multiplyScalar(.1); coreHalo.material.color.multiplyScalar(.3); }

// the photograph itself, as the light of the disc; it turns with the same differential rotation as the stars
const discMat = new THREE.ShaderMaterial({
  uniforms: { uMap: { value: null }, uTime: U.uTime, uSpin: starMat.uniforms.uSpin, uGain: { value: .62 } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vP; varying float vFace;
    void main(){ vP = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.);
      vFace = abs(dot(normalize(normalMatrix * vec3(0., 0., 1.)), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D uMap; uniform float uTime, uSpin, uGain; varying vec2 vP; varying float vFace;
    void main(){
      vec2 g = vec2(vP.x, -vP.y); float r = length(g);
      float th = atan(g.y, g.x) - uTime * uSpin / (2. + r);
      vec2 q = vec2(cos(th), sin(th)) * r;
      vec2 uv0 = vec2(g.x, -g.y) / ${DISC}. + .5, uv = vec2(q.x, -q.y) / ${DISC}. + .5;
      vec3 c = textureGrad(uMap, uv, dFdx(uv0), dFdy(uv0)).rgb;      // gradients from the unrotated uv: no seam at the atan wrap
      c *= mix(.3, 1., smoothstep(.3, 4.5, r));                         // the photo's core is burnt in: leave headroom for bloom
      gl_FragColor = vec4(c * uGain * smoothstep(.02, .4, vFace), 1.);
    }` });
const disc = new THREE.Mesh(new THREE.PlaneGeometry(DISC, DISC), discMat);
disc.rotation.x = -Math.PI / 2; disc.renderOrder = -1; disc.visible = !!photo;
galaxy.add(disc);

// ---------- the far sky: distant stars and a faint nebular background ----------
const skyGroup = new THREE.Group(); scene.add(skyGroup);
{
  const n = phone ? 4000 : 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, th = rnd() * 6.283, s = Math.sqrt(1 - u * u), r = 600;
    pos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
    const c = mixc(YOUNG, OLD, rnd()); col.set(c.map(v => v * (.25 + rnd() ** 4 * 1.2)), i * 3); size[i] = 1 + rnd() ** 6 * 2.5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uPR; varying vec3 vC;
      void main(){ vC = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * uPR; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vC, smoothstep(.5, .1, d)); }` });
  const sky = new THREE.Points(g, m); sky.frustumCulled = false; skyGroup.add(sky);

  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: U,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: GLSL_NOISE + `varying vec3 vDir; uniform float uTime;
      void main(){
        vec3 d = normalize(vDir);
        float band = exp(-pow(dot(d, normalize(vec3(.3, 1., -.2))) * 3.2, 2.));          // a faint far galactic band
        float n = fbm3(d * 3.2 + vec3(0., 0., uTime * .002)), n2 = fbm3(d * 7. + 4.);
        vec3 col = vec3(.010, .013, .024) + band * vec3(.05, .045, .06) * n2;
        col += smoothstep(.55, .85, n) * vec3(.05, .016, .02) + smoothstep(.6, .9, n2) * vec3(.012, .02, .045);
        gl_FragColor = vec4(col, 1.);
      }` });
  skyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat));
}

// ---------- the four worlds ----------
const loader = new THREE.TextureLoader();
const tex = (src, srgb = true) => { const t = loader.load(src); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
if (photo) discMat.uniforms.uMap.value = tex(phone ? 'img/universe/galaxy-1024.webp' : 'img/universe/galaxy-2048.webp');
const NEB_RED = tex(`img/universe/nebula-red-${phone ? 512 : 1024}.webp`), NEB_TEAL = tex(`img/universe/nebula-teal-${phone ? 512 : 1024}.webp`);
const sprite = (map, color, size, additive = true, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.setScalar(size); return s;
};
const worldsGroup = new THREE.Group(); galaxy.add(worldsGroup);
const LIGHT_DIR_UNIFORM = { value: new THREE.Vector3() };

function planetMaterial(palette, bands, seedOff, map = null) {   // banded gas giant lit by the galactic core (a photo texture when given)
  return new THREE.ShaderMaterial({ defines: map ? { USE_PHOTO: '' } : {}, uniforms: { uMap: { value: map }, uTime: U.uTime, uLight: LIGHT_DIR_UNIFORM, uA: { value: new THREE.Color(palette[0]) }, uB: { value: new THREE.Color(palette[1]) }, uC: { value: new THREE.Color(palette[2]) } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vP = position; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_NOISE + `uniform float uTime; uniform vec3 uLight, uA, uB, uC; uniform sampler2D uMap; varying vec3 vN; varying vec3 vP; varying vec3 vW; varying vec2 vUv;
      void main(){
        vec3 p = normalize(vP);
        float warp = fbm3(p * 3. + vec3(uTime * .01, 0., ${seedOff.toFixed(1)}));
        float lat = p.y * ${bands.toFixed(1)} + warp * 2.6;
        float b = .5 + .5 * sin(lat * 3.1416);
        float storms = smoothstep(.62, .8, fbm3(p * 9. + ${seedOff.toFixed(1)}));
        vec3 col = mix(uA, uB, b); col = mix(col, uC, storms * .7 + smoothstep(.85, 1., b) * .3);
        #ifdef USE_PHOTO
        col = texture2D(uMap, vec2(vUv.x + uTime * .004 + (warp - .5) * .004, vUv.y)).rgb;   // the cloud bands drift
        #endif
        vec3 n = normalize(vN), l = normalize((viewMatrix * vec4(uLight, 0.)).xyz);
        float diff = smoothstep(-.15, .6, dot(n, l));
        float rim = pow(1. - max(dot(n, vec3(0., 0., 1.)), 0.), 3.);
        gl_FragColor = vec4(col * (.05 + diff * 1.1) + rim * uB * .5 * (.3 + diff), 1.);
      }` });
}
function atmosphere(radius, color, power = 2.6) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uC: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), ${power.toFixed(1)}); gl_FragColor = vec4(uC * f * 1.6, f); }` }));
}
function beams(color, length, width, count) {                    // soft light cones (stage lights, pulsar beams)
  const g = new THREE.ConeGeometry(width, length, 32, 1, true); g.translate(0, -length / 2, 0); g.rotateX(Math.PI);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uC: { value: new THREE.Color(color) }, uL: { value: length } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; uniform float uL; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float t = clamp(vY / uL, 0., 1.); float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(uC * (1. - t) * (1. - t) * edge * .55, 1.); }` });
  const grp = new THREE.Group();
  for (let i = 0; i < count; i++) grp.add(new THREE.Mesh(g, m));
  return grp;
}

const covers = ['arisen', 'the-lost-columns', 're-leaf-va', 'midnight-occults', 'quis-sum', 'lumin', 'music-for-entropia', 'sins-and-destiny-revelations-under-a-buried-sun-split', 'spirits-drifting', 'woolgathering', 'levitate', 'black-hypnosis', 'galaxsynth', 'time-and-space'];
const WORLDS = [
  { id: 'releases', name: 'Releases', note: 'Fourteen transmissions · 2013 — 2026', pos: [7.2, .25, 3.2], view: 3.4, image: 'img/covers/arisen-1200.webp', title: 'Fourteen transmissions.', sections: ['.latest', '.disco', '.elsewhere'] },
  { id: 'live', name: 'Live', note: 'Sound and light · performed in the dark', pos: [-6.4, .35, 4.6], view: 3.8, image: 'img/photos/p15-1600.webp', title: 'Sound and light, performed in the dark.', sections: ['.live'] },
  { id: 'about', name: 'About', note: 'The source · Istanbul, since 2013', pos: [-5.6, .2, -5.2], view: 3.0, image: 'img/photos/p03-1600.webp', title: 'An inner universe.', sections: ['.about'] },
  { id: 'contact', name: 'Contact', note: 'Send a signal', pos: [6.4, .4, -6.2], view: 2.8, image: 'img/photos/p11-1600.webp', title: 'Across the void.', sections: ['.contact'] },
];
const anims = [];                                                 // per-frame updates of the worlds (one per world, in order)
const extras = [];                                                // other per-frame updates

// far nebulae hanging in the sky behind the galaxy: depth and colour on the way out
[[NEB_RED, [-220, 70, -330], 230, .55, .4], [NEB_TEAL, [300, -60, -160], 260, .5, 2.1], [NEB_TEAL, [-260, -120, 260], 190, .3, 4], [NEB_RED, [240, 140, 280], 170, .28, 1.2]].forEach(([m, p, size, o, rot]) => {
  const s = sprite(m, new THREE.Color(1, 1, 1), size, true, o); s.position.set(...p); s.material.rotation = rot; skyGroup.add(s);
});
WORLDS.forEach(w => {
  const g = new THREE.Group(); g.position.set(...w.pos); worldsGroup.add(g); w.group = g;
  const hit = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.userData.world = w; g.add(hit); w.hit = hit;
  w.glow = sprite(GLOW, new THREE.Color(1, 1, 1), 1, true, .0); g.add(w.glow);   // hover glow
});

// 01 RELEASES — a gas giant with the discography orbiting as its ring
{
  const w = WORLDS[0], g = w.group;
  const planet = new THREE.Mesh(new THREE.SphereGeometry(.62, 64, 48), planetMaterial(['#0b2a2c', '#7fa7a0', '#e8e2d2'], 7, 3., tex('img/universe/gas-giant-1024.webp'))); g.add(planet);
  g.add(atmosphere(.7, '#6fd0c0'));
  const tilt = new THREE.Group(); tilt.rotation.set(.42, 0, -.25); g.add(tilt);
  const ringDust = new THREE.Mesh(new THREE.RingGeometry(.9, 1.55, 128, 1), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: GLSL_NOISE + `varying vec2 vP; void main(){ float r = length(vP); float bands = .5 + .5 * sin(r * 70.) * noise3(vec3(r * 30., 0., 1.)); float a = smoothstep(.9, 1., r) * smoothstep(1.55, 1.35, r) * bands; gl_FragColor = vec4(vec3(.75, .8, .78) * a * .35, 1.); }` }));
  ringDust.rotation.x = -Math.PI / 2; tilt.add(ringDust);
  const ring = new THREE.Group(); tilt.add(ring);
  covers.forEach((c, i) => {
    const s = sprite(tex(`img/covers/${c}-600.webp`), new THREE.Color(1, 1, 1), .34, false, 1);
    const a = i / covers.length * Math.PI * 2; s.userData.a = a; s.position.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25); ring.add(s);
  });
  anims.push((t, k) => { planet.rotation.y = t * .05; ring.rotation.y = t * (.05 + k * .25); });
}
// 02 LIVE — a stage in a red emission nebula: a hot star, sweeping light beams, photographs drifting in the light
{
  const w = WORLDS[1], g = w.group;
  const neb = sprite(NEB_RED, new THREE.Color(1, 1, 1), 4.6, true, .95); g.add(neb);
  const neb2 = sprite(NEB_RED, new THREE.Color(1, .8, .85), 3.2, true, .5); neb2.material.rotation = 2.4; g.add(neb2);
  extras.push(t => { neb.material.rotation = t * .01; neb2.material.rotation = 2.4 - t * .014; });
  for (let i = 0; i < 10; i++) {
    const s = sprite(PUFF, new THREE.Color().setHSL(rnd() < .75 ? .99 : .6, .8, .5).multiplyScalar(.3 + rnd() * .35), 1.4 + rnd() * 2, true, .3);
    s.position.set(gauss() * .9, gauss() * .5, gauss() * .9); s.material.rotation = rnd() * 6.28; g.add(s);
  }
  g.add(sprite(GLOW, new THREE.Color(1, .85, .8).multiplyScalar(3), 1.5));
  const bm = beams('#ffd8d0', 3.2, .55, 3); g.add(bm);
  const shots = ['p04', 'p12', 'p02', 'p09', 'p13'].map((p, i) => {
    const s = sprite(tex(`img/photos/${p}-960.webp`), new THREE.Color(1, 1, 1), 1, false, .92); s.scale.set(.62, .41, 1);
    s.userData.a = i / 5 * Math.PI * 2; g.add(s); return s;
  });
  anims.push((t, k) => {
    bm.children.forEach((b, i) => { b.rotation.set(Math.sin(t * .6 + i * 2.1) * .7, t * .3 + i * 2.09, Math.cos(t * .5 + i) * .5); });
    shots.forEach((s, i) => { const a = s.userData.a + t * (.06 + k * .2); s.position.set(Math.cos(a) * 1.35, Math.sin(t * .4 + i) * .25, Math.sin(a) * 1.35); });
  });
}
// 03 ABOUT — the source: a binary star, one white-hot and one ember-red, circling each other
{
  const w = WORLDS[2], g = w.group;
  const starMat2 = col => new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uC: { value: new THREE.Color(col) } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: GLSL_NOISE + `uniform float uTime; uniform vec3 uC; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ float n = fbm3(normalize(vP) * 5. + uTime * .15); float limb = pow(max(dot(vN, vV), 0.), .45);
        gl_FragColor = vec4(uC * (1.4 + n * 1.6) * limb, 1.); }` });
  const a = new THREE.Mesh(new THREE.SphereGeometry(.34, 48, 32), starMat2('#ffe9d6')), b = new THREE.Mesh(new THREE.SphereGeometry(.2, 48, 32), starMat2('#ff5a3c'));
  const ga = sprite(GLOW, new THREE.Color(1, .9, .8).multiplyScalar(2.2), 2.6), gb = sprite(GLOW, new THREE.Color(1, .35, .2).multiplyScalar(1.6), 1.5);
  a.add(ga); b.add(gb); g.add(a, b);
  const bridge = sprite(PUFF, new THREE.Color(1, .45, .3).multiplyScalar(.5), 1.6, true, .6); g.add(bridge);   // matter streaming between them
  const portrait = sprite(tex('img/photos/p08-960.webp'), new THREE.Color(1, 1, 1), 1, false, .9); portrait.scale.set(.5, .62, 1); g.add(portrait);
  anims.push((t, k) => {
    const ang = t * (.35 + k * .8);
    a.position.set(Math.cos(ang) * .38, 0, Math.sin(ang) * .38); b.position.set(-Math.cos(ang) * .66, 0, -Math.sin(ang) * .66);
    bridge.position.copy(a.position).lerp(b.position, .45); bridge.material.rotation = ang;
    portrait.position.set(Math.cos(-t * .15) * 1.35, .35 + Math.sin(t * .5) * .08, Math.sin(-t * .15) * 1.35);
  });
}
// 04 CONTACT — a pulsar: a tiny dense core, two sweeping beams, signal rings travelling outwards
{
  const w = WORLDS[3], g = w.group;
  g.add(sprite(GLOW, new THREE.Color(.75, .85, 1).multiplyScalar(3.2), 1.1));
  const neb = sprite(NEB_TEAL, new THREE.Color(1, 1, 1), 4.2, true, .7); g.add(neb);           // the remnant the pulsar was born from
  extras.push(t => { neb.material.rotation = -t * .012; });
  const axis = new THREE.Group(); axis.rotation.z = .5; g.add(axis);
  const bm = beams('#bcd4ff', 3.4, .16, 2); bm.children[1].rotation.x = Math.PI; axis.add(bm);
  // the transmission: a wide searchlight aimed out of the galaxy, with packets of light and wavefronts riding it
  const tx = new THREE.Group(); tx.rotation.set(-.35, 0, -.55); g.add(tx);
  const LEN = 11, send = beams('#9fc4ff', LEN, 1.1, 1); tx.add(send);
  const core2 = beams('#e4eeff', LEN, .22, 1); tx.add(core2);
  const packets = Array.from({ length: 9 }, () => { const s = sprite(GLOW, new THREE.Color(.8, .9, 1).multiplyScalar(2.4), .5); tx.add(s); return s; });
  const fronts = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(.55, .75, 1), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; tx.add(m); return m;
  });
  const flash = sprite(GLOW, new THREE.Color(.7, .85, 1), 2.4, true, 0); g.add(flash);
  extras.push(t => {
    tx.rotation.y = Math.sin(t * .13) * .5;                        // the dish slowly scans the sky
    const cyc = t % 4;                                               // every 4 s: a burst of three ("· · ·")
    packets.forEach((s, i) => {
      const burst = (i / 3) | 0, j = i % 3, u = (cyc - j * .22 + burst * 4 / 3) % 4 / 2.2;   // three bursts in flight
      const on = u >= 0 && u < 1;
      s.visible = on; if (!on) return;
      s.position.set(0, u * LEN, 0); s.material.opacity = (1 - u) * (u < .05 ? u / .05 : 1);
      s.scale.setScalar(.35 + u * .5);
    });
    fronts.forEach((m, i) => { const u = ((t * .28 + i / fronts.length) % 1); m.position.set(0, u * LEN, 0); m.scale.setScalar(.15 + u * 1.05); m.material.opacity = (1 - u) * .35; });
    flash.material.opacity = Math.max(0, 1 - (cyc % (4 / 3)) * 4) * .5;
  });
  const rings = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(.6, .75, 1), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; g.add(m); return m;
  });
  anims.push((t, k) => {
    axis.rotation.y = t * (2.2 + k * 3);
    rings.forEach((m, i) => { const u = ((t * .5 + i / rings.length) % 1); m.scale.setScalar(.2 + u * 2.4); m.material.opacity = (1 - u) * .5 * (.6 + k); });
  });
}

// ---------- post: bloom, then lens (warp blur, chromatic fringe, vignette, grain) ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .85, .55, .55);
composer.addPass(bloom);
const lens = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: U.uTime, uWarp: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uWarp, uAspect; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5; float d = length(c * vec2(uAspect, 1.));
      vec3 col = vec3(0.);
      if (uWarp < .01) {                                              // at rest: one tap, just the colour fringe
        float ca = .0016 * d;
        col = vec3(texture2D(tDiffuse, .5 + c * (1. + ca)).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, .5 + c * (1. - ca)).b);
      } else {
      float amt = uWarp * .09;                                       // zoom streaks while flying
      for (int i = 0; i < 10; i++){ float s = 1. - amt * float(i) / 9.; vec2 uv = .5 + c * s;
        float ca = .0016 * (1. + uWarp * 8.) * d;
        col += vec3(texture2D(tDiffuse, .5 + (uv - .5) * (1. + ca)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, .5 + (uv - .5) * (1. - ca)).b); }
      col /= 10.;
      }
      col *= mix(1., smoothstep(1.05, .25, d), .75);
      col += (h(vUv * 1000. + fract(uTime) * 61.) - .5) * .028;
      gl_FragColor = vec4(col, 1.);
    }` });
composer.addPass(lens);
composer.addPass(new OutputPass());

// ---------- camera: orbit with inertia, an intro pull-back, flights to the worlds ----------
const orbit = { theta: .6, phi: 1.08, dist: phone ? 30 : 23 }, goal = { ...orbit };
const look = new THREE.Vector3();
let intro = reduce ? 1 : 0;
const homeDist = () => (innerWidth / innerHeight < .8 ? 34 : phone ? 28 : 23);
function orbitPos(o, out = new THREE.Vector3()) { return out.set(Math.sin(o.phi) * Math.sin(o.theta), Math.cos(o.phi), Math.sin(o.phi) * Math.cos(o.theta)).multiplyScalar(o.dist); }
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

let flight = null;                                                // { w, from, to, lookFrom, lookTo, t, dir }
const worldPos = w => w.group.getWorldPosition(new THREE.Vector3());
function flyTo(w) {
  scene.updateMatrixWorld();
  const wp = worldPos(w), camNow = camera.position.clone();
  const away = camNow.clone().sub(wp).setY(0).normalize();
  const to = wp.clone().add(away.multiplyScalar(w.view)).add(new THREE.Vector3(0, w.view * .32, 0));
  flight = { w, from: camNow, to, lookFrom: look.clone(), lookTo: wp, t: 0, dir: 1, dur: reduce ? .01 : 2.4 };
  hideLabels(true);
  window.track?.('world', { id: w.id });
}
function flyBack() {
  if (!flight) return;
  flight.dir = -1; flight.t = Math.min(flight.t, 1);
}

// ---------- HTML overlay: labels, intro text, chapter ----------
const labelsEl = document.getElementById('labels');
WORLDS.forEach((w, i) => {
  const b = document.createElement('button'); b.className = 'orb'; b.type = 'button';
  b.innerHTML = `<span class="orb__n">${String(i + 1).padStart(2, '0')}</span><span class="orb__name">${w.name}</span><span class="orb__note">${w.note}</span>`;
  b.addEventListener('click', () => go(w)); b.addEventListener('pointerenter', () => hovered = w); b.addEventListener('pointerleave', () => { if (hovered === w) hovered = null; });
  labelsEl.append(b); w.label = b;
});
function hideLabels(h) { labelsEl.classList.toggle('hidden', h); }
const v3 = new THREE.Vector3();
function placeLabels() {
  for (const w of WORLDS) {
    v3.copy(worldPos(w)); v3.y += 1.05;
    const p = v3.project(camera), on = p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15;
    w.label.style.transform = `translate(${(p.x * .5 + .5) * innerWidth}px, ${(-p.y * .5 + .5) * innerHeight}px)`;
    w.label.style.opacity = on ? '' : '0'; w.label.classList.toggle('on', hovered === w);
  }
}

// ---------- pointer: orbit, zoom, hover, click ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hovered = null, drag = null, moved = 0, pinch = 0;
const pointers = new Map();
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY }; moved = 0; });
canvas.addEventListener('pointermove', e => {
  stirAt = performance.now();
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const p = pointers.get(e.pointerId);
  if (p && !flight) {
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) goal.dist = THREE.MathUtils.clamp(goal.dist * pinch / d, 7, 46); pinch = d;
    } else {
      const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy);
      goal.theta -= dx * .005; goal.phi = THREE.MathUtils.clamp(goal.phi - dy * .004, .25, 1.48);
    }
    p.x = e.clientX; p.y = e.clientY; intro = 1;
  }
});
const up = e => {
  pointers.delete(e.pointerId); pinch = 0;
  if (pointers.size === 0 && drag && moved < 8 && !flight) {          // a click, not a drag
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(WORLDS.map(w => w.hit))[0];
    if (hit) go(hit.object.userData.world);
  }
  if (!pointers.size) drag = null;
};
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', e => { if (flight) return; e.preventDefault(); goal.dist = THREE.MathUtils.clamp(goal.dist * Math.exp(e.deltaY * .0012), 7, 46); intro = 1; }, { passive: false });
addEventListener('keydown', e => {
  if (chapter.open || flight) { if (e.key === 'Escape') home(); return; }
  const k = { ArrowLeft: [.12, 0], ArrowRight: [-.12, 0], ArrowUp: [0, -.08], ArrowDown: [0, .08] }[e.key];
  if (k) { goal.theta += k[0]; goal.phi = THREE.MathUtils.clamp(goal.phi + k[1], .25, 1.48); }
  if (e.key === '+' || e.key === '=') goal.dist = Math.max(7, goal.dist * .85);
  if (e.key === '-') goal.dist = Math.min(46, goal.dist * 1.15);
});

// ---------- chapters ----------
const chapter = document.getElementById('chapter');
const chapterBody = document.getElementById('chapter-body');
const chapterHero = document.getElementById('chapter-hero');
let classicDoc = null;
async function classic() {
  if (!classicDoc) classicDoc = fetch('classic.html').then(r => r.text()).then(t => new DOMParser().parseFromString(t, 'text/html'));
  return classicDoc;
}
classic();                                                          // warm it up
async function fillChapter(w) {
  const doc = await classic();
  chapterBody.replaceChildren();
  for (const sel of w.sections) {
    const s = doc.querySelector('main ' + sel); if (!s) continue;
    const n = document.importNode(s, true);
    n.querySelectorAll('.reveal, .zoom').forEach(el => el.classList.remove('reveal', 'zoom'));
    chapterBody.append(n);
  }
  const i = WORLDS.indexOf(w), nx = WORLDS[(i + 1) % WORLDS.length];
  const more = document.createElement('div'); more.className = 'chapter__next';
  more.innerHTML = `<button type="button" class="btn btn--ghost" data-next>Continue to ${nx.name} →</button><button type="button" class="btn btn--ghost" data-home>Back to the galaxy</button>`;
  more.querySelector('[data-next]').onclick = () => { closeChapter(true); setTimeout(() => go(nx), reduce ? 0 : 900); };
  more.querySelector('[data-home]').onclick = home;
  chapterBody.append(more);
  window.kaosmosLightbox?.(chapterBody);
  chapterHero.querySelector('img').src = w.image;
  chapterHero.querySelector('.chapter__note').textContent = w.note;
  chapterHero.querySelector('h2').textContent = w.title;
  document.getElementById('chapter-name').textContent = w.name;
}
let chapterWorld = null;
async function openChapter(w) {
  chapterWorld = w;
  await fillChapter(w);
  const p = worldPos(w).project(camera);
  chapter.style.setProperty('--ox', `${(p.x * .5 + .5) * 100}%`); chapter.style.setProperty('--oy', `${(-p.y * .5 + .5) * 100}%`);
  chapter.hidden = false; chapter.scrollTop = 0; chapter.open = true;
  requestAnimationFrame(() => chapter.classList.add('in'));
  document.documentElement.classList.add('in-chapter');
  setTimeout(() => {                                                // opened: stop drawing the galaxy and drop the clip, so the page scrolls light
    if (!chapter.open) return;
    paused = true; chapter.classList.add('settled'); document.documentElement.classList.add('chapter-settled');
    chapter.querySelector('.chapter__close').focus({ preventScroll: true });
  }, reduce ? 0 : 950);
}
function closeChapter(keepFlight) {
  if (!chapter.open) return;
  chapter.open = false; paused = false; wake();
  chapter.classList.remove('settled'); document.documentElement.classList.remove('chapter-settled');
  void chapter.offsetWidth;                                          // re-apply the open circle before closing it
  chapter.classList.remove('in'); document.documentElement.classList.remove('in-chapter');
  setTimeout(() => { if (!chapter.open) { chapter.hidden = true; chapterBody.replaceChildren(); } }, reduce ? 0 : 800);
  if (!keepFlight) flyBack();
  else flight = null;
}
chapter.querySelector('.chapter__close').addEventListener('click', home);

function go(w) {
  if (location.hash !== '#' + w.id) history.pushState(null, '', '#' + w.id);
  route();
}
function home() {
  if (location.hash && location.hash !== '#home') history.pushState(null, '', location.pathname);
  route();
}
function route() {
  const w = WORLDS.find(x => '#' + x.id === location.hash);
  if (w) {
    if (chapter.open && chapterWorld === w) return;
    if (chapter.open) { closeChapter(true); setTimeout(() => { intro = 1; flyTo(w); }, reduce ? 0 : 700); return; }
    intro = 1; flyTo(w);
  } else if (chapter.open || flight) { closeChapter(false); if (!chapter.open && flight) flyBack(); }
}
addEventListener('popstate', route);
document.querySelectorAll('[data-world]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const w = WORLDS.find(x => x.id === a.dataset.world); if (w) go(w); }));
document.querySelectorAll('[data-home]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); home(); }));

// ---------- loop ----------
let paused = false, raf = 0, last = 0, slow = 0;
const introEl = document.getElementById('intro');
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(DPR); renderer.setSize(w, h, false); composer.setPixelRatio(DPR); composer.setSize(w, h);
  bloom.resolution.set(w / (phone ? 3 : 2), h / (phone ? 3 : 2));
  camera.aspect = w / h; camera.updateProjectionMatrix(); U.uPR.value = DPR; U.uScale.value = h / 900; lens.uniforms.uAspect.value = w / h;
  goal.dist = Math.min(goal.dist, 46);
}
addEventListener('resize', resize);
function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
document.addEventListener('visibilitychange', wake);
const tmp = new THREE.Vector3(), par = { x: 0, y: 0 }, inv = new THREE.Matrix4(), lray = new THREE.Ray();
let stirAt = -1e9;
function frame(now) {
  raf = 0; if (paused) return;
  const dt = Math.min(clock.getDelta(), .05); U.uTime.value += dt; lens.uniforms.uTime.value = U.uTime.value;
  const t = U.uTime.value;
  // intro: from inside the core out to the whole galaxy
  if (intro < 1) { intro = Math.min(1, intro + dt / 5); }
  const ie = ease(intro);
  if (!flight) {
    if (!drag && !reduce) goal.theta += dt * .012;                // the galaxy turns slowly on its own
    orbit.theta += (goal.theta - orbit.theta) * (1 - Math.exp(-dt * 5));
    orbit.phi += (goal.phi - orbit.phi) * (1 - Math.exp(-dt * 5));
    orbit.dist += (goal.dist - orbit.dist) * (1 - Math.exp(-dt * 4));
    const d = intro < 1 ? 2.2 + (homeDist() - 2.2) * ie : orbit.dist;
    if (intro < 1) { orbit.dist = goal.dist = homeDist(); }
    par.x += ((drag || phone ? 0 : ndc.x) - par.x) * (1 - Math.exp(-dt * 2.5)); par.y += ((drag || phone ? 0 : ndc.y) - par.y) * (1 - Math.exp(-dt * 2.5));
    orbitPos({ theta: orbit.theta - (1 - ie) * 1.2 - par.x * .06, phi: orbit.phi - (1 - ie) * .5 + par.y * .04, dist: d }, camera.position);   // the pointer leans the view: parallax
    look.lerp(tmp.set(0, 0, 0), 1 - Math.exp(-dt * 4));
    camera.lookAt(look);
    lens.uniforms.uWarp.value *= .9;
  } else {
    const f = flight;
    f.t = Math.min(1, Math.max(0, f.t + f.dir * dt / f.dur));
    const e = ease(f.t);
    const lift = Math.sin(Math.PI * e) * 2.2;                         // arc above the disc
    camera.position.copy(f.from).lerp(f.to, e); camera.position.y += lift;
    look.copy(f.lookFrom).lerp(f.lookTo, Math.min(1, e * 1.6)); camera.lookAt(look);
    const warp = Math.pow(Math.sin(Math.PI * f.t), 1.5);
    lens.uniforms.uWarp.value = reduce ? 0 : warp;
    camera.fov = 55 + warp * 22; camera.updateProjectionMatrix();
    if (f.dir > 0 && f.t >= .86 && !chapter.open) openChapter(f.w);
    if (f.dir < 0 && f.t <= 0) {                                      // home again: continue orbiting from here
      const off = camera.position.clone();
      goal.dist = orbit.dist = Math.min(46, Math.max(7, off.length()));
      goal.phi = orbit.phi = Math.acos(THREE.MathUtils.clamp(off.y / orbit.dist, -1, 1));
      goal.theta = orbit.theta = Math.atan2(off.x, off.z);
      flight = null; hideLabels(false); camera.fov = 55; camera.updateProjectionMatrix();
    }
  }
  // the releases planet is lit from the galactic core
  LIGHT_DIR_UNIFORM.value.copy(galaxy.getWorldPosition(tmp)).sub(worldPos(WORLDS[0])).normalize();
  for (const w of WORLDS) {
    w.k = (w.k || 0) + (((hovered === w) || (flight && flight.w === w) ? 1 : 0) - (w.k || 0)) * (1 - Math.exp(-dt * 6));
    w.glow.material.opacity = w.k * .35; w.glow.scale.setScalar(2.6 + w.k * .8);
  }
  anims.forEach((fn, i) => fn(t, WORLDS[i].k || 0)); extras.forEach(fn => fn(t));
  introEl.style.opacity = flight ? 0 : Math.max(0, Math.min(1, (intro - .45) * 3)) * Math.max(0, Math.min(1, (orbit.dist - 9) / 8));
  if (!flight) {                                                      // hover via raycast
    ray.setFromCamera(ndc, camera);
    const hit = drag ? null : ray.intersectObjects(WORLDS.map(w => w.hit))[0];
    const hv = hit ? hit.object.userData.world : (labelsEl.matches(':hover') ? hovered : null);
    hovered = hv; canvas.style.cursor = hv ? 'pointer' : drag ? 'grabbing' : 'grab';
  }
  // the pointer on the disc plane, in the galaxy's own space: stars nearby part and brighten
  {
    const want = !flight && performance.now() - stirAt < 1600 ? 1 : 0, mu = starMat.uniforms;
    mu.uMouseK.value += (want - mu.uMouseK.value) * (1 - Math.exp(-dt * (want ? 4 : 1.2)));
    if (want) {
      ray.setFromCamera(ndc, camera); inv.copy(galaxy.matrixWorld).invert(); lray.copy(ray.ray).applyMatrix4(inv);
      if (Math.abs(lray.direction.y) > 1e-3) { const k = -lray.origin.y / lray.direction.y; if (k > 0) mu.uMouse.value.lerp(lray.at(k, tmp), 1 - Math.exp(-dt * 10)); }
    }
  }
  skyGroup.rotation.set(par.y * .05, -par.x * .08, 0);
  placeLabels();
  composer.render();
  // keep it smooth on slow GPUs: lower the resolution if frames run long
  if (now && last) { const ms = now - last; slow = ms > 28 ? slow + 1 : Math.max(0, slow - 1); if (slow > 40 && DPR > 1) { DPR = Math.max(1, DPR - .25); slow = 0; resize(); } }
  last = now;
  wake();
}
resize();
if (location.hash) { intro = 1; }
// ?still=<seconds>: render single frames on demand (for screenshots on machines without a GPU)
const STILL = new URLSearchParams(location.search).get('still');
if (STILL !== null) {
  U.uTime.value = +STILL || 20; intro = 1; DPR = 1; resize();
  window.__galaxy = {
    step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { clock.getDelta(); clock.oldTime -= dt * 1000; frame(performance.now()); cancelAnimationFrame(raf); raf = 0; } },
    orbit(o) { Object.assign(orbit, o); Object.assign(goal, o); },
    go(id) { go(WORLDS.find(w => w.id === id)); }, home, hover(id) { hovered = WORLDS.find(w => w.id === id) || null; },
  };
  route(); window.__galaxy.step(2);
} else {
  route();
  wake();
}
document.documentElement.classList.add('ready');
