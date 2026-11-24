// Hipódromo 3D Pro — Skins especiales (solo visuales)
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// SKINS ESPECIALES: puramente visuales (no cambian velocidad ni nada del juego)
// =========================================================================
const SKINS = {
  otter:    { label: 'Nutria',    emoji: '🦦' },
  capybara: { label: 'Capibara',  emoji: '🦫' },
  cuy:      { label: 'Cuy',       emoji: '🐹' },
  skeleton: { label: 'Esqueleto', emoji: '💀' },
  car:      { label: 'Auto',      emoji: '🏎️', vehicle: true },
  moto:     { label: 'Moto',      emoji: '🏍️', vehicle: true },
  cow:      { label: 'Vaca',      emoji: '🐄' },
  pig:      { label: 'Chancho',   emoji: '🐷' }
};
const SKIN_KEYS = Object.keys(SKINS);
const SPECIAL_SKIN_CHANCE = 0.08;   // probabilidad de que un participante cualquiera salga con skin rara
const MAX_SPECIAL_RIGS = 16;        // skins fuera de los punteros que igual se dibujan con modelo completo
// Nombres con skin fija: basta que el nombre contenga TODAS esas palabras
// (sin importar mayúsculas, tildes, orden ni nombres extra)
const NAME_SKINS = [
  { words: ['castillo', 'latorre'], skin: 'otter' },
  { words: ['agustin', 'acevedo'], skin: 'capybara' },
  { words: ['tien', 'villalobos'], skin: 'cuy' }
];
const skinRolls = new Map();   // nombre -> skin sorteada (se mantiene entre la vista previa y la carrera)

function nameWords(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function forcedSkinForName(name) {
  const words = new Set(nameWords(name));
  for (const r of NAME_SKINS) if (r.words.every(w => words.has(w))) return r.skin;
  return null;
}
function assignSkins() {
  const maxRandom = Math.max(1, Math.min(12, Math.round(state.participants.length * 0.08)));
  let randomCount = 0;
  for (const p of state.participants) {
    const forced = forcedSkinForName(p.name);
    if (forced) { p.skin = forced; continue; }
    if (!skinRolls.has(p.name)) skinRolls.set(p.name, Math.random() < SPECIAL_SKIN_CHANCE ? SKIN_KEYS[(Math.random() * SKIN_KEYS.length) | 0] : null);
    let s = skinRolls.get(p.name);
    if (s && randomCount >= maxRandom) s = null;
    if (s) randomCount++;
    p.skin = s;
  }
}

// Cara del participante en las listas: emoji de su skin, o la cara del caballo
function horseFace(p, horseState, isLeader, size = 34) {
  if (p.skin) {
    return `<span style="display:inline-flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;font-size:${Math.round(size * 0.78)}px;line-height:1">${SKINS[p.skin].emoji}</span>`;
  }
  return getHorseFaceSvg(p.coatIdx, horseState, isLeader, size);
}

let skinGeo = null;
function SG() {
  if (!skinGeo) skinGeo = {
    sphere: new THREE.SphereGeometry(1, 16, 12),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(1, 1, 10)
  };
  return skinGeo;
}
const skinMat = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.r ?? 0.75, metalness: o.m ?? 0, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 0,
  transparent: o.op !== undefined, opacity: o.op ?? 1
});
function part(parent, geo, mat, s, p, rot, shadow) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(s[0], s[1], s[2]);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (shadow) m.castShadow = true;
  parent.add(m);
  return m;
}

// Animal de cuatro patas genérico (nutria, capibara, cuy, vaca, chancho)
function buildCritterSkin(o) {
  const { sphere: S, cyl: C, cone: K } = SG();
  const G = new THREE.Group(), core = new THREE.Group();
  const bodyY = o.leg + o.h;
  core.position.y = bodyY;
  G.add(core);
  const fur = skinMat(o.color), dark = skinMat(0x0b0b0b, { r: 0.3 }), white = skinMat(0xffffff, { r: 0.3 });
  const muzzle = o.muzzle ? skinMat(o.muzzle) : fur, nose = skinMat(o.nose ?? 0x2a1a12, { r: 0.4 });
  part(core, S, fur, [o.len, o.h, o.w], null, null, true);
  if (o.belly) part(core, S, skinMat(o.belly), [o.len * 0.82, o.h * 0.72, o.w * 0.86], [o.len * 0.08, -o.h * 0.3, 0]);

  const head = new THREE.Group();
  head.position.set(o.len * 0.9, o.h * 0.45 + (o.headUp || 0), 0);
  core.add(head);
  const [hx, hy, hz] = o.head;
  part(head, S, fur, [hx, hy, hz], null, null, true);
  part(head, S, muzzle, [hx * 0.55, hy * 0.62, hz * 0.72], [hx * 0.72, -hy * 0.22, 0]);
  part(head, S, nose, [hz * 0.26, hz * 0.2, hz * 0.3], [hx * 1.22, -hy * 0.08, 0]);
  for (const sd of [-1, 1]) {
    part(head, S, dark, [hy * 0.17, hy * 0.19, hy * 0.13], [hx * 0.42, hy * 0.32, sd * hz * 0.78]);
    part(head, S, white, [hy * 0.05, hy * 0.05, hy * 0.04], [hx * 0.5, hy * 0.4, sd * hz * 0.88]);
    if (o.ears === 'cow') {
      part(head, S, fur, [hy * 0.12, hy * 0.08, hy * 0.32], [-hx * 0.25, hy * 0.5, sd * hz * 1.05]);
      part(head, K, skinMat(0xe8dcc0), [0.06, 0.3, 0.06], [-hx * 0.35, hy * 1.0, sd * hz * 0.5], [sd * 0.55, 0, 0]);
    } else if (o.ears === 'pig') {
      part(head, K, fur, [hy * 0.2, hy * 0.36, hy * 0.08], [-hx * 0.1, hy * 0.9, sd * hz * 0.55], [sd * 0.4, 0, -0.5]);
    } else {
      part(head, S, o.earColor ? skinMat(o.earColor) : fur, [hy * 0.16, hy * 0.2, hy * 0.08], [-hx * 0.25, hy * 0.82, sd * hz * 0.62]);
    }
    if (o.whiskers) {
      for (let k = 0; k < 3; k++) {
        part(head, C, white, [0.008, 0.5, 0.008], [hx * 1.0, -hy * 0.2 + (k - 1) * 0.05, sd * hz * 0.45], [sd * (1.25 + (k - 1) * 0.15), 0, 0]);
      }
    }
  }

  // Patas
  const legs = [];
  const L = o.leg + o.h * 0.55;
  for (const [lx, front] of [[o.len * 0.58, true], [-o.len * 0.58, false]]) {
    for (const sd of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(lx, -o.h * 0.45, sd * o.w * 0.55);
      core.add(piv);
      part(piv, C, fur, [o.legR, L, o.legR], [0, -L / 2, 0], null, true);
      part(piv, S, o.paw ? skinMat(o.paw) : fur, [o.legR * 1.3, o.legR * 0.8, o.legR * 1.25], [o.legR * 0.4, -L + o.legR * 0.6, 0]);
      legs.push({ piv, front, sd });
    }
  }

  // Cola
  let tail = null;
  if (o.tail === 'otter') {
    tail = new THREE.Group(); tail.position.set(-o.len * 0.92, -o.h * 0.15, 0); core.add(tail);
    part(tail, K, fur, [0.26, 1.4, 0.22], [-0.65, 0, 0], [0, 0, Math.PI / 2], true);
  } else if (o.tail === 'cow') {
    tail = new THREE.Group(); tail.position.set(-o.len * 0.98, o.h * 0.3, 0); tail.rotation.z = -0.35; core.add(tail);
    part(tail, C, fur, [0.035, 1.0, 0.035], [0, -0.5, 0]);
    part(tail, S, dark, [0.1, 0.18, 0.1], [0, -1.02, 0]);
  } else if (o.tail === 'pig') {
    tail = new THREE.Group(); tail.position.set(-o.len * 1.0, o.h * 0.3, 0); core.add(tail);
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 16, Math.PI * 1.6), fur);
    curl.rotation.y = Math.PI / 2; tail.add(curl);
  }

  // Manchas
  for (const sp of (o.spots || [])) {
    const mat = skinMat(sp.color);
    for (let k = 0; k < sp.n; k++) {
      const phi = (Math.random() - 0.5) * Math.PI * 1.5;
      const x = (Math.random() * 1.5 - 0.75) * o.len;
      const r = Math.sqrt(Math.max(0.05, 1 - (x / o.len) ** 2));
      const sz = sp.size * (0.7 + Math.random() * 0.6);
      part(core, S, mat, [sz * o.len, sz * o.h * 1.1, sz * o.w * 1.1], [x, Math.cos(phi) * o.h * r * 0.93, Math.sin(phi) * o.w * r * 0.93]);
    }
    if (sp.head) part(head, S, mat, [hx * 0.7, hy * 0.75, hz * 1.02], [-hx * 0.25, hy * 0.2, 0]);
  }
  if (o.udder) part(core, S, skinMat(0xf2b6b0), [0.26, 0.18, 0.26], [-o.len * 0.35, -o.h * 0.95, 0]);
  if (o.orange) {
    // capibara con su naranja en la cabeza
    part(head, S, skinMat(0xf97316, { r: 0.5 }), [0.17, 0.15, 0.17], [-hx * 0.05, hy * 1.08, 0], null, true);
    part(head, S, skinMat(0x16a34a), [0.08, 0.02, 0.05], [-hx * 0.02, hy * 1.25, 0.04], [0, 0, 0.3]);
  }
  if (o.snoutDisk) part(head, C, skinMat(0xf08ca0), [hz * 0.3, 0.08, hz * 0.3], [hx * 1.18, -hy * 0.1, 0], [0, 0, Math.PI / 2]);

  G.userData = { kind: 'critter', core, head, legs, tail, gait: o.gait, bodyY, seatY: bodyY + o.h - 0.45 + (o.seatAdj || 0), tailKind: o.tail };
  return G;
}

// Esqueleto de caballo con ojos brillantes
function buildSkeletonSkin() {
  const { sphere: S, cyl: C, box: B } = SG();
  const G = new THREE.Group(), core = new THREE.Group();
  core.position.y = 1.32;
  G.add(core);
  const bone = skinMat(0xebe5d2, { r: 0.65, e: 0x1f1d16, ei: 0.4 });
  const hole = skinMat(0x050505, { r: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
  // Columna con apófisis
  for (let i = 0; i < 11; i++) {
    const x = -1.0 + i * 0.19;
    part(core, B, bone, [0.14, 0.13, 0.13], [x, 0.25, 0], null, true);
    part(core, B, bone, [0.04, 0.16, 0.04], [x, 0.37, 0]);
  }
  // Costillas
  for (let i = 0; i < 7; i++) {
    const r = 0.42 - Math.abs(i - 3) * 0.035;
    const rg = new THREE.Group();
    rg.position.set(-0.4 + i * 0.16, 0.25, 0);
    rg.rotation.x = Math.PI;
    rg.scale.y = 1.25;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 16, Math.PI), bone);
    rib.rotation.y = Math.PI / 2;
    rg.add(rib);
    core.add(rg);
  }
  part(core, B, bone, [0.95, 0.05, 0.08], [0.08, -0.27, 0]);           // esternón
  part(core, B, bone, [0.4, 0.3, 0.5], [-0.95, 0.15, 0], null, true);  // pelvis
  for (const sd of [-1, 1]) part(core, B, bone, [0.12, 0.5, 0.04], [0.62, 0.05, sd * 0.2], [0, 0, 0.3]);   // escápulas
  // Cuello y cráneo
  const neck = new THREE.Group(); neck.position.set(0.95, 0.3, 0); neck.rotation.z = -0.92; core.add(neck);
  for (let i = 0; i < 6; i++) part(neck, B, bone, [0.13, 0.11, 0.12], [0, 0.07 + i * 0.15, 0]);
  const skull = new THREE.Group(); skull.position.set(0, 0.95, 0); skull.rotation.z = 0.3; neck.add(skull);
  part(skull, S, bone, [0.2, 0.19, 0.17], null, null, true);
  part(skull, B, bone, [0.55, 0.14, 0.17], [0.32, -0.03, 0]);
  part(skull, B, bone, [0.45, 0.05, 0.13], [0.3, -0.15, 0]);
  for (const sd of [-1, 1]) {
    part(skull, S, hole, [0.075, 0.075, 0.04], [0.06, 0.06, sd * 0.135]);
    part(skull, S, glow, [0.035, 0.035, 0.02], [0.07, 0.06, sd * 0.16]);
    part(skull, S, hole, [0.03, 0.025, 0.02], [0.58, 0.0, sd * 0.05]);
  }
  // Cola
  for (let k = 0; k < 6; k++) part(core, S, bone, [0.06 - k * 0.007, 0.06 - k * 0.007, 0.06 - k * 0.007], [-1.18 - k * 0.12, 0.2 - k * 0.1, 0]);
  // Patas (copian el galope del caballo oculto)
  const legs = {};
  const mk = (key, x, y, z, isFront) => {
    const upper = new THREE.Group(); upper.position.set(x, y, z); core.add(upper);
    const jointY = isFront ? -0.56 : -0.6;
    part(upper, C, bone, [0.045, -jointY, 0.045], [0, jointY / 2, 0], null, true);
    part(upper, S, bone, [0.07, 0.07, 0.07], [0, jointY, 0]);
    const middle = new THREE.Group(); middle.position.y = jointY; upper.add(middle);
    part(middle, C, bone, [0.035, 0.45, 0.035], [0, -0.225, 0]);
    const fet = new THREE.Group(); fet.position.y = -0.45; middle.add(fet);
    part(fet, S, bone, [0.055, 0.055, 0.055]);
    part(fet, C, bone, [0.03, 0.2, 0.03], [0, -0.1, 0]);
    part(fet, B, bone, [0.16, 0.07, 0.13], [0.02, -0.2, 0]);
    legs[key] = { upper, middle, fet };
  };
  mk('fl', 0.68, -0.08, -0.2, true); mk('fr', 0.68, -0.08, 0.2, true);
  mk('bl', -0.7, -0.04, -0.21, false); mk('br', -0.7, -0.04, 0.21, false);
  G.userData = { kind: 'skeleton', core, neck, skull, legs };
  return G;
}

function buildWheel(r, w, tireMat, rimMat) {
  const { cyl: C, box: B } = SG();
  const wh = new THREE.Group();
  part(wh, C, tireMat, [r, w, r], null, [Math.PI / 2, 0, 0], true);
  part(wh, C, rimMat, [r * 0.6, w * 1.04, r * 0.6], null, [Math.PI / 2, 0, 0]);
  part(wh, B, tireMat, [r * 1.15, r * 0.14, w * 1.08]);
  part(wh, B, tireMat, [r * 0.14, r * 1.15, w * 1.08]);
  return wh;
}

// Auto de carreras descapotable (el jinete va de piloto)
function buildCarSkin() {
  const { box: B, cyl: C, sphere: S } = SG();
  const G = new THREE.Group(), core = new THREE.Group();
  G.add(core);
  const paint = skinMat(0xdc2626, { r: 0.3, m: 0.45 });
  const black = skinMat(0x111827, { r: 0.6 }), grey = skinMat(0x9ca3af, { r: 0.3, m: 0.7 });
  const glass = skinMat(0x7dd3fc, { r: 0.05, m: 0.2, op: 0.45 });
  const white = skinMat(0xf8fafc, { r: 0.4 });
  part(core, B, paint, [3.0, 0.42, 1.45], [0, 0.55, 0], null, true);
  part(core, B, paint, [0.8, 0.22, 1.3], [1.75, 0.45, 0], null, true);                 // trompa
  part(core, B, paint, [0.9, 0.2, 1.3], [-0.95, 0.85, 0], null, true);                 // cola alta
  part(core, B, white, [3.6, 0.02, 0.28], [0.15, 0.775, 0]);                           // franja
  part(core, B, glass, [0.06, 0.38, 1.2], [0.45, 0.98, 0], [0, 0, -0.5]);              // parabrisas
  part(core, B, black, [0.9, 0.08, 1.0], [-0.2, 0.77, 0]);                             // cabina
  // Alerón
  for (const sd of [-1, 1]) part(core, B, black, [0.08, 0.35, 0.08], [-1.4, 1.05, sd * 0.55]);
  part(core, B, paint, [0.4, 0.06, 1.6], [-1.45, 1.24, 0], null, true);
  // Luces
  for (const sd of [-1, 1]) {
    part(core, S, new THREE.MeshBasicMaterial({ color: 0xfef9c3 }), [0.06, 0.07, 0.14], [2.15, 0.5, sd * 0.45]);
    part(core, B, new THREE.MeshBasicMaterial({ color: 0xef4444 }), [0.04, 0.08, 0.3], [-1.5, 0.62, sd * 0.5]);
  }
  const exhaust = new THREE.Object3D(); exhaust.position.set(-1.6, 0.42, 0.3); core.add(exhaust);
  part(core, C, grey, [0.07, 0.25, 0.07], [-1.55, 0.42, 0.3], [0, 0, Math.PI / 2]);
  const tire = skinMat(0x111111, { r: 0.9 });
  const wheels = [];
  for (const x of [1.15, -1.0]) for (const sd of [-1, 1]) {
    const wh = buildWheel(0.38, 0.32, tire, grey);
    wh.position.set(x, 0.38, sd * 0.78);
    core.add(wh); wheels.push(wh);
  }
  G.userData = { kind: 'vehicle', core, wheels, r: 0.38, paint, exhaust, seatY: 0.1, seatX: -0.3, spin: 0 };
  return G;
}

// Moto deportiva (el jinete va montado)
function buildMotoSkin() {
  const { box: B, cyl: C, sphere: S } = SG();
  const G = new THREE.Group(), pivot = new THREE.Group(), core = new THREE.Group();
  const R = 0.42, rearX = -0.85;
  pivot.position.set(rearX, R, 0);     // pivote en el eje trasero (para hacer "willy" con turbo)
  core.position.set(-rearX, -R, 0);
  pivot.add(core); G.add(pivot);
  const paint = skinMat(0x2563eb, { r: 0.3, m: 0.45 });
  const black = skinMat(0x111827, { r: 0.6 }), grey = skinMat(0x9ca3af, { r: 0.3, m: 0.75 });
  part(core, B, paint, [0.7, 0.32, 0.38], [0.2, 1.02, 0], null, true);                    // estanque
  part(core, B, black, [0.7, 0.12, 0.32], [-0.35, 1.0, 0]);                              // asiento
  part(core, B, paint, [0.5, 0.18, 0.3], [-0.78, 1.0, 0], [0, 0, 0.25], true);           // colín
  part(core, B, grey, [0.55, 0.4, 0.32], [0.0, 0.62, 0], null, true);                    // motor
  part(core, B, paint, [0.35, 0.5, 0.45], [0.62, 1.05, 0], [0, 0, -0.35], true);         // carenado
  part(core, C, grey, [0.04, 0.95, 0.04], [0.72, 0.82, -0.12], [0, 0, 0.38]);            // horquilla
  part(core, C, grey, [0.04, 0.95, 0.04], [0.72, 0.82, 0.12], [0, 0, 0.38]);
  part(core, C, black, [0.03, 0.75, 0.03], [0.55, 1.28, 0], [Math.PI / 2, 0, 0]);        // manubrio
  part(core, S, new THREE.MeshBasicMaterial({ color: 0xfef9c3 }), [0.1, 0.1, 0.1], [0.86, 1.12, 0]);
  part(core, C, grey, [0.06, 0.8, 0.06], [-0.45, 0.48, 0.22], [0, 0, Math.PI / 2 + 0.12]); // escape
  const exhaust = new THREE.Object3D(); exhaust.position.set(-0.88, 0.53, 0.22); core.add(exhaust);
  const tire = skinMat(0x111111, { r: 0.9 });
  const wheels = [];
  for (const x of [0.85, rearX]) {
    const wh = buildWheel(R, 0.16, tire, grey);
    wh.position.set(x, R, 0);
    core.add(wh); wheels.push(wh);
  }
  G.userData = { kind: 'vehicle', core, pivot, wheels, r: R, paint, exhaust, seatY: 0.42, seatX: -0.3, spin: 0, wheelie: 0, rearX, moto: true };
  return G;
}

function buildSkinModel(key) {
  switch (key) {
    case 'otter': return buildCritterSkin({ color: 0x5b3a22, belly: 0xb08d6a, muzzle: 0xc8a782, len: 1.35, h: 0.42, w: 0.4, leg: 0.38, legR: 0.11,
      head: [0.42, 0.36, 0.36], headUp: 0.18, tail: 'otter', whiskers: true, gait: 'bound', paw: 0x3b2515 });
    case 'capybara': return buildCritterSkin({ color: 0x8b5e34, muzzle: 0x5a3a20, len: 1.25, h: 0.68, w: 0.62, leg: 0.5, legR: 0.15,
      head: [0.62, 0.48, 0.4], headUp: 0.05, gait: 'trot', orange: true, paw: 0x4a2f19 });
    case 'cuy': return buildCritterSkin({ color: 0xf5efe4, muzzle: 0xf5efe4, nose: 0xf4a3a8, earColor: 0xe8a59a, len: 1.1, h: 0.62, w: 0.6, leg: 0.22, legR: 0.12,
      head: [0.55, 0.48, 0.46], headUp: -0.05, gait: 'bound', whiskers: true, paw: 0xf4c7c0,
      spots: [{ color: 0xd9822b, n: 3, size: 0.45, head: true }, { color: 0x1f1a17, n: 2, size: 0.4 }] });
    case 'cow': return buildCritterSkin({ color: 0xf8f8f5, muzzle: 0xf0b8b0, nose: 0x7a4a45, len: 1.3, h: 0.6, w: 0.55, leg: 0.8, legR: 0.12,
      head: [0.5, 0.4, 0.34], ears: 'cow', tail: 'cow', udder: true, gait: 'trot', paw: 0x222222,
      spots: [{ color: 0x111111, n: 6, size: 0.32 }] });
    case 'pig': return buildCritterSkin({ color: 0xf4a6b5, muzzle: 0xf4a6b5, nose: 0xf08ca0, len: 1.15, h: 0.6, w: 0.58, leg: 0.48, legR: 0.13,
      head: [0.5, 0.45, 0.45], ears: 'pig', tail: 'pig', snoutDisk: true, gait: 'trot', paw: 0x6b4a40 });
    case 'skeleton': return buildSkeletonSkin();
    case 'car': return buildCarSkin();
    case 'moto': return buildMotoSkin();
  }
  return null;
}

function applySkin(rig, p) {
  const s = p.skin || null;
  if (rig.skin !== s) {
    for (const o of rig.horseParts) o.visible = !s;
    rig.reins.visible = !s;
    for (const k in rig.skinModels) rig.skinModels[k].visible = false;
    if (s) {
      if (!rig.skinModels[s]) {
        const m = buildSkinModel(s);
        rig.skinModels[s] = m;
        rig.root.add(m);
      }
      rig.skinModels[s].visible = true;
    }
    const vehicle = !!(s && SKINS[s].vehicle);
    for (const l of rig.riderLegs) l.visible = !(s === 'car');
    rig.bodyGroup.position.x = vehicle ? rig.skinModels[s].userData.seatX : 0;
    rig.skin = s;
    rig.skinPid = -1;
  }
  // Color del vehículo = colores del jinete
  if (s && rig.skinPid !== p.id) {
    rig.skinPid = p.id;
    const u = rig.skinModels[s].userData;
    if (u.paint) u.paint.color.set(p.silkHex);
  }
}

function animateSkin(rig, p, amp, dt) {
  const m = rig.skinModels[p.skin];
  if (!m) return;
  const u = m.userData, ph = p.gallopPhase;
  const bg = rig.bodyGroup;
  if (u.kind === 'critter') {
    const bound = u.gait === 'bound';
    const bob = (bound ? Math.abs(Math.sin(ph)) * 0.16 : Math.abs(Math.sin(ph * 2)) * 0.06) * amp;
    const pitch = (bound ? Math.cos(ph) * 0.12 : Math.sin(ph * 2) * 0.03) * amp;
    u.core.position.y = u.bodyY + bob;
    u.core.rotation.z = pitch;
    for (const l of u.legs) {
      const off = bound ? (l.front ? 0 : Math.PI) + l.sd * 0.3 : ((l.front === (l.sd > 0)) ? 0 : Math.PI);
      l.piv.rotation.z = Math.sin(ph + off) * 0.85 * amp;
    }
    u.head.rotation.z = Math.sin(ph * 2) * 0.06 * amp;
    if (u.tail) {
      if (u.tailKind === 'otter') { u.tail.rotation.y = Math.sin(ph * 1.5) * 0.3 * amp; u.tail.rotation.z = Math.sin(ph) * 0.12 * amp; }
      else u.tail.rotation.x = Math.sin(ph * 1.5) * 0.4 * amp;
    }
    bg.position.y = u.seatY + bob;
    bg.rotation.z = pitch * 0.7;
    bg.rotation.x = 0;
  } else if (u.kind === 'skeleton') {
    // Copia la postura del caballo oculto (mismo galope)
    u.core.position.y = bg.position.y;
    u.core.rotation.z = bg.rotation.z;
    u.core.rotation.x = bg.rotation.x;
    u.neck.rotation.z = rig.neckGroup.rotation.z;
    u.skull.rotation.z = rig.headGroup.rotation.z;
    for (const k in u.legs) {
      const src = rig.legs[k], dst = u.legs[k];
      dst.upper.rotation.z = src.upper.rotation.z;
      dst.middle.rotation.z = src.middle.rotation.z;
      dst.fet.rotation.z = src.fetlock.rotation.z;
    }
  } else {
    u.spin += (p.speed || 0) * dt / u.r;
    for (const w of u.wheels) w.rotation.z = -u.spin;
    const vib = Math.sin(performance.now() * 0.05 + p.id) * 0.012 * Math.min(1, amp * 2);
    const turbo = p.state === 'turbo' || p.state === 'attack';
    let seatX = u.seatX, seatY = u.seatY + vib, rot = 0;
    if (u.moto) {
      // Con turbo levanta la rueda delantera; el piloto gira junto con la moto
      u.wheelie += ((turbo && (state.phase === 'racing' || state.phase === 'replay') ? 0.3 : 0) - u.wheelie) * Math.min(1, dt * 4);
      u.pivot.rotation.z = u.wheelie;
      u.pivot.position.y = u.r + vib;
      const ax = u.rearX, ay = u.r, c = Math.cos(u.wheelie), s = Math.sin(u.wheelie);
      const dx = u.seatX - ax, dy = u.seatY - ay;
      seatX = ax + dx * c - dy * s; seatY = ay + dx * s + dy * c + vib;
      rot = u.wheelie;
    } else {
      u.core.position.y = vib;
    }
    bg.position.x = seatX; bg.position.y = seatY;
    bg.rotation.z = rot; bg.rotation.x = 0;
    // Llamarada del escape con turbo
    if (turbo && dt > 0 && (state.phase === 'racing' || state.phase === 'replay')) {
      u.exhaust.getWorldPosition(tmpV2);
      emitDX = rig.dirX; emitDZ = rig.dirZ;
      for (let k = 0; k < 3; k++) {
        firePool.spawn(tmpV2.x, tmpV2.y, tmpV2.z, p.speed * 0.5 + rnd(-1, 1), rnd(-0.2, 0.8), rnd(-0.4, 0.4),
          rnd(0.18, 0.3), 0.4, 0.06, 1, 0.9, 0.5, 1, 0.25, 0.02, 0.95, 0, 1);
      }
    }
  }
}
