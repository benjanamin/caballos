// Hipódromo 3D Pro — Bucle principal y arranque
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 9. BUCLE PRINCIPAL
// =========================================================================
let lastFrameTime = performance.now();

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
