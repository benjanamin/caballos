// Hipódromo 3D Pro — Repeticiones
// Graba la carrera (posición, velocidad y estado de cada caballo) y la reproduce después:
//  - "Última vuelta": se repite en bucle detrás del panel de resultados, resaltando al Top 10 final
//  - "Completa": la carrera entera, con controles (pausa, velocidad, barra de tiempo)
// Durante la repetición la simulación no corre: se escriben los datos grabados en los participantes
// y el resto del motor (caballos, cámara, etiquetas, Top 10) los dibuja como en vivo.
'use strict';

const REPLAY_STATES = ['normal', 'turbo', 'attack', 'tired', 'recovery'];
const REC_K = 7;   // valores por caballo y muestra: modo + 6 datos

const recorder = {
  frames: [],     // Float32Array por muestra
  times: [],      // tiempo de carrera de cada muestra
  dt: 0.1,
  nextT: 0,
  n: 0,
  done: false,
  lastLapStart: 0,
  marks: []       // eventos para el rótulo durante la repetición
};

const replay = {
  active: false,
  mode: 'lastlap',   // 'lastlap' | 'full'
  t: 0, t0: 0, t1: 0,
  speed: 1,
  paused: false,
  loop: false,
  highlight: false,
  top10: [],
  snapshot: null,
  markIdx: 0,
  winnerCrossT: null
};

function resetRecorder() {
  stopReplay();
  recorder.frames = [];
  recorder.times = [];
  recorder.n = state.participants.length;
  recorder.dt = recorder.n > 300 ? 0.2 : 0.1;   // carreras enormes: menos muestras (memoria)
  recorder.nextT = 0;
  recorder.done = false;
  recorder.lastLapStart = 0;
  recorder.marks = [];
  updateReplayButton();
}

// Se llama en cada cuadro después de simular
function recordRaceSample(force) {
  if (recorder.done || state.phase === 'replay') return;
  if (state.phase !== 'racing' && state.phase !== 'finished') return;
  if (!force && state.raceTime < recorder.nextT) return;
  if (recorder.times.length && state.raceTime <= recorder.times[recorder.times.length - 1]) return;
  recorder.nextT = state.raceTime + recorder.dt;
  const list = state.participants;
  const f = new Float32Array(list.length * REC_K);
  for (let i = 0; i < list.length; i++) {
    const p = list[i], o = i * REC_K;
    if (!p.eliminated) {
      f[o] = 0; f[o + 1] = p.x; f[o + 2] = p.z; f[o + 3] = p.speed; f[o + 4] = Math.max(0, REPLAY_STATES.indexOf(p.state));
    } else {
      const et = elimTransform(p);
      if (et && et.visible) {
        f[o] = 1; f[o + 1] = et.x; f[o + 2] = et.y; f[o + 3] = et.z; f[o + 4] = et.s; f[o + 5] = et.ry; f[o + 6] = et.rz;
      } else f[o] = 2;
    }
  }
  recorder.frames.push(f);
  recorder.times.push(state.raceTime);
  // Inicio de la última vuelta: cuando el puntero entra en ella
  const m = getTrackMetrics();
  const leader = state.sortedParticipants[0];
  if (!recorder.lastLapStart && leader && m.laps > 1 && leader.x >= m.worldLength - m.P) recorder.lastLapStart = state.raceTime;
}

function markReplayEvent(text) {
  if (state.phase === 'racing') recorder.marks.push({ t: state.raceTime, text });
}

function finishRecording() {
  recordRaceSample(true);
  recorder.done = true;
  for (const p of state.participants) p.finalRank = p.rank;
  updateReplayButton();
}

function hasReplay() {
  return recorder.done && recorder.frames.length > 2;
}

// ---------------- Reproducción ----------------
const _replayT = [];
function replayTransformFor(i) {
  return _replayT[i] || (_replayT[i] = { x: 0, y: 0, z: 0, s: 1, ry: 0, rz: 0, visible: true });
}

function applyReplayFrame(t) {
  const times = recorder.times, frames = recorder.frames;
  let lo = 0, hi = times.length - 1;
  if (t <= times[0]) hi = 0;
  else if (t >= times[hi]) lo = hi;
  else {
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
  }
  const A = frames[lo], B = frames[hi];
  const a = hi === lo ? 0 : (t - times[lo]) / (times[hi] - times[lo]);
  const list = state.participants;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], o = i * REC_K;
    const F = (A[o] !== B[o] && a > 0.5) ? B : A;   // si cambia de modo, se usa la muestra más cercana
    const mode = F[o];
    const lerp = k => (A[o] === B[o]) ? A[o + k] + (B[o + k] - A[o + k]) * a : F[o + k];
    if (mode === 0) {
      const prevX = p.x;
      p.x = lerp(1); p.z = lerp(2); p.speed = lerp(3);
      p.state = REPLAY_STATES[F[o + 4] | 0] || 'normal';
      p.eliminated = false; p.replayT = null;
      p.finished = p.finishTime !== null && p.finishTime !== undefined && t >= p.finishTime;
      p._replayDx = p.x - prevX;
    } else {
      const rt = replayTransformFor(i);
      p.eliminated = true; p.finished = false; p.speed = 0;
      if (mode === 2) rt.visible = false;
      else {
        rt.visible = true;
        rt.x = lerp(1); rt.y = lerp(2); rt.z = lerp(3); rt.s = lerp(4); rt.ry = lerp(5); rt.rz = lerp(6);
      }
      p.replayT = rt;
      p._replayDx = 0;
    }
  }
  // Orden en vivo, igual que en la carrera
  state.sortedParticipants.sort((x, y) => {
    if (x.eliminated !== y.eliminated) return x.eliminated ? 1 : -1;
    if (x.finished && y.finished) return x.finishTime - y.finishTime;
    if (x.finished) return -1;
    if (y.finished) return 1;
    return y.x - x.x;
  });
  for (let i = 0; i < state.sortedParticipants.length; i++) state.sortedParticipants[i].rank = i + 1;
}

function startReplay(mode) {
  if (!hasReplay()) return;
  if (state.phase !== 'finished' && state.phase !== 'replay') return;
  if (!replay.active) {
    // Se guarda el estado final para dejarlo igual al salir
    replay.snapshot = {
      sorted: [...state.sortedParticipants],
      raceTime: state.raceTime,
      ps: state.participants.map(p => ({ x: p.x, z: p.z, speed: p.speed, state: p.state, finished: p.finished, eliminated: p.eliminated, rank: p.rank, gallopPhase: p.gallopPhase }))
    };
  }
  const tEnd = recorder.times[recorder.times.length - 1];
  replay.mode = mode;
  replay.active = true;
  replay.t0 = mode === 'lastlap' ? Math.max(recorder.times[0], recorder.lastLapStart) : recorder.times[0];
  replay.t = 0;
  replay.paused = false;
  replay.loop = mode === 'lastlap';
  replay.highlight = mode === 'lastlap';
  replay.speed = 1;
  replay.top10 = (replay.snapshot ? replay.snapshot.sorted : state.sortedParticipants).filter(p => !p.elimCause).slice(0, 10);
  // Última vuelta: termina cuando ya llegó todo el Top 10 (no hace falta ver al resto)
  const top10Done = replay.top10.reduce((mx, p) => Math.max(mx, p.finishTime || 0), 0);
  replay.t1 = mode === 'lastlap' && top10Done > 0 ? Math.min(tEnd, top10Done + 2.0) : tEnd;
  replay.t = replay.t0;
  replay.markIdx = recorder.marks.findIndex(mk => mk.t >= replay.t0);
  if (replay.markIdx < 0) replay.markIdx = recorder.marks.length;
  replay.winnerCrossT = state.participants[state.winnerId] ? state.participants[state.winnerId].finishTime : null;
  state.phase = 'replay';
  state.finaleCamActive = false;
  state.slowMoActive = false;
  state.slowMoScale = 1;
  document.getElementById('photo-card').classList.add('hidden');
  resetCameraFollow();
  director.until = 0; director.idx = 0;
  applyReplayFrame(replay.t);
  updateReplayBar(true);
  announceTicker(mode === 'lastlap' ? '⏪ Repetición: la última vuelta (Top 10 resaltado)' : '⏪ Repetición completa de la carrera', true);
}

function stopReplay() {
  if (!replay.active) return;
  replay.active = false;
  const snap = replay.snapshot;
  if (snap) {
    state.participants.forEach((p, i) => {
      Object.assign(p, snap.ps[i]);
      p.replayT = undefined;
    });
    state.sortedParticipants = snap.sorted;
    state.raceTime = snap.raceTime;
  }
  replay.snapshot = null;
  if (state.phase === 'replay') state.phase = 'finished';
  state.finaleCamActive = false;
  resetCameraFollow();
  updateReplayBar(true);
}

function updateReplay(realDt) {
  if (!replay.active) return;
  if (!replay.paused) {
    replay.t += realDt * replay.speed;
    if (replay.t > replay.t1 + 1.5) {
      if (replay.loop) {
        replay.t = replay.t0;
        replay.markIdx = recorder.marks.findIndex(mk => mk.t >= replay.t0);
        if (replay.markIdx < 0) replay.markIdx = recorder.marks.length;
        resetCameraFollow();
      } else {
        // Termina la repetición completa: vuelve a los resultados
        stopReplay();
        startResultsPresentation();
        return;
      }
    }
  }
  const t = Math.min(replay.t, replay.t1);
  const dtSim = replay.paused ? 0 : realDt * replay.speed;
  state.raceTime = t;
  applyReplayFrame(t);
  for (const p of state.participants) {
    if (!p.eliminated) p.gallopPhase += dtSim * p.speed * (p.state === 'tired' ? 0.56 : 0.68);
  }
  // Rótulos de los eventos que ocurrieron en este tramo
  while (replay.markIdx < recorder.marks.length && recorder.marks[replay.markIdx].t <= t) {
    announceTicker('⏪ ' + recorder.marks[replay.markIdx].text, true);
    replay.markIdx++;
  }
  updateReplayBar(false);
}

// Cámara durante la repetición: director normal, cámara de llegada y luego las llegadas
function replayCameraMode(mode) {
  const leader = state.sortedParticipants[0];
  if (!leader) return mode;
  const L = getTrackMetrics().worldLength;
  const t = replay.t;
  if (replay.winnerCrossT !== null && t >= replay.winnerCrossT) {
    return t - replay.winnerCrossT < 2.0 ? 'finale' : 'arrivals';
  }
  const tLead = (L - (leader.x + NOSE_OFFSET)) / Math.max(4, leader.speed);
  if (tLead < 3.2) return 'finale';
  return mode;
}

// Etiquetas: en la última vuelta se resalta al Top 10 final con su puesto final
function replayLabelCandidates() {
  if (replay.highlight) return replay.top10.filter(p => !p.eliminated);
  return state.sortedParticipants.slice(0, LABEL_COUNT[state.labelsMode] || 0);
}

// ---------------- Presentación de resultados (panel + repetición detrás) ----------------
function startResultsPresentation() {
  document.getElementById('photo-card').classList.add('hidden');
  openResultsModal(true);
  if (hasReplay()) startReplay('lastlap');
}

// ---------------- Interfaz ----------------
let replayBarLast = 0;
function fmtReplayTime(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

function updateReplayBar(force) {
  const bar = document.getElementById('replay-bar');
  if (!replay.active) { bar.classList.add('hidden'); return; }
  const now = performance.now();
  if (!force && now - replayBarLast < 100) return;
  replayBarLast = now;
  bar.classList.remove('hidden');
  const results = document.getElementById('results-modal');
  bar.classList.toggle('replay-right', !results.classList.contains('hidden') && results.classList.contains('docked'));
  document.getElementById('replay-title').textContent = replay.mode === 'lastlap' ? 'Última vuelta • Top 10 resaltado' : 'Carrera completa';
  document.getElementById('replay-play').textContent = replay.paused ? '▶' : '⏸';
  document.getElementById('replay-speed').textContent = replay.speed + 'x';
  const seek = document.getElementById('replay-seek');
  const span = Math.max(0.01, replay.t1 - replay.t0);
  if (!seek._dragging) seek.value = String(Math.round(1000 * Math.min(1, (replay.t - replay.t0) / span)));
  document.getElementById('replay-time').textContent = `${fmtReplayTime(Math.min(replay.t, replay.t1) - replay.t0)} / ${fmtReplayTime(span)}`;
  document.getElementById('replay-full').classList.toggle('hidden', replay.mode === 'full');
  document.getElementById('replay-lastlap').classList.toggle('hidden', replay.mode === 'lastlap');
}

function updateReplayButton() {
  const btn = document.getElementById('btn-replay');
  if (btn) btn.classList.toggle('hidden', !hasReplay());
}

function bindReplayUi() {
  const $ = id => document.getElementById(id);
  $('replay-play').addEventListener('click', () => {
    if (replay.t >= replay.t1) replay.t = replay.t0;
    replay.paused = !replay.paused;
    updateReplayBar(true);
  });
  $('replay-speed').addEventListener('click', () => {
    const steps = [0.5, 1, 2, 4];
    replay.speed = steps[(steps.indexOf(replay.speed) + 1) % steps.length];
    updateReplayBar(true);
  });
  const seek = $('replay-seek');
  seek.addEventListener('input', () => {
    seek._dragging = true;
    replay.t = replay.t0 + (replay.t1 - replay.t0) * (Number(seek.value) / 1000);
    replay.markIdx = recorder.marks.findIndex(mk => mk.t >= replay.t);
    if (replay.markIdx < 0) replay.markIdx = recorder.marks.length;
    resetCameraFollow();
  });
  seek.addEventListener('change', () => { seek._dragging = false; });
  $('replay-full').addEventListener('click', () => {
    // La repetición completa se ve sin el panel de resultados encima
    closeResultsModal();
    startReplay('full');
  });
  $('replay-lastlap').addEventListener('click', () => startReplay('lastlap'));
  $('replay-close').addEventListener('click', () => {
    stopReplay();
  });
  $('btn-replay').addEventListener('click', () => {
    if (state.phase === 'replay') stopReplay();
    startResultsPresentation();
  });
  $('btn-results-full-replay').addEventListener('click', () => {
    closeResultsModal();
    startReplay('full');
  });
  updateReplayButton();
}
