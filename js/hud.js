// Hipódromo 3D Pro — Vueltas, nombres en pantalla, cartel del líder y director de cámara
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 11. VUELTAS, NOMBRES EN PANTALLA, CARTEL DEL LÍDER Y DIRECTOR DE CÁMARA
// =========================================================================

// Vueltas: en automático la carrera se alarga con la cantidad de participantes
function getLaps() {
  if (state.lapsSetting !== 'auto') return state.lapsSetting;
  const n = state.names.length;
  return n <= 30 ? 1 : n <= 200 ? 2 : 3;
}

function currentLapInfo() {
  const m = getTrackMetrics();
  const leader = state.sortedParticipants[0];
  if (!leader || m.laps <= 1) return { lap: 1, laps: m.laps };
  const rem = Math.max(0, m.worldLength - leader.x - NOSE_OFFSET - 0.001);
  return { lap: Math.min(m.laps, Math.max(1, m.laps - Math.floor(rem / m.P))), laps: m.laps };
}

let lastLapShown = 0;
function updateLapHud() {
  const el = document.getElementById('hud-lap');
  const { lap, laps } = currentLapInfo();
  const big = document.getElementById('lap-big');
  if (laps <= 1) { el.classList.add('hidden'); big.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = `Vuelta ${lap}/${laps}`;
  // Número de vuelta grande en pantalla (se oculta cuando ya hay ganador)
  const showBig = (state.phase === 'racing' || state.phase === 'countdown') && state.winnerId === -1;
  big.classList.toggle('hidden', !showBig);
  const cur = document.getElementById('lap-big-cur');
  if (cur.textContent !== String(lap)) {
    cur.textContent = String(lap);
    cur.classList.remove('lap-bump'); void cur.offsetWidth; cur.classList.add('lap-bump');
  }
  document.getElementById('lap-big-tot').textContent = '/' + laps;
  big.firstElementChild.style.borderColor = lap === laps ? 'rgba(251,191,36,0.9)' : '';
  cur.style.color = lap === laps ? '#fcd34d' : '';
  if (state.phase === 'racing' && lap !== lastLapShown) {
    if (lastLapShown !== 0 && lap === laps) {
      announceTicker('🔔 ¡ÚLTIMA VUELTA!', true);
      audioEngine.playBell();
      showLapMessage('¡ÚLTIMA VUELTA!', true);
    } else if (lastLapShown !== 0) {
      announceTicker(`🏁 Vuelta ${lap} de ${laps}`, true);
      showLapMessage(`VUELTA ${lap} DE ${laps}`, false);
    }
    lastLapShown = lap;
  }
  if (state.phase !== 'racing') lastLapShown = 0;
}

// Mensaje grande en pantalla al cambiar de vuelta
let lapMsgTimer = null;
function showLapMessage(text, isLast) {
  const wrap = document.getElementById('lap-message');
  const txt = document.getElementById('lap-message-text');
  const sub = document.getElementById('lap-message-sub');
  txt.textContent = text;
  txt.className = 'font-display font-black tracking-tight drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] ' +
    (isLast ? 'text-5xl sm:text-7xl text-amber-300' : 'text-3xl sm:text-5xl text-white');
  const leader = state.sortedParticipants[0];
  sub.textContent = leader ? `Adelante: ${leader.name}` : '';
  wrap.classList.remove('hidden', 'lap-msg-anim');
  void wrap.offsetWidth;
  wrap.classList.add('lap-msg-anim');
  clearTimeout(lapMsgTimer);
  lapMsgTimer = setTimeout(() => wrap.classList.add('hidden'), isLast ? 3200 : 2200);
}

// ---------------- Nombres sobre los caballos (HTML nítido, sin superponerse) ----------------
const LABEL_COUNT = { top3: 3, top5: 5, top10: 10, off: 0 };
let labelLayer = null;
const labelEls = [];
const labelPlaced = [];
const labelVec = new THREE.Vector3();

function getLabelEl(i) {
  if (labelEls[i]) return labelEls[i];
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;display:none;';
  el.innerHTML = `
    <div class="lbl-box" style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 3px;border-radius:999px;background:rgba(2,6,23,0.86);border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.45);white-space:nowrap;">
      <span class="lbl-rank" style="width:20px;height:20px;flex:0 0 20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:900 11px Outfit,Inter,sans-serif;"></span>
      <span class="lbl-silk" style="width:8px;height:8px;flex:0 0 8px;border-radius:50%;"></span>
      <span class="lbl-name" style="font:700 13px Inter,system-ui,sans-serif;color:#fff;"></span>
    </div>
    <div class="lbl-line" style="position:absolute;left:50%;width:2px;margin-left:-1px;background:rgba(255,255,255,0.65);"></div>`;
  labelLayer.appendChild(el);
  el._box = el.querySelector('.lbl-box');
  el._rank = el.querySelector('.lbl-rank');
  el._silk = el.querySelector('.lbl-silk');
  el._name = el.querySelector('.lbl-name');
  el._line = el.querySelector('.lbl-line');
  el._key = '';
  el._pid = -1;
  el._fresh = true;
  labelEls[i] = el;
  return el;
}

// Asigna una etiqueta fija por caballo mientras siga entre los primeros
function getLabelElFor(pid) {
  for (const el of labelEls) if (el && el._pid === pid) return el;
  let i = labelEls.findIndex(el => el && el._pid === -1 && el.style.display === 'none');
  if (i < 0) i = labelEls.length;
  const el = getLabelEl(i);
  el._pid = pid; el._fresh = true; el._key = '';
  return el;
}

function updateHtmlLabels() {
  if (!labelLayer) return;
  let cands;
  const hl = state.phase === 'replay' && replay.highlight;   // repetición: Top 10 final resaltado
  if (state.phase === 'ready' || state.freezeTimer > 0) cands = [];
  else if (state.phase === 'replay') cands = replayLabelCandidates();
  else if (state.phase === 'racing' && state.winnerId !== -1 && state.labelsMode !== 'off') {
    cands = state.sortedParticipants.filter(p => p.finished && state.raceTime - p.finishTime < 3.5).slice(-12);
  } else cands = state.sortedParticipants.slice(0, LABEL_COUNT[state.labelsMode] || 0);
  const n = cands.length;
  const W = labelLayer.clientWidth, H = labelLayer.clientHeight;
  const nowT = performance.now();
  const ldt = Math.min(0.1, (nowT - (updateHtmlLabels.last || nowT)) / 1000);
  updateHtmlLabels.last = nowT;
  labelPlaced.length = 0;
  const usedEls = new Set();
  for (let i = 0; i < n; i++) {
    const p = cands[i];
    const r = (hl ? (p.finalRank || p.rank) : p.rank) - 1;   // puesto real (en la llegada puede ser 37°, 38°...); en la repetición, el puesto final
    const el = getLabelElFor(p.id);
    usedEls.add(el);
    trackPos(p.x + 0.5, p.z, labelVec);
    labelVec.y = 3.0;
    labelVec.project(camera);
    if (labelVec.z > 1 || labelVec.x < -1.15 || labelVec.x > 1.15 || labelVec.y < -1.1 || labelVec.y > 1.2) { el.style.display = 'none'; continue; }
    const sx = (labelVec.x + 1) / 2 * W;
    const sy = (1 - labelVec.y) / 2 * H;

    const info = STATE_INFO[p.state] || STATE_INFO.normal;
    const key = `${p.id}|${r}|${p.state}|${hl}`;
    if (el._key !== key) {
      el._key = key;
      const rankBg = r === 0 ? '#fbbf24' : r === 1 ? '#cbd5e1' : r === 2 ? '#b45309' : '#334155';
      el._rank.style.background = rankBg;
      el._rank.style.color = r <= 1 ? '#0f172a' : '#fff';
      el._rank.style.width = el._rank.style.minWidth = (r + 1 >= 100 ? 30 : r + 1 >= 10 ? 24 : 20) + 'px';
      el._rank.style.flex = '0 0 auto';
      el._rank.style.borderRadius = '999px';
      el._rank.textContent = String(r + 1);
      el._silk.style.background = p.silkHex;
      let name = p.name.length > 24 ? p.name.slice(0, 23) + '…' : p.name;
      el._name.textContent = name + (info.icon ? ' ' + info.icon : '');
      el._box.style.borderColor = (r === 0 || hl) ? '#fbbf24' : (p.state === 'normal' ? 'rgba(255,255,255,0.25)' : info.border);
      el._box.style.boxShadow = hl ? '0 0 12px rgba(251,191,36,0.75)' : '';
      if (hl) el._rank.textContent = (r + 1) + '°';
      el.style.display = '';
      el._w = el._box.offsetWidth || 120;
    }
    el.style.display = '';
    const w = el._w, h = 26;
    let x0 = Math.max(4, Math.min(W - w - 4, sx - w / 2));
    let y0 = sy - h - 6;
    // Apila hacia arriba si choca con una etiqueta ya colocada
    for (let k = 0; k < 14; k++) {
      let hit = null;
      for (const r of labelPlaced) {
        if (x0 < r.x + r.w + 3 && x0 + w + 3 > r.x && y0 < r.y + r.h + 2 && y0 + h + 2 > r.y) { hit = r; break; }
      }
      if (!hit) break;
      y0 = hit.y - h - 3;
    }
    y0 = Math.max(2, y0);
    labelPlaced.push({ x: x0, y: y0, w, h });
    // Deslizamiento suave (sin saltos cuando se reordenan las posiciones)
    if (el._x === undefined || el._fresh) { el._x = x0; el._y = y0; el._fresh = false; }
    const a = 1 - Math.exp(-ldt * 9);
    el._x += (x0 - el._x) * a; el._y += (y0 - el._y) * a;
    el.style.transform = `translate(${el._x.toFixed(1)}px, ${el._y.toFixed(1)}px)`;
    const lineLen = Math.max(0, sy - (y0 + h));
    el._line.style.top = h + 'px';
    el._line.style.height = Math.max(0, sy - (el._y + h)) + 'px';
    el._line.style.left = Math.max(8, Math.min(w - 8, sx - el._x)) + 'px';
  }
  for (const el of labelEls) if (el && !usedEls.has(el)) { el.style.display = 'none'; el._fresh = true; el._pid = -1; }
}

// ---------------- Lista de llegadas (nombres a medida que cruzan la meta) ----------------
let arrivalsShown = 0;
let lastArrivalsUpdate = 0;
function updateArrivalsFeed() {
  const feed = document.getElementById('arrivals-feed');
  const resultsOpen = !document.getElementById('results-modal').classList.contains('hidden');
  if (state.winnerId === -1 || state.phase === 'ready' || state.phase === 'countdown' || state.phase === 'replay' || resultsOpen) {
    feed.classList.add('hidden'); arrivalsShown = 0; return;
  }
  const now = performance.now();
  if (now - lastArrivalsUpdate < 120) return;
  lastArrivalsUpdate = now;
  // Solo se oculta durante el congelado del foto-finish (antes se ocultaba todo el rato que estaba el cartel)
  feed.classList.toggle('hidden', state.freezeTimer > 0);
  const finished = state.phase === 'racing'
    ? state.sortedParticipants.filter(p => p.finished)
    : state.sortedParticipants.filter(p => p.finishTime !== null && p.finishTime <= state.raceTime + 0.001);
  document.getElementById('arrivals-count').textContent = `${finished.length.toLocaleString('es-CL')} / ${activeRunners().toLocaleString('es-CL')}`;
  if (finished.length === arrivalsShown) return;
  const prev = arrivalsShown;
  arrivalsShown = finished.length;
  const last = finished.slice(-8).reverse();
  document.getElementById('arrivals-list').innerHTML = last.map(p => {
    const isNew = p.rank > prev;
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '';
    return `<div class="${isNew ? 'arr-in ' : ''}flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-900/80">
      <span class="min-w-[34px] text-center text-xs font-black rounded-md px-1 py-0.5 ${p.rank <= 3 ? 'bg-amber-400 text-amber-950' : 'bg-slate-700 text-white'}">${p.rank}°</span>
      <span class="w-2 h-2 rounded-full shrink-0" style="background:${p.silkHex}"></span>
      <span class="text-sm font-bold text-white truncate">${medal} ${escapeHtml(p.name)}</span>
    </div>`;
  }).join('');
}

// ---------------- Cartel grande "VA GANANDO" ----------------
let lastBannerUpdate = 0;
function updateLeaderBanner() {
  const now = performance.now();
  if (now - lastBannerUpdate < 150) return;
  lastBannerUpdate = now;
  const el = document.getElementById('leader-banner');
  const photoVisible = !document.getElementById('photo-card').classList.contains('hidden');
  if (state.phase === 'ready' || state.phase === 'countdown' || photoVisible) { el.classList.add('hidden'); return; }
  const list = state.sortedParticipants;
  const lead = list[0];
  if (!lead) return;
  el.classList.remove('hidden');
  const inReplay = state.phase === 'replay';
  const finished = !inReplay && (state.phase === 'finished' || state.winnerId !== -1);
  const winner = state.winnerId !== -1 ? state.participants[state.winnerId] : lead;
  document.getElementById('leader-banner-tag').textContent = inReplay ? '⏪ REPETICIÓN' : finished ? '🏆 GANADOR' : 'VA GANANDO';
  document.getElementById('leader-banner-name').textContent = finished ? winner.name : lead.name;
  const { lap, laps } = currentLapInfo();
  const parts = [];
  if (list[1]) parts.push(`2.º ${list[1].name}`);
  if (list[2]) parts.push(`3.º ${list[2].name}`);
  if (!finished && laps > 1) parts.push(`Vuelta ${lap}/${laps}`);
  document.getElementById('leader-banner-sub').textContent = parts.join('  •  ');
}

// ---------------- Director automático de cámara (cortes tipo transmisión) ----------------
const director = { shot: 'tv', until: 0, idx: 0, cut: false };
const DIRECTOR_PLAN = [['tv', 7000], ['front', 4200], ['tv', 6500], ['chase', 3800], ['tv', 6000], ['aerial', 4000]];

function getDirectedMode() {
  if (state.cameraMode !== 'auto') return state.cameraMode;
  if (state.phase !== 'racing' && state.phase !== 'replay') { director.until = 0; director.idx = 0; return 'tv'; }
  const m = getTrackMetrics();
  const leader = state.sortedParticipants[0];
  const prog = leader ? leader.x / m.worldLength : 0;
  const now = performance.now();
  let want = director.shot;
  if (m.isStampede && state.raceTime < 4.5) want = 'aerial';       // muestra el tamaño de la estampida
  else if (prog > 0.82 || state.slowMoActive) want = 'tv';          // recta final: siempre la toma lateral
  else if (now >= director.until || director.until === 0) {
    const [shot, dur] = DIRECTOR_PLAN[director.idx % DIRECTOR_PLAN.length];
    director.idx++;
    want = (shot === 'aerial' && !m.isStampede && Math.random() < 0.5) ? 'tv' : shot;
    director.until = now + dur * (m.isStampede ? 1.6 : 1);
  }
  // Un turbo del puntero merece un plano frontal
  if (!m.isStampede && state.cameraMode === 'auto' && want === 'tv' && leader && leader.state === 'turbo' && prog < 0.8 && now > director.until - 2500 && director.shot !== 'front') {
    want = 'front';
    director.until = now + 3500;
  }
  if (want !== director.shot) { director.shot = want; director.cut = true; }
  return director.shot;
}

// Encuadre del grupo de punta para la toma lateral
function leadGroupFrame() {
  const list = state.sortedParticipants;
  const leader = list[0];
  let zMin = leader.z, zMax = leader.z, xMin = leader.x;
  for (let i = 1; i < Math.min(6, list.length); i++) {
    const p = list[i];
    if (leader.x - p.x > 12 || p.finished !== leader.finished) continue;
    zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z); xMin = Math.min(xMin, p.x);
  }
  return { zMin, zMax, depth: leader.x - xMin };
}

function bindExtraUi() {
  labelLayer = document.createElement('div');
  labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden;';
  document.getElementById('viewport-3d').appendChild(labelLayer);
  document.getElementById('select-laps').addEventListener('change', e => {
    state.lapsSetting = e.target.value === 'auto' ? 'auto' : parseInt(e.target.value, 10);
    updateTopInfoUi();
    refreshPreviewIfIdle();
  });
  document.getElementById('btn-toggle-sprites').textContent = LABEL_MODE_TEXT[state.labelsMode];
}
