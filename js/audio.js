// Hipódromo 3D Pro — Audio: efectos y música
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 4. AUDIO: EFECTOS + MÚSICA "LLANERO SOLITARIO" (Obertura Guillermo Tell, Rossini)
// =========================================================================
class RaceAudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.noiseBuffer = null;
    this.master = null;
    this.sfxBus = null;
    this.musicFilter = null;
    this.crowdGain = null;
    this.crowdFilter = null;
    this.hoofTimer = 0;
    this.heartbeatTimer = 0;
  }

  init() {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.9 : 0;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        this.master.connect(comp);
        comp.connect(this.ctx.destination);

        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 0.8;
        this.sfxBus.connect(this.master);

        // Filtro de la música (se cierra en cámara lenta para efecto "bajo el agua")
        this.musicFilter = this.ctx.createBiquadFilter();
        this.musicFilter.type = 'lowpass';
        this.musicFilter.frequency.value = 16000;
        this.musicFilter.connect(this.master);

        this._createNoiseBuffer();
        this._startCrowdNode();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {}
  }

  _createNoiseBuffer() {
    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  _startCrowdNode() {
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 650;
      filter.Q.value = 0.6;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxBus);
      src.start();
      this.crowdGain = gain;
      this.crowdFilter = filter;
    } catch (e) {}
  }

  setEnabled(val) {
    this.enabled = val;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(val ? 0.9 : 0, this.ctx.currentTime, 0.05);
    }
  }

  setSlowMoFilter(isSlow) {
    if (!this.ctx || !this.musicFilter) return;
    this.musicFilter.frequency.setTargetAtTime(isSlow ? 900 : 16000, this.ctx.currentTime, 0.12);
  }

  noiseHit(when, { type = 'bandpass', freq = 1800, q = 0.8, gain = 0.1, decay = 0.1, dest = null }) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0008, when + decay);
    src.connect(f);
    f.connect(g);
    g.connect(dest || this.sfxBus);
    src.start(when, Math.random() * 1.5, decay + 0.05);
  }

  playHoofThud(intensity, isSlowMo) {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const baseFreq = state.surface === 'dirt' ? 230 : 170;
      this.noiseHit(now, {
        type: 'lowpass', freq: isSlowMo ? baseFreq * 0.55 : baseFreq, q: 0.7,
        gain: Math.min(0.18, 0.05 + intensity * 0.1), decay: isSlowMo ? 0.16 : 0.07
      });
    } catch (e) {}
  }

  playSlowMoHeartbeat() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [0, 0.2].forEach((delay, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(idx === 0 ? 72 : 58, now + delay);
        osc.frequency.exponentialRampToValueAtTime(34, now + delay + 0.16);
        gain.gain.setValueAtTime(0.001, now + delay);
        gain.gain.linearRampToValueAtTime(idx === 0 ? 0.32 : 0.22, now + delay + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.2);
        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(now + delay);
        osc.stop(now + delay + 0.22);
      });
    } catch (e) {}
  }

  playCameraShutter() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      this.noiseHit(now, { type: 'highpass', freq: 3000, q: 0.5, gain: 0.35, decay: 0.05 });
      this.noiseHit(now + 0.07, { type: 'bandpass', freq: 1500, q: 1.2, gain: 0.25, decay: 0.06 });
    } catch (e) {}
  }

  playBell() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [0, 0.35, 0.7].forEach(d => {
        [1318, 1975, 2637].forEach((f, k) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, now + d);
          g.gain.linearRampToValueAtTime(0.16 / (k + 1), now + d + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0005, now + d + 1.1);
          o.connect(g); g.connect(this.sfxBus);
          o.start(now + d); o.stop(now + d + 1.2);
        });
      });
    } catch (e) {}
  }

  _tone(type, f0, f1, dur, gain, delay = 0, lfo = 0) {
    const now = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    if (lfo) {
      const l = this.ctx.createOscillator(), lg = this.ctx.createGain();
      l.frequency.value = lfo; lg.gain.value = f0 * 0.08;
      l.connect(lg); lg.connect(o.frequency); l.start(now); l.stop(now + dur);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.05);
    g.gain.setValueAtTime(gain, now + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(now); o.stop(now + dur + 0.05);
  }
  _noise(type, freq, dur, gain, delay = 0) {
    const now = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + Math.min(0.4, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(now); src.stop(now + dur + 0.05);
    return f;
  }
  playUfo() { if (!this.enabled || !this.ctx) return; try { this._tone('sine', 520, 900, 1.2, 0.12, 0, 7); this._tone('sine', 900, 380, 2.6, 0.1, 1.2, 9); this._tone('triangle', 260, 1400, 1.2, 0.08, 3.6, 5); } catch (e) {} }
  playWhistle() { if (!this.enabled || !this.ctx) return; try { this._tone('sine', 2200, 260, 1.1, 0.12); } catch (e) {} }
  playBoom() { if (!this.enabled || !this.ctx) return; try { this._noise('lowpass', 260, 1.8, 0.6); this._tone('sine', 90, 28, 1.2, 0.5); } catch (e) {} }
  playThunder() { if (!this.enabled || !this.ctx) return; try { this._noise('highpass', 2500, 0.3, 0.5); this._noise('lowpass', 160, 2.4, 0.45, 0.1); } catch (e) {} }
  playWind() { if (!this.enabled || !this.ctx) return; try { const f = this._noise('bandpass', 400, 4.8, 0.35); f.Q.value = 1.5; f.frequency.linearRampToValueAtTime(1100, this.ctx.currentTime + 2.4); f.frequency.linearRampToValueAtTime(350, this.ctx.currentTime + 4.8); } catch (e) {} }
  playRumble() { if (!this.enabled || !this.ctx) return; try { this._noise('lowpass', 110, 3.2, 0.5); this._tone('sine', 55, 35, 3, 0.25); } catch (e) {} }
  playScreech() { if (!this.enabled || !this.ctx) return; try { this._tone('sawtooth', 2600, 1400, 0.55, 0.05, 0, 28); this._tone('square', 2100, 1200, 0.7, 0.03, 0.12, 34); } catch (e) {} }
  playPop() { if (!this.enabled || !this.ctx) return; try { [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone('triangle', f, f * 1.02, 0.18, 0.08, i * 0.11)); this._noise('highpass', 2500, 0.12, 0.25, 0.6); } catch (e) {} }
  playFreeze() { if (!this.enabled || !this.ctx) return; try { this._noise('highpass', 3200, 1.6, 0.18); this._tone('sine', 3400, 1700, 1.1, 0.05); this._tone('sine', 2200, 4200, 0.9, 0.04, 0.35); } catch (e) {} }
  playBuzz() { if (!this.enabled || !this.ctx) return; try { this._tone('sawtooth', 215, 245, 3.2, 0.05, 0, 23); this._tone('sawtooth', 290, 260, 3.0, 0.035, 0.15, 31); } catch (e) {} }
  playSlip() { if (!this.enabled || !this.ctx) return; try { this._tone('sine', 300, 1500, 0.35, 0.1); this._tone('sine', 1400, 220, 0.5, 0.08, 0.35); this._noise('lowpass', 300, 0.4, 0.3, 0.8); } catch (e) {} }
  playTrainHorn() { if (!this.enabled || !this.ctx) return; try { [311, 370, 466].forEach(f => this._tone('sawtooth', f, f * 0.985, 1.3, 0.045)); this._noise('lowpass', 150, 3.5, 0.3, 0.2); } catch (e) {} }
  playPianoCrash() { if (!this.enabled || !this.ctx) return; try { [131, 156, 185, 208, 247, 277, 330].forEach((f, i) => this._tone('triangle', f, f * 0.97, 1.4, 0.06, i * 0.012)); this._noise('lowpass', 420, 0.7, 0.45); } catch (e) {} }
  playMagnet() { if (!this.enabled || !this.ctx) return; try { this._tone('sine', 110, 170, 2.6, 0.09, 0, 6); this._tone('square', 55, 85, 2.2, 0.025, 0.4, 3); } catch (e) {} }
  playPortal() { if (!this.enabled || !this.ctx) return; try { this._tone('sine', 180, 950, 1.4, 0.08, 0, 8); this._tone('triangle', 900, 140, 2.2, 0.06, 1.4, 5); } catch (e) {} }
  playShatter() { if (!this.enabled || !this.ctx) return; try { this._noise('highpass', 4200, 0.6, 0.4); this._tone('triangle', 3800, 1900, 0.35, 0.06); this._tone('triangle', 2900, 1500, 0.3, 0.05, 0.08); } catch (e) {} }

  playCheer() {
    if (!this.enabled || !this.ctx || !this.crowdGain) return;
    const now = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(now);
    this.crowdGain.gain.setTargetAtTime(0.22, now, 0.1);
    this.crowdGain.gain.setTargetAtTime(0.03, now + 2.2, 0.8);
  }

  updateRaceAmbience(dt, leadProgress, avgSpeed, isRacing, isSlowMo) {
    if (!this.ctx || !this.crowdGain) return;
    try {
      const now = this.ctx.currentTime;
      if (!isRacing) {
        this.crowdGain.gain.setTargetAtTime(0.0001, now, 0.6);
        return;
      }
      const excitement = leadProgress > 0.6 ? (leadProgress - 0.6) / 0.4 : 0;
      this.crowdGain.gain.setTargetAtTime(isSlowMo ? 0.05 : (0.02 + excitement * 0.12), now, 0.25);
      if (this.crowdFilter) this.crowdFilter.frequency.setTargetAtTime(isSlowMo ? 260 : 650, now, 0.15);

      const stepInterval = Math.max(0.07, (0.15 - avgSpeed * 0.0024) / Math.max(0.25, state.slowMoScale));
      this.hoofTimer += dt;
      if (this.hoofTimer >= stepInterval) {
        this.hoofTimer = 0;
        this.playHoofThud(Math.min(1, avgSpeed / 22), isSlowMo);
      }
      if (isSlowMo) {
        this.heartbeatTimer += dt;
        if (this.heartbeatTimer >= 0.75) {
          this.heartbeatTimer = 0;
          this.playSlowMoHeartbeat();
        }
      } else {
        this.heartbeatTimer = 0.6;
      }
    } catch (e) {}
  }
}

const audioEngine = new RaceAudioEngine();

// -------------------------------------------------------------------------
// Secuenciador musical sincronizado con la cuenta atrás.
// Tempo fijo: la cuenta "3, 2, 1" cae sobre los toques de trompeta y
// la largada coincide exactamente con el primer golpe del galope.
// -------------------------------------------------------------------------
const MUSIC_BPM = 152;
// Melodía del Final de la Obertura de Guillermo Tell (Rossini, 1829 – dominio público),
// transcrita desde MIDI y transportada a Mi mayor (tonalidad original).
// Formato: "inicio,duración,nota MIDI" en beats del juego (1 beat = un "ta-ta-TÁ").
const WT_MELODY = '0,1.5,71;1.5,0.25,71;1.75,0.25,71;2,1.5,71;3.5,0.25,71;3.75,0.25,71;4,0.5,71;6,0.5,71;7,0.5,71;7.5,0.5,76;8,1.5,71;9.5,0.25,71;9.75,0.25,71;10,1.5,71;11.5,0.25,71;11.75,0.25,71;12,1.5,71;13.5,0.25,71;13.75,0.25,71;14,0.5,71;14.5,0.25,71;14.75,0.25,71;15,0.5,71;15.5,0.25,71;15.75,0.25,71;16,0.5,76;16.5,0.5,78;17,0.5,80;17.5,0.25,71;17.75,0.25,71;18,0.5,71;18.5,0.25,71;18.75,0.25,71;19,0.5,76;19.5,0.5,80;20,0.5,78;20.5,0.5,75;21,0.5,71;21.5,0.25,71;21.75,0.25,71;22,0.5,71;22.5,0.25,71;22.75,0.25,71;23,0.5,71;23.5,0.25,71;23.75,0.25,71;24,0.5,76;24.5,0.5,78;25,0.5,80;25.5,0.25,76;25.75,0.25,80;26,1.25,83;27.25,0.25,81;27.5,0.25,80;27.75,0.25,78;28,0.5,76;28.5,0.5,80;29,0.5,76;29.5,0.25,71;29.75,0.25,71;30,0.5,71;30.5,0.25,71;30.75,0.25,71;31,0.5,71;31.5,0.25,71;31.75,0.25,71;32,0.5,76;32.5,0.5,78;33,0.5,80;33.5,0.25,71;33.75,0.25,71;34,0.5,71;34.5,0.25,71;34.75,0.25,71;35,0.5,76;35.5,0.5,80;36,0.5,78;36.5,0.5,75;37,0.5,71;37.5,0.25,71;37.75,0.25,71;38,0.5,71;38.5,0.25,71;38.75,0.25,71;39,0.5,71;39.5,0.25,71;39.75,0.25,71;40,0.5,76;40.5,0.5,78;41,0.5,80;41.5,0.25,76;41.75,0.25,80;42,1.25,83;43.25,0.25,81;43.5,0.25,80;43.75,0.25,78;44,0.5,76;44.5,0.5,80;45,0.5,76;45.5,0.25,71;45.75,0.25,71;46,0.5,76;46.5,0.5,80;47,0.5,76;47.5,0.25,80;47.75,0.25,80;48,0.5,80;48.5,0.25,80;48.75,0.25,80;49,0.5,80;49.5,0.25,80;49.75,0.25,80;50,0.5,80;50.5,0.5,85;51,0.5,80;51.5,0.5,85;52,0.5,80;52.5,0.5,85;53,0.5,80;53.5,0.5,78;54,0.5,76;54.5,0.5,75;55,0.5,73;55.5,0.25,80;55.75,0.25,80;56,0.5,80;56.5,0.25,80;56.75,0.25,80;57,0.5,80;57.5,0.25,80;57.75,0.25,80;58,0.5,80;58.5,0.5,85;59,0.5,80;59.5,0.5,85;60,0.5,80;60.5,0.5,85;61,0.5,83;61.5,0.5,82;62,0.5,83;62.5,0.5,82;63,0.5,83;63.5,0.25,71;63.75,0.25,71;64,0.5,71;64.5,0.25,71;64.75,0.25,71;65,0.5,71;65.5,0.25,71;65.75,0.25,71;66,0.5,76;66.5,0.5,78;67,0.5,80;67.5,0.25,71;67.75,0.25,71;68,0.5,71;68.5,0.25,71;68.75,0.25,71;69,0.5,76;69.5,0.5,80;70,0.5,78;70.5,0.5,75;71,0.5,71;71.5,0.25,71;71.75,0.25,71;72,0.5,71;72.5,0.25,71;72.75,0.25,71;73,0.5,71;73.5,0.25,71;73.75,0.25,71;74,0.5,76;74.5,0.5,78;75,0.5,80;75.5,0.25,76;75.75,0.25,80;76,1.25,83;77.25,0.25,81;77.5,0.25,80;77.75,0.25,78;78,0.5,76;78.5,0.5,80;79,0.5,76';
const WT_BASS = [40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,40,47,47,47,47,47,40,40,40,40,40,40,40,40,40,40,40,47,47,47,47,47,40,40,40,40,40,40,40,40,40,49,49,49,49,49,49,49,49,49,49,49,42,42,47,40,40,40,40,40,40,47,47,47,47,47,40,40,40,40,40]; // raíz del bajo por beat (Mi2=40, La2=45, Si2=47, Do#3=49, Fa#2=42)
// Cuenta atrás sobre la fanfarria de trompetas de la introducción
const COUNT_STEPS = [[0, '¡PREPARADOS!'], [4, '¡LISTOS!'], [8, '3'], [10, '2'], [12, '1']];
const COUNT_BEATS = { go: 14 };   // la largada cae en el primer golpe del galope
const LOOP_START = 13.5;          // "ta-ta" de anacrusa del galope
const LOOP_END = 79.5;
const LOOP_LEN = LOOP_END - LOOP_START;

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

const SONG = (function buildSong() {
  const mel = WT_MELODY.split(';').map(x => x.split(',').map(Number));
  const intro = [];
  const loop = [];
  for (const [b, d, m] of mel) {
    if (b < LOOP_START) {
      intro.push({ b, d, m, i: 'lead' });
      // Fanfarria: metales en las notas largas, timbal y platillo en las más largas
      if (d >= 0.45) {
        intro.push({ b, d, m: 64, i: 'brass', g: 1.2 });
        intro.push({ b, d, m: 68, i: 'brass', g: 1.2 });
      }
      if (d >= 1) {
        intro.push({ b, i: 'timp', m: 40 });
        intro.push({ b, i: 'crash', g: 0.45 });
        intro.push({ b, d, m: 40, i: 'bass' });
      }
    } else if (b < LOOP_END) {
      loop.push({ b: b - LOOP_START, d, m, i: 'lead' });
    }
  }
  // Redoble creciente antes de la largada
  for (let k = 0; k < 8; k++) intro.push({ b: 12.5 + k * 0.125, i: 'snare', g: 0.05 + k * 0.025 });

  // Acompañamiento del galope: bajo "um-pa", caja a contratiempo y acordes de metales
  for (let B = 14; B < LOOP_END; B++) {
    const root = WT_BASS[B] || 40;
    const rel = B - LOOP_START;
    loop.push({ b: rel, d: 0.4, m: root, i: 'bass' });
    loop.push({ b: rel + 0.5, d: 0.4, m: root + 7, i: 'bass' });
    loop.push({ b: rel + 0.5, i: 'snare', g: 0.07 });
    loop.push({ b: rel + 0.25, i: 'hat' });
    loop.push({ b: rel + 0.75, i: 'hat' });
    const third = root + (root === 49 ? 3 : 4) + 24;
    loop.push({ b: rel + 0.5, d: 0.22, m: third, i: 'brass', g: 0.5 });
    loop.push({ b: rel + 0.5, d: 0.22, m: root + 31, i: 'brass', g: 0.4 });
  }
  // Platillos y timbal al inicio de cada sección (tema, parte central, regreso del tema)
  [14, 47.5, 63.5].forEach(B => {
    loop.push({ b: B - LOOP_START, i: 'crash' });
    loop.push({ b: B - LOOP_START, i: 'timp', m: 40 });
  });
  return { intro, loop };
})();

class MusicEngine {
  constructor(audio) {
    this.audio = audio;
    this.playing = false;
    this.beat = 0;
    this.scheduledTo = 0;
    this.tempoScale = 1;
    this.loopActive = true;
    this.bus = null;
    this.lastPerf = 0;
    this.loopCount = 0;
  }

  get bps() { return (MUSIC_BPM / 60) * this.tempoScale; }

  start() {
    this.stop(0.05);
    this.playing = true;
    this.beat = -0.35; // pequeño margen antes del primer redoble
    this.scheduledTo = this.beat;
    this.tempoScale = 1;
    this.loopActive = true;
    this.lastPerf = performance.now();
    const ctx = this.audio.ctx;
    if (ctx) {
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.75;
      this.bus.connect(this.audio.musicFilter);
    }
  }

  stop(fade = 0.3) {
    this.playing = false;
    const ctx = this.audio.ctx;
    if (this.bus && ctx) {
      const b = this.bus;
      b.gain.cancelScheduledValues(ctx.currentTime);
      b.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(() => { try { b.disconnect(); } catch (e) {} }, (fade + 0.6) * 1000);
    }
    this.bus = null;
  }

  // Llamado cada frame (tiempo real)
  update() {
    if (!this.playing) return;
    const now = performance.now();
    const dtReal = Math.min(0.1, (now - this.lastPerf) / 1000);
    this.lastPerf = now;
    if (state.paused) return;
    this.beat += dtReal * this.bps;

    const horizon = this.beat + 0.2 * this.bps; // 200ms de anticipación
    if (horizon <= this.scheduledTo) return;
    const from = this.scheduledTo;
    this.scheduledTo = horizon;

    for (const ev of SONG.intro) {
      if (ev.b >= from && ev.b < horizon) this._play(ev, ev.b);
    }
    if (this.loopActive) {
      const kStart = Math.max(0, Math.floor((from - LOOP_START) / LOOP_LEN));
      const kEnd = Math.floor((horizon - LOOP_START) / LOOP_LEN);
      for (let k = kStart; k <= kEnd; k++) {
        const base = LOOP_START + k * LOOP_LEN;
        for (const ev of SONG.loop) {
          const b = base + ev.b;
          if (b >= from && b < horizon && b >= LOOP_START) this._play(ev, b, k);
        }
      }
    }
  }

  // Final triunfal cuando el ganador cruza la meta
  playEnding() {
    if (!this.playing) return;
    this.loopActive = false;
    const ctx = this.audio.ctx;
    if (!ctx || !this.bus) return;
    const t0 = ctx.currentTime + 0.05;
    const s = 60 / MUSIC_BPM;
    const notes = [[0, 71, 0.25], [0.25, 71, 0.25], [0.5, 71, 0.5], [1, 76, 2.5]];
    notes.forEach(([b, m, d]) => this._synthLead(t0 + b * s, d * s, m, 1.1));
    [64, 68, 71, 76, 80].forEach(m => this._synthBrass(t0 + s, 3 * s, m, 0.9));
    this._synthBass(t0 + s, 2.5 * s, 40);
    this._synthTimp(t0 + s, 40);
    this.audio.noiseHit(t0 + s, { type: 'highpass', freq: 5000, q: 0.4, gain: 0.25, decay: 1.6, dest: this.bus });
    setTimeout(() => { if (!this.loopActive) this.stop(1.5); }, 4500);
  }

  _play(ev, beatPos, loopIdx = 0) {
    const ctx = this.audio.ctx;
    if (!ctx || !this.bus || !this.audio.enabled) return;
    const when = Math.max(ctx.currentTime, ctx.currentTime + (beatPos - this.beat) / this.bps);
    const durSec = (ev.d || 0.25) / this.bps;
    try {
      switch (ev.i) {
        case 'lead':
          this._synthLead(when, durSec, ev.m, 1);
          if (loopIdx % 2 === 1) this._synthLead(when, durSec, ev.m - 12, 0.5); // segunda vuelta: doblada a la octava grave
          break;
        case 'brass': this._synthBrass(when, durSec, ev.m, ev.g || 1); break;
        case 'bass': this._synthBass(when, durSec, ev.m); break;
        case 'snare': this.audio.noiseHit(when, { type: 'bandpass', freq: 1900, q: 0.9, gain: ev.g || 0.08, decay: 0.09, dest: this.bus }); break;
        case 'hat': this.audio.noiseHit(when, { type: 'highpass', freq: 7500, q: 0.5, gain: 0.035, decay: 0.03, dest: this.bus }); break;
        case 'crash': this.audio.noiseHit(when, { type: 'highpass', freq: 4500, q: 0.4, gain: 0.16 * (ev.g || 1), decay: 1.1, dest: this.bus }); break;
        case 'timp': this._synthTimp(when, ev.m); break;
      }
    } catch (e) {}
  }

  _synthLead(when, dur, midi, vol) {
    const ctx = this.audio.ctx;
    const f = midiToFreq(midi);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1200, when);
    filt.frequency.linearRampToValueAtTime(3600, when + 0.03);
    filt.frequency.exponentialRampToValueAtTime(1800, when + Math.max(0.05, dur));
    const peak = 0.075 * vol;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.012);
    g.gain.linearRampToValueAtTime(peak * 0.7, when + 0.06);
    g.gain.setValueAtTime(peak * 0.7, when + Math.max(0.06, dur * 0.85));
    g.gain.exponentialRampToValueAtTime(0.0005, when + dur * 0.85 + 0.05);
    [-7, 7].forEach(det => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(filt);
      o.start(when);
      o.stop(when + dur + 0.1);
    });
    filt.connect(g);
    g.connect(this.bus);
  }

  _synthBrass(when, dur, midi, vol) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = midiToFreq(midi);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1400;
    const g = ctx.createGain();
    const peak = 0.022 * vol;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.02);
    g.gain.setValueAtTime(peak, when + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0005, when + dur + 0.05);
    o.connect(filt);
    filt.connect(g);
    g.connect(this.bus);
    o.start(when);
    o.stop(when + dur + 0.1);
  }

  _synthBass(when, dur, midi) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midiToFreq(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.16, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
    o.connect(g);
    g.connect(this.bus);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  _synthTimp(when, midi) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = midiToFreq(midi);
    o.frequency.setValueAtTime(f * 1.5, when);
    o.frequency.exponentialRampToValueAtTime(f, when + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.32, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, when + 0.7);
    o.connect(g);
    g.connect(this.bus);
    o.start(when);
    o.stop(when + 0.75);
  }
}

const music = new MusicEngine(audioEngine);
