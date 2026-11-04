// Background music. Browsers only allow sound after a user gesture, so the first visit
// opens with an "enter" gate (like a venue door); after that the nav toggle controls it.
(() => {
  const audio = document.getElementById('bgm');
  const btn = document.querySelector('.sound');
  const gate = document.querySelector('.gate');
  const store = (k, v) => { try { v === undefined ? (v = localStorage.getItem(k)) : localStorage.setItem(k, v); } catch {} return v; };
  const sess = (k, v) => { try { v === undefined ? (v = sessionStorage.getItem(k)) : sessionStorage.setItem(k, v); } catch {} return v; };
  const MAX = 0.6;
  let on = false, fadeId;

  // Analyser for audio-reactive particles. Only over http(s): on file:// the graph would mute the audio.
  let analyser, data;
  function connectAnalyser() {
    if (analyser || !location.protocol.startsWith('http') || !window.AudioContext) return;
    const ctx = new AudioContext();
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; data = new Uint8Array(analyser.frequencyBinCount);
    ctx.createMediaElementSource(audio).connect(analyser); analyser.connect(ctx.destination);
  }
  let level = 0;
  window.audioLevel = () => {
    if (!analyser || !on) return (level *= .9);
    analyser.getByteFrequencyData(data);
    let s = 0; for (let i = 2; i < 40; i++) s += data[i];
    return (level += (s / (38 * 255) - level) * .2);
  };

  function fade(to, done) {
    cancelAnimationFrame(fadeId);
    const from = audio.volume, t0 = performance.now(), dur = to > from ? 2500 : 900;
    (function step(t) {
      const k = Math.min((t - t0) / dur, 1);
      audio.volume = from + (to - from) * k;
      if (k < 1) fadeId = requestAnimationFrame(step); else done?.();
    })(t0);
  }
  function setOn(v) {
    on = v; store('sound', v ? 'on' : 'off');
    btn.classList.toggle('on', v); btn.setAttribute('aria-pressed', v);
    if (v) {
      connectAnalyser();
      audio.volume = 0;
      audio.play().then(() => fade(MAX)).catch(() => { on = false; btn.classList.remove('on'); btn.setAttribute('aria-pressed', false); });
    } else fade(0, () => audio.pause());
  }
  btn.addEventListener('click', () => { setOn(!on); window.track?.('sound-toggle', { state: on ? 'on' : 'off' }); });

  // Minutes of music actually heard per visit.
  let heard = 0;
  setInterval(() => { if (on && !audio.paused && !document.hidden && ++heard % 60 === 0) window.track?.('listening', { minutes: heard / 60 }); }, 1000);

  function enter(withSound) {
    sess('entered', '1');
    window.track?.('gate-enter', { sound: withSound ? 'on' : 'off' });
    gate.classList.add('gate--out');
    setTimeout(() => gate.remove(), 1200);
    document.documentElement.classList.remove('gated');
    document.dispatchEvent(new CustomEvent('entered'));
    if (withSound) setOn(true); else store('sound', 'off');
  }

  if (!sess('entered')) {
    document.documentElement.classList.add('gated');
    gate.hidden = false;
    gate.querySelector('[data-sound=on]').addEventListener('click', () => enter(true));
    gate.querySelector('[data-sound=off]').addEventListener('click', () => enter(false));
    gate.querySelector('[data-sound=on]').focus();
  } else {
    gate.remove();
    // Returning in the same session with sound on: resume on the first gesture.
    if (store('sound') === 'on') {
      const resume = e => {
        if (e.target.closest?.('.sound')) return;        // the toggle handles its own click
        ['pointerdown', 'keydown'].forEach(ev => removeEventListener(ev, resume));
        if (!on) setOn(true);
      };
      ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, resume));
    }
  }
})();
