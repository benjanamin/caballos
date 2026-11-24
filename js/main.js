// Hipódromo 3D Pro — Bucle principal y arranque
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 9. BUCLE PRINCIPAL
// =========================================================================
let lastFrameTime = performance.now();

// Pantalla completa (botón arriba a la derecha o tecla F)
function bindFullscreenUi() {
  const btn = document.getElementById('btn-fullscreen');
  const root = document.documentElement;
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const toggle = () => {
    try {
      const r = isFull() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
                         : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      if (r && r.catch) r.catch(() => showToast('No se pudo cambiar a pantalla completa.', 'error'));
    } catch (e) {
      showToast('Este navegador no permite pantalla completa.', 'error');
    }
  };
  const sync = () => {
    const full = isFull();
    document.getElementById('label-fullscreen').textContent = full ? 'Salir' : 'Pantalla completa';
    document.getElementById('icon-fullscreen').innerHTML = full
      ? '<path stroke-linecap="round" stroke-linejoin="round" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'
      : '<path stroke-linecap="round" stroke-linejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>';
  };
  if (!(root.requestFullscreen || root.webkitRequestFullscreen)) { btn.classList.add('hidden'); return; }   // p. ej. iPhone
  btn.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggle(); }
  });
}

// Con el panel de resultados a la izquierda, el centro de la imagen se corre a la parte visible del visor
let viewShift = 0;
function updatePanelViewOffset(dt) {
  const modal = document.getElementById('results-modal');
  const vp = document.getElementById('viewport-3d');
  let target = 0;
  if (!modal.classList.contains('hidden') && modal.classList.contains('docked') && modal.firstElementChild) {
    const panel = modal.firstElementChild.getBoundingClientRect();
    const r = vp.getBoundingClientRect();
    const covered = Math.max(0, Math.min(r.right, panel.right) - r.left);
    if (covered < r.width * 0.7) target = covered / 2;
  }
  viewShift += (target - viewShift) * Math.min(1, dt * 6);
  if (Math.abs(target - viewShift) < 0.5) viewShift = target;
  const W = vp.clientWidth, H = vp.clientHeight;
  if (viewShift > 0.5 && W > 0 && H > 0) camera.setViewOffset(W, H, -viewShift, 0, W, H);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  // Los carteles centrados también se corren a la parte visible
  const left = viewShift > 0.5 ? `calc(50% + ${viewShift.toFixed(0)}px)` : '';
  for (const id of ['slowmo-overlay', 'photo-card']) {
    const el = document.getElementById(id);
    if (el.style.left !== left) el.style.left = left;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  music.update();

  let animDt = 0;
  if (!state.paused) {
    const simDt = stepRaceSimulation(realDt);
    animDt = (state.phase === 'ready' || state.phase === 'countdown') ? realDt : simDt;
    recordRaceSample(false);
    if (state.phase === 'replay') updateReplay(realDt);
    if (state.resultsTimer > 0) {
      state.resultsTimer -= realDt;
      if (state.resultsTimer <= 0) {
        state.resultsTimer = -1;
        // Panel de resultados (queda abierto) + repetición de la última vuelta detrás
        startResultsPresentation();
      }
    }
  }

  syncHorseRigsToScene(animDt);
  updateStampedeInstances();
  emitStampedeDust(animDt);
  firePool.update(animDt);
  smokePool.update(animDt);
  animateStadium(realDt);
  updatePanelViewOffset(realDt);
  updateCamera(realDt);
  updateParticleScale();

  updateHtmlLabels();
  if (!state.paused) {
    renderTop10Sidebar();
    updateHudProgress();
    updateLapHud();
    updateLeaderBanner();
    updateArrivalsFeed();
  }
  renderer.render(scene, camera);
  renderEventPip(realDt);
  updateNewsCrawl(state.paused ? 0 : realDt);
}

// =========================================================================
// 10. ARRANQUE
// =========================================================================
initThreeScene();
renderStateLegend();
bindUiEvents();
bindExtraUi();
bindEventsUi();
bindReplayUi();
bindFullscreenUi();
updateAutoFinishBtn();
if (window.innerWidth < 768) state.top10Open = false;
applyTop10Ui();
prepareRaceParticipants();
setParticipantsModalOpen(true);   // al abrir la página se muestran las opciones de la carrera
requestAnimationFrame(frame);
