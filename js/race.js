// Hipódromo 3D Pro — Simulación de carrera, cuenta atrás, director de llegada y cámara
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 6. SIMULACIÓN DE CARRERA, CUENTA ATRÁS MUSICAL Y DIRECTOR DE LLEGADA
// =========================================================================
function announceTicker(msg, force = false) {
  const now = performance.now();
  if (!force && now - state.lastTickerTime < 2200) return;
  state.lastTickerTime = now;
  const el = document.getElementById('live-ticker-text');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('ticker-anim');
  void el.offsetWidth;
  el.classList.add('ticker-anim');
}

function formatPhotoFinishDiff(diffSec) {
  if (diffSec <= 0.0005) return 'Ganador';
  const ms = Math.round(diffSec * 1000);
  if (diffSec <= 0.018) return `+${ms}ms • Por nariz`;
  if (diffSec <= 0.045) return `+${ms}ms • Por cabeza`;
  if (diffSec <= 0.095) return `+${ms}ms • Por pescuezo`;
  if (diffSec < 1.0) return `+${ms}ms`;
  return `+${diffSec.toFixed(2)}s`;
}

function resetFinaleUi() {
  document.getElementById('slowmo-overlay').classList.add('hidden');
  document.getElementById('photo-card').classList.add('hidden');
  document.getElementById('photo-flash').classList.remove('flash');
  document.getElementById('viewport-3d').classList.remove('freeze');
  audioEngine.setSlowMoFilter(false);
}

function prepareRaceParticipants() {
  stopReplay();   // si había una repetición, se cierra antes de rehacer la grilla
  const metrics = getTrackMetrics();
  const L = metrics.worldLength;
  const count = state.names.length;
  const nominalSpeed = L / metrics.targetDuration;

  // En estampida, el orden en la grilla es aleatorio
  const slots = [...Array(count).keys()];
  if (metrics.isStampede) {
    for (let k = slots.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [slots[k], slots[j]] = [slots[j], slots[k]];
    }
  }

  state.participants = state.names.map((rawName, idx) => {
    const coatIdx = (idx * 3 + Math.floor(idx / 8)) % HORSE_COATS.length;
    const silkIdx = idx % JOCKEY_SILKS.length;
    let startX = -1.1 - NOSE_OFFSET + 1.6;
    let z = 0;
    if (!metrics.isStampede) {
      const norm = count === 1 ? 0.5 : idx / (count - 1);
      z = (norm - 0.5) * (metrics.trackWidth - 2.6);
    } else {
      const slot = slots[idx];
      const row = Math.floor(slot / metrics.perRow);
      const col = slot % metrics.perRow;
      const rowCount = Math.min(metrics.perRow, count - row * metrics.perRow);
      const normCol = rowCount <= 1 ? 0.5 : col / (rowCount - 1);
      z = (normCol - 0.5) * (metrics.trackWidth - 3.4) + (row % 2 ? 0.35 : -0.35);
      startX = -1.6 - row * 2.8 - Math.random() * 0.5;
    }
    // Compensación de handicap: quien larga más atrás corre un poco más rápido
    const handicap = (L + Math.max(0, -startX)) / L;
    return {
      id: idx,
      name: rawName,
      coatIdx, silkIdx,
      silkHex: JOCKEY_SILKS[silkIdx].hex,
      blaze: Math.random() < 0.45,
      socks: (Math.random() < 0.3 ? 1 : 0) | (Math.random() < 0.3 ? 2 : 0) | (Math.random() < 0.35 ? 4 : 0) | (Math.random() < 0.35 ? 8 : 0),
      x: startX, z,
      startX, totalDist: L - startX,   // para medir el avance de forma justa (relativo a su propia largada)
      speed: 0,
      gallopPhase: Math.random() * Math.PI * 2,
      baseSpeed: nominalSpeed * (0.95 + Math.random() * 0.1) * handicap,
      accelSkill: 0.88 + Math.random() * 0.25,
      finishKick: 0.9 + Math.random() * 0.25,
      stamina: 100,
      staminaDrain: 2.1 + Math.random() * 1.15,
      recoveryRate: 4.6 + Math.random() * 2.4,
      state: 'normal',
      stateTimer: 0,
      turboCooldown: 2.2 + Math.random() * 4.5,
      attackCooldown: 2.8 + Math.random() * 4.2,
      hasUsedSecondWind: false,
      waveAmp: nominalSpeed * (0.04 + Math.random() * 0.05),
      waveFreq: 0.6 + Math.random() * 0.7,
      wavePhase: Math.random() * Math.PI * 2,
      // Estilo: 'front' (puntero: sale fuerte, se apaga), 'closer' (atropellador: guarda y explota al final), 'stalker'
      style: (() => { const r = Math.random(); return r < 0.3 ? 'front' : r < 0.62 ? 'closer' : 'stalker'; })(),
      kickAt: 0.66 + Math.random() * 0.2,      // dónde empieza su sprint final (fracción de la carrera)
      kickPower: 1.03 + Math.random() * 0.07,
      kickUsed: false,
      finished: false,
      finishTime: null,
      rank: idx + 1,
      lodDetailed: false
    };
  });

  assignSkins();
  resetRecorder();
  state.sortedParticipants = [...state.participants];
  state.raceTime = 0;
  state.gateOpenProgress = 0;
  state.slowMoScale = 1;
  state.slowMoActive = false;
  state.slowMoTriggered = false;
  state.finaleCamActive = false;
  state.freezeTimer = 0;
  state.photoTaken = false;
  state.winnerId = -1;
  state.resultsTimer = -1;
  state.currentLeaderId = state.participants[0] ? state.participants[0].id : -1;
  resetCameraFollow();
  resetEvents();
  music.tempoScale = 1;
  resetFinaleUi();

  const stBadge = document.getElementById('stampede-badge');
  if (metrics.isStampede) {
    stBadge.classList.remove('hidden');
    document.getElementById('stampede-badge-text').textContent =
      `Estampida 3D: ${count.toLocaleString('es-CL')} caballos simultáneos en pista`;
  } else {
    stBadge.classList.add('hidden');
  }

  if (firePool) { firePool.clear(); smokePool.clear(); }
  buildRacetrackEnvironment();
  rebuildHorsePool(count);
  rebuildStampedeInstancedMeshes();
  syncHorseRigsToScene(0);
  updateStampedeInstances();
  updateTopInfoUi();
  renderTop10Sidebar(true);
  updateHudProgress();
}

// Cuenta atrás conducida por el reloj de la música (cae justo en los toques de trompeta)
function handleCountdown() {
  const b = music.beat;
  for (let i = 0; i < COUNT_STEPS.length; i++) {
    if (b >= COUNT_STEPS[i][0] && state.countdownShown < i) {
      state.countdownShown = i;
      showCountdownText(COUNT_STEPS[i][1], false);
    }
  }
  if (b >= COUNT_BEATS.go) {
    state.countdownShown = COUNT_STEPS.length;
    showCountdownText('¡SALIDA!', true);
    state.phase = 'racing';
    state.raceTime = 0;
    const metrics = getTrackMetrics();
    announceTicker(metrics.isStampede
      ? `¡LARGARON! Estampida de ${state.participants.length.toLocaleString('es-CL')} caballos en pista`
      : '¡LARGARON! Arranca la carrera', true);
  }
}

function showCountdownText(text, isGo) {
  const overlay = document.getElementById('countdown-overlay');
  const el = document.getElementById('countdown-text');
  overlay.classList.remove('hidden');
  el.textContent = text;
  el.className = 'font-display font-black ' + (text.length > 3 ? 'text-4xl sm:text-7xl' : 'text-7xl sm:text-9xl') + ' drop-shadow-[0_10px_28px_rgba(0,0,0,0.85)] tracking-tight ' +
    (isGo ? 'text-emerald-400' : 'text-amber-300');
  void el.offsetWidth; // reinicia la animación
  el.classList.add('countdown-pop');
  if (isGo) setTimeout(() => { if (state.phase !== 'countdown') overlay.classList.add('hidden'); }, 900);
}

// Decide cámara de llegada y cámara lenta según lo peleado del final
function directFinale(realDt, metrics) {
  const L = metrics.worldLength;
  const list = state.sortedParticipants;
  const leader = list[0], second = list[1];
  let target = 1;
  state.finaleCamActive = false;
  let gapT = 99;

  if (state.phase === 'racing' && leader) {
    const leadNose = leader.x + NOSE_OFFSET;
    const tLead = (L - leadNose) / Math.max(4, leader.speed);
    if (second) {
      if (!leader.finished) gapT = (leadNose - (second.x + NOSE_OFFSET)) / Math.max(4, second.speed);
      else if (!second.finished) gapT = (state.raceTime - leader.finishTime) + (L - second.x - NOSE_OFFSET) / Math.max(4, second.speed);
      else gapT = second.finishTime - leader.finishTime;
    }
    const sinceWin = leader.finished ? state.raceTime - leader.finishTime : -1;

    if (state.autoPhotoFinish) {
      state.finaleCamActive = (!leader.finished && tLead < 3.2) || (leader.finished && sinceWin < 2.0);
      const close = gapT < 0.2;
      if (!state.slowMoTriggered && close && !leader.finished && tLead < 1.05) {
        state.slowMoTriggered = true;
        announceTicker(`📸 ¡FINAL PELEADO! ${leader.name} vs ${second.name}`, true);
      }
      // Si el final deja de estar peleado, se cancela la cámara lenta
      if (state.slowMoTriggered && !leader.finished && gapT > 0.32) state.slowMoTriggered = false;
      if (state.slowMoTriggered) {
        const secondDone = !second || second.finished;
        if (!leader.finished) target = tLead > 0.55 ? 0.4 : 0.18;
        else if (!secondDone && sinceWin < 1.0) target = 0.18;
        else if (sinceWin < 0.6) target = 0.3;
      }
    }
  }

  const rate = target < state.slowMoScale ? 7 : 2.2;
  state.slowMoScale += (target - state.slowMoScale) * Math.min(1, realDt * rate);
  if (target === 1 && state.slowMoScale > 0.99) state.slowMoScale = 1;

  const active = state.slowMoScale < 0.8;
  if (active !== state.slowMoActive) {
    state.slowMoActive = active;
    document.getElementById('slowmo-overlay').classList.toggle('hidden', !active);
    audioEngine.setSlowMoFilter(active);
  }
  if (active && second) {
    const gapM = Math.max(0, ((leader.x - second.x) / L) * metrics.meters);
    document.getElementById('slowmo-gap-badge').textContent = gapM < 0.4 ? '¡CABEZA A CABEZA!' : `Dif: ${gapM.toFixed(1)}m`;
  }
  music.tempoScale = Math.max(0.4, state.slowMoScale);
}

// Congela la imagen en el instante en que la nariz del ganador cruza la meta
function startPhotoFreeze(winner) {
  const metrics = getTrackMetrics();
  const L = metrics.worldLength;
  state.freezeTimer = 1.7;
  state.photoTaken = true;
  const second = state.sortedParticipants.find(p => p.id !== winner.id && !p.finished) || null;
  let txt = `${winner.name} cruza primero`;
  if (second) {
    const est = Math.max(0.001, (L - (second.x + NOSE_OFFSET)) / Math.max(4, second.speed));
    txt = `${winner.name} le gana a ${second.name} ${formatPhotoFinishDiff(est).replace(/^\+\d+ms • /, '').toLowerCase()}`;
    if (est > 0.095) txt = `${winner.name} gana por ${Math.round(est * 1000)}ms`;
  }
  document.getElementById('photo-card-text').textContent = txt;
  const card = document.getElementById('photo-card');
  card.classList.remove('hidden');
  card.classList.remove('photo-card-in'); void card.offsetWidth; card.classList.add('photo-card-in');
  const flash = document.getElementById('photo-flash');
  flash.classList.remove('flash'); void flash.offsetWidth; flash.classList.add('flash');
  document.getElementById('viewport-3d').classList.add('freeze');
  audioEngine.playCameraShutter();
}

function endPhotoFreeze() {
  state.freezeTimer = 0;
  document.getElementById('viewport-3d').classList.remove('freeze');
}

function stepRaceSimulation(realDt) {
  const metrics = getTrackMetrics();
  const L = metrics.worldLength;

  if (state.phase === 'countdown') {
    handleCountdown();
    for (const p of state.participants) p.gallopPhase += realDt * 2.2;
    return realDt;
  }
  if (state.phase !== 'racing' && state.phase !== 'finished') return realDt;

  if (state.freezeTimer > 0) {
    state.freezeTimer -= realDt;
    if (state.freezeTimer <= 0) endPhotoFreeze();
    return 0;
  }

  directFinale(realDt, metrics);
  const simDt = realDt * (state.slowMoActive ? 1 : state.speedMultiplier) * state.slowMoScale;

  // Abrir partidor o elevar barrera
  if (state.gateOpenProgress < 1 && state.phase === 'racing') {
    state.gateOpenProgress = Math.min(1, state.gateOpenProgress + realDt * 5.0);
    const angle = state.gateOpenProgress * Math.PI * 0.48;
    for (const d of gateDoors) d.mesh.rotation.y = d.side === -1 ? -angle : Math.PI + angle;
    if (stampedeBarrier) stampedeBarrier.position.y = 1.45 + state.gateOpenProgress * 5.8;
  }

  if (state.phase === 'racing') state.raceTime += simDt;

  const leaderPre = state.sortedParticipants[0];
  const currentLeadX = leaderPre ? leaderPre.x : 0;
  const secondPre = state.sortedParticipants[1];
  const secondX = secondPre && !secondPre.finished ? secondPre.x : null;
  // Avance justo: fracción de SU propio recorrido (no castiga ni premia la fila de largada)
  let leadQ = 0;
  for (const q of state.participants) if (!q.finished && !q.eliminated) leadQ = Math.max(leadQ, (q.x - q.startX) / q.totalDist);
  let finishedCount = 0;
  let avgSpeed = 0;
  let firstCrosser = null;

  for (let i = 0; i < state.participants.length; i++) {
    const p = state.participants[i];
    if (p.eliminated) { finishedCount++; continue; }   // fuera de carrera por un evento
    const progress = Math.max(0, Math.min(1, p.x / L));

    if (!p.finished) {
      p.turboCooldown = Math.max(0, p.turboCooldown - simDt);
      p.attackCooldown = Math.max(0, p.attackCooldown - simDt);
      if (p.stateTimer > 0) {
        p.stateTimer -= simDt;
        if (p.stateTimer <= 0 && p.state !== 'tired') p.state = 'normal';
      }

      if (p.state === 'turbo') p.stamina = Math.max(0, p.stamina - simDt * p.staminaDrain * 3.1);
      else if (p.state === 'attack') p.stamina = Math.max(0, p.stamina - simDt * p.staminaDrain * 2.35);
      else if (p.state === 'recovery') p.stamina = Math.min(100, p.stamina + simDt * 15.5);
      else if (p.state === 'tired') {
        p.stamina = Math.min(100, p.stamina + simDt * p.recoveryRate);
        if (p.stamina >= 36) p.state = 'normal';
      } else p.stamina = Math.max(0, p.stamina - simDt * p.staminaDrain * (p.rank === 1 ? 1.04 : 0.92));

      if (p.stamina < 20 && p.state !== 'tired' && p.state !== 'recovery') {
        if (progress > 0.42 && !p.hasUsedSecondWind && Math.random() < 0.36) {
          p.hasUsedSecondWind = true;
          p.state = 'recovery';
          p.stateTimer = 2.6;
          if (p.rank <= 6) announceTicker(`✨ ¡${p.name} saca un segundo aire!`);
        } else {
          p.state = 'tired';
          p.stateTimer = 2.5;
          if (p.rank <= 4) announceTicker(`💦 ${p.name} muestra cansancio`);
        }
      }

      if (p.state === 'normal' && state.raceTime > 1.8) {
        const gapToLeader = currentLeadX - p.x;
        const turboChance = (progress > 0.62 ? 0.38 : 0.15) * simDt;
        if (p.turboCooldown <= 0 && p.stamina > 34 && Math.random() < turboChance) {
          p.state = 'turbo';
          p.stateTimer = 2.2 + Math.random() * 1.6;
          p.turboCooldown = 6.2 + Math.random() * 4.0;
          if (p.rank <= 5) announceTicker(`🔥 ¡${p.name} prende fuego en los cascos!`);
        } else if (p.attackCooldown <= 0 && p.rank > 1 && gapToLeader > 2.4 && p.stamina > 30 && Math.random() < 0.25 * simDt) {
          p.state = 'attack';
          p.stateTimer = 2.3 + Math.random() * 1.4;
          p.attackCooldown = 5.4 + Math.random() * 3.5;
          if (p.rank <= 6) announceTicker(`⚡ ¡${p.name} lanza un ataque eléctrico!`);
        }
      }

      let stateMult = 1.0;
      if (p.state === 'turbo') stateMult = 1.21 * p.finishKick;
      else if (p.state === 'attack') stateMult = 1.16;
      else if (p.state === 'recovery') stateMult = 1.11;
      else if (p.state === 'tired') stateMult = 0.84;

      // Ritmo según estilo a lo largo de la carrera
      let styleMult = 1;
      if (p.style === 'front') styleMult = 1.05 - 0.035 * progress;
      else if (p.style === 'closer') styleMult = 0.955 + 0.085 * progress;
      else styleMult = 1.0 + 0.02 * Math.sin(progress * Math.PI);

      // Rebufo: quien va atrás descuenta (más cuanto más lejos, con tope); el líder pelea contra el viento
      const gapAhead = (leadQ - (p.x - p.startX) / p.totalDist) * L;
      let packMult = 1;
      if (progress > 0.08 && progress < 0.97) {
        if (gapAhead > 0.5) packMult += Math.min(0.055, gapAhead * 0.003);
        else if (p.rank === 1 && secondX !== null) packMult -= Math.min(0.015, Math.max(0, p.x - secondX) * 0.0015);
      }

      // Atropellada final: cada caballo tiene su momento de sprint
      if (!p.kickUsed && progress >= p.kickAt && p.stamina > 18 && p.state !== 'tired') {
        p.kickUsed = true;
        p.kickLeading = p.rank === 1; // el puntero defiende su lugar con más fuerza
        p.state = 'turbo';
        p.stateTimer = 2.4 + Math.random() * 1.8;
        p.turboCooldown = 8;
        if (p.rank > 1 && p.rank <= 6) announceTicker(`🚀 ¡${p.name} ATROPELLA desde el ${p.rank}° lugar!`);
      }
      const kick = (p.kickUsed && p.state === 'turbo') ? p.kickPower + (p.kickLeading ? 0.09 : 0) : 1;

      const wave = Math.sin(state.raceTime * p.waveFreq + p.wavePhase) * p.waveAmp;
      const targetSpeed = Math.max(p.baseSpeed * 0.68, p.baseSpeed * stateMult * styleMult * packMult * kick + wave);
      const accelRate = (state.raceTime < 1.5 ? 16 : 6.2) * p.accelSkill;
      p.speed += (targetSpeed - p.speed) * Math.min(1, simDt * accelRate);

      const prevX = p.x;
      p.x += p.speed * simDt;
      p.gallopPhase += simDt * p.speed * (p.state === 'tired' ? 0.56 : 0.68);

      // La meta se cruza con la nariz
      if (p.x + NOSE_OFFSET >= L) {
        const seg = Math.max(0.0001, p.x - prevX);
        const frac = 1 - (p.x + NOSE_OFFSET - L) / seg;
        p.finished = true;
        p.finishTime = Math.max(0.01, state.raceTime - simDt * (1 - frac));
        finishedCount++;
        if (state.winnerId === -1 && (!firstCrosser || p.finishTime < firstCrosser.finishTime)) firstCrosser = p;
      }
    } else {
      finishedCount++;
      p.state = 'normal';
      if (p.x < L + 65) {
        p.speed = Math.max(0, p.speed - simDt * 5.0);
        p.x += p.speed * simDt;
        p.gallopPhase += simDt * p.speed * 0.62;
      } else p.speed = 0;
    }
    avgSpeed += p.speed;
  }
  avgSpeed /= Math.max(1, state.participants.length);

  // Eventos locos (OVNI, meteorito...): pueden eliminar caballos
  maybeStartEvent();
  updateEvents(simDt);

  state.sortedParticipants.sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (a.eliminated) return b.elimAt - a.elimAt;
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.x - a.x;
  });
  for (let i = 0; i < state.sortedParticipants.length; i++) state.sortedParticipants[i].rank = i + 1;

  // Primer cruce: final musical, ovación y foto-finish
  if (firstCrosser) {
    state.winnerId = firstCrosser.id;
    music.playEnding();
    audioEngine.playCheer();
    announceTicker(`👑 ¡${firstCrosser.name} CRUZA PRIMERO LA META!`, true);
    if (state.autoPhotoFinish && state.slowMoTriggered && !state.photoTaken) {
      const rival = state.sortedParticipants.find(p => p.id !== firstCrosser.id);
      const estGap = !rival ? 99 : rival.finished ? rival.finishTime - firstCrosser.finishTime
        : (L - (rival.x + NOSE_OFFSET)) / Math.max(4, rival.speed);
      if (estGap < 0.25) startPhotoFreeze(firstCrosser);
    }
  }

  const leader = state.sortedParticipants[0];
  if (leader && leader.id !== state.currentLeaderId && state.phase === 'racing' && state.raceTime > 1.2 && state.winnerId === -1) {
    state.currentLeaderId = leader.id;
    announceTicker(`👑 ¡${leader.name} toma el primer lugar!`);
  }

  const leadProgress = leader ? Math.min(1, leader.x / L) : 0;
  audioEngine.updateRaceAmbience(realDt, leadProgress, avgSpeed, state.phase === 'racing', state.slowMoActive);

  if (state.phase === 'racing') {
    const allFinished = finishedCount >= state.participants.length;
    const winnerTime = leader && leader.finished ? leader.finishTime : null;
    // Tiempo para ver llegar a más caballos (más participantes = más tiempo, con tope)
    const n = state.participants.length;
    const arrivalsWindow = n <= 12 ? 7 : Math.min(22, 7 + n * 0.025);
    const timeout = winnerTime !== null && (state.raceTime - winnerTime) > arrivalsWindow;
    if (allFinished || timeout) {
      for (const p of state.sortedParticipants) {
        if (!p.finished && !p.eliminated) {
          const rem = Math.max(0.1, L - p.x - NOSE_OFFSET);
          p.finishTime = state.raceTime + rem / Math.max(6, p.speed || p.baseSpeed);
          p.finished = true;
        }
      }
      state.sortedParticipants.sort((a, b) => {
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (a.eliminated) return b.elimAt - a.elimAt;
    return a.finishTime - b.finishTime;
      });
      for (let i = 0; i < state.sortedParticipants.length; i++) state.sortedParticipants[i].rank = i + 1;
      state.phase = 'finished';
      skinRolls.clear();   // la próxima carrera vuelve a sortear las skins raras
      state.slowMoScale = 1;
      state.slowMoActive = false;
      state.finaleCamActive = false;
      document.getElementById('slowmo-overlay').classList.add('hidden');
      audioEngine.setSlowMoFilter(false);
      renderTop10Sidebar(true);
      finishRecording();
      state.resultsTimer = 2.5;   // un momento para ver al ganador antes de los resultados
    }
  }
  return simDt;
}

// -------------------------------------------------------------------------
// Cámara: modos del usuario + cámara automática de llegada + órbita del ganador
// -------------------------------------------------------------------------
let winnerOrbitAngle = 0;
// Seguimiento del líder sin retraso: se sigue su posición exacta y solo se suaviza
// la transición cuando cambia el puntero.
const follow = { id: -1, s: 0, lat: 0, offS: 0, offLat: 0 };
const anchorPrev = new THREE.Vector3();
const anchorNow = new THREE.Vector3();
let anchorValid = false;

// Valores de encuadre suavizados (evitan saltos cuando cambia el grupo de punta)
const camSmooth = {};
function smoothTo(key, target, rate, dt) {
  if (camSmooth[key] === undefined || !isFinite(camSmooth[key])) camSmooth[key] = target;
  camSmooth[key] += (target - camSmooth[key]) * (1 - Math.exp(-dt * rate));
  return camSmooth[key];
}

function resetCameraFollow() {
  follow.id = -1; follow.offS = 0; follow.offLat = 0;
  for (const k in camSmooth) delete camSmooth[k];
  anchorValid = false;
}

// Garantiza que el puntero / ganador quede dentro del cuadro y fuera de la franja inferior
// (cartel "VA GANANDO" y barra de noticias). Si un caballo pasa muy cerca de la cámara,
// se abre el ángulo al instante; después vuelve suave a su lente normal.
const GUARD_BOTTOM = 0.6, GUARD_TOP = 0.88, GUARD_SIDE = 0.9;   // límites en coordenadas de pantalla (-1..1)
const guardV = new THREE.Vector3();
function guardFraming(mode, L) {
  if (mode !== 'finale' && mode !== 'finish' && mode !== 'arrivals' && mode !== 'tv' && mode !== 'winner') return;
  if (state.phase !== 'racing' && state.phase !== 'finished' && state.phase !== 'replay') return;
  const targets = [];
  if (mode === 'winner') {
    const w = state.participants[state.winnerId];
    if (w) targets.push(w);
  } else if (mode === 'arrivals') {
    for (const p of state.participants) if (p.finished && state.raceTime - p.finishTime < 1.5) targets.push(p);
    if (targets.length > 6) targets.length = 6;
  }
  const lead = state.sortedParticipants[0];
  if (!targets.length && lead && !lead.eliminated) targets.push(lead);
  if (!targets.length) return;

  camera.updateMatrixWorld();
  const inv = camera.matrixWorldInverse;
  let need = 0;   // tangente del semiángulo vertical necesario
  for (const p of targets) {
    const f = trackPos(Math.min(L + 60, p.x), p.z, tmpV1);
    for (let k = 0; k < 4; k++) {
      const dl = k < 2 ? 1.4 : -1.4, h = k % 2 ? 3.0 : 0.25;   // nariz/cola, cascos/cabeza del jinete
      guardV.set(tmpV1.x + f.tx * dl, h, tmpV1.z + f.tz * dl).applyMatrix4(inv);
      const depth = -guardV.z;
      if (depth < 0.6) continue;   // detrás de la cámara: abrir el ángulo no lo arregla
      const ty = guardV.y / depth, tx = Math.abs(guardV.x) / depth / camera.aspect;
      need = Math.max(need, ty < 0 ? -ty / GUARD_BOTTOM : ty / GUARD_TOP, tx / GUARD_SIDE);
    }
  }
  if (need <= 0) return;
  const needFov = Math.min(75, 2 * THREE.MathUtils.radToDeg(Math.atan(need)));
  if (needFov > camera.fov + 0.1) { camera.fov = needFov; camera.updateProjectionMatrix(); }
}

function updateCamera(dt) {
  const metrics = getTrackMetrics();
  const L = metrics.worldLength;
  const halfW = metrics.halfWidth;
  const list = state.sortedParticipants;
  const leader = list[0];
  const maxLat = halfW + 9;   // la cámara nunca entra a la tribuna

  if (leader) {
    // Avance: se sigue al puntero; si cambia, la transición es suave
    if (follow.id !== leader.id) {
      // Se usa la posición ACTUAL del puntero anterior: el seguimiento no se detiene ni salta
      const prevLead = follow.id !== -1 ? state.participants[follow.id] : null;
      if (prevLead) follow.offS += Math.min(L + 60, prevLead.x) - Math.min(L + 60, leader.x);
      follow.id = leader.id;
    }
    follow.offS *= Math.exp(-dt * 1.2);
    follow.s = Math.min(L + 60, leader.x) + follow.offS;
    // Carril: promedio del grupo de punta, muy suavizado (no salta de un lado a otro)
    let zs = 0, c = 0;
    for (let i = 0; i < Math.min(4, list.length); i++) {
      const p = list[i];
      if (leader.x - p.x > 8 || p.finished !== leader.finished) continue;
      zs += p.z * (i === 0 ? 2 : 1); c += (i === 0 ? 2 : 1);
    }
    follow.lat = smoothTo('lat', c ? zs / c : leader.z, metrics.isStampede ? 0.7 : 1.2, dt);
  }
  const lx = follow.s, lz = follow.lat;
  const zoom = camDrag.zoomOffset;

  let mode = getDirectedMode();
  if (state.phase === 'racing' && state.finaleCamActive) mode = 'finale';
  else if (state.phase === 'racing' && state.winnerId !== -1) mode = 'arrivals';
  if (state.phase === 'finished') mode = 'winner';
  if (state.phase === 'replay') mode = replayCameraMode(mode);

  let targetFov = 46;
  if (mode === 'finale') targetFov = state.slowMoActive ? 30 : 36;
  else if (mode === 'finish') targetFov = 38;
  else if (mode === 'arrivals') targetFov = 44;
  else if (mode === 'event') targetFov = 50;
  else if (mode === 'tv') targetFov = 40;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3.5);
    camera.updateProjectionMatrix();
  }

  let smooth = 4.5;
  let anchor = lx;
  let moving = true;
  if (state.phase === 'ready' || state.phase === 'countdown') {
    const t = performance.now() * 0.00025;
    const readyDist = Math.min(maxLat, halfW + 8);
    anchor = 0; moving = false;
    trackToWorld(0, 12 + Math.sin(t) * 4 + camDrag.yawOffset, (metrics.isStampede ? 16 : 6.2) + camDrag.pitchOffset * 0.5, readyDist + zoom, tmpCamPos);
    trackToWorld(0, metrics.isStampede ? -16 : -1, 1.6, 0, tmpLookAt);
  } else if (mode === 'finale' || mode === 'finish') {
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity, n = 0;
    for (let i = 0; i < Math.min(5, list.length); i++) {
      const p = list[i];
      if (leader.x - p.x > 6) continue;
      xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
      zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z);
      n++;
    }
    if (n === 0) { xMin = xMax = leader.x; zMin = zMax = leader.z; }
    const zc = smoothTo('finZ', (zMin + zMax) / 2, 1.5, dt);
    const dNose = L - (leader.x + NOSE_OFFSET);
    let camX, lookX;
    if (mode === 'finish' || dNose <= 0) { camX = L; lookX = L; }
    else { camX = L - dNose * 0.45; lookX = L - dNose * 0.8; }
    if (mode === 'finish') lookX = L - Math.max(0, Math.min(10, dNose)) * 0.5;
    const spread = (zMax - zMin) * 0.85 + (xMax - xMin) * 0.4;
    const dist = smoothTo('finDist', Math.max(9, Math.min(28, 9 + spread)), 1.2, dt) + zoom * 0.5;
    const camLat = Math.min(maxLat, zc + dist);
    const extraH = Math.max(0, (zc + dist) - camLat) * 0.35;   // si no cabe, sube un poco
    const camH = (metrics.isStampede ? 5.5 : (state.slowMoActive ? 1.9 : 2.6)) + extraH + camDrag.pitchOffset * 0.3;
    anchor = L; moving = false;
    trackToWorld(L, camX + camDrag.yawOffset * 0.3, camH, camLat, tmpCamPos);
    trackToWorld(L, lookX, 1.35, zc, tmpLookAt);
    smooth = mode === 'finale' ? 3.2 : 4;
  } else if (mode === 'event') {
    const ev = activeEvent;
    const v = eventView(ev);
    const back = v.crossing ? halfW + 18 : 22;
    anchor = ev.s; moving = false;
    trackToWorld(ev.s, ev.s + 13, v.sky ? 9 : 7, Math.min(maxLat, v.lat + back), tmpCamPos);
    trackToWorld(ev.s, ev.s - 1, v.lookY + 0.4, v.lat, tmpLookAt);
    smooth = 3;
  } else if (mode === 'arrivals') {
    // Cámara fija sobre la meta para ver pasar a cada caballo con su nombre
    let zs = 0, c = 0;
    for (const p of state.participants) if (p.finished && state.raceTime - p.finishTime < 3) { zs += p.z; c++; }
    const zc = smoothTo('arrZ', c ? zs / c : 0, 0.6, dt);
    const dist = Math.max(14, halfW * 0.7 + 10);
    const camLat = Math.min(maxLat, zc + dist);
    anchor = L; moving = false;
    trackToWorld(L, L + 6 + camDrag.yawOffset * 0.3, 4.5 + (dist - 14) * 0.18 + camDrag.pitchOffset * 0.3, camLat + zoom * 0.3, tmpCamPos);
    trackToWorld(L, L - 2.5, 1.2, zc, tmpLookAt);
    smooth = 2.2;
  } else if (mode === 'winner') {
    const w = state.participants[state.winnerId] || leader;
    winnerOrbitAngle += dt * 0.35;
    const r = 10 + zoom * 0.5;
    anchor = w.x; moving = false;
    trackToWorld(w.x, w.x + Math.cos(winnerOrbitAngle) * r + camDrag.yawOffset * 0.3, 4.2 + camDrag.pitchOffset * 0.4, Math.min(maxLat, w.z + Math.sin(winnerOrbitAngle) * r), tmpCamPos);
    trackToWorld(w.x, w.x + 0.5, 1.6, w.z, tmpLookAt);
    smooth = 2.5;
  } else if (mode === 'tv') {
    // Toma lateral de TV: el puntero queda centrado y con aire por delante
    // Se abre para que entre todo el grupo que pelea la punta
    const g = leader ? leadGroupFrame() : { zMin: lz, zMax: lz, depth: 0 };
    const zc = smoothTo('tvZ', ((g.zMin + g.zMax) / 2) * 0.6 + lz * 0.4, 0.9, dt);
    const depth = smoothTo('tvDepth', g.depth, 0.8, dt);
    const want = smoothTo('tvWant', Math.max(12, Math.min(34, 11 + (g.zMax - g.zMin) * 0.75 + g.depth * 0.55)), 0.7, dt) + zoom;
    const camLat = Math.min(maxLat, zc + want);
    const camH = 4.2 + (want - 12) * 0.18 + camDrag.pitchOffset + Math.max(0, zc + want - camLat) * 0.3;
    const lookX = lx + 1.8 - depth * 0.35;
    if (metrics.isStampede) smooth = 3.2;
    trackToWorld(lx, lookX + 0.8 + camDrag.yawOffset, camH, camLat, tmpCamPos);
    trackToWorld(lx, lookX, 1.5, zc, tmpLookAt);
  } else if (mode === 'chase') {
    // Persecución: detrás del grupo de punta (siguiendo la curva de la pista), algo elevada
    // y mirando al líder, para ver a los perseguidores pelear la punta en vez de pista vacía
    const g = leader ? leadGroupFrame() : { zMin: lz, zMax: lz, depth: 0 };
    const depth = smoothTo('chDepth', Math.min(14, g.depth), 0.8, dt);
    const spread = smoothTo('chSpread', g.zMax - g.zMin, 0.8, dt);
    const zc = smoothTo('chZ', ((g.zMin + g.zMax) / 2) * 0.5 + lz * 0.5, 0.9, dt);
    const back = Math.max(6, 9 + depth * 0.9 + spread * 0.25 + zoom * 0.7);
    const camH = Math.max(2.2, 4.0 + depth * 0.22 + spread * 0.12 + camDrag.pitchOffset * 0.6);
    const camLat = Math.max(-maxLat, Math.min(maxLat, zc + 1.5 + camDrag.yawOffset * 0.45));
    trackPos(lx - back, camLat, tmpCamPos); tmpCamPos.y = camH;
    trackPos(lx + 2.5, lz * 0.6 + zc * 0.4, tmpLookAt); tmpLookAt.y = 1.3;
  } else if (mode === 'front') {
    trackToWorld(lx, lx + 14.0 + zoom * 0.6 + camDrag.yawOffset * 0.4, 3.2 + Math.max(-1.0, camDrag.pitchOffset * 0.45), lz + 2.2 + camDrag.yawOffset * 0.5, tmpCamPos);
    trackToWorld(lx, lx - 1.5, 1.6, lz, tmpLookAt);
  } else if (mode === 'aerial') {
    trackToWorld(lx, lx - 8.0 + camDrag.yawOffset, (metrics.isStampede ? 36 : 23) + zoom * 0.8 + camDrag.pitchOffset, Math.min(maxLat + 10, lz + (metrics.isStampede ? 26 : 15) + zoom * 0.5), tmpCamPos);
    trackToWorld(lx, lx - (metrics.isStampede ? 6 : 0), 1.0, lz * 0.4, tmpLookAt);
  }

  // Compensa el avance del ancla antes de suavizar: la cámara viaja con el líder sin quedarse atrás
  trackToWorld(anchor, anchor, 0, 0, anchorNow);
  if (moving && anchorValid) {
    tmpV3.subVectors(anchorNow, anchorPrev);
    if (tmpV3.lengthSq() < 400) { currentCamPos.add(tmpV3); currentLookAt.add(tmpV3); }
  }
  anchorPrev.copy(anchorNow);
  anchorValid = true;

  // Corte de cámara del director: salto directo al nuevo plano
  if (director.cut) { currentCamPos.copy(tmpCamPos); currentLookAt.copy(tmpLookAt); director.cut = false; }
  const k = 1 - Math.exp(-dt * smooth);
  currentCamPos.lerp(tmpCamPos, k);
  currentLookAt.lerp(tmpLookAt, k);
  camera.position.copy(currentCamPos);
  camera.lookAt(currentLookAt);
  guardFraming(mode, L);

  if (skyDome) skyDome.position.set(camera.position.x, 0, camera.position.z);
  if (sunLight) {
    sunLight.position.set(currentLookAt.x + 24, 75, currentLookAt.z + 55);
    sunLight.target.position.set(currentLookAt.x, 0, currentLookAt.z);
  }
}
