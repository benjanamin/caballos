// Hipódromo 3D Pro — Top 10 lateral, modales de participantes y resultados
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 7. TOP 10 COMPACTO EN PANEL LATERAL
// =========================================================================
function renderStateLegend() {
  const legend = document.getElementById('state-legend');
  legend.innerHTML = ['normal', 'turbo', 'attack', 'recovery', 'tired'].map(st => {
    const info = STATE_INFO[st];
    return `
      <div class="flex flex-col items-center justify-center py-1 px-0.5 rounded-lg bg-slate-900/70 border border-white/5" title="${info.tip}">
        ${getHorseFaceSvg(0, st, false, 22)}
        <span class="text-[9px] font-semibold text-slate-300 mt-0.5 leading-none truncate w-full">${info.label}</span>
      </div>`;
  }).join('');
}

function renderTop10Sidebar(force = false) {
  const now = performance.now();
  if (!force && now - state.lastLeaderboardUpdate < 150) return;
  if (!force && !state.top10Open) return;
  state.lastLeaderboardUpdate = now;

  const metrics = getTrackMetrics();
  const L = metrics.worldLength;
  const listEl = document.getElementById('leaderboard-list');
  const topN = Math.min(10, state.sortedParticipants.length);
  const leaderX = state.sortedParticipants[0] ? state.sortedParticipants[0].x : 0;

  let html = '';
  for (let i = 0; i < topN; i++) {
    const p = state.sortedParticipants[i];
    const isLeader = i === 0;
    const stam = Math.max(0, Math.min(100, p.stamina));
    const stamColor = stam > 55 ? '#10b981' : stam > 25 ? '#f59e0b' : '#ef4444';
    let gapText;
    if (p.finished) gapText = `${p.finishTime.toFixed(2)}s`;
    else if (state.phase === 'ready' || state.phase === 'countdown') gapText = 'Listo';
    else if (isLeader) gapText = 'LÍDER';
    else gapText = `-${Math.max(0.1, ((leaderX - p.x) / L) * metrics.meters).toFixed(1)}m`;

    const rankCls = i === 0 ? 'bg-amber-400 text-amber-950' : i === 1 ? 'bg-slate-300 text-slate-900' : i === 2 ? 'bg-amber-700 text-amber-50' : 'bg-slate-800 text-slate-300';
    const info = STATE_INFO[p.state] || STATE_INFO.normal;
    const border = isLeader ? 'rgba(251,191,36,0.5)' : (p.state === 'normal' ? 'rgba(255,255,255,0.05)' : info.border);

    html += `
      <div class="rounded-lg px-1.5 py-1 border bg-slate-900/70 flex items-center gap-1.5" style="border-color:${border}">
        <span class="w-4 h-4 rounded-full text-[9px] font-extrabold flex items-center justify-center shrink-0 ${rankCls}">${i + 1}</span>
        ${horseFace(p, p.state, isLeader, 22)}
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center gap-1 min-w-0">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${p.silkHex}"></span>
              <span class="text-[11px] font-semibold text-slate-100 truncate">${escapeHtml(p.name)}</span>
            </div>
            <span class="text-[10px] font-mono font-bold ${isLeader ? 'text-amber-300' : 'text-slate-400'} shrink-0">${gapText}</span>
          </div>
          <div class="mt-0.5 w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full rounded-full" style="width:${stam.toFixed(0)}%; background:${stamColor}"></div>
          </div>
        </div>
      </div>`;
  }
  listEl.innerHTML = html;
}


function updateHudProgress() {
  const metrics = getTrackMetrics();
  const L = metrics.worldLength;
  const leader = state.sortedParticipants[0];
  const progress = leader ? Math.max(0, Math.min(1, leader.x / L)) : 0;
  const metersRem = Math.max(0, Math.round(metrics.meters * (1 - progress)));
  const remTxt = metersRem > 0 ? `${metersRem}m` : 'META';
  const timeTxt = state.raceTime.toFixed(2) + 's';

  document.getElementById('hud-meters-left').textContent = remTxt;
  document.getElementById('hud-timer').textContent = timeTxt;
  document.getElementById('hud-progress-bar').style.width = (progress * 100).toFixed(1) + '%';

  document.getElementById('mobile-meters').textContent = remTxt;
  document.getElementById('mobile-timer').textContent = timeTxt;
}

function updateTopInfoUi() {
  const tm = getTrackMetrics();
  const surfLabel = state.surface === 'dirt' ? 'Tierra' : 'Césped';
  document.getElementById('top-track-subtitle').textContent =
    `${tm.meters}m${tm.laps > 1 ? ` • ${tm.laps} vueltas` : ''} • ${surfLabel}`;
  document.getElementById('top-count-badge').textContent = state.names.length.toLocaleString('es-CL');
  document.getElementById('sidebar-total-badge').textContent = `${state.names.length.toLocaleString('es-CL')} caballos`;

  const surfBtn = document.getElementById('btn-toggle-surface');
  surfBtn.textContent = surfLabel;
  surfBtn.className = state.surface === 'dirt'
    ? 'px-2.5 py-1.5 rounded-lg bg-amber-600/25 hover:bg-amber-600/35 border border-amber-500/40 text-xs font-semibold text-amber-200 transition'
    : 'px-2.5 py-1.5 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/35 border border-emerald-500/40 text-xs font-semibold text-emerald-200 transition';
}

// =========================================================================
// 8. MODALES (PARTICIPANTES Y RESULTADOS) + EVENTOS
// =========================================================================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const cls = type === 'error'
    ? 'bg-rose-600/95 border-rose-400/50 text-white'
    : 'bg-slate-900/95 border-emerald-400/50 text-emerald-200';
  toast.className = `toast-enter px-4 py-2 rounded-xl border text-xs sm:text-sm font-semibold shadow-2xl ${cls}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 2500);
}

function setParticipantsModalOpen(open) {
  const modal = document.getElementById('participants-modal');
  if (open) {
    renderParticipantsModalList();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } else {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function renderParticipantsModalList() {
  const container = document.getElementById('participants-list-container');
  const overflowNote = document.getElementById('participants-overflow-note');
  const filterText = document.getElementById('input-filter-list').value.trim().toLowerCase();

  document.getElementById('modal-count-badge').textContent =
    `${state.names.length.toLocaleString('es-CL')} Participante${state.names.length === 1 ? '' : 's'}`;
  document.getElementById('btn-start-from-modal').disabled = state.names.length < 2;

  const indexed = [];
  for (let i = 0; i < state.names.length; i++) {
    if (!filterText || state.names[i].toLowerCase().includes(filterText)) {
      indexed.push({ idx: i, name: state.names[i] });
    }
  }

  const MAX_DOM_ITEMS = 120;
  const slice = indexed.slice(0, MAX_DOM_ITEMS);

  if (slice.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-500 text-center py-4">No hay participantes en la lista.</div>';
    overflowNote.classList.add('hidden');
    return;
  }

  let html = '';
  for (let i = 0; i < slice.length; i++) {
    const item = slice[i];
    const color = JOCKEY_SILKS[item.idx % JOCKEY_SILKS.length].hex;
    html += `
      <div class="flex items-center justify-between gap-2 bg-slate-800/70 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg text-xs">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[10px] font-mono text-slate-400 w-7 text-right shrink-0">${item.idx + 1}.</span>
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
          <span class="text-slate-100 font-medium truncate">${escapeHtml(item.name)}</span>
        </div>
        <button data-remove-idx="${item.idx}" class="btn-remove-item text-slate-400 hover:text-rose-400 px-1 transition" title="Quitar">✕</button>
      </div>
    `;
  }
  container.innerHTML = html;

  if (indexed.length > MAX_DOM_ITEMS) {
    overflowNote.textContent = `Mostrando ${MAX_DOM_ITEMS} de ${indexed.length.toLocaleString('es-CL')} participantes (todos correrán simultáneamente en 3D).`;
    overflowNote.classList.remove('hidden');
  } else {
    overflowNote.classList.add('hidden');
  }
}

function parseBulkNames(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
}


// Resultados finales: durante una repetición el orden en vivo cambia, así que se usa el orden guardado al terminar
function finalResultsList() {
  return (replay.active && replay.snapshot) ? replay.snapshot.sorted : state.sortedParticipants;
}
const isOut = p => !!p.elimCause;                   // eliminado por un evento (no cambia durante la repetición)
const finalRankOf = p => p.finalRank || p.rank;

// Panel de resultados. Se muestra como panel lateral para que se vea la repetición detrás; no se cierra solo.
function openResultsModal(docked = true) {
  const modal = document.getElementById('results-modal');
  const list = finalResultsList();
  const winTime = list[0] ? list[0].finishTime : 0;

  for (let pos = 1; pos <= 3; pos++) {
    const p = list[pos - 1] && !isOut(list[pos - 1]) ? list[pos - 1] : null;
    const faceEl = document.getElementById(`podium-${pos}-face`);
    faceEl.innerHTML = p ? horseFace(p, pos === 1 ? 'turbo' : 'normal', pos === 1, pos === 1 ? 56 : 44) : '';
    document.getElementById(`podium-${pos}-name`).textContent = p ? p.name : '—';
    document.getElementById(`podium-${pos}-time`).textContent = p ? p.finishTime.toFixed(3) + 's' : '—';
    if (pos > 1) {
      const diffEl = document.getElementById(`podium-${pos}-diff`);
      diffEl.textContent = p ? formatPhotoFinishDiff(p.finishTime - winTime) : '';
    }
  }

  const marginPill = document.getElementById('results-margin-pill');
  if (list[1] && !isOut(list[1])) {
    const d12 = list[1].finishTime - winTime;
    if (d12 <= 0.12) {
      marginPill.textContent = `📸 ${formatPhotoFinishDiff(d12)}`;
      marginPill.classList.remove('hidden');
    } else {
      marginPill.classList.add('hidden');
    }
  } else {
    marginPill.classList.add('hidden');
  }

  const outList = list.filter(isOut);
  const nOut = outList.length;
  const tabElim = document.getElementById('tab-elim');
  tabElim.textContent = `Eliminados (${nOut})`;
  tabElim.classList.toggle('hidden', nOut === 0);
  const note = document.getElementById('results-elim-note');
  note.classList.toggle('hidden', nOut === 0);
  note.innerHTML = nOut ? `✖ <b>${nOut}</b> ${nOut === 1 ? 'caballo eliminado' : 'caballos eliminados'} por eventos: ` +
    outList.slice(0, 4).map(p => `<span class="text-rose-200">${escapeHtml(p.name)}</span>`).join(', ') +
    (nOut > 4 ? ` y ${nOut - 4} más` : '') + ' — mira la pestaña <b>Eliminados</b>.' : '';

  document.getElementById('btn-remove-winner-repeat').disabled = state.names.length <= 2;
  document.getElementById('btn-results-full-replay').classList.toggle('hidden', !hasReplay());

  state.resultsTab = 'top10';
  document.getElementById('input-search-results').value = '';
  updateResultsTabsUi();
  renderResultsTable();

  modal.classList.toggle('docked', !!docked);
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeResultsModal() {
  const modal = document.getElementById('results-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function updateResultsTabsUi() {
  const on = 'px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold';
  const off = 'px-2.5 py-1 rounded-md text-slate-300 hover:text-white font-semibold';
  const elim = document.getElementById('tab-elim');
  document.getElementById('tab-top10').className = state.resultsTab === 'top10' ? on : off;
  document.getElementById('tab-all').className = state.resultsTab === 'all' ? on : off;
  const hidden = elim.classList.contains('hidden');
  elim.className = (state.resultsTab === 'elim' ? on.replace('bg-emerald-600', 'bg-rose-600') : off) + (hidden ? ' hidden' : '');
}

function renderResultsTable() {
  const tbody = document.getElementById('results-table-body');
  const query = document.getElementById('input-search-results').value.trim().toLowerCase();
  const all = finalResultsList();
  const winnerTime = all[0] ? all[0].finishTime : 0;

  let source = all;
  if (query) {
    source = source.filter(p => p.name.toLowerCase().includes(query));
  } else if (state.resultsTab === 'top10') {
    source = source.filter(p => !isOut(p)).slice(0, 10);
  } else if (state.resultsTab === 'elim') {
    source = source.filter(isOut);
  }

  const MAX_ROWS = 250;
  const rows = source.slice(0, MAX_ROWS);
  let html = '';

  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    const out = isOut(p), rank = finalRankOf(p);
    const diffStr = out ? '✖ ' + p.elimCause : rank === 1 ? 'Ganador' : formatPhotoFinishDiff(p.finishTime - winnerTime);
    const badgeCls = rank === 1
      ? 'bg-amber-400 text-amber-950'
      : rank === 2
        ? 'bg-slate-300 text-slate-900'
        : rank === 3
          ? 'bg-amber-700 text-amber-50'
          : 'bg-slate-800 text-slate-300';

    html += `
      <tr class="hover:bg-white/5 transition">
        <td class="py-2 px-3">
          <span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-extrabold ${out ? 'bg-rose-900 text-rose-200' : badgeCls}">${out ? '✖' : rank}</span>
        </td>
        <td class="py-2 px-2">
          <div class="flex items-center gap-2">
            ${horseFace(p, rank === 1 ? 'turbo' : 'normal', rank === 1, 26)}
            <span class="w-2.5 h-2.5 rounded-full shrink-0 border border-white/40" style="background:${p.silkHex}"></span>
            <span class="font-semibold text-slate-100">${escapeHtml(p.name)}</span>
          </div>
          ${out ? `<div class="text-[11px] text-rose-300 mt-0.5">✖ ${escapeHtml(p.elimCause)}</div>` : ''}
        </td>
        <td class="py-2 px-3 text-right font-mono ${out ? 'text-rose-300' : 'text-emerald-300'} font-semibold">${out ? 'Eliminado' : p.finishTime.toFixed(3) + 's'}</td>
        <td class="py-2 px-3 text-right font-mono text-xs text-slate-300 hidden sm:table-cell">${out ? '—' : diffStr}</td>
      </tr>
    `;
  }

  if (source.length > MAX_ROWS) {
    html += `<tr><td colspan="4" class="py-3 text-center text-xs text-slate-400">Mostrando los primeros ${MAX_ROWS} de ${source.length.toLocaleString('es-CL')}. Usa el buscador para encontrar cualquier participante.</td></tr>`;
  }

  tbody.innerHTML = html || '<tr><td colspan="4" class="py-6 text-center text-xs text-slate-500">Sin coincidencias.</td></tr>';
}

function copyResultsToClipboard() {
  const all = finalResultsList();
  const top10 = all.filter(p => !isOut(p)).slice(0, 10);
  if (top10.length === 0) return;

  const winTime = top10[0].finishTime;
  const lines = [`🏆 Resultados Top 10 — Hipódromo 3D Pro (${state.participants.length} caballos):`];
  top10.forEach(p => {
    const rank = finalRankOf(p);
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const diff = rank === 1 ? '' : ` (${formatPhotoFinishDiff(p.finishTime - winTime)})`;
    lines.push(`${medal} ${p.name} — ${p.finishTime.toFixed(3)}s${diff}`);
  });
  const outList = all.filter(isOut);
  if (outList.length) {
    lines.push('', `✖ Eliminados (${outList.length}):`);
    outList.slice(0, 30).forEach(p => lines.push(`• ${p.name} — ${p.elimCause}`));
    if (outList.length > 30) lines.push(`… y ${outList.length - 30} más`);
  }
  const text = lines.join('\n');

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(ok ? '¡Resultados Top 10 copiados!' : 'No se pudo copiar automáticamente.', ok ? 'success' : 'error');
  } catch (err) {
    showToast('Error al copiar al portapapeles.', 'error');
  }
}

function updatePauseButtonUi() {
  document.getElementById('label-pause').textContent = state.paused ? 'Reanudar' : 'Pausar';
  document.getElementById('icon-pause').innerHTML = state.paused
    ? '<path d="M8 5v14l11-7z"/>'
    : '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
}
