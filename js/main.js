// Hipódromo 3D Pro — Bucle principal y arranque
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 9. BUCLE PRINCIPAL
// =========================================================================
let lastFrameTime = performance.now();

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
updateAutoFinishBtn();
if (window.innerWidth < 768) state.top10Open = false;
applyTop10Ui();
prepareRaceParticipants();
setParticipantsModalOpen(true);   // al abrir la página se muestran las opciones de la carrera
requestAnimationFrame(frame);
