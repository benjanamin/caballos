// Hipódromo 3D Pro — Constantes, paletas y estado global
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 1. CONSTANTES Y PALETAS
// =========================================================================
const MAX_DETAILED_HORSES = 20;   // Punteros con modelo completo (jinete, riendas, número, fuego)
const NOSE_OFFSET = 2.05;         // Distancia del centro del caballo a la punta de la nariz (la meta se cruza con la nariz)
const MAX_PARTICIPANTS = 2000;

const DISTANCE_PRESETS = {
  short:  { meters: 600,  worldLength: 360, targetDuration: 18, label: '600m' },
  medium: { meters: 1200, worldLength: 600, targetDuration: 28, label: '1200m' },
  long:   { meters: 2000, worldLength: 920, targetDuration: 44, label: '2000m' }
};

const HORSE_COATS = [
  { name: 'Castaño',        body: 0x7c4324, hex: '#8b4d2b', mane: 0x1a100b, maneHex: '#23160f', muzzleHex: '#59301b' },
  { name: 'Castaño Oscuro', body: 0x422518, hex: '#543020', mane: 0x100906, maneHex: '#170d09', muzzleHex: '#331c12' },
  { name: 'Negro',          body: 0x1d2027, hex: '#333847', mane: 0x0b0c0f, maneHex: '#12141a', muzzleHex: '#222630' },
  { name: 'Alazán',         body: 0xb05327, hex: '#c25e2e', mane: 0x7a3414, maneHex: '#733014', muzzleHex: '#8a3e1c' },
  { name: 'Tordo',          body: 0xd9d6cf, hex: '#dedbd2', mane: 0x9e9b93, maneHex: '#9e9b93', muzzleHex: '#b8b4aa' },
  { name: 'Palomino',       body: 0xd8a75a, hex: '#e0af63', mane: 0xf4ead5, maneHex: '#f5ecd8', muzzleHex: '#b88a44' },
  { name: 'Bayo',           body: 0xb8864a, hex: '#c79654', mane: 0x1c140e, maneHex: '#241a12', muzzleHex: '#8c6533' },
  { name: 'Zaino',          body: 0x5c3220, hex: '#6e3d28', mane: 0x140b08, maneHex: '#1c100b', muzzleHex: '#452417' }
];

// Chaquetillas: color principal, secundario (casco/dibujo) y patrón
const JOCKEY_SILKS = [
  { hex: '#ef4444', num: 0xef4444, hex2: '#ffffff', pattern: 'hoops' },
  { hex: '#2563eb', num: 0x2563eb, hex2: '#facc15', pattern: 'diamonds' },
  { hex: '#10b981', num: 0x10b981, hex2: '#ffffff', pattern: 'sash' },
  { hex: '#f59e0b', num: 0xf59e0b, hex2: '#111827', pattern: 'stripes' },
  { hex: '#a855f7', num: 0xa855f7, hex2: '#fde047', pattern: 'star' },
  { hex: '#ec4899', num: 0xec4899, hex2: '#1e3a8a', pattern: 'halves' },
  { hex: '#06b6d4', num: 0x06b6d4, hex2: '#ffffff', pattern: 'spots' },
  { hex: '#f97316', num: 0xf97316, hex2: '#1f2937', pattern: 'hoops' },
  { hex: '#84cc16', num: 0x84cc16, hex2: '#14532d', pattern: 'diamonds' },
  { hex: '#eab308', num: 0xeab308, hex2: '#b91c1c', pattern: 'sash' },
  { hex: '#14b8a6', num: 0x14b8a6, hex2: '#f8fafc', pattern: 'stripes' },
  { hex: '#6366f1', num: 0x6366f1, hex2: '#f472b6', pattern: 'star' },
  { hex: '#f43f5e', num: 0xf43f5e, hex2: '#0f172a', pattern: 'halves' },
  { hex: '#22c55e', num: 0x22c55e, hex2: '#fef08a', pattern: 'spots' },
  { hex: '#38bdf8', num: 0x38bdf8, hex2: '#1e40af', pattern: 'hoops' },
  { hex: '#e879f9', num: 0xe879f9, hex2: '#ffffff', pattern: 'plain' }
];

const DEFAULT_NAMES = [
  'Relámpago', 'Centella', 'Tornado', 'Pegaso', 'Huracán', 'Sombra Negra',
  'Fuego Real', 'Estrella Sur', 'Viento Norte', 'Cometa', 'Rayo Veloz', 'Majestad'
];

const NAME_NOUNS = [
  'Relámpago', 'Centella', 'Tornado', 'Pegaso', 'Huracán', 'Sombra', 'Fuego', 'Estrella', 'Viento', 'Cometa',
  'Rayo', 'Halcón', 'Diamante', 'Trueno', 'Ciclón', 'Sol', 'Luna', 'Furia', 'Galope', 'Imperio', 'Bala',
  'Flecha', 'Destello', 'Titán', 'Gladiador', 'Corsario', 'Duque', 'Emperador', 'Fénix', 'Cóndor', 'Puma',
  'Volcán', 'Tsunami', 'Zafiro', 'Rubí', 'Lucero', 'Bandido', 'Pirata', 'Faraón', 'Vikingo', 'Samurái',
  'Mustang', 'Apache', 'Tigre', 'Lobo', 'Dragón', 'Meteoro', 'Bólido', 'Torbellino', 'Charro'
];
const NAME_ADJS = [
  'Veloz', 'Real', 'Negro', 'Dorado', 'de Plata', 'Salvaje', 'Invencible', 'del Sur', 'del Norte', 'Bravo',
  'Eterno', 'Furioso', 'Rojo', 'Azul', 'Supremo', 'Imparable', 'Feroz', 'Loco', 'Mágico', 'Glorioso',
  'Nocturno', 'Andino', 'Austral', 'Supersónico', 'Legendario'
];

function generateNames(n) {
  const out = [];
  const used = new Set();
  let i = 0;
  while (out.length < n) {
    const noun = NAME_NOUNS[i % NAME_NOUNS.length];
    const adj = NAME_ADJS[(i * 7 + Math.floor(i / NAME_NOUNS.length)) % NAME_ADJS.length];
    const lap = Math.floor(i / (NAME_NOUNS.length * NAME_ADJS.length));
    let name = `${noun} ${adj}` + (lap > 0 ? ` ${lap + 1}` : '');
    if (!used.has(name)) { used.add(name); out.push(name); }
    i++;
  }
  // Mezcla
  for (let k = out.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [out[k], out[j]] = [out[j], out[k]];
  }
  return out;
}

const STATE_INFO = {
  normal:   { label: 'Normal',  icon: '',   tip: 'Ritmo normal y enfocado',               border: 'rgba(148,163,184,0.45)', accent: '#94a3b8' },
  turbo:    { label: 'Turbo',   icon: '🔥', tip: 'Turbo: fuego en los cascos',            border: 'rgba(251,146,60,0.9)',   accent: '#fb923c' },
  attack:   { label: 'Ataque',  icon: '⚡', tip: 'Ataque: llamas eléctricas en los cascos', border: 'rgba(56,189,248,0.9)',  accent: '#38bdf8' },
  recovery: { label: '2° Aire', icon: '✨', tip: 'Segundo aire: recuperando energía',     border: 'rgba(52,211,153,0.9)',   accent: '#34d399' },
  tired:    { label: 'Cansado', icon: '💦', tip: 'Cansado: vapor por el hocico',          border: 'rgba(248,113,113,0.85)', accent: '#f87171' }
};

const LABEL_MODES = ['top5', 'top10', 'top3', 'off'];
const LABEL_MODE_TEXT = { top3: 'Nombres: Top 3', top5: 'Nombres: Top 5', top10: 'Nombres: Top 10', off: 'Nombres: No' };

// =========================================================================
// 2. ESTADO GLOBAL
// =========================================================================
const state = {
  names: [...DEFAULT_NAMES],
  distanceKey: 'medium',
  surface: 'dirt',
  cameraMode: 'auto',       // 'auto' | 'tv' | 'chase' | 'front' | 'aerial' | 'finish'
  lapsSetting: 'auto',      // 'auto' | 1..4
  eventsEnabled: false,     // eventos locos desactivados por defecto
  eventsDone: 0,
  nextEventAt: 0,
  autoPhotoFinish: true,
  speedMultiplier: 1,
  labelsMode: 'top5',
  soundEnabled: true,
  top10Open: true,
  phase: 'ready',           // 'ready' | 'countdown' | 'racing' | 'finished'
  paused: false,
  raceTime: 0,
  countdownShown: -1,
  gateOpenProgress: 0,
  participants: [],
  sortedParticipants: [],
  resultsTab: 'top10',
  lastLeaderboardUpdate: 0,
  currentLeaderId: -1,
  lastTickerTime: 0,
  metrics: null,
  // Director de la llegada (cámara + cámara lenta + foto-finish)
  slowMoScale: 1.0,
  slowMoActive: false,
  slowMoTriggered: false,
  finaleCamActive: false,
  freezeTimer: 0,
  photoTaken: false,
  winnerId: -1,
  resultsTimer: -1
};

function getHorseFaceSvg(coatIdx, horseState, isLeader, size = 34) {
  const c = HORSE_COATS[coatIdx % HORSE_COATS.length];
  const st = horseState || 'normal';

  let aura = '';
  if (st === 'turbo') {
    aura = `
      <circle cx="32" cy="34" r="27" fill="rgba(249,115,22,0.22)" />
      <path d="M8 24 L13 13 L17 21 Z" fill="#fb923c"/>
      <path d="M56 24 L51 13 L47 21 Z" fill="#fbbf24"/>
      <circle cx="11" cy="38" r="2.2" fill="#fde047"/>
      <circle cx="53" cy="36" r="2.4" fill="#fb923c"/>
    `;
  } else if (st === 'attack') {
    aura = `
      <circle cx="32" cy="34" r="26" fill="rgba(56,189,248,0.18)" />
      <path d="M52 14 L46 25 L51 25 L47 35 L57 22 L51 22 Z" fill="#38bdf8" stroke="#e0f2fe" stroke-width="0.8"/>
      <line x1="6" y1="26" x2="14" y2="26" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round"/>
      <line x1="4" y1="33" x2="12" y2="33" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>
    `;
  } else if (st === 'recovery') {
    aura = `
      <circle cx="32" cy="34" r="26" fill="rgba(52,211,153,0.18)" />
      <path d="M11 19 L12.5 23 L16.5 24.5 L12.5 26 L11 30 L9.5 26 L5.5 24.5 L9.5 23 Z" fill="#34d399"/>
      <path d="M53 20 L54.2 23.2 L57.5 24.5 L54.2 25.8 L53 29 L51.8 25.8 L48.5 24.5 L51.8 23.2 Z" fill="#6ee7b7"/>
    `;
  } else if (st === 'tired') {
    aura = `<circle cx="32" cy="34" r="25" fill="rgba(248,113,113,0.14)" />`;
  }

  const crown = isLeader ? `
    <path d="M22 14 L24 5 L29 10 L32 4 L35 10 L40 5 L42 14 Z" fill="#fbbf24" stroke="#92400e" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="32" cy="10.5" r="1.4" fill="#fef08a"/>
  ` : '';

  let faceDetails = '';
  if (st === 'turbo') {
    faceDetails = `
      <circle cx="24.5" cy="31.5" r="3" fill="#ffffff"/>
      <circle cx="39.5" cy="31.5" r="3" fill="#ffffff"/>
      <circle cx="25.2" cy="31.5" r="1.7" fill="#0f172a"/>
      <circle cx="38.8" cy="31.5" r="1.7" fill="#0f172a"/>
      <path d="M19 25.5 L28.5 29.5" stroke="#111827" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M45 25.5 L35.5 29.5" stroke="#111827" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M24 47.5 Q32 53.5 40 46.5" fill="none" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M36 47.5 L38.5 49.5" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
    `;
  } else if (st === 'attack') {
    faceDetails = `
      <circle cx="24.5" cy="31.5" r="2.8" fill="#ffffff"/>
      <circle cx="39.5" cy="31.5" r="2.8" fill="#ffffff"/>
      <circle cx="25" cy="31.5" r="1.7" fill="#0284c7"/>
      <circle cx="39" cy="31.5" r="1.7" fill="#0284c7"/>
      <path d="M20 27 L28.5 28.8" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M44 27 L35.5 28.8" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M26 48.5 L38 48.5" stroke="#111827" stroke-width="2.3" stroke-linecap="round"/>
    `;
  } else if (st === 'recovery') {
    faceDetails = `
      <path d="M21 32 Q24.5 27.5 28 32" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M36 32 Q39.5 27.5 43 32" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="21" cy="36.5" r="2.2" fill="#f472b6" opacity="0.55"/>
      <circle cx="43" cy="36.5" r="2.2" fill="#f472b6" opacity="0.55"/>
      <path d="M25.5 47 Q32 52 38.5 47" fill="none" stroke="#111827" stroke-width="2.2" stroke-linecap="round"/>
    `;
  } else if (st === 'tired') {
    faceDetails = `
      <ellipse cx="24.5" cy="32.5" rx="3" ry="2.2" fill="#ffffff"/>
      <ellipse cx="39.5" cy="32.5" rx="3" ry="2.2" fill="#ffffff"/>
      <circle cx="24.5" cy="33" r="1.3" fill="#0f172a"/>
      <circle cx="39.5" cy="33" r="1.3" fill="#0f172a"/>
      <path d="M20.5 29.8 L28.5 31.4" stroke="#111827" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M43.5 29.8 L35.5 31.4" stroke="#111827" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M26 48 Q32 45.5 38 48" fill="none" stroke="#111827" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M31 47.5 Q34 56 37 48.5 Z" fill="#fb7185" stroke="#9f1239" stroke-width="0.9"/>
      <path d="M48 21 C48 21 53 27 53 30.2 A5 5 0 0 1 43 30.2 C43 27 48 21 48 21 Z" fill="#38bdf8" stroke="#0369a1" stroke-width="1"/>
      <circle cx="46.5" cy="29.5" r="1.2" fill="#e0f2fe"/>
    `;
  } else {
    faceDetails = `
      <circle cx="24.5" cy="31.5" r="2.7" fill="#ffffff"/>
      <circle cx="39.5" cy="31.5" r="2.7" fill="#ffffff"/>
      <circle cx="24.8" cy="31.5" r="1.6" fill="#0f172a"/>
      <circle cx="39.2" cy="31.5" r="1.6" fill="#0f172a"/>
      <circle cx="25.4" cy="30.8" r="0.6" fill="#ffffff"/>
      <circle cx="39.8" cy="30.8" r="0.6" fill="#ffffff"/>
      <path d="M27.5 48 Q32 50 36.5 48" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="shrink-0 block" aria-hidden="true">
      ${aura}
      <path d="M17 25 L13 11 L25 19 Z" fill="${c.hex}" stroke="#111827" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M17.5 22 L15.5 14.5 L22.5 19.5 Z" fill="${c.muzzleHex}"/>
      <path d="M47 25 L51 11 L39 19 Z" fill="${c.hex}" stroke="#111827" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M46.5 22 L48.5 14.5 L41.5 19.5 Z" fill="${c.muzzleHex}"/>
      <rect x="16" y="18" width="32" height="33" rx="14" fill="${c.hex}" stroke="#111827" stroke-width="1.8"/>
      <path d="M26 17 Q32 12 38 17 Q35 23 32 21 Q29 24 26 17 Z" fill="${c.maneHex}"/>
      <rect x="19" y="37" width="26" height="17" rx="8.5" fill="${c.muzzleHex}" stroke="#111827" stroke-width="1.5"/>
      <ellipse cx="26.5" cy="43" rx="2.1" ry="1.4" fill="#111827"/>
      <ellipse cx="37.5" cy="43" rx="2.1" ry="1.4" fill="#111827"/>
      ${faceDetails}
      ${crown}
    </svg>
  `;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawHorseFaceCanvas(ctx, cx, cy, r, coatIdx, horseState, isLeader) {
  const c = HORSE_COATS[coatIdx % HORSE_COATS.length];
  const st = horseState || 'normal';
  const s = r / 32;

  ctx.save();
  ctx.translate(cx - 32 * s, cy - 32 * s);
  ctx.scale(s, s);

  if (st === 'turbo') {
    ctx.fillStyle = 'rgba(249, 115, 22, 0.28)';
    ctx.beginPath(); ctx.arc(32, 34, 28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fb923c';
    ctx.beginPath(); ctx.moveTo(7, 25); ctx.lineTo(13, 12); ctx.lineTo(17, 21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.moveTo(57, 25); ctx.lineTo(51, 12); ctx.lineTo(47, 21); ctx.closePath(); ctx.fill();
  } else if (st === 'attack') {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
    ctx.beginPath(); ctx.arc(32, 34, 27, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(53, 13); ctx.lineTo(46, 25); ctx.lineTo(51, 25);
    ctx.lineTo(47, 36); ctx.lineTo(58, 22); ctx.lineTo(52, 22);
    ctx.closePath(); ctx.fill();
  } else if (st === 'recovery') {
    ctx.fillStyle = 'rgba(52, 211, 153, 0.24)';
    ctx.beginPath(); ctx.arc(32, 34, 27, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#34d399';
    [[10, 24], [54, 24]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 1.8, sy - 1.5); ctx.lineTo(sx + 5, sy);
      ctx.lineTo(sx + 1.8, sy + 1.5); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 1.8, sy + 1.5);
      ctx.lineTo(sx - 5, sy); ctx.lineTo(sx - 1.8, sy - 1.5);
      ctx.closePath(); ctx.fill();
    });
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = c.hex;
  ctx.beginPath(); ctx.moveTo(17, 25); ctx.lineTo(13, 11); ctx.lineTo(25, 19); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(47, 25); ctx.lineTo(51, 11); ctx.lineTo(39, 19); ctx.closePath(); ctx.fill(); ctx.stroke();

  roundRectPath(ctx, 16, 18, 32, 33, 14);
  ctx.fillStyle = c.hex; ctx.fill(); ctx.stroke();

  ctx.fillStyle = c.maneHex;
  ctx.beginPath();
  ctx.moveTo(25, 18); ctx.quadraticCurveTo(32, 11, 39, 18);
  ctx.quadraticCurveTo(34, 24, 32, 21); ctx.quadraticCurveTo(29, 24, 25, 18);
  ctx.fill();

  roundRectPath(ctx, 19, 37, 26, 17, 8.5);
  ctx.fillStyle = c.muzzleHex; ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.ellipse(26.5, 43, 2.1, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(37.5, 43, 2.1, 1.4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.lineCap = 'round';
  if (st === 'turbo') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(24.5, 31.5, 3, 0, Math.PI * 2); ctx.arc(39.5, 31.5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(25.2, 31.5, 1.7, 0, Math.PI * 2); ctx.arc(38.8, 31.5, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(19, 25.5); ctx.lineTo(28.5, 29.5); ctx.moveTo(45, 25.5); ctx.lineTo(35.5, 29.5); ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(24, 47.5); ctx.quadraticCurveTo(32, 53.5, 40, 46.5); ctx.stroke();
  } else if (st === 'attack') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(24.5, 31.5, 2.9, 0, Math.PI * 2); ctx.arc(39.5, 31.5, 2.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0284c7';
    ctx.beginPath(); ctx.arc(25, 31.5, 1.7, 0, Math.PI * 2); ctx.arc(39, 31.5, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(20, 27); ctx.lineTo(28.5, 28.8); ctx.moveTo(44, 27); ctx.lineTo(35.5, 28.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, 48.5); ctx.lineTo(38, 48.5); ctx.stroke();
  } else if (st === 'recovery') {
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(21, 32); ctx.quadraticCurveTo(24.5, 27, 28, 32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36, 32); ctx.quadraticCurveTo(39.5, 27, 43, 32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(25.5, 47); ctx.quadraticCurveTo(32, 52, 38.5, 47); ctx.stroke();
  } else if (st === 'tired') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(24.5, 32.5, 3, 2.2, 0, 0, Math.PI * 2); ctx.ellipse(39.5, 32.5, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(24.5, 33, 1.3, 0, Math.PI * 2); ctx.arc(39.5, 33, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.3;
    ctx.beginPath(); ctx.moveTo(20.5, 29.8); ctx.lineTo(28.5, 31.4); ctx.moveTo(43.5, 29.8); ctx.lineTo(35.5, 31.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, 48); ctx.quadraticCurveTo(32, 45.5, 38, 48); ctx.stroke();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath(); ctx.moveTo(31, 47.5); ctx.quadraticCurveTo(34, 56.5, 37, 48.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(48, 21);
    ctx.bezierCurveTo(48, 21, 53.5, 27, 53.5, 30.5);
    ctx.arc(48, 30.5, 5.5, 0, Math.PI);
    ctx.bezierCurveTo(42.5, 27, 48, 21, 48, 21);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(24.5, 31.5, 2.8, 0, Math.PI * 2); ctx.arc(39.5, 31.5, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(24.8, 31.5, 1.6, 0, Math.PI * 2); ctx.arc(39.2, 31.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(27.5, 48); ctx.quadraticCurveTo(32, 50, 36.5, 48); ctx.stroke();
  }

  if (isLeader) {
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(22, 14); ctx.lineTo(24, 4); ctx.lineTo(29, 10);
    ctx.lineTo(32, 3); ctx.lineTo(35, 10); ctx.lineTo(40, 4); ctx.lineTo(42, 14);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  ctx.restore();
}
