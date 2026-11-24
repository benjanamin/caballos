// Hipódromo 3D Pro — Eventos locos
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 12. EVENTOS LOCOS: OVNI, METEORITO, TORNADO, RAYO, ROCA GIGANTE, GLOBOS, OLA DE FRÍO, ÁGUILA, SOCAVÓN, OLA GIGANTE, ABEJAS Y PLÁTANOS
// Eliminan caballos durante la carrera. Reglas:
//  - desactivados por defecto
//  - el epicentro cae a veces sobre el grupo de punta (LEADER_EVENT_CHANCE) y si no, al azar entre todos
//  - nunca quedan menos de MIN_SURVIVORS caballos
//  - no ocurren en el tramo final (para no decidir la carrera en la meta)
// =========================================================================
const MIN_SURVIVORS = 10;
const EVENT_TYPES = {
  ufo:       { icon: '👽', title: '¡UN OVNI ABDUCE CABALLOS!',          cause: 'Abducido por un OVNI', dur: 4.8 },
  meteor:    { icon: '☄️', title: '¡CAE UN METEORITO!',                 cause: 'Aplastado por un meteorito', dur: 4.0 },
  tornado:   { icon: '🌪️', title: '¡TORNADO EN LA PISTA!',               cause: 'Arrastrado por un tornado', dur: 5.0 },
  lightning: { icon: '⚡', title: '¡RAYO FULMINANTE!',                   cause: 'Fulminado por un rayo', dur: 3.4 },
  boulder:   { icon: '🪨', title: '¡UNA ROCA GIGANTE CRUZA LA PISTA!',   cause: 'Arrollado por una roca gigante', dur: 3.8 },
  balloons:  { icon: '🎈', title: '¡LLUVIA DE GLOBOS!',                  cause: 'Se fue volando con globos', dur: 4.8 },
  freeze:    { icon: '🥶', title: '¡OLA DE FRÍO! CABALLOS CONGELADOS',   cause: 'Congelado en un bloque de hielo', dur: 4.4 },
  eagle:     { icon: '🦅', title: '¡ATAQUE DE UN ÁGUILA GIGANTE!',       cause: 'Raptado por un águila gigante', dur: 4.4 },
  sinkhole:  { icon: '🕳️', title: '¡SE ABRE UN SOCAVÓN EN LA PISTA!',    cause: 'Tragado por un socavón', dur: 4.0 },
  tsunami:   { icon: '🌊', title: '¡UNA OLA GIGANTE INUNDA LA PISTA!',   cause: 'Arrastrado por una ola gigante', dur: 5.0 },
  bees:      { icon: '🐝', title: '¡ENJAMBRE DE ABEJAS ASESINAS!',       cause: 'Huyó de un enjambre de abejas', dur: 4.6 },
  bananas:   { icon: '🍌', title: '¡CÁSCARAS DE PLÁTANO EN LA PISTA!',   cause: 'Resbaló con una cáscara de plátano', dur: 3.8 },
  train:     { icon: '🚂', title: '¡PASA UN TREN POR LA PISTA!',         cause: 'Atropellado por un tren', dur: 5.2 },
  lava:      { icon: '🌋', title: '¡ERUPCIÓN! LLUEVE LAVA',              cause: 'Alcanzado por una bola de lava', dur: 4.8 },
  magnet:    { icon: '🧲', title: '¡UN IMÁN GIGANTE ATRAE LAS HERRADURAS!', cause: 'Atrapado por un imán gigante', dur: 4.6 },
  piano:     { icon: '🎹', title: '¡CAEN PIANOS DEL CIELO!',             cause: 'Aplastado por un piano', dur: 4.2 },
  portal:    { icon: '🌀', title: '¡SE ABRE UN PORTAL DIMENSIONAL!',     cause: 'Se fue por un portal a otra dimensión', dur: 4.4 }
};
// Probabilidad de que un evento caiga sobre el grupo de punta (los primeros lugares)
const LEADER_EVENT_CHANCE = 0.4;
const TRAIN_RUNUP = 34;   // distancia desde donde viene el tren antes de entrar a la pista
const EVENT_KEYS = Object.keys(EVENT_TYPES);

let eventGroup = null;
let activeEvent = null;
let recentEventTypes = [];

function activeRunners() {
  let n = 0;
  for (const p of state.participants) if (!p.eliminated && !p.doomed) n++;
  return n;
}

function resetEvents() {
  if (eventGroup) disposeGroup(eventGroup);
  eventGroup = new THREE.Group();
  scene.add(eventGroup);
  activeEvent = null;
  recentEventTypes = [];
  state.eventsDone = 0;
  state.nextEventAt = 10 + Math.random() * 5;
  document.getElementById('event-message').classList.add('hidden');
  document.getElementById('event-pip').classList.add('hidden');
  pipState.active = false;
  resetNewsCrawl();
  updateEliminatedBadge();
}

function updateEliminatedBadge() {
  const el = document.getElementById('sidebar-total-badge');
  const total = state.participants.length || state.names.length;
  const elim = state.participants.filter(p => p.eliminated).length;
  el.textContent = elim > 0
    ? `${(total - elim).toLocaleString('es-CL')} en carrera • ${elim} fuera`
    : `${total.toLocaleString('es-CL')} caballos`;
}

// Encuadre de cámara de cada evento (cámara principal y recuadro)
function eventView(ev) {
  const crossing = ev.type === 'tornado' || ev.type === 'boulder' || ev.type === 'tsunami' || ev.type === 'train';
  const sky = ev.type === 'ufo' || ev.type === 'lightning' || ev.type === 'eagle' || ev.type === 'balloons' || ev.type === 'magnet' || (ev.type === 'meteor' && !ev.impact);
  let lookY = sky ? 6 : 1.6;
  if (ev.type === 'balloons') lookY = 2.2 + Math.min(7, Math.max(0, ev.t - 0.8) * 1.8);
  else if (ev.type === 'eagle') lookY = 3 + Math.max(0, ev.t - 1.8) * 2.2;
  else if (ev.type === 'magnet') lookY = 4 + Math.max(0, ev.t - 3.2) * 3;
  else if (ev.type === 'freeze' || ev.type === 'tsunami' || ev.type === 'train') lookY = 2;
  else if (ev.type === 'sinkhole' || ev.type === 'bananas') lookY = 1.1;
  else if (ev.type === 'portal' || ev.type === 'lava') lookY = 2.8;
  else if (ev.type === 'piano') lookY = 2.2;
  return { crossing, sky, lat: crossing ? 0 : ev.lat, lookY };
}

// Decide si arranca un evento (llamado en cada paso de simulación)
function maybeStartEvent() {
  if (!state.eventsEnabled || activeEvent || state.phase !== 'racing' || state.winnerId !== -1) return;
  if (state.raceTime < state.nextEventAt) return;
  const m = getTrackMetrics();
  const leader = state.sortedParticipants[0];
  const prog = leader ? leader.x / m.worldLength : 0;
  if (prog < 0.1 || prog > 0.78) return;
  const free = activeRunners() - MIN_SURVIVORS;
  if (free <= 0) return;
  // Cantidad de eventos según duración de la carrera
  const maxEvents = Math.max(1, Math.min(5, Math.round(m.targetDuration / 22)));   // pocos eventos, pero grandes
  const interval = (m.targetDuration * 0.66) / maxEvents;
  state.nextEventAt = state.raceTime + interval * (0.7 + Math.random() * 0.6);
  // Tipo al azar sin repetir los últimos (más variedad en la misma carrera)
  let options = EVENT_KEYS.filter(k => !recentEventTypes.includes(k));
  if (options.length === 0) options = EVENT_KEYS;
  const type = options[(Math.random() * options.length) | 0];
  recentEventTypes.push(type);
  if (recentEventTypes.length > 4) recentEventTypes.shift();
  startEvent(type, free);
}

function startEvent(type, free) {
  if (activeEvent) { activeEvent.t = activeEvent.dur; updateEvents(0.0001); }   // cierra cualquier evento anterior
  const m = getTrackMetrics();
  const runners = state.participants.filter(p => !p.eliminated && !p.doomed && !p.finished);
  if (runners.length === 0) return;
  // Epicentro: a veces cae sobre el grupo de punta; si no, al azar entre todos
  const top = state.sortedParticipants.filter(p => !p.eliminated && !p.doomed && !p.finished)
    .slice(0, Math.max(3, Math.ceil(runners.length * 0.05)));
  const onLeaders = top.length > 0 && Math.random() < LEADER_EVENT_CHANCE;
  const E = onLeaders ? top[(Math.random() * top.length) | 0] : runners[(Math.random() * runners.length) | 0];
  const def = EVENT_TYPES[type];
  const ev = { type, def, t: 0, dur: def.dur, s: E.x, lat: E.z, victims: [], meshes: {}, impact: false, done: false, onLeaders };

  // Víctimas: las más cercanas al epicentro según el tipo de evento
  const dist = p => Math.hypot((p.x - E.x) * 0.8, p.z - E.z);
  let cap = Math.min(free, Math.max(1, Math.floor(runners.length * 0.35)));
  let pool;
  const crossing = type === 'tornado' || type === 'boulder' || type === 'tsunami';
  const halfW0 = m.halfWidth;
  if (type === 'train') {
    // El tren cruza la pista de lado a lado en un punto fijo justo delante del epicentro:
    // le toca a quien llegue a ese cruce cuando pasa la locomotora
    ev.lat0 = -halfW0 - TRAIN_RUNUP; ev.lat1 = halfW0 + TRAIN_RUNUP;
    const travel = ev.dur * 0.9;
    const hitAt = p => Math.max(0.2, ((p.z - ev.lat0) / (ev.lat1 - ev.lat0)) * travel);
    const sTrain = E.x + Math.max(4, E.speed || E.baseSpeed) * hitAt(E);
    const miss = p => Math.abs(p.x + Math.max(4, p.speed || p.baseSpeed) * hitAt(p) - sTrain);
    pool = runners.filter(p => miss(p) < 2.2).sort((a, b) => miss(a) - miss(b));
    cap = Math.min(cap, 40);
    ev.trainS = sTrain;
    ev.trainHitAt = hitAt;
    ev.lat = 0;
  } else if (crossing) {
    // Cruza la pista de lado a lado: se lleva a los que están en su franja
    const band = { boulder: 3.6, tornado: 4.5, tsunami: 5.5 }[type];
    pool = runners.filter(p => Math.abs(p.x - E.x) < band).sort((a, b) => Math.abs(a.x - E.x) - Math.abs(b.x - E.x));
    cap = Math.min(cap, { boulder: 30, tornado: 50, tsunami: 45 }[type]);
    ev.lat = 0;
  } else {
    pool = [...runners].sort((a, b) => dist(a) - dist(b));
    const radius = { ufo: 7, meteor: 9.5, lightning: 3.2, balloons: 6.5, freeze: 8.5, eagle: 4, sinkhole: 7.5, bees: 6, bananas: 6,
                     lava: 9, magnet: 7, piano: 5, portal: 7 }[type];
    const maxN = { ufo: 40, meteor: 60, lightning: 5, balloons: 18, freeze: 35, eagle: 3, sinkhole: 35, bees: 12, bananas: 10,
                   lava: 25, magnet: 12, piano: 4, portal: 20 }[type];
    pool = pool.filter((p, i) => i === 0 || dist(p) < radius);
    cap = Math.min(cap, maxN);
    if (type === 'ufo') cap = Math.min(cap, Math.max(1, Math.round(runners.length * 0.1)));
  }
  if (pool.length === 0) pool = [E];
  const victims = pool.slice(0, Math.max(1, cap));

  const halfW = m.halfWidth;
  const lat0 = -halfW - 7, lat1 = halfW + 7;
  // El evento avanza con los caballos: el meteorito apunta adonde VAN a estar, el OVNI, el águila y el tornado los persiguen
  ev.v = victims.reduce((a, p) => a + Math.max(4, p.speed || p.baseSpeed), 0) / victims.length;
  ev.s0 = E.x;
  const HIT = { ufo: 1.0, meteor: 1.1, lightning: 0.7, freeze: 0.9, balloons: 0.6, eagle: 1.5, tornado: ev.dur, boulder: ev.dur,
                sinkhole: 0.8, tsunami: ev.dur, bees: 1.2, bananas: 0.5, train: 0, lava: 0.9, magnet: 1.1, piano: 1.0, portal: 0.8 };
  ev.tStop = HIT[type];
  ev.fixed = type === 'meteor' || type === 'lightning' || type === 'freeze' || type === 'balloons' || type === 'sinkhole' || type === 'bananas'
    || type === 'train' || type === 'lava' || type === 'piano' || type === 'portal';
  ev.s = ev.fixed ? ev.s0 + ev.v * ev.tStop : ev.s0;
  if (type === 'train') ev.s = ev.trainS;
  ev.shatterT = ev.dur - 0.45;   // ola de frío: el hielo se rompe al final
  victims.forEach((p, i) => {
    let at;
    if (type === 'ufo') at = 1.0 + i * 0.09;
    else if (type === 'meteor') at = 1.1;
    else if (type === 'lightning') at = 0.7;
    else if (type === 'freeze') at = 0.9 + i * 0.025;
    else if (type === 'balloons') at = 0.6 + i * 0.12;
    else if (type === 'eagle') at = 1.25 + i * 0.12;
    else if (type === 'sinkhole') at = 0.8 + i * 0.03;
    else if (type === 'bees') at = 1.0 + i * 0.15;
    else if (type === 'bananas') at = 0.5 + i * 0.1;
    else if (type === 'train') at = ev.trainHitAt(p);
    else if (type === 'lava') at = 0.9 + i * 0.12;
    else if (type === 'magnet') at = 1.1 + i * 0.12;
    else if (type === 'piano') at = 1.0 + i * 0.25;
    else if (type === 'portal') at = 0.8 + i * 0.06;
    else at =Math.max(0.2, ((p.z - lat0) / (lat1 - lat0)) * ev.dur * 0.9);
    p.doomed = { ev, at, idx: i, spin: (Math.random() - 0.5) * 8, power: 0.7 + Math.random() * 0.6 };
    ev.victims.push(p);
  });

  const center = new THREE.Vector3();
  trackPos(ev.s, ev.lat, center);
  ev.wx = center.x; ev.wz = center.z;
  buildEventVisuals(ev, m);
  activeEvent = ev;
  state.eventsDone++;
  playEventSound(type);
  updateEliminatedBadge();

  const names = victims.map(p => p.name);
  const shown = names.slice(0, 6).join(', ') + (names.length > 6 ? ` y ${names.length - 6} más` : '');
  ev.shown = shown;
  ev.pipNames = names.length <= 3 ? shown : `${names.length} caballos • nombres abajo ⬇`;
  showEventPip(def.icon, def.title, `🎯 En la mira: ${ev.pipNames}`);
  crawlPush(`${def.icon} ${def.title}`, 'headline');
  markReplayEvent(`${def.icon} ${def.title}`);
  const hitsLeader = victims.some(p => p.rank === 1);
  const lead = hitsLeader ? '¡CAE EL PUNTERO! ' : ev.onLeaders ? '¡GOLPE A LOS PRIMEROS LUGARES! ' : '';
  announceTicker(`${def.icon} ${lead}${def.title} Fuera: ${shown}`, true);
}

// ---------------- Visuales de cada evento ----------------
function addMesh(ev, key, mesh) {
  ev.meshes[key] = mesh;
  eventGroup.add(mesh);
  return mesh;
}

// Platillo volador detallado: casco torneado, anillo de luces giratorio, cabina con alienígena
function buildUfoModel() {
  const ufo = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xc9d3e0, metalness: 0.35, roughness: 0.28, emissive: 0x1e293b, emissiveIntensity: 0.25 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.4, roughness: 0.35 });
  // Casco principal (perfil torneado)
  const prof = [[0, -1.0], [1.4, -0.96], [2.8, -0.72], [4.2, -0.3], [5.1, 0.0], [4.4, 0.3], [3.2, 0.62], [2.0, 0.84], [0, 0.9]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  ufo.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 56), hullMat));
  // Franja decorativa superior
  const band = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.07, 6, 56), darkMat);
  band.rotation.x = Math.PI / 2; band.position.y = 0.6;
  ufo.add(band);

  // Anillo ecuatorial con luces (gira)
  const spinner = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.08, 0.17, 8, 72), darkMat);
  rim.rotation.x = Math.PI / 2;
  spinner.add(rim);
  const lights = [];
  const lightGeo = new THREE.SphereGeometry(0.24, 10, 8);
  const lightCols = [0xfde047, 0x4ade80, 0x22d3ee, 0xf472b6];
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const l = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: lightCols[k % 4] }));
    l.position.set(Math.cos(a) * 5.08, 0.02, Math.sin(a) * 5.08);
    spinner.add(l); lights.push(l);
  }
  // Ventanillas en la parte superior del casco
  const winGeo = new THREE.BoxGeometry(0.75, 0.16, 0.34);
  const winMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const w = new THREE.Mesh(winGeo, winMat);
    w.position.set(Math.cos(a) * 3.9, 0.42, Math.sin(a) * 3.9);
    w.rotation.y = -a + Math.PI / 2;
    w.rotation.x = 0.28;
    spinner.add(w);
  }
  ufo.add(spinner);

  // Parte inferior: motor brillante y patas de aterrizaje
  const engineRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.2, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  engineRing.rotation.x = Math.PI / 2; engineRing.position.y = -0.98;
  ufo.add(engineRing);
  const engineCore = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32),
    new THREE.MeshBasicMaterial({ color: 0xa7f3d0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  engineCore.rotation.x = Math.PI / 2; engineCore.position.y = -1.0;
  ufo.add(engineCore);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6), darkMat);
    leg.position.set(Math.cos(a) * 2.9, -1.05, Math.sin(a) * 2.9);
    leg.rotation.z = Math.cos(a) * 0.35; leg.rotation.x = -Math.sin(a) * 0.35;
    ufo.add(leg);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10), darkMat);
    pad.position.set(Math.cos(a) * 3.08, -1.5, Math.sin(a) * 3.08);
    ufo.add(pad);
  }

  // Cabina: cúpula de cristal con un alienígena pilotando
  const cabin = new THREE.Group();
  cabin.position.y = 0.82;
  const alienMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.55, emissive: 0x14532d, emissiveIntensity: 0.25 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.1, metalness: 0.4 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 0.8, 12), alienMat);
  torso.position.y = 0.35; cabin.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 18, 14), alienMat);
  head.scale.set(1, 1.18, 0.95); head.position.y = 1.15; cabin.add(head);
  for (const sd of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), eyeMat);
    eye.scale.set(0.75, 1.35, 0.5); eye.position.set(sd * 0.24, 1.2, 0.48); eye.rotation.z = sd * 0.45;
    cabin.add(eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5), alienMat);
    ant.position.set(sd * 0.22, 1.82, 0); ant.rotation.z = -sd * 0.35; cabin.add(ant);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
    bulb.position.set(sd * 0.3, 2.03, 0); cabin.add(bulb);
  }
  const consoleM = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.4), darkMat);
  consoleM.position.set(0, 0.35, 0.85); consoleM.rotation.x = -0.4; cabin.add(consoleM);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(2.0, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x99f6e4, transparent: true, opacity: 0.32, metalness: 0.2, roughness: 0.02, emissive: 0x0e7490, emissiveIntensity: 0.35, depthWrite: false }));
  cabin.add(glass);
  ufo.add(cabin);
  const domeRing = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.12, 8, 48), darkMat);
  domeRing.rotation.x = Math.PI / 2; domeRing.position.y = 0.84;
  ufo.add(domeRing);
  // Antena con baliza
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 6), darkMat);
  mast.position.y = 3.2; ufo.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  beacon.position.y = 3.7; ufo.add(beacon);

  ufo.userData = { lights, spinner, cabin, engineRing, engineCore, beacon };
  return ufo;
}

// Águila gigante con alas articuladas
function buildEagleModel() {
  const eagle = new THREE.Group();
  const brown = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b1a0e, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), brown);
  body.scale.set(0.95, 0.85, 2.1); eagle.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), white);
  head.scale.set(0.95, 0.9, 1.35); head.position.set(0, 0.5, 2.0); eagle.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.95, 10), yellow);
  beak.rotation.x = Math.PI / 2 + 0.35; beak.position.set(0, 0.4, 3.0); eagle.add(beak);
  for (const sd of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), black);
    eye.position.set(sd * 0.4, 0.78, 2.6); eagle.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.2), dark);
    brow.position.set(sd * 0.38, 0.92, 2.62); brow.rotation.z = sd * 0.4; eagle.add(brow);
  }
  // Alas con forma de pluma (hombro + punta articuladas)
  const wingGeo = (pts, sd) => {
    // ala izquierda: forma en espejo (se refleja el contorno, no la malla, para no invertir normales)
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * sd, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
    g.rotateX(Math.PI / 2);          // forma en el plano horizontal, "adelante" = +z
    return g;
  };
  const innerPts = [[0, 0.95], [1.2, 1.08], [2.4, 1.02], [3.5, 0.85], [3.5, -1.05], [2.9, -1.3], [2.3, -1.05], [1.7, -1.38], [1.0, -1.1], [0.4, -1.32], [0, -0.95]];
  const outerPts = [[-0.1, 0.85], [1.0, 0.65], [2.0, 0.25], [2.9, -0.3], [3.4, -0.75], [2.9, -0.88], [2.6, -0.75], [2.3, -1.18], [1.9, -0.9], [1.5, -1.32], [1.1, -1.0], [0.6, -1.38], [0.2, -1.05], [-0.1, -1.05]];
  const wingBrown = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85, side: THREE.DoubleSide });
  const wingDark = new THREE.MeshStandardMaterial({ color: 0x2b1a0e, roughness: 0.9, side: THREE.DoubleSide });
  const wings = [];
  for (const sd of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sd * 0.7, 0.35, 0.1);
    pivot.add(new THREE.Mesh(wingGeo(innerPts, sd), wingBrown));
    const outer = new THREE.Group(); outer.position.x = sd * 3.45; pivot.add(outer);
    outer.add(new THREE.Mesh(wingGeo(outerPts, sd), wingDark));
    eagle.add(pivot);
    wings.push({ pivot, outer, sd });
  }
  // Cola en abanico
  for (let k = -1; k <= 1; k++) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 1.8), white);
    tail.position.set(k * 0.45, 0.05, -2.6); tail.rotation.y = k * 0.3;
    eagle.add(tail);
  }
  // Garras
  for (const sd of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 1.0, 6), yellow);
    leg.position.set(sd * 0.4, -0.95, 0.4); eagle.add(leg);
    for (let k = -1; k <= 1; k++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 5), black);
      claw.position.set(sd * 0.4 + k * 0.12, -1.55, 0.5); claw.rotation.x = Math.PI + 0.5;
      eagle.add(claw);
    }
  }
  eagle.scale.setScalar(1.15);
  eagle.userData = { wings };
  return eagle;
}

function buildEventVisuals(ev, m) {
  const additive = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  if (ev.type === 'ufo') {
    const ufo = buildUfoModel();
    ufo.position.set(ev.wx, 48, ev.wz);
    addMesh(ev, 'ufo', ufo);
    // Rayo tractor: cono exterior, núcleo, anillos que suben y mancha de luz en el suelo
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 5.8, 9.6, 32, 1, true), additive(0x86efac, 0));
    beam.material.side = THREE.FrontSide;   // si la cámara queda dentro del rayo no se ve todo blanco
    beam.position.set(ev.wx, 4.8, ev.wz);
    addMesh(ev, 'beam', beam);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.4, 9.6, 24, 1, true), additive(0xecfccb, 0));
    core.material.side = THREE.FrontSide;
    core.position.set(ev.wx, 4.8, ev.wz);
    addMesh(ev, 'core', core);
    ev.rings = [];
    for (let k = 0; k < 4; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 48), additive(0xbbf7d0, 0));
      ring.rotation.x = Math.PI / 2;
      addMesh(ev, 'ring' + k, ring);
      ev.rings.push(ring);
    }
    const spot = new THREE.Mesh(new THREE.CircleGeometry(6.2, 40), additive(0x4ade80, 0));
    spot.rotation.x = -Math.PI / 2; spot.position.set(ev.wx, 0.07, ev.wz);
    addMesh(ev, 'spot', spot);
  } else if (ev.type === 'meteor') {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 1), new THREE.MeshStandardMaterial({ color: 0x3f1d0b, emissive: 0xea580c, emissiveIntensity: 0.8, roughness: 0.9, flatShading: true }));
    addMesh(ev, 'rock', rock);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), additive(0xf97316, 0.45));
    addMesh(ev, 'glow', glow);
    const f = trackFrame(ev.s);
    ev.from = new THREE.Vector3(ev.wx - f.tx * 45 + f.nx * 20, 75, ev.wz - f.tz * 45 + f.nz * 20);
    rock.position.copy(ev.from); glow.position.copy(ev.from);
  } else if (ev.type === 'tornado') {
    const tw = new THREE.Group();
    const layers = [];
    for (let k = 0; k < 4; k++) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(5.5 - k * 0.6, 0.6 + k * 0.25, 16 - k * 1.5, 20, 6, true),
        new THREE.MeshStandardMaterial({ color: k % 2 ? 0x94a3b8 : 0x64748b, transparent: true, opacity: 0.38 - k * 0.04, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
      cone.position.y = (16 - k * 1.5) / 2;
      tw.add(cone); layers.push(cone);
    }
    tw.userData.layers = layers;
    addMesh(ev, 'tornado', tw);
  } else if (ev.type === 'lightning') {
    const cloud = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x374151, transparent: true, opacity: 0, roughness: 1 }));
      puff.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 8);
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set(ev.wx, 32, ev.wz);
    addMesh(ev, 'cloud', cloud);
    // Rayo zigzagueante hecho de segmentos
    const bolt = new THREE.Group();
    let px = 0, py = 31, pz = 0;
    const boltMat = additive(0xe0f2fe, 1);
    for (let k = 0; k < 10; k++) {
      const nx = k === 9 ? 0 : (Math.random() - 0.5) * 3.5, ny = py - 3.1, nz = k === 9 ? 0 : (Math.random() - 0.5) * 3.5;
      const len = Math.hypot(nx - px, ny - py, nz - pz);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, len, 5), boltMat);
      seg.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      seg.lookAt(nx, ny, nz); seg.rotateX(Math.PI / 2);
      bolt.add(seg);
      px = nx; py = ny; pz = nz;
    }
    bolt.position.set(ev.wx, 0, ev.wz);
    bolt.visible = false;
    addMesh(ev, 'bolt', bolt);
  } else if (ev.type === 'boulder') {
    // Roca irregular (deformación continua: sin grietas entre caras)
    const geo = new THREE.DodecahedronGeometry(3.0, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const f = 1 + 0.13 * Math.sin(x * 1.7 + y * 2.3) * Math.cos(z * 1.9 - y * 0.7) + 0.06 * Math.sin(z * 3.1 + x * 0.9);
      pos.setXYZ(i, x * f, y * f * 0.92, z * f);
    }
    geo.computeVertexNormals();
    const roll = new THREE.Group();
    const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a817c, roughness: 0.95, flatShading: true }));
    rock.castShadow = true;
    roll.add(rock);
    // Manchas de musgo
    for (let k = 0; k < 5; k++) {
      const moss = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.5, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4d6b2f, roughness: 1, flatShading: true }));
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * 2.4;
      moss.position.set(Math.cos(a) * 2.5, b, Math.sin(a) * 2.5);
      moss.scale.set(1, 0.4, 1); moss.lookAt(0, 0, 0);
      rock.add(moss);
    }
    roll.userData.rock = rock;
    roll.scale.setScalar(0.01);
    addMesh(ev, 'boulder', roll);
  } else if (ev.type === 'balloons') {
    // Un racimo de globos por víctima: caen del cielo, se enganchan y se lo llevan volando
    const sphere = new THREE.SphereGeometry(0.55, 14, 10);
    const knot = new THREE.ConeGeometry(0.1, 0.18, 6);
    const cols = [0xef4444, 0xf59e0b, 0xfde047, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899, 0x06b6d4];
    ev.bunches = [];
    ev.victims.forEach((p, i) => {
      const g = new THREE.Group();
      const n = 4 + (i % 3);
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
        const rr = 0.55 + Math.random() * 0.35;
        const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr, by = 2.5 + Math.random() * 1.0;
        const col = cols[(i * 3 + k) % cols.length];
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.05, emissive: col, emissiveIntensity: 0.12 });
        const b = new THREE.Mesh(sphere, mat);
        b.scale.set(1, 1.2, 1); b.position.set(bx, by, bz);
        g.add(b);
        const kn = new THREE.Mesh(knot, mat);
        kn.position.set(bx, by - 0.68, bz); kn.rotation.x = Math.PI;
        g.add(kn);
        pts.push(0, 0, 0, bx, by - 0.75, bz);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xf1f5f9 })));
      g.userData.sway = Math.random() * 6;
      g.visible = false;
      addMesh(ev, 'bunch' + i, g);
      ev.bunches.push(g);
    });
  } else if (ev.type === 'freeze') {
    // Escarcha en el suelo y un bloque de hielo por víctima
    const frost = new THREE.Mesh(new THREE.CircleGeometry(10, 48), new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0, depthWrite: false }));
    frost.rotation.x = -Math.PI / 2; frost.position.set(ev.wx, 0.06, ev.wz);
    addMesh(ev, 'frost', frost);
    const cloud = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3.5 + Math.random() * 2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0, roughness: 1 }));
      puff.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 8);
      puff.scale.y = 0.5;
      cloud.add(puff);
    }
    cloud.position.set(ev.wx, 22, ev.wz);
    addMesh(ev, 'cloud', cloud);
    const boxGeo = new THREE.BoxGeometry(3.0, 3.1, 1.6);
    const edgeGeo = new THREE.EdgesGeometry(boxGeo);
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.15, emissive: 0x0c4a6e, emissiveIntensity: 0.3, depthWrite: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xf0f9ff, transparent: true, opacity: 0.85 });
    ev.blocks = [];
    ev.victims.forEach((p, i) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(boxGeo, iceMat));
      g.add(new THREE.LineSegments(edgeGeo, edgeMat));
      g.visible = false;
      addMesh(ev, 'ice' + i, g);
      ev.blocks.push(g);
    });
  } else if (ev.type === 'eagle') {
    const eagle = buildEagleModel();
    addMesh(ev, 'eagle', eagle);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(2.4, 0.9, 1);
    addMesh(ev, 'shadow', shadow);
    ev.ep = new THREE.Vector3(); ev.epPrev = null;
  } else if (ev.type === 'sinkhole') {
    // Hoyo negro que se abre en el suelo, con borde de tierra removida
    const hole = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), new THREE.MeshBasicMaterial({ color: 0x050302, transparent: true, opacity: 0.97, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(ev.wx, 0.07, ev.wz); hole.scale.setScalar(0.01);
    addMesh(ev, 'hole', hole);
    const inner = new THREE.Mesh(new THREE.RingGeometry(5.2, 7.5, 48), new THREE.MeshBasicMaterial({ color: 0x2a1a0f, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    inner.rotation.x = -Math.PI / 2; inner.position.set(ev.wx, 0.08, ev.wz); inner.scale.setScalar(0.01);
    addMesh(ev, 'inner', inner);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.55, 8, 48), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1, flatShading: true }));
    rim.rotation.x = Math.PI / 2; rim.position.set(ev.wx, 0.1, ev.wz); rim.scale.setScalar(0.01);
    addMesh(ev, 'rim', rim);
  } else if (ev.type === 'tsunami') {
    // Muro de agua con cresta de espuma que cruza la pista de lado a lado
    const wave = new THREE.Group();
    const water = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0.1, emissive: 0x075985, emissiveIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const foam = new THREE.MeshStandardMaterial({ color: 0xf0f9ff, roughness: 0.6, emissive: 0xe0f2fe, emissiveIntensity: 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(17, 4.6, 3.2), water);
    body.position.y = 2.3; wave.add(body);
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 17, 20), water);
    crest.rotation.z = Math.PI / 2; crest.position.y = 4.6; wave.add(crest);
    const crestFoam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 17.4, 12), foam);
    crestFoam.rotation.z = Math.PI / 2; crestFoam.position.y = 6.1; wave.add(crestFoam);
    wave.userData.crest = crest; wave.userData.foam = crestFoam;
    wave.scale.setScalar(0.01);
    addMesh(ev, 'wave', wave);
  } else if (ev.type === 'bees') {
    // Enjambre: muchas abejas pequeñas (cuerpo amarillo, franjas negras, alas)
    const swarm = new THREE.Group();
    const bodyGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const stripeGeo = new THREE.TorusGeometry(0.135, 0.035, 4, 10);
    const wingGeo = new THREE.CircleGeometry(0.13, 8);
    const yellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, emissive: 0x713f12, emissiveIntensity: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    ev.bees = [];
    for (let k = 0; k < 70; k++) {
      const bee = new THREE.Group();
      const b = new THREE.Mesh(bodyGeo, yellow); b.scale.set(1, 0.85, 1.5); bee.add(b);
      for (const z of [-0.05, 0.08]) { const s = new THREE.Mesh(stripeGeo, black); s.position.z = z; bee.add(s); }
      const wings = [];
      for (const sd of [-1, 1]) {
        const w = new THREE.Mesh(wingGeo, wingMat);
        w.position.set(sd * 0.14, 0.12, 0); w.rotation.x = -Math.PI / 2;
        bee.add(w); wings.push(w);
      }
      bee.scale.setScalar(1.6);
      bee.userData = { wings, ph: Math.random() * Math.PI * 2, r: 1.2 + Math.random() * 3.2, h: Math.random() * 2.6, sp: 2.5 + Math.random() * 3, dir: Math.random() < 0.5 ? 1 : -1 };
      swarm.add(bee); ev.bees.push(bee);
    }
    addMesh(ev, 'swarm', swarm);
    ev.swarmPos = new THREE.Vector3(ev.wx, 18, ev.wz);
  } else if (ev.type === 'bananas') {
    // Una cáscara por víctima, en el lugar donde la va a pisar
    const peelMat = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.55, emissive: 0x854d0e, emissiveIntensity: 0.15, side: THREE.DoubleSide });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x422006, roughness: 0.8 });
    const armGeo = new THREE.CylinderGeometry(0.06, 0.16, 0.85, 6);
    const stemGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.3, 6);
    ev.peels = [];
    ev.victims.forEach((p, i) => {
      const g = new THREE.Group();
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), peelMat);
      center.scale.y = 0.6; center.position.y = 0.12; g.add(center);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        const arm = new THREE.Mesh(armGeo, peelMat);
        arm.position.set(Math.cos(a) * 0.4, 0.08, Math.sin(a) * 0.4);
        arm.rotation.set(0, -a, Math.PI / 2 - 0.25);
        arm.rotateY(Math.PI / 2);
        g.add(arm);
      }
      const stem = new THREE.Mesh(stemGeo, tipMat); stem.position.y = 0.32; g.add(stem);
      g.scale.setScalar(1.7);
      g.rotation.y = Math.random() * Math.PI * 2;
      // Lugar donde estará el caballo cuando lo alcance
      trackPos(p.x + Math.max(4, p.speed || p.baseSpeed) * p.doomed.at, p.z, evTmp);
      g.userData = { x: evTmp.x, z: evTmp.z, delay: Math.max(0, p.doomed.at - 0.5) * 0.5 };   // cae justo antes de que el caballo la pise
      g.position.set(evTmp.x, 12, evTmp.z);
      g.visible = false;
      addMesh(ev, 'peel' + i, g);
      ev.peels.push(g);
    });
  } else if (ev.type === 'train') {
    buildTrainVisuals(ev, m);
  } else if (ev.type === 'lava') {
    // Una bola de lava por víctima, que cae justo donde va a estar el caballo
    ev.balls = [];
    const geo = new THREE.IcosahedronGeometry(0.75, 1);
    ev.victims.forEach((p, i) => {
      const ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7c2d12, emissive: 0xf97316, emissiveIntensity: 1.1, roughness: 0.8, flatShading: true }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), additive(0xfb923c, 0.4));
      ball.visible = glow.visible = false;
      addMesh(ev, 'ball' + i, ball); addMesh(ev, 'glow' + i, glow);
      const at = p.doomed.at;
      trackPos(p.x + Math.max(4, p.speed || p.baseSpeed) * at, p.z, evTmp);
      const to = new THREE.Vector3(evTmp.x, 0.7, evTmp.z);
      const f = trackFrame(p.x);
      const from = new THREE.Vector3(to.x - f.nx * (25 + Math.random() * 10) + (Math.random() - 0.5) * 12, 45, to.z - f.nz * (25 + Math.random() * 10) + (Math.random() - 0.5) * 12);
      ev.balls.push({ ball, glow, from, to, at, hit: false });
    });
  } else if (ev.type === 'magnet') {
    const mag = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.3 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.2, metalness: 0.9 });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.6, 14, 28, Math.PI), red);
    arc.position.y = 1.6; mag.add(arc);
    for (const sd of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 1.2), red); leg.position.set(sd * 2.2, 0.75, 0); mag.add(leg);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.6, 1.24), steel); tip.position.set(sd * 2.2, -0.35, 0); mag.add(tip);
    }
    mag.position.set(ev.wx, 40, ev.wz);
    mag.rotation.y = trackFrame(ev.s).heading;
    addMesh(ev, 'magnet', mag);
    ev.fieldRings = [];
    for (let k = 0; k < 4; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), additive(0x60a5fa, 0));
      ring.rotation.x = Math.PI / 2;
      addMesh(ev, 'field' + k, ring);
      ev.fieldRings.push(ring);
    }
    ev.mag = new THREE.Vector3(ev.wx, 40, ev.wz);
  } else if (ev.type === 'piano') {
    // Un piano de cola por víctima: cae del cielo con su sombra creciendo en el suelo
    ev.pianos = [];
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.15, metalness: 0.2 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    ev.victims.forEach((p, i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 1.7), black); body.position.y = 1.25; g.add(body);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.75, 20, 1, false, 0, Math.PI), black);
      tail.rotation.y = Math.PI / 2; tail.position.set(-1.1, 1.25, 0); g.add(tail);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 1.6), black); lid.position.set(-0.3, 1.95, 0.25); lid.rotation.x = -0.6; g.add(lid);
      const keys = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 1.6), white); keys.position.set(1.25, 1.45, 0); g.add(keys);
      for (let k = 0; k < 7; k++) {
        const bk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.09), black);
        bk.position.set(1.2, 1.51, -0.7 + k * 0.23); g.add(bk);
      }
      for (const [lx, lz] of [[1.0, 0.7], [1.0, -0.7], [-1.4, 0]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.9, 8), black); leg.position.set(lx, 0.45, lz); g.add(leg);
      }
      const at = p.doomed.at;
      trackPos(p.x + Math.max(4, p.speed || p.baseSpeed) * at, p.z, evTmp);
      g.position.set(evTmp.x, 40, evTmp.z);
      g.rotation.y = Math.random() * Math.PI * 2;
      g.visible = false;
      addMesh(ev, 'piano' + i, g);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(evTmp.x, 0.07, evTmp.z);
      addMesh(ev, 'pshadow' + i, shadow);
      ev.pianos.push({ g, shadow, x: evTmp.x, z: evTmp.z, at, hit: false });
    });
  } else if (ev.type === 'portal') {
    // Portal vertical de frente a los caballos, en el lugar al que van a llegar
    const f = trackFrame(ev.s);
    const portal = new THREE.Group();
    portal.position.set(ev.wx, 3.3, ev.wz);
    portal.rotation.y = Math.atan2(f.tx, f.tz);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.32, 12, 56), new THREE.MeshBasicMaterial({ color: 0xc084fc }));
    portal.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.1, 8, 56), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
    portal.add(ring2);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.0, 48), additive(0x7c3aed, 0.75));
    portal.add(disc);
    const swirl = new THREE.Mesh(new THREE.RingGeometry(0.4, 2.9, 48, 1, 0, Math.PI * 1.4), additive(0x22d3ee, 0.45));
    portal.add(swirl);
    const swirl2 = new THREE.Mesh(new THREE.RingGeometry(0.8, 2.4, 48, 1, Math.PI, Math.PI * 1.2), additive(0xf0abfc, 0.4));
    portal.add(swirl2);
    portal.userData = { ring, ring2, disc, swirl, swirl2 };
    portal.scale.setScalar(0.01);
    addMesh(ev, 'portal', portal);
  }
}

// Tren: rieles que cruzan la pista, barreras con luces y una locomotora a vapor con tres vagones
function buildTrainVisuals(ev, m) {
  const f = trackFrame(ev.s);
  const rotY = Math.atan2(-f.nz, f.nx);   // eje local x = dirección del tren (de lado a lado de la pista)
  const railLen = (ev.lat1 - ev.lat0) + 40;
  const rails = new THREE.Group();
  trackPos(ev.s, (ev.lat0 + ev.lat1) / 2, evTmp);
  rails.position.set(evTmp.x, 0, evTmp.z);
  rails.rotation.y = rotY;
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 1 });
  for (const sd of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(railLen, 0.1, 0.1), steel);
    rail.position.set(0, 0.12, sd * 0.62); rails.add(rail);
  }
  const sleeperGeo = new THREE.BoxGeometry(0.28, 0.07, 1.9);
  for (let x = -railLen / 2; x <= railLen / 2; x += 1.1) {
    const sl = new THREE.Mesh(sleeperGeo, wood); sl.position.set(x, 0.05, 0); rails.add(sl);
  }
  rails.scale.set(1, 1, 0.01);
  addMesh(ev, 'rails', rails);

  // Barreras con luces rojas a los dos lados de la pista
  ev.crossLights = [];
  for (const sd of [-1, 1]) {
    const post = new THREE.Group();
    trackPos(ev.s - 2.2, sd * (m.halfWidth + 1.4), evTmp);
    post.position.set(evTmp.x, 0, evTmp.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 8), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
    pole.position.y = 1.5; post.add(pole);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 1.4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    sign.position.y = 2.7; sign.rotation.y = rotY; post.add(sign);
    for (const k of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      light.position.set(0, 2.2, 0); light.translateOnAxis(new THREE.Vector3(Math.cos(rotY + Math.PI / 2), 0, -Math.sin(rotY + Math.PI / 2)), k * 0.3);
      post.add(light); ev.crossLights.push({ light, k });
    }
    addMesh(ev, 'xing' + sd, post);
  }

  // Tren
  const train = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.8 });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 16);
  const addWheel = (x, r = 0.42) => {
    for (const sd of [-1, 1]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, black); tire.rotation.x = Math.PI / 2; tire.scale.set(r / 0.42, 1, r / 0.42); w.add(tire);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, 0.08, 0.18), paint); w.add(spoke);
      w.position.set(x, r, sd * 0.78);
      train.add(w); wheels.push(w);
    }
  };
  const box = (sx, sy, sz, mat, x, y, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); b.position.set(x, y, z); b.castShadow = true; train.add(b); return b; };
  // Locomotora (la punta en x = 0)
  box(4.4, 0.35, 1.5, black, -1.7, 0.65);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 2.6, 18), black);
  boiler.rotation.z = Math.PI / 2; boiler.position.set(-0.75, 1.45, 0); boiler.castShadow = true; train.add(boiler);
  for (const bx of [-1.6, -0.75, 0.1]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 18), gold);
    band.rotation.z = Math.PI / 2; band.position.set(bx, 1.45, 0); train.add(band);
  }
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.9, 12), black);
  chimney.position.set(0.05, 2.5, 0); train.add(chimney);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), gold); dome.position.set(-1.0, 2.2, 0); train.add(dome);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfef9c3 }));
  lamp.position.set(0.6, 1.95, 0); train.add(lamp);
  const catcher = box(0.6, 0.45, 1.5, new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.6, roughness: 0.4 }), 0.5, 0.45);
  catcher.rotation.z = -0.55;
  box(1.5, 1.6, 1.6, paint, -2.95, 1.65);                       // cabina
  box(1.8, 0.14, 1.8, black, -2.95, 2.5);                       // techo
  for (const sd of [-1, 1]) box(0.6, 0.5, 0.03, windowMat, -2.85, 1.95, sd * 0.81);
  addWheel(-0.45); addWheel(-1.45); addWheel(-2.45, 0.55);
  // Vagones
  const colors = [0x15803d, 0x1d4ed8, 0xca8a04];
  for (let k = 0; k < 3; k++) {
    const x0 = -4.25 - k * 3.55;
    const mat = new THREE.MeshStandardMaterial({ color: colors[k], roughness: 0.5 });
    box(0.4, 0.15, 0.2, black, x0 + 0.1, 0.75);                  // enganche
    box(3.2, 0.3, 1.45, black, x0 - 1.7, 0.65);
    box(3.1, 1.45, 1.45, mat, x0 - 1.7, 1.5);
    box(3.3, 0.14, 1.65, black, x0 - 1.7, 2.3);
    for (const sd of [-1, 1]) for (let w = 0; w < 3; w++) box(0.55, 0.45, 0.03, windowMat, x0 - 0.75 - w * 0.95, 1.7, sd * 0.74);
    addWheel(x0 - 0.65); addWheel(x0 - 2.75);
  }
  ev.trainLen = 4.25 + 3 * 3.55;
  train.rotation.y = rotY;
  train.userData = { wheels };
  trackPos(ev.s, ev.lat0, evTmp);
  train.position.set(evTmp.x, 0, evTmp.z);
  addMesh(ev, 'train', train);
}

// ---------------- Animación de eventos (tiempo de simulación) ----------------
const evTmp = new THREE.Vector3();
function updateEvents(simDt) {
  const ev = activeEvent;
  if (!ev || simDt <= 0) return;
  ev.t += simDt;
  const t = ev.t;
  if (!ev.fixed) {
    ev.s = ev.s0 + ev.v * Math.min(t, ev.tStop);
    const c = new THREE.Vector3();
    trackPos(ev.s, ev.lat, c);
    ev.wx = c.x; ev.wz = c.z;
  }
  // El águila se mueve antes de capturar (las víctimas se enganchan a sus garras)
  if (ev.type === 'eagle') updateEagle(ev, simDt);
  for (const p of ev.victims) if (p.doomed && t >= p.doomed.at) captureVictim(p, ev);
  if (!ev.subDone && ev.victims.every(p => !p.doomed)) {
    ev.subDone = true;
    const n = ev.victims.length;
    document.getElementById('event-pip-sub').textContent = `✖ ${n === 1 ? 'Eliminado' : `Eliminados (${n})`}: ${ev.pipNames}`;
  }
  emitDX = 1; emitDZ = 0;   // partículas en coordenadas de mundo
  const M = ev.meshes;

  if (ev.type === 'ufo') {
    const ufo = M.ufo, U = ufo.userData;
    const HOVER = 10.5;
    if (t < 3.7) { ufo.position.x = ev.wx; ufo.position.z = ev.wz; }
    if (t < 1) ufo.position.y = 48 - (48 - HOVER) * (1 - Math.pow(1 - t, 3));
    else if (t < 3.7) ufo.position.y = HOVER + Math.sin(t * 3) * 0.3;
    else { const k = t - 3.7; ufo.position.y = HOVER + k * k * 30; ufo.position.x = ev.wx + k * k * 25; }
    // Bamboleo, anillo giratorio, luces en secuencia y motor pulsante
    ufo.rotation.z = Math.sin(t * 2.1) * 0.07 + (t > 3.7 ? -0.25 : 0);
    ufo.rotation.x = Math.cos(t * 1.7) * 0.06;
    U.spinner.rotation.y += simDt * 2.8;
    U.cabin.rotation.y = Math.sin(t * 1.3) * 0.9;
    const step = Math.floor(t * 14);
    U.lights.forEach((l, i) => { l.visible = ((i + step) % 5) !== 0; });
    U.beacon.visible = Math.sin(t * 9) > 0;
    const beamOn = (t > 1 && t < 3.7) ? 1 : 0;
    U.engineRing.material.opacity = 0.55 + 0.35 * Math.sin(t * 10) + beamOn * 0.1;
    U.engineCore.material.opacity = 0.45 + 0.3 * Math.sin(t * 13) + beamOn * 0.25;
    const fadeTo = (mat, target, rate) => { mat.opacity += (target - mat.opacity) * Math.min(1, simDt * rate); };
    for (const k of ['beam', 'core', 'spot']) { M[k].position.x = ev.wx; M[k].position.z = ev.wz; }
    fadeTo(M.beam.material, beamOn ? 0.26 + Math.sin(t * 12) * 0.07 : 0, 6);
    fadeTo(M.core.material, beamOn ? 0.3 + Math.sin(t * 17) * 0.1 : 0, 6);
    fadeTo(M.spot.material, beamOn ? 0.4 : 0, 5);
    ev.rings.forEach((ring, i) => {
      const ph = (t * 0.9 + i / ev.rings.length) % 1;
      ring.position.set(ev.wx, ph * 9.6, ev.wz);
      ring.scale.setScalar(5.8 + (1.4 - 5.8) * ph);
      ring.material.opacity = beamOn * 0.55 * Math.sin(ph * Math.PI);
    });
    if (beamOn && Math.random() < simDt * 40) {
      firePool.spawn(ev.wx + (Math.random() - 0.5) * 7, 0.3, ev.wz + (Math.random() - 0.5) * 7, 0, 4 + Math.random() * 3, 0, 1.2, 0.25, 0.05, 0.6, 1, 0.7, 0.2, 0.9, 0.5, 0.8, 0, 0);
    }
  } else if (ev.type === 'meteor') {
    const fall = Math.min(1, t / 1.1);
    if (!ev.impact) {
      const p = ev.from.clone().lerp(new THREE.Vector3(ev.wx, 0.8, ev.wz), fall * fall);
      M.rock.position.copy(p); M.glow.position.copy(p);
      M.rock.rotation.x += simDt * 6; M.rock.rotation.y += simDt * 4;
      for (let k = 0; k < 6; k++) {
        firePool.spawn(p.x + (Math.random() - 0.5) * 1.5, p.y + (Math.random() - 0.5) * 1.5, p.z + (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2,
          0.6, 1.8, 0.3, 1, 0.8, 0.3, 0.9, 0.15, 0.02, 0.9, 0, 0.5);
      }
      if (fall >= 1) {
        ev.impact = true;
        M.rock.visible = false;
        audioEngine.playBoom();
        flashScreen();
        for (let k = 0; k < 160; k++) {
          const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 16;
          firePool.spawn(ev.wx, 0.6, ev.wz, Math.cos(a) * sp, 4 + Math.random() * 14, Math.sin(a) * sp, 0.6 + Math.random() * 0.6, 0.9, 0.2, 1, 0.85, 0.4, 0.8, 0.1, 0.02, 1, -12, 0.8);
        }
        for (let k = 0; k < 60; k++) {
          const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
          smokePool.spawn(ev.wx, 0.8, ev.wz, Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp, 1.6 + Math.random(), 1.5, 5, 0.3, 0.25, 0.22, 0.55, 0.5, 0.46, 0.55, 0, 1.2);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 8, 48), new THREE.MeshBasicMaterial({ color: 0xfdba74, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(ev.wx, 0.4, ev.wz);
        addMesh(ev, 'ring', ring);
        const crater = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 1, transparent: true, opacity: 0.85 }));
        crater.rotation.x = -Math.PI / 2; crater.position.set(ev.wx, 0.04, ev.wz);
        eventGroup.add(crater);   // el cráter queda hasta el final de la carrera
        ev.impactT = t;
      }
    } else {
      const k = t - ev.impactT;
      M.glow.scale.setScalar(1 + k * 6); M.glow.material.opacity = Math.max(0, 0.6 - k * 0.9);
      M.glow.position.y = 1;
      if (M.ring) { M.ring.scale.setScalar(1 + k * 22); M.ring.material.opacity = Math.max(0, 0.9 - k * 1.2); }
    }
  } else if (ev.type === 'tornado') {
    const m = getTrackMetrics();
    const lat = -m.halfWidth - 7 + (2 * m.halfWidth + 14) * Math.min(1, t / (ev.dur * 0.9));
    const c = new THREE.Vector3();
    trackPos(ev.s, lat, c);
    M.tornado.position.set(c.x, 0, c.z);
    M.tornado.userData.layers.forEach((l, i) => { l.rotation.y += simDt * (5 + i * 2); l.scale.x = l.scale.z = 1 + Math.sin(t * 6 + i) * 0.08; });
    ev.curX = c.x; ev.curZ = c.z;
    const fade = t > ev.dur - 0.6 ? Math.max(0, (ev.dur - t) / 0.6) : Math.min(1, t * 2);
    M.tornado.scale.setScalar(Math.max(0.01, fade));
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2;
      smokePool.spawn(c.x + Math.cos(a) * 3, 0.3, c.z + Math.sin(a) * 3, -Math.sin(a) * 8, 2 + Math.random() * 3, Math.cos(a) * 8, 0.8, 0.8, 2.2, 0.6, 0.55, 0.5, 0.75, 0.72, 0.68, 0.45, 0, 1);
    }
  } else if (ev.type === 'lightning') {
    const cloudOp = t < 0.6 ? t / 0.6 * 0.95 : t > ev.dur - 0.8 ? Math.max(0, (ev.dur - t) / 0.8) * 0.95 : 0.95;
    M.cloud.children.forEach(pf => { pf.material.opacity = cloudOp; });
    const strikes = [0.7, 0.95, 1.3];
    M.bolt.visible = strikes.some(s => t >= s && t < s + 0.12);
    M.bolt.rotation.y = t * 7;
    if (!ev.impact && t >= 0.7) {
      ev.impact = true;
      audioEngine.playThunder();
      flashScreen();
      for (let k = 0; k < 70; k++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
        firePool.spawn(ev.wx, 0.8, ev.wz, Math.cos(a) * sp, 3 + Math.random() * 8, Math.sin(a) * sp, 0.4 + Math.random() * 0.4, 0.3, 0.05, 0.8, 0.95, 1, 0.3, 0.5, 1, 1, -10, 0.5);
      }
    }
  } else if (ev.type === 'boulder') {
    const m = getTrackMetrics();
    const R = 3;
    const lat = -m.halfWidth - 7 + (2 * m.halfWidth + 14) * Math.min(1, t / (ev.dur * 0.9));
    const f = trackPos(ev.s, lat, evTmp);
    const bounce = Math.abs(Math.sin(t * 4.5)) * 0.6;
    M.boulder.position.set(evTmp.x, R * 0.92 + bounce, evTmp.z);
    // Rueda hacia el lado opuesto de la pista: gira sobre el eje tangente
    M.boulder.rotation.y = Math.atan2(-f.tz, f.tx);
    const prevLat = ev.prevLat ?? lat; ev.prevLat = lat;
    const sign = (f.nx * -f.tz + f.nz * f.tx) >= 0 ? 1 : -1;
    M.boulder.userData.rock.rotation.x += sign * (lat - prevLat) / R;
    ev.curX = evTmp.x; ev.curZ = evTmp.z;
    const fade = t > ev.dur - 0.5 ? Math.max(0, (ev.dur - t) / 0.5) : Math.min(1, t * 3);
    M.boulder.scale.setScalar(Math.max(0.01, fade));
    // Polvo y piedrecitas al rodar
    if (fade > 0.5) {
      for (let k = 0; k < 3; k++) {
        smokePool.spawn(evTmp.x + (Math.random() - 0.5) * 4, 0.3, evTmp.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3,
          1.1, 1.2, 3.2, 0.55, 0.45, 0.35, 0.7, 0.62, 0.52, 0.5, 0, 1);
      }
      if (bounce < 0.08 && Math.random() < 0.5) {
        for (let k = 0; k < 8; k++) {
          firePool.spawn(evTmp.x, 0.3, evTmp.z, (Math.random() - 0.5) * 8, 3 + Math.random() * 4, (Math.random() - 0.5) * 8, 0.6, 0.25, 0.2, 0.45, 0.4, 0.35, 0.35, 0.3, 0.28, 1, -14, 0.3);
        }
      }
    }
  } else if (ev.type === 'balloons') {
    // Confeti mientras caen los globos
    if (t < 2.2 && Math.random() < simDt * 35) {
      const c = Math.random();
      firePool.spawn(ev.wx + (Math.random() - 0.5) * 12, 9 + Math.random() * 4, ev.wz + (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, -3, (Math.random() - 0.5) * 2,
        1.6, 0.22, 0.2, c, 1 - c, 0.6 + c * 0.4, c, 1 - c, 0.6, 1, 0, 0.6);
    }
    ev.victims.forEach((p, i) => {
      const g = ev.bunches[i];
      if (!g) return;
      const sway = Math.sin(t * 2.3 + g.userData.sway) * 0.18;
      if (p.doomed) {
        trackPos(p.x, p.z, evTmp);
        g.position.set(evTmp.x, 2.2 + Math.max(0, p.doomed.at - t) * 9, evTmp.z);
        g.scale.setScalar(Math.min(1, t * 2));
        g.visible = true;
      } else {
        const o = elimTransform(p);
        g.visible = !!o && o.visible;
        if (o) { g.position.set(o.x, o.y + 2.2 * o.s, o.z); g.scale.setScalar(Math.max(0.01, o.s)); }
      }
      g.rotation.z = sway; g.rotation.x = sway * 0.6;
    });
  } else if (ev.type === 'freeze') {
    const cloudOp = t < 0.5 ? t / 0.5 * 0.85 : t > ev.dur - 0.7 ? Math.max(0, (ev.dur - t) / 0.7) * 0.85 : 0.85;
    M.cloud.children.forEach(pf => { pf.material.opacity = cloudOp; });
    M.frost.material.opacity = t < 0.9 ? (t / 0.9) * 0.55 : t > ev.dur - 0.6 ? Math.max(0, (ev.dur - t) / 0.6) * 0.55 : 0.55;
    M.frost.scale.setScalar(0.3 + 0.7 * Math.min(1, t / 0.9));
    // Ventisca de nieve
    if (t < ev.shatterT) {
      const n = Math.min(12, Math.floor(simDt * 160 + Math.random()));
      for (let k = 0; k < n; k++) {
        smokePool.spawn(ev.wx + (Math.random() - 0.5) * 20, 8 + Math.random() * 10, ev.wz + (Math.random() - 0.5) * 20, 2 + Math.random() * 2, -5 - Math.random() * 3, (Math.random() - 0.5) * 2,
          1.8, 0.28, 0.24, 0.95, 0.97, 1, 0.85, 0.92, 1, 0.9, 0, 0);
      }
    }
    ev.victims.forEach((p, i) => {
      const g = ev.blocks[i];
      if (!g || p.doomed || !p.elim) return;
      const k = t - p.elim.t0;
      g.visible = t < ev.shatterT;
      g.position.set(p.elim.base.x, 1.5, p.elim.base.z);
      g.rotation.y = p.elim.base.heading;
      g.scale.setScalar(Math.max(0.01, Math.min(1, k * 5)));
      if (k < simDt * 1.5 && k >= 0) {
        for (let q = 0; q < 6; q++) firePool.spawn(p.elim.base.x, 1.5, p.elim.base.z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5, 0.5, 0.3, 0.05, 0.8, 0.95, 1, 0.6, 0.85, 1, 1, -6, 0.5);
      }
    });
    if (!ev.shattered && t >= ev.shatterT) {
      ev.shattered = true;
      audioEngine.playShatter();
      for (const p of ev.victims) {
        if (!p.elim) continue;
        for (let q = 0; q < 18; q++) {
          firePool.spawn(p.elim.base.x + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 2.5, p.elim.base.z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 9, 2 + Math.random() * 7, (Math.random() - 0.5) * 9,
            0.9 + Math.random() * 0.4, 0.35, 0.15, 0.75, 0.92, 1, 0.55, 0.8, 1, 1, -14, 0.4);
        }
      }
    }
  } else if (ev.type === 'eagle') {
    const sh = M.shadow;
    sh.position.set(ev.ep.x, 0.06, ev.ep.z);
    sh.rotation.z = -M.eagle.rotation.y;
    sh.material.opacity = Math.max(0, 0.3 - ev.ep.y * 0.012) * Math.min(1, t * 3);
  } else if (ev.type === 'sinkhole') {
    // Se abre (con temblor y polvo), se traga a los caballos y se vuelve a cerrar
    const closeT = Math.min(ev.dur, ev.closeAt ?? Infinity);
    const open = t < 0.8 ? 1 - Math.pow(1 - t / 0.8, 3) : t > closeT - 0.7 ? Math.max(0.01, (closeT - t) / 0.7) : 1;
    for (const k of ['hole', 'inner', 'rim']) M[k].scale.setScalar(Math.max(0.01, open));
    // Mientras está abierto, también caen los que llegan después y pisan el hoyo.
    // Si ya no se puede eliminar a nadie más (mínimo de sobrevivientes), el hoyo se cierra enseguida.
    if (t > 0.5 && t < closeT - 0.7 && ev.closeAt === undefined) {
      const r = 7.5 * open * 0.85;
      const more = sweepIntoEvent(ev, p => {
        if (Math.abs(p.x - ev.s) > r + 2) return false;
        trackPos(p.x + 0.6, p.z, evTmp);
        return Math.hypot(evTmp.x - ev.wx, evTmp.z - ev.wz) < r;
      });
      if (!more) ev.closeAt = t + 0.75;
    }
    if (!ev.impact && t >= 0.15) { ev.impact = true; audioEngine.playBoom(); }
    if (t < 1.6) {
      const n = Math.min(10, Math.floor(simDt * 120 + Math.random()));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, r = 7.5 * open;
        smokePool.spawn(ev.wx + Math.cos(a) * r, 0.3, ev.wz + Math.sin(a) * r, Math.cos(a) * 1.5, 1.5 + Math.random() * 2.5, Math.sin(a) * 1.5,
          1.3, 1.0, 2.8, 0.55, 0.42, 0.3, 0.68, 0.58, 0.46, 0.55, 0, 1);
      }
      if (Math.random() < simDt * 25) {
        const a = Math.random() * Math.PI * 2;
        firePool.spawn(ev.wx + Math.cos(a) * 7 * open, 0.3, ev.wz + Math.sin(a) * 7 * open, -Math.cos(a) * 3, 2 + Math.random() * 3, -Math.sin(a) * 3,
          0.7, 0.22, 0.18, 0.45, 0.35, 0.25, 0.35, 0.28, 0.2, 1, -12, 0.3);
      }
    }
  } else if (ev.type === 'tsunami') {
    const m = getTrackMetrics();
    const lat = -m.halfWidth - 9 + (2 * m.halfWidth + 18) * Math.min(1, t / (ev.dur * 0.9));
    const f = trackPos(ev.s, lat, evTmp);
    const W = M.wave;
    W.position.set(evTmp.x, 0, evTmp.z);
    W.rotation.y = Math.atan2(-f.tz, f.tx);   // a lo largo de la pista, avanzando de lado
    W.userData.crest.rotation.x = Math.sin(t * 5) * 0.08;
    W.userData.foam.position.y = 6.1 + Math.sin(t * 7) * 0.15;
    const fade = t > ev.dur - 0.6 ? Math.max(0, (ev.dur - t) / 0.6) : Math.min(1, t * 2.5);
    W.scale.set(1, Math.max(0.01, fade), 1);
    ev.curX = evTmp.x; ev.curZ = evTmp.z;
    if (!ev.impact && t > 0.2) { ev.impact = true; audioEngine.playWind(); audioEngine.playRumble(); }
    if (fade > 0.3) {
      const n = Math.min(14, Math.floor(simDt * 200 + Math.random()));
      for (let k = 0; k < n; k++) {
        const along = (Math.random() - 0.5) * 17;
        smokePool.spawn(evTmp.x + f.tx * along, 5 + Math.random() * 1.8, evTmp.z + f.tz * along, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3,
          0.9, 0.5, 1.6, 0.95, 0.98, 1, 0.75, 0.88, 0.98, 0.8, -6, 0.8);
        if (k % 3 === 0) firePool.spawn(evTmp.x + f.tx * along, 0.4, evTmp.z + f.tz * along, (Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6,
          0.7, 0.2, 0.08, 0.7, 0.9, 1, 0.3, 0.6, 1, 0.9, -14, 0.3);
      }
    }
  } else if (ev.type === 'bees') {
    // El enjambre baja del cielo, rodea a sus víctimas y las persigue fuera de la pista
    const target = evTmp.set(ev.wx, 2.2, ev.wz);
    let n = 0, sx = 0, sz = 0;
    for (const p of ev.victims) {
      const o = p.elim && !p.doomed ? elimTransform(p) : null;
      if (o && o.visible) { sx += o.x; sz += o.z; n++; }
    }
    if (n) target.set(sx / n, 2.2, sz / n);
    if (t < 1.0) target.y = 2.2 + 16 * Math.pow(1 - t, 2);
    ev.swarmPos.lerp(target, Math.min(1, simDt * (t < 1 ? 6 : 4)));
    const fade = t > ev.dur - 0.5 ? Math.max(0.01, (ev.dur - t) / 0.5) : Math.min(1, t * 3 + 0.05);
    const spread = 1 + Math.min(1, ev.victims.length / 6);
    for (const bee of ev.bees) {
      const u = bee.userData;
      const a = u.ph + t * u.sp * u.dir;
      const x = ev.swarmPos.x + Math.cos(a) * u.r * spread, z = ev.swarmPos.z + Math.sin(a) * u.r * spread;
      const y = ev.swarmPos.y + u.h - 0.6 + Math.sin(t * 5 + u.ph) * 0.5;
      bee.lookAt(x - Math.sin(a) * u.dir, y, z + Math.cos(a) * u.dir);
      bee.position.set(x, y, z);
      bee.scale.setScalar(1.6 * fade);
      const flap = Math.sin(t * 90 + u.ph) * 0.9;
      u.wings[0].rotation.y = flap; u.wings[1].rotation.y = -flap;
    }
    if (!ev.impact && t > 0.6) { ev.impact = true; audioEngine.playBuzz(); }
  } else if (ev.type === 'bananas') {
    ev.peels.forEach(g => {
      const u = g.userData;
      const k = t - u.delay;
      if (k < 0) return;
      g.visible = true;
      const fall = Math.min(1, k / 0.45);
      g.position.set(u.x, 0.05 + 12 * (1 - fall * fall), u.z);
      if (fall < 1) g.rotation.x = (1 - fall) * 6;
      else g.rotation.x = 0;
      if (t > ev.dur - 0.4) g.scale.setScalar(Math.max(0.01, 1.7 * (ev.dur - t) / 0.4));
    });
  } else if (ev.type === 'train') {
    updateTrain(ev, t, simDt);
  } else if (ev.type === 'lava') {
    // Cielo rojizo con brasas y bolas de lava que caen una tras otra
    if (Math.random() < simDt * 30) {
      firePool.spawn(ev.wx + (Math.random() - 0.5) * 24, 12 + Math.random() * 8, ev.wz + (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 2, -4, (Math.random() - 0.5) * 2,
        1.4, 0.3, 0.1, 1, 0.6, 0.1, 0.8, 0.15, 0.02, 0.9, -2, 0.3);
    }
    let booms = 0;
    for (const b of ev.balls) {
      const k = (t - (b.at - 0.9)) / 0.9;
      if (k <= 0 || b.hit) continue;
      if (k < 1) {
        b.ball.visible = b.glow.visible = true;
        const pos = evTmp.copy(b.from).lerp(b.to, k * k);
        b.ball.position.copy(pos); b.glow.position.copy(pos);
        b.ball.rotation.x += simDt * 7; b.ball.rotation.y += simDt * 5;
        for (let q = 0; q < 3; q++) {
          firePool.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2,
            0.5, 1.2, 0.2, 1, 0.75, 0.2, 0.8, 0.1, 0.02, 0.9, 0, 0.5);
        }
      } else {
        b.hit = true;
        b.ball.visible = b.glow.visible = false;
        if (booms++ < 1) audioEngine.playBoom();
        for (let q = 0; q < 40; q++) {
          const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
          firePool.spawn(b.to.x, 0.5, b.to.z, Math.cos(a) * sp, 3 + Math.random() * 7, Math.sin(a) * sp, 0.6 + Math.random() * 0.4, 0.6, 0.15, 1, 0.8, 0.3, 0.8, 0.12, 0.02, 1, -12, 0.6);
        }
        const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 1, transparent: true, opacity: 0.8 }));
        scorch.rotation.x = -Math.PI / 2; scorch.position.set(b.to.x, 0.045, b.to.z);
        eventGroup.add(scorch);   // las quemaduras quedan hasta el final de la carrera
      }
    }
  } else if (ev.type === 'magnet') {
    // Baja del cielo, atrae a los caballos por las herraduras y se va volando con ellos
    const HOVER = 9.5;
    let y;
    if (t < 1.0) y = 40 - (40 - HOVER) * (1 - Math.pow(1 - t, 3));
    else if (t < 3.3) y = HOVER + Math.sin(t * 3) * 0.25;
    else { const k = t - 3.3; y = HOVER + k * k * 22; }
    const drift = t > 3.3 ? (t - 3.3) * (t - 3.3) * 12 : 0;
    trackPos(ev.s + drift, ev.lat, evTmp);
    ev.mag.set(evTmp.x, y, evTmp.z);
    M.magnet.position.copy(ev.mag);
    M.magnet.rotation.z = Math.sin(t * 2.3) * 0.06;
    const fade = t > ev.dur - 0.5 ? Math.max(0.01, (ev.dur - t) / 0.5) : 1;
    M.magnet.scale.setScalar(fade);
    ev.mFade = fade;
    const on = t > 0.9 && t < 3.4 ? 1 : 0;
    ev.fieldRings.forEach((ring, i) => {
      const ph = (t * 1.3 + i / ev.fieldRings.length) % 1;
      ring.position.set(ev.mag.x, y - 1 - ph * (y - 1), ev.mag.z);
      ring.scale.setScalar(1.5 + ph * 5);
      ring.material.opacity = on * 0.6 * Math.sin(ph * Math.PI);
    });
    if (on && Math.random() < simDt * 40) {
      firePool.spawn(ev.mag.x + (Math.random() - 0.5) * 5, y - 0.8, ev.mag.z + (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, -2 - Math.random() * 3, (Math.random() - 0.5) * 3,
        0.35, 0.25, 0.05, 0.75, 0.9, 1, 0.3, 0.6, 1, 1, 0, 0.5);
    }
  } else if (ev.type === 'piano') {
    let crashes = 0;
    for (const pn of ev.pianos) {
      const k = (t - (pn.at - 1.0)) / 1.0;   // un segundo de caída
      if (k <= 0) continue;
      if (!pn.hit) {
        pn.g.visible = true;
        const kk = Math.min(1, k);
        pn.g.position.y = 40 * (1 - kk * kk);
        pn.g.rotation.x = (1 - kk) * 0.8; pn.g.rotation.z = (1 - kk) * 0.5;
        pn.shadow.material.opacity = 0.15 + 0.45 * kk;
        pn.shadow.scale.setScalar(0.4 + 0.6 * kk);
        if (k >= 1) {
          pn.hit = true;
          pn.g.position.y = 0; pn.g.rotation.x = 0; pn.g.rotation.z = 0.08;
          pn.shadow.material.opacity = 0;
          if (crashes++ < 1) audioEngine.playPianoCrash();
          for (let q = 0; q < 50; q++) {
            const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
            smokePool.spawn(pn.x, 0.3, pn.z, Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp, 1.2, 0.8, 2.4, 0.6, 0.5, 0.4, 0.75, 0.68, 0.6, 0.6, 0, 1.2);
          }
          for (let q = 0; q < 12; q++) {   // estrellitas de dibujo animado
            const a = Math.random() * Math.PI * 2;
            firePool.spawn(pn.x, 2.4, pn.z, Math.cos(a) * 2, 2 + Math.random() * 2, Math.sin(a) * 2, 0.9, 0.35, 0.2, 1, 0.95, 0.4, 1, 0.85, 0.2, 1, -3, 0.5);
          }
        }
      } else if (t > ev.dur - 0.5) {
        pn.g.scale.setScalar(Math.max(0.01, (ev.dur - t) / 0.5));
      }
    }
  } else if (ev.type === 'portal') {
    const P = M.portal, U = P.userData;
    const sc = t < 0.6 ? 1 - Math.pow(1 - t / 0.6, 3) : t > ev.dur - 0.6 ? Math.max(0.01, (ev.dur - t) / 0.6) : 1;
    P.scale.setScalar(Math.max(0.01, sc));
    U.swirl.rotation.z -= simDt * 4;
    U.swirl2.rotation.z += simDt * 2.6;
    U.ring2.rotation.z += simDt * 1.5;
    U.disc.material.opacity = 0.6 + Math.sin(t * 9) * 0.15;
    if (!ev.impact && t > 0.2) { ev.impact = true; audioEngine.playPortal(); }
    // Chispas que giran hacia el centro
    if (sc > 0.5) {
      for (let q = 0; q < 3; q++) {
        const a = Math.random() * Math.PI * 2, r = 3.5 + Math.random() * 2;
        const f = trackFrame(ev.s);
        const ox = f.nx * Math.cos(a) * r, oz = f.nz * Math.cos(a) * r, oy = Math.sin(a) * r;
        firePool.spawn(ev.wx + ox, 3.3 + oy, ev.wz + oz, -ox * 1.4, -oy * 1.4, -oz * 1.4, 0.7, 0.25, 0.05, 0.8, 0.5, 1, 0.2, 0.9, 1, 1, 0, 0);
      }
    }
  }

  if (t >= ev.dur) {
    for (const p of ev.victims) if (p.doomed) captureVictim(p, ev);
    ev.done = true;
    // limpiar visuales temporales (el cráter del meteorito queda)
    for (const k in M) {
      eventGroup.remove(M[k]);
      M[k].traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    activeEvent = null;
  }
}

// Trayectoria del águila: picada desde atrás, agarra a sus presas y se va hacia el cielo
function updateEagle(ev, simDt) {
  const t = ev.t, E = ev.meshes.eagle, pos = ev.ep;
  let flapAmp = 0.55, flapSp = 9;
  if (t < 1.25) {
    const u = t / 1.25, e = 1 - (1 - u) * (1 - u);
    trackToWorld(ev.s, ev.s - 48 * (1 - e), 4.6 + 34 * (1 - e) * (1 - e), ev.lat + 20 * (1 - e), pos);
    flapAmp = u < 0.65 ? 0.12 : 0.65;   // planea en la picada y frena aleteando
    if (!ev.screech && u > 0.6) { ev.screech = true; audioEngine.playScreech(); }
  } else if (t < 1.8) {
    trackToWorld(ev.s, ev.s + (t - 1.25) * 2.5, 4.6 + Math.sin((t - 1.25) * 6) * 0.25, ev.lat, pos);
    flapSp = 13; flapAmp = 0.7;
  } else {
    const w = t - 1.8;
    trackToWorld(ev.s, ev.s + 1.4 + 10 * w + 6 * w * w, 4.6 + 3 * w + 3 * w * w, ev.lat - 3 * w, pos);
    flapSp = 11; flapAmp = 0.75;
  }
  if (!ev.epPrev) ev.epPrev = pos.clone();
  const dx = pos.x - ev.epPrev.x, dy = pos.y - ev.epPrev.y, dz = pos.z - ev.epPrev.z;
  E.position.copy(pos);
  if (dx * dx + dz * dz > 1e-5) E.lookAt(pos.x + dx, pos.y + dy * 0.6, pos.z + dz);
  ev.epPrev.copy(pos);
  E.userData.wings.forEach(w => {
    const a = Math.sin(t * flapSp) * flapAmp;
    w.pivot.rotation.z = w.sd * a;
    w.outer.rotation.z = w.sd * Math.sin(t * flapSp - 0.7) * flapAmp * 0.6;
  });
  const fade = t > ev.dur - 0.5 ? Math.max(0.01, (ev.dur - t) / 0.5) : Math.min(1, t * 4 + 0.05);
  E.scale.setScalar(1.15 * fade);
  ev.eFade = fade;
}

function flashScreen() {
  const flash = document.getElementById('photo-flash');
  flash.classList.remove('flash'); void flash.offsetWidth; flash.classList.add('flash');
}

// Suma víctimas a un evento en curso (los que llegan después y lo tocan).
// Respeta el mínimo de sobrevivientes; devuelve false si ya no se puede eliminar a nadie más.
function sweepIntoEvent(ev, test) {
  let free = activeRunners() - MIN_SURVIVORS;
  if (free <= 0) return false;
  for (const p of state.participants) {
    if (p.eliminated || p.doomed || p.finished) continue;
    if (!test(p)) continue;
    p.doomed = { ev, at: ev.t, idx: ev.victims.length, spin: (Math.random() - 0.5) * 8, power: 0.7 + Math.random() * 0.6 };
    ev.victims.push(p);
    if (--free <= 0) return false;
  }
  return true;
}

// Tren: avanza de lado a lado; se lleva a todo el que esté en su camino (locomotora y vagones)
function updateTrain(ev, t, simDt) {
  const M = ev.meshes;
  const travel = ev.dur * 0.9;
  const lat = ev.lat0 + (ev.lat1 - ev.lat0) * Math.min(1, t / travel);
  const prevLat = ev.trainLat ?? lat;
  ev.trainLat = lat;
  const f = trackPos(ev.s, lat, evTmp);
  const fx = evTmp.x, fz = evTmp.z, nx = f.nx, nz = f.nz, tx = f.tx, tz = f.tz;
  M.train.position.set(fx, 0, fz);
  for (const w of M.train.userData.wheels) w.rotation.z -= (lat - prevLat) / 0.42;
  // Los rieles aparecen al empezar y se van al final
  const railsIn = Math.min(1, t / 0.5), railsOut = t > ev.dur - 0.5 ? Math.max(0.01, (ev.dur - t) / 0.5) : 1;
  M.rails.scale.z = Math.max(0.01, Math.min(railsIn, railsOut));
  // Luces de la barrera alternadas
  const blink = Math.floor(t * 4) % 2;
  for (const c of ev.crossLights) c.light.visible = (c.k > 0) === (blink === 0);
  // Humo de la chimenea
  if (Math.random() < simDt * 30) {
    smokePool.spawn(fx + nx * 0.05, 3.0, fz + nz * 0.05, -nx * 3 + (Math.random() - 0.5), 2.5 + Math.random() * 1.5, -nz * 3 + (Math.random() - 0.5),
      1.6, 0.6, 2.6, 0.35, 0.35, 0.38, 0.7, 0.7, 0.72, 0.6, -0.5, 0.8);
  }
  if (!ev.horn2 && t > 1.3) { ev.horn2 = true; audioEngine.playTrainHorn(); }
  // Atropella también a los que llegan al cruce mientras pasan los vagones
  if (t < travel) {
    sweepIntoEvent(ev, p => {
      if (Math.abs(p.x - ev.s) > 3) return false;
      trackPos(p.x + 0.8, p.z, tmpV3);
      const rx = tmpV3.x - fx, rz = tmpV3.z - fz;
      const along = rx * nx + rz * nz, side = rx * tx + rz * tz;
      return along < 0.8 && along > -ev.trainLen && Math.abs(side) < 1.4;
    });
  }
}

// El evento alcanza a un caballo: desde aquí deja de correr
function captureVictim(p, ev) {
  const d = p.doomed;
  const base = new THREE.Vector3();
  const f = trackPos(p.x, p.z, base);
  let dx = base.x - ev.wx, dz = base.z - ev.wz;
  const len = Math.hypot(dx, dz) || 1;
  if (ev.type === 'boulder' || ev.type === 'train') { dx = f.nx * 0.85 + f.tx * 0.5; dz = f.nz * 0.85 + f.tz * 0.5; }   // sale despedido hacia donde rueda la roca
  else if (len < 0.3) { dx = f.nx; dz = f.nz; } else { dx /= len; dz /= len; }
  p.doomed = null;
  p.eliminated = true;
  p.elimAt = state.raceTime;
  p.elimCause = ev.def.cause;
  p.state = 'normal';
  p.speed = 0;
  p.elim = {
    event: ev, t0: ev.t, idx: d.idx || 0, spin: d.spin, power: d.power, vx: dx, vz: dz,
    base: { x: base.x, z: base.z, heading: f.heading, tx: f.tx, tz: f.tz, nx: f.nx, nz: f.nz },
    // abejas: huye hacia el borde más cercano de la pista
    side: p.z >= 0 ? 1 : -1,
    // ola gigante: posición de la ola al atraparlo (luego se mueve con ella)
    cx0: ev.curX, cz0: ev.curZ
  };
  if (ev.type === 'balloons' && d.idx % 4 === 0) audioEngine.playPop();
  if (ev.type === 'bananas' && d.idx > 0 && d.idx % 3 === 0) audioEngine.playSlip();
  crawlPush(p.name, 'victim');
  updateEliminatedBadge();
}

// Transformación visual de un caballo eliminado (posición absoluta de mundo)
const ELIM_OUT = { x: 0, y: 0, z: 0, s: 1, ry: 0, rz: 0, visible: true };
function elimTransform(p) {
  if (state.phase === 'replay') return p.replayT || null;   // repetición: transformación grabada
  if (!p.eliminated) return null;
  const e = p.elim, ev = e.event, b = e.base;
  const o = ELIM_OUT;
  o.x = b.x; o.y = 0; o.z = b.z; o.s = 1; o.ry = b.heading; o.rz = 0; o.visible = true;
  if (ev.done) { o.visible = false; return o; }
  const t = ev.t;
  const k = t - e.t0;
  if (ev.type === 'ufo') {
    const r = Math.max(0, Math.min(1, k / 1.9));
    if (r >= 1) { o.visible = false; return o; }
    o.x = b.x + (ev.wx - b.x) * r * 0.9; o.z = b.z + (ev.wz - b.z) * r * 0.9;
    o.y = r * r * 8.5; o.s = 1 - 0.8 * r; o.ry = b.heading + r * e.spin * 2;
  } else if (ev.type === 'meteor' || ev.type === 'boulder' || ev.type === 'train') {
    if (ev.type === 'meteor' && !ev.impact) return o;
    const tau = ev.type === 'meteor' ? t - ev.impactT : k;
    if (tau > 1.7) { o.visible = false; return o; }
    const sp = (ev.type === 'meteor' ? 9 : ev.type === 'train' ? 11 : 7.5) * e.power;
    o.x = b.x + e.vx * sp * tau; o.z = b.z + e.vz * sp * tau;
    o.y = Math.max(0, (ev.type === 'meteor' ? 12 : 10) * e.power * tau - 9 * tau * tau);
    o.ry = b.heading + e.spin * tau; o.rz = e.spin * tau * 0.6;
    o.s = tau > 1.3 ? Math.max(0.01, 1 - (tau - 1.3) / 0.4) : 1;
  } else if (ev.type === 'tornado') {
    if (k < 0) return o;
    if (k > 2.2) { o.visible = false; return o; }
    const ang = k * 9 + e.spin, rad = 1.2 + k * 1.3;
    const cx = ev.curX ?? b.x, cz = ev.curZ ?? b.z;
    o.x = cx + Math.cos(ang) * rad; o.z = cz + Math.sin(ang) * rad;
    o.y = k * k * 3.5; o.ry = b.heading + ang; o.rz = Math.sin(k * 7) * 0.8;
    o.s = k > 1.8 ? Math.max(0.01, 1 - (k - 1.8) / 0.4) : 1;
  } else if (ev.type === 'lightning') {
    const tau = k;
    if (tau > 1.6) { o.visible = false; return o; }
    o.rz = Math.min(1.5, tau * 4) * (e.spin > 0 ? 1 : -1);  // cae de lado
    o.y = Math.min(1.5, tau * 4) * 0.35;
    o.s = tau > 1.2 ? Math.max(0.01, 1 - (tau - 1.2) / 0.4) : 1;
    if (Math.random() < 0.3) smokePool.spawn(b.x, 1.2, b.z, 0, 2, 0, 0.8, 0.5, 1.6, 0.15, 0.15, 0.15, 0.4, 0.4, 0.4, 0.6, 0, 1);
  } else if (ev.type === 'balloons') {
    // Sube flotando, balanceándose y pataleando
    const kk = Math.max(0, k);
    o.y = kk * 1.1 + kk * kk * 0.55;
    o.x = b.x + Math.sin(kk * 0.9 + e.spin) * kk * 0.6; o.z = b.z + Math.cos(kk * 0.7 + e.spin) * kk * 0.5;
    o.ry = b.heading + Math.sin(kk * 0.8 + e.spin) * 0.7;
    o.rz = Math.sin(kk * 2.4 + e.spin) * 0.22;
    if (t > ev.dur - 0.5) o.s = Math.max(0.01, (ev.dur - t) / 0.5);
  } else if (ev.type === 'freeze') {
    if (t >= ev.shatterT) { o.visible = false; return o; }
    if (k < 0.35) o.rz = Math.sin(k * 60) * 0.03 * (1 - k / 0.35);   // tiritón antes de quedar congelado
  } else if (ev.type === 'eagle') {
    // Queda colgando de las garras del águila
    const r = Math.min(1, Math.max(0, k) / 0.3);
    const ep = ev.ep;
    const off = (e.idx - 1) * 0.9;
    const tx = ep.x + off * 0.6, ty = Math.max(0, ep.y - 3.4 - (e.idx % 2) * 0.5), tz = ep.z + off * 0.6;
    const sc = 1 - 0.25 * r;
    o.x = b.x + (tx - b.x) * r; o.z = b.z + (tz - b.z) * r; o.y = ty * r;
    o.s = sc * (ev.eFade ?? 1);
    o.ry = b.heading + Math.sin(k * 3 + e.spin) * 0.5 * r;
    o.rz = Math.sin(k * 6 + e.spin) * 0.35 * r;
  } else if (ev.type === 'sinkhole') {
    // Se tambalea en el borde, gira y se hunde hacia el centro del hoyo
    if (k < 0) return o;
    if (k > 1.5) { o.visible = false; return o; }
    const r = Math.min(1, k / 1.2);
    o.x = b.x + (ev.wx - b.x) * r * 0.55; o.z = b.z + (ev.wz - b.z) * r * 0.55;
    o.y = -r * r * 3.2;
    o.ry = b.heading + r * e.spin * 1.5;
    o.rz = Math.sin(k * 14) * 0.15 * (1 - r) + r * 0.6 * (e.spin > 0 ? 1 : -1);
    o.s = 1 - 0.55 * r;
  } else if (ev.type === 'tsunami') {
    // La ola lo arrastra fuera de la pista, flotando y dando tumbos
    if (k < 0) return o;
    if (k > 2.4) { o.visible = false; return o; }
    const cx = ev.curX ?? b.x, cz = ev.curZ ?? b.z;
    const ox = e.cx0 ?? cx, oz = e.cz0 ?? cz;
    o.x = b.x + (cx - ox); o.z = b.z + (cz - oz);
    o.y = Math.min(1, k * 3) * (1.6 + Math.sin(k * 5 + e.spin) * 0.4);
    o.ry = b.heading + k * e.spin * 0.8; o.rz = Math.sin(k * 4 + e.spin) * 0.9;
    o.s = k > 2.0 ? Math.max(0.01, 1 - (k - 2.0) / 0.4) : 1;
  } else if (ev.type === 'bees') {
    // Sale corriendo despavorido hacia fuera de la pista, saltando
    if (k < 0) return o;
    if (k > 3.2) { o.visible = false; return o; }
    const side = e.side ?? 1;
    const run = 7 * k + 1.5 * k * k;
    o.x = b.x + b.nx * side * run + b.tx * k * 2; o.z = b.z + b.nz * side * run + b.tz * k * 2;
    o.y = Math.abs(Math.sin(k * 9)) * 0.7;
    o.ry = Math.atan2(-(b.nz * side * 7 + b.tz * 2), b.nx * side * 7 + b.tx * 2) + Math.sin(k * 7) * 0.4;
    o.rz = Math.sin(k * 11) * 0.25;
    o.s = k > 2.8 ? Math.max(0.01, 1 - (k - 2.8) / 0.4) : 1;
  } else if (ev.type === 'bananas') {
    // Resbala: patina hacia adelante girando y cae de lado
    if (k < 0) return o;
    if (k > 1.9) { o.visible = false; return o; }
    const tau = Math.min(k, 1.6);
    const slide = 7 * e.power * (tau - tau * tau / 3.2);
    o.x = b.x + b.tx * slide + e.vx * tau * 1.2; o.z = b.z + b.tz * slide + e.vz * tau * 1.2;
    o.y = Math.sin(Math.min(1, k * 2.2) * Math.PI) * 1.1;
    o.ry = b.heading + e.spin * tau * 1.4;
    o.rz = Math.min(1.45, k * 2.6) * (e.spin > 0 ? 1 : -1);
    o.s = k > 1.5 ? Math.max(0.01, 1 - (k - 1.5) / 0.4) : 1;
  } else if (ev.type === 'lava') {
    // Salta por el impacto, cae de lado humeando y desaparece
    if (k < 0) return o;
    if (k > 1.6) { o.visible = false; return o; }
    o.x = b.x + e.vx * 2.5 * k; o.z = b.z + e.vz * 2.5 * k;
    o.y = Math.max(0, 6 * e.power * k - 9 * k * k);
    o.rz = Math.min(1.5, k * 3) * (e.spin > 0 ? 1 : -1);
    o.ry = b.heading + e.spin * k * 0.5;
    o.s = k > 1.2 ? Math.max(0.01, 1 - (k - 1.2) / 0.4) : 1;
    if (Math.random() < 0.25) smokePool.spawn(o.x, 1.2 + o.y, o.z, 0, 2, 0, 0.9, 0.5, 1.6, 0.2, 0.18, 0.16, 0.45, 0.42, 0.4, 0.6, 0, 1);
  } else if (ev.type === 'magnet') {
    // Sale volando patas arriba hasta pegarse por las herraduras a las puntas del imán
    if (k < 0) return o;
    const r = Math.min(1, k / 0.7), eased = r * r * (3 - 2 * r);
    const m = ev.mag;
    const sd = e.idx % 2 ? 1 : -1;                    // punta izquierda o derecha
    const row = Math.floor(e.idx / 2);
    const hx = Math.cos(trackFrame(ev.s).heading);   // las puntas están a lo largo de la pista
    const hz = -Math.sin(trackFrame(ev.s).heading);
    const tx = m.x + hx * sd * 2.2 + (row % 3 - 1) * 0.5, tz = m.z + hz * sd * 2.2 + (row % 2 ? 0.4 : -0.4);
    const ty = Math.max(0, m.y - 0.75 - row * 0.15);
    o.x = b.x + (tx - b.x) * eased; o.z = b.z + (tz - b.z) * eased; o.y = ty * eased;
    o.rz = Math.PI * eased;                           // queda colgando patas arriba
    o.ry = b.heading + Math.sin(k * 3 + e.spin) * 0.3 * r;
    o.s = (1 - 0.2 * r) * (ev.mFade ?? 1);
  } else if (ev.type === 'piano') {
    // Aplastado: se achata de golpe bajo el piano
    if (k < 0) return o;
    if (k > 0.25) { o.visible = false; return o; }
    o.s = Math.max(0.05, 1 - k * 4);
  } else if (ev.type === 'portal') {
    // Absorbido hacia el centro del portal, girando y encogiéndose
    if (k < 0) return o;
    const r = Math.min(1, k / 1.1);
    if (r >= 1) { o.visible = false; return o; }
    const e2 = r * r;
    o.x = b.x + (ev.wx - b.x) * e2; o.z = b.z + (ev.wz - b.z) * e2;
    o.y = e2 * 2.2;
    o.s = 1 - 0.92 * e2;
    o.ry = b.heading + e2 * e.spin * 3;
    o.rz = e2 * 1.3 * (e.spin > 0 ? 1 : -1);
  }
  return o;
}

// ---------------- Cartel del evento ----------------
let eventMsgTimer = null;
function showEventMessage(icon, title, sub) {
  const wrap = document.getElementById('event-message');
  document.getElementById('event-message-icon').textContent = icon;
  document.getElementById('event-message-title').textContent = title;
  document.getElementById('event-message-sub').textContent = sub;
  wrap.classList.remove('hidden', 'lap-msg-anim');
  void wrap.offsetWidth;
  wrap.classList.add('lap-msg-anim');
  clearTimeout(eventMsgTimer);
  eventMsgTimer = setTimeout(() => wrap.classList.add('hidden'), 4200);
}

// ---------------- Barra de noticias: todos los eliminados pasan rápido por abajo ----------------
const newsCrawl = { visible: false, x: 0, speed: 110, holdUntil: 0 };

function crawlPush(text, kind) {
  const wrap = document.getElementById('news-crawl');
  const track = document.getElementById('news-crawl-track');
  const item = document.createElement('span');
  if (kind === 'headline') {
    item.className = 'text-amber-300 font-display font-black tracking-wide';
    item.textContent = text;
  } else {
    const x = document.createElement('span');
    x.className = 'text-rose-400'; x.textContent = '✖';
    const name = document.createElement('span');
    name.textContent = text;   // textContent: los nombres nunca se interpretan como HTML
    item.append(x, name);
  }
  // Si la barra quedó vacía entre capturas, lo nuevo vuelve a entrar desde la derecha
  if (newsCrawl.visible && !track.firstElementChild) newsCrawl.x = track.parentElement.clientWidth;
  track.appendChild(item);
  if (!newsCrawl.visible) {
    newsCrawl.visible = true;
    newsCrawl.x = track.parentElement.clientWidth;   // entra desde la derecha
    newsCrawl.speed = 110;
    wrap.classList.remove('hidden', 'crawl-in'); void wrap.offsetWidth; wrap.classList.add('crawl-in');
    document.getElementById('viewport-3d').classList.add('crawl-on');
  }
  const n = state.participants.filter(p => p.eliminated).length;
  document.getElementById('news-crawl-count').textContent = n > 0 ? `${n} FUERA` : '';
}

function updateNewsCrawl(dt) {
  if (!newsCrawl.visible) return;
  const track = document.getElementById('news-crawl-track');
  if (dt > 0) {
    // Velocidad de lectura: sube un poco con muchos nombres, pero siempre legible
    const remaining = newsCrawl.x + track.scrollWidth;
    const want = Math.max(110, Math.min(190, remaining / 14));   // velocidad de lectura cómoda
    newsCrawl.speed += (want - newsCrawl.speed) * Math.min(1, dt * 2);
    newsCrawl.x -= newsCrawl.speed * dt;
    // Saca los que ya salieron por la izquierda (sin saltos: se compensa su ancho)
    let first = track.firstElementChild;
    while (first && newsCrawl.x + first.offsetWidth < 0) {
      newsCrawl.x += first.offsetWidth;
      first.remove();
      first = track.firstElementChild;
    }
    if (!first && !activeEvent) { resetNewsCrawl(); return; }
  }
  track.style.transform = `translateX(${newsCrawl.x.toFixed(1)}px)`;
}

function resetNewsCrawl() {
  newsCrawl.visible = false;
  const track = document.getElementById('news-crawl-track');
  track.innerHTML = '';
  track.style.transform = '';
  document.getElementById('news-crawl').classList.add('hidden');
  document.getElementById('viewport-3d').classList.remove('crawl-on');
}

// ---------------- Cámara en recuadro (picture-in-picture) para los eventos ----------------
const pipState = { active: false, cam: null, pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true, rect: null };

function showEventPip(icon, title, sub) {
  document.getElementById('event-pip-icon').textContent = icon;
  document.getElementById('event-pip-title').textContent = title;
  document.getElementById('event-pip-sub').textContent = sub;
  pipState.active = true;
  pipState.snap = true;
}

function pipRect() {
  const W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
  const w = Math.round(Math.max(220, Math.min(W * 0.36, 440)));
  const h = Math.round(w * 9 / 16);
  const bottom = Math.min(92, Math.max(12, H - h - 60)) + (newsCrawl.visible ? 34 : 0);
  return { x: 12, y: bottom, w, h, W, H };
}

function renderEventPip(dt) {
  const frame = document.getElementById('event-pip');
  const ev = activeEvent;
  if (!ev || state.phase !== 'racing') {
    if (pipState.active || !frame.classList.contains('hidden')) { frame.classList.add('hidden'); pipState.active = false; }
    return;
  }
  if (!pipState.cam) pipState.cam = new THREE.PerspectiveCamera(48, 16 / 9, 0.3, 1200);
  const r = pipRect();
  frame.classList.remove('hidden');
  frame.style.left = r.x + 'px'; frame.style.bottom = r.y + 'px';
  frame.style.width = r.w + 'px'; frame.style.height = r.h + 'px';

  // Encuadre del evento
  const m = getTrackMetrics();
  const v = eventView(ev);
  const back = v.crossing ? m.halfWidth + 16 : 18;
  trackToWorld(ev.s, ev.s + 11, v.sky ? 8.5 : 6, Math.min(m.halfWidth + 9, v.lat + back), tmpV1);
  trackToWorld(ev.s, ev.s - 1, v.lookY, v.lat, tmpV2);
  if (pipState.snap) { pipState.pos.copy(tmpV1); pipState.look.copy(tmpV2); pipState.snap = false; }
  const k = 1 - Math.exp(-dt * 4);
  pipState.pos.lerp(tmpV1, k); pipState.look.lerp(tmpV2, k);
  const cam = pipState.cam;
  cam.position.copy(pipState.pos);
  cam.lookAt(pipState.look);
  cam.aspect = r.w / r.h;
  cam.updateProjectionMatrix();

  // Segunda pasada de render solo en el recuadro
  const pr = renderer.getPixelRatio();
  const ps = (r.h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  firePool.material.uniforms.uScale.value = ps;
  smokePool.material.uniforms.uScale.value = ps;
  renderer.setScissorTest(true);
  renderer.setScissor(r.x, r.y, r.w, r.h);
  renderer.setViewport(r.x, r.y, r.w, r.h);
  renderer.render(scene, cam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, r.W, r.H);
  updateParticleScale();
}

function playEventSound(type) {
  if (type === 'ufo') audioEngine.playUfo();
  else if (type === 'meteor') audioEngine.playWhistle();
  else if (type === 'tornado') audioEngine.playWind();
  else if (type === 'boulder') audioEngine.playRumble();
  else if (type === 'balloons') audioEngine.playPop();
  else if (type === 'freeze') { audioEngine.playFreeze(); audioEngine.playWind(); }
  else if (type === 'eagle') audioEngine.playWind();
  else if (type === 'sinkhole') audioEngine.playRumble();
  else if (type === 'bananas') audioEngine.playSlip();
  else if (type === 'train') audioEngine.playTrainHorn();
  else if (type === 'lava') { audioEngine.playRumble(); audioEngine.playWhistle(); }
  else if (type === 'magnet') audioEngine.playMagnet();
  else if (type === 'piano') audioEngine.playWhistle();
  // ola gigante y abejas: su sonido empieza cuando aparecen (ver updateEvents)
}

function updateEventsToggleUi() {
  const btn = document.getElementById('btn-toggle-events');
  btn.textContent = state.eventsEnabled ? '👽 Eventos: Sí' : '👽 Eventos: No';
  btn.className = state.eventsEnabled
    ? 'px-2.5 py-1 rounded-md bg-fuchsia-500/25 hover:bg-fuchsia-500/35 border border-fuchsia-400/50 text-[11px] font-semibold text-fuchsia-200 transition'
    : 'px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-white/10 text-[11px] font-semibold text-slate-400 transition';
  document.getElementById('chk-events').checked = state.eventsEnabled;
}

function bindEventsUi() {
  const set = v => {
    state.eventsEnabled = v;
    updateEventsToggleUi();
    showToast(v ? `Eventos activados: OVNIs, meteoritos y más (siempre quedan al menos ${MIN_SURVIVORS} caballos)` : 'Eventos desactivados');
  };
  document.getElementById('btn-toggle-events').addEventListener('click', () => set(!state.eventsEnabled));
  document.getElementById('chk-events').addEventListener('change', e => set(e.target.checked));
  updateEventsToggleUi();
}


function startRaceFlow() {
  if (state.names.length < 2) {
    showToast('Agrega al menos 2 participantes para iniciar la carrera.', 'error');
    setParticipantsModalOpen(true);
    return;
  }
  audioEngine.init();
  setParticipantsModalOpen(false);
  const resModal = document.getElementById('results-modal');
  resModal.classList.add('hidden');
  resModal.classList.remove('flex');

  state.paused = false;
  updatePauseButtonUi();
  document.getElementById('btn-start-top-label').textContent = 'Reiniciar';

  prepareRaceParticipants();
  state.phase = 'countdown';
  state.countdownShown = -1;
  music.start();
  announceTicker('¡Caballos en la largada! Atentos a la trompeta...', true);
}

// Vuelve a mostrar la grilla de largada si cambian nombres/pista fuera de carrera
function refreshPreviewIfIdle() {
  if (state.phase === 'racing' || state.phase === 'countdown') return;
  state.phase = 'ready';
  music.stop(0.3);
  prepareRaceParticipants();
}

function setNames(list) {
  state.names = list.slice(0, MAX_PARTICIPANTS);
  const dupes = state.names.length - new Set(state.names.map(n => n.trim().toLowerCase())).size;
  if (dupes > 0) showToast(`Ojo: hay ${dupes} nombre${dupes === 1 ? '' : 's'} repetido${dupes === 1 ? '' : 's'} en la lista.`, 'error');
  if (list.length > MAX_PARTICIPANTS) showToast(`Máximo ${MAX_PARTICIPANTS} participantes: se recortó la lista.`, 'error');
  renderParticipantsModalList();
  updateTopInfoUi();
  refreshPreviewIfIdle();
}

function applyTop10Ui() {
  const sidebar = document.getElementById('top10-sidebar');
  sidebar.classList.toggle('collapsed', !state.top10Open);
  const btn = document.getElementById('btn-toggle-top10');
  btn.className = state.top10Open
    ? 'px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-semibold text-emerald-300 flex items-center gap-1 transition'
    : 'px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-slate-300 flex items-center gap-1 transition';
  if (state.top10Open) renderTop10Sidebar(true);
}

function updateAutoFinishBtn() {
  const btn = document.getElementById('btn-autofinish');
  btn.className = state.autoPhotoFinish
    ? 'px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-[11px] font-semibold text-amber-300 transition'
    : 'px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-white/10 text-[11px] font-semibold text-slate-400 line-through transition';
}

function bindUiEvents() {
  const $ = id => document.getElementById(id);

  // Barra superior
  $('btn-open-participants').addEventListener('click', () => setParticipantsModalOpen(true));
  $('btn-start-top').addEventListener('click', startRaceFlow);

  $('btn-toggle-surface').addEventListener('click', () => {
    state.surface = state.surface === 'dirt' ? 'turf' : 'dirt';
    buildRacetrackEnvironment();
    updateTopInfoUi();
    showToast(`Superficie cambiada a ${state.surface === 'dirt' ? 'Tierra' : 'Césped'}.`);
  });

  $('btn-speed').addEventListener('click', () => {
    state.speedMultiplier = state.speedMultiplier === 1 ? 2 : 1;
    $('btn-speed').textContent = state.speedMultiplier + 'x';
  });

  $('btn-toggle-sound').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    audioEngine.init();
    audioEngine.setEnabled(state.soundEnabled);
    $('icon-sound-on').classList.toggle('hidden', !state.soundEnabled);
    $('icon-sound-off').classList.toggle('hidden', state.soundEnabled);
  });

  $('btn-toggle-top10').addEventListener('click', () => {
    state.top10Open = !state.top10Open;
    applyTop10Ui();
  });

  // Barra inferior: cámaras
  document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.cameraMode = btn.getAttribute('data-cam');
      camDrag.yawOffset = 0; camDrag.pitchOffset = 0; camDrag.zoomOffset = 0;
      updateRecenterButtonVisibility();
      document.querySelectorAll('.cam-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  $('btn-recenter-cam').addEventListener('click', () => {
    camDrag.yawOffset = 0; camDrag.pitchOffset = 0; camDrag.zoomOffset = 0;
    updateRecenterButtonVisibility();
  });

  $('btn-autofinish').addEventListener('click', () => {
    state.autoPhotoFinish = !state.autoPhotoFinish;
    updateAutoFinishBtn();
    showToast(state.autoPhotoFinish ? 'Cámara de llegada + cámara lenta: activadas' : 'Cámara de llegada automática desactivada');
  });

  $('btn-toggle-sprites').addEventListener('click', () => {
    const idx = LABEL_MODES.indexOf(state.labelsMode);
    state.labelsMode = LABEL_MODES[(idx + 1) % LABEL_MODES.length];
    $('btn-toggle-sprites').textContent = LABEL_MODE_TEXT[state.labelsMode];
    horseRigs.forEach(r => { r.label.lastKey = ''; });
  });

  $('btn-pause').addEventListener('click', () => {
    if (state.phase !== 'racing' && state.phase !== 'countdown') return;
    state.paused = !state.paused;
    updatePauseButtonUi();
    if (audioEngine.ctx) {
      if (state.paused) audioEngine.ctx.suspend(); else audioEngine.ctx.resume();
    }
    music.lastPerf = performance.now();
  });

  $('btn-restart-bottom').addEventListener('click', startRaceFlow);

  // Modal de participantes
  $('btn-close-participants').addEventListener('click', () => setParticipantsModalOpen(false));
  $('btn-cancel-participants').addEventListener('click', () => setParticipantsModalOpen(false));
  $('btn-start-from-modal').addEventListener('click', startRaceFlow);

  const addSingle = () => {
    const input = $('input-single-name');
    const name = input.value.trim();
    if (!name) return;
    setNames([...state.names, name]);
    input.value = '';
    input.focus();
  };
  $('btn-add-single').addEventListener('click', addSingle);
  $('input-single-name').addEventListener('keydown', e => { if (e.key === 'Enter') addSingle(); });

  $('btn-bulk-replace').addEventListener('click', () => {
    const list = parseBulkNames($('textarea-bulk').value);
    if (list.length === 0) { showToast('La lista está vacía.', 'error'); return; }
    setNames(list);
    $('textarea-bulk').value = '';
    showToast(`Lista reemplazada: ${list.length.toLocaleString('es-CL')} participantes.`);
  });
  $('btn-bulk-append').addEventListener('click', () => {
    const list = parseBulkNames($('textarea-bulk').value);
    if (list.length === 0) { showToast('La lista está vacía.', 'error'); return; }
    setNames([...state.names, ...list]);
    $('textarea-bulk').value = '';
    showToast(`Se añadieron ${list.length.toLocaleString('es-CL')} participantes.`);
  });

  $('input-file-upload').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const list = parseBulkNames(text.replace(/[,;]/g, '\n'));
      $('textarea-bulk').value = list.join('\n');
      showToast(`Archivo cargado: ${list.length.toLocaleString('es-CL')} nombres. Pulsa Reemplazar o Añadir.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.getAttribute('data-preset'), 10);
      setNames(n === 12 ? [...DEFAULT_NAMES] : generateNames(n));
      showToast(`${n.toLocaleString('es-CL')} caballos listos en la largada.`);
    });
  });

  $('select-distance').addEventListener('change', e => {
    state.distanceKey = e.target.value;
    updateTopInfoUi();
    refreshPreviewIfIdle();
  });

  $('btn-shuffle-list').addEventListener('click', () => {
    const arr = [...state.names];
    for (let k = arr.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [arr[k], arr[j]] = [arr[j], arr[k]];
    }
    setNames(arr);
  });
  $('btn-clear-list').addEventListener('click', () => {
    state.names = [];
    renderParticipantsModalList();
    updateTopInfoUi();
  });
  $('input-filter-list').addEventListener('input', renderParticipantsModalList);
  $('participants-list-container').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove-item');
    if (!btn) return;
    const idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
    const arr = [...state.names];
    arr.splice(idx, 1);
    setNames(arr);
  });

  // Modal de resultados
  // Cerrar el panel también termina la repetición de la última vuelta
  const closeResults = () => { closeResultsModal(); stopReplay(); };
  $('btn-close-results').addEventListener('click', closeResults);
  $('tab-top10').addEventListener('click', () => { state.resultsTab = 'top10'; updateResultsTabsUi(); renderResultsTable(); });
  $('tab-all').addEventListener('click', () => { state.resultsTab = 'all'; updateResultsTabsUi(); renderResultsTable(); });
  $('tab-elim').addEventListener('click', () => { state.resultsTab = 'elim'; updateResultsTabsUi(); renderResultsTable(); });
  $('input-search-results').addEventListener('input', renderResultsTable);
  $('btn-repeat-race').addEventListener('click', startRaceFlow);
  $('btn-remove-winner-repeat').addEventListener('click', () => {
    const winner = state.sortedParticipants[0];
    if (!winner || state.names.length <= 2) return;
    const arr = [...state.names];
    arr.splice(winner.id, 1);
    state.names = arr;
    showToast(`${winner.name} sale de la lista. ¡Nueva carrera!`);
    startRaceFlow();
  });
  $('btn-copy-results').addEventListener('click', copyResultsToClipboard);
  $('btn-edit-participants').addEventListener('click', () => { closeResults(); setParticipantsModalOpen(true); });

  // Teclado: espacio pausa, Enter inicia
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if (e.code === 'Space') { e.preventDefault(); $('btn-pause').click(); }
  });
}
