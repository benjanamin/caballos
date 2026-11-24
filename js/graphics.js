// Hipódromo 3D Pro — Motor 3D: escena, caballos, jinetes, pista y estampida instanciada
// Los archivos comparten el ámbito global y se cargan en orden desde index.html.
'use strict';

// =========================================================================
// 5. MOTOR 3D: ESCENA, MODELOS DE CABALLO/JINETE Y ESTAMPIDA INSTANCIADA
// =========================================================================
let scene, camera, renderer, sunLight, skyDome;
let trackGroup = null;
let horsePoolGroup = null;
let stampedeGroup = null;
let gateDoors = [];
let stampedeBarrier = null;
let horseRigs = [];
let inst = { capacity: 0, core: null, legsF: null, legsH: null, jockey: null };

const camDrag = { active: false, lastX: 0, lastY: 0, yawOffset: 0, pitchOffset: 0, zoomOffset: 0 };

const trackedLeaderPos = new THREE.Vector3(0, 0, 0);
const tmpCamPos = new THREE.Vector3();
const tmpLookAt = new THREE.Vector3();
const currentCamPos = new THREE.Vector3(10, 7, 22);
const currentLookAt = new THREE.Vector3(0, 1.7, 0);
const tmpColor = new THREE.Color();
const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const instDummy = new THREE.Object3D();
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

const sharedAssets = { initialized: false, geo: {}, mats: {}, coatMats: [], maneMats: [], silkMats: [], silk2Mats: [], all: new Set() };

// -------------------------------------------------------------------------
// Utilidades de geometría
// -------------------------------------------------------------------------
// Torno a lo largo de un eje: perfil [[radio, posición], ...]
function lathe(profile, segs, alongX) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const g = new THREE.LatheGeometry(pts, segs);
  if (alongX) g.rotateZ(-Math.PI / 2);
  return g;
}

function m4(x, y, z, rz = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0) {
  instDummy.position.set(x, y, z);
  instDummy.rotation.set(rx, ry, rz);
  instDummy.scale.set(sx, sy, sz);
  instDummy.updateMatrix();
  return instDummy.matrix.clone();
}

// Une varias geometrías (con transformación y color por vértice) en una sola
function mergeParts(parts) {
  const pre = [];
  let total = 0;
  for (const pt of parts) {
    const g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone();
    g.applyMatrix4(pt.matrix);
    pre.push({ g, c: pt.color || [1, 1, 1] });
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let off = 0;
  for (const { g, c } of pre) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    for (let i = 0; i < n; i++) {
      col[(off + i) * 3] = c[0];
      col[(off + i) * 3 + 1] = c[1];
      col[(off + i) * 3 + 2] = c[2];
    }
    off += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// Textura de chaquetilla con dibujo (aros, rombos, banda, etc.)
function createSilkTexture(silk) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = silk.hex;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = silk.hex2;
  switch (silk.pattern) {
    case 'hoops': for (let y = 8; y < 128; y += 32) ctx.fillRect(0, y, 128, 12); break;
    case 'stripes': for (let x = 6; x < 128; x += 26) ctx.fillRect(x, 0, 10, 128); break;
    case 'diamonds':
      for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
        ctx.beginPath(); ctx.moveTo(x + 16, y + 4); ctx.lineTo(x + 28, y + 16); ctx.lineTo(x + 16, y + 28); ctx.lineTo(x + 4, y + 16); ctx.closePath(); ctx.fill();
      }
      break;
    case 'sash':
      ctx.save(); ctx.translate(64, 64); ctx.rotate(-0.7); ctx.fillRect(-90, -11, 180, 22); ctx.restore(); break;
    case 'star':
      for (let y = 16; y < 128; y += 48) for (let x = 16; x < 128; x += 48) {
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? 12 : 5;
          const a = -Math.PI / 2 + k * Math.PI / 5;
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
      }
      break;
    case 'halves': ctx.fillRect(0, 0, 64, 128); break;
    case 'spots':
      for (let y = 12; y < 128; y += 30) for (let x = (y / 30) % 2 ? 26 : 10; x < 128; x += 32) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); }
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// -------------------------------------------------------------------------
// Geometrías y materiales compartidos
// -------------------------------------------------------------------------
function initSharedHorseAssets() {
  if (sharedAssets.initialized) return;
  const g = sharedAssets.geo;

  // --- Caballo detallado ---
  g.torso = lathe([[0, -1.02], [0.2, -0.99], [0.34, -0.88], [0.42, -0.66], [0.44, -0.4], [0.41, -0.1],
                   [0.39, 0.2], [0.42, 0.5], [0.42, 0.74], [0.34, 0.92], [0.17, 1.0], [0, 1.02]], 18, true);
  g.torso.scale(1, 1, 0.84);
  g.rump = new THREE.SphereGeometry(0.42, 16, 12); g.rump.scale(1.12, 1.0, 0.95);
  g.chest = new THREE.SphereGeometry(0.4, 16, 12); g.chest.scale(1.0, 1.06, 0.92);
  g.withers = new THREE.SphereGeometry(0.3, 12, 8); g.withers.scale(1.35, 0.8, 0.7);
  g.neck = lathe([[0.31, -0.05], [0.29, 0.2], [0.24, 0.5], [0.19, 0.78], [0.16, 0.95], [0.12, 1.0]], 14, false);
  g.neck.scale(1, 1, 0.72);
  g.maneStrand = new THREE.BoxGeometry(0.1, 0.2, 0.05); g.maneStrand.translate(-0.05, 0, 0);
  g.head = lathe([[0, -0.13], [0.13, -0.11], [0.175, 0.0], [0.17, 0.14], [0.135, 0.3], [0.105, 0.42],
                  [0.115, 0.5], [0.1, 0.57], [0.05, 0.61], [0, 0.62]], 14, true);
  g.head.scale(1, 1, 0.72);
  g.jaw = new THREE.SphereGeometry(0.15, 12, 10); g.jaw.scale(1.15, 1.0, 0.78);
  g.eye = new THREE.SphereGeometry(0.034, 8, 6);
  g.nostril = new THREE.SphereGeometry(0.03, 6, 5);
  g.ear = new THREE.ConeGeometry(0.045, 0.17, 7); g.ear.translate(0, 0.08, 0);
  g.forelock = new THREE.BoxGeometry(0.16, 0.06, 0.1);
  g.blaze = new THREE.BoxGeometry(0.42, 0.02, 0.06);
  g.noseband = new THREE.TorusGeometry(0.115, 0.014, 6, 16); g.noseband.rotateY(Math.PI / 2);
  g.browband = new THREE.TorusGeometry(0.15, 0.012, 6, 16); g.browband.rotateY(Math.PI / 2);
  g.tailStrand = new THREE.ConeGeometry(0.075, 0.95, 7); g.tailStrand.rotateX(Math.PI); g.tailStrand.translate(0, -0.47, 0);
  g.tailBase = new THREE.SphereGeometry(0.09, 8, 6);

  g.forearm = lathe([[0.075, -0.56], [0.085, -0.46], [0.12, -0.22], [0.145, -0.05], [0.12, 0.04]], 10, false);
  g.gaskin = lathe([[0.08, -0.6], [0.1, -0.48], [0.165, -0.22], [0.2, -0.05], [0.17, 0.06]], 10, false);
  g.knee = new THREE.SphereGeometry(0.082, 10, 8);
  g.cannon = lathe([[0.058, -0.45], [0.05, -0.3], [0.052, -0.1], [0.064, 0.02]], 9, false);
  g.fetlock = new THREE.SphereGeometry(0.066, 9, 7);
  g.pastern = new THREE.CylinderGeometry(0.05, 0.058, 0.16, 8); g.pastern.translate(0, -0.08, 0);
  g.hoof = new THREE.CylinderGeometry(0.062, 0.082, 0.11, 10); g.hoof.translate(0, -0.2, 0);

  // Montura y mantilla con número
  g.saddle = new THREE.BoxGeometry(0.5, 0.07, 0.5);
  g.saddleCloth = new THREE.PlaneGeometry(0.66, 0.36);
  g.girth = new THREE.TorusGeometry(0.43, 0.025, 6, 24); g.girth.rotateY(Math.PI / 2); g.girth.scale(1, 1, 0.84);

  // --- Jinete ---
  g.jTorso = lathe([[0.12, -0.02], [0.17, 0.12], [0.19, 0.3], [0.17, 0.46], [0.12, 0.54], [0.06, 0.57]], 12, true);
  g.jTorso.scale(1, 0.95, 0.88);
  g.jHead = new THREE.SphereGeometry(0.105, 12, 10);
  g.jHelmet = new THREE.SphereGeometry(0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.jPeak = new THREE.BoxGeometry(0.1, 0.018, 0.17);
  g.jPom = new THREE.SphereGeometry(0.03, 6, 5);
  g.jGoggles = new THREE.BoxGeometry(0.05, 0.05, 0.2);
  g.jUpperArm = new THREE.CylinderGeometry(0.052, 0.045, 0.27, 8); g.jUpperArm.translate(0, -0.135, 0);
  g.jForearm = new THREE.CylinderGeometry(0.044, 0.038, 0.26, 8); g.jForearm.translate(0, -0.13, 0);
  g.jHand = new THREE.SphereGeometry(0.045, 8, 6);
  g.jThigh = new THREE.CylinderGeometry(0.075, 0.06, 0.32, 8); g.jThigh.translate(0, -0.16, 0);
  g.jShin = new THREE.CylinderGeometry(0.058, 0.05, 0.34, 8); g.jShin.translate(0, -0.17, 0);
  g.jFoot = new THREE.BoxGeometry(0.16, 0.06, 0.07);
  g.stirrup = new THREE.TorusGeometry(0.05, 0.01, 4, 10);
  g.whip = new THREE.CylinderGeometry(0.008, 0.012, 0.62, 5); g.whip.translate(0, 0.28, 0);

  // Etiqueta flotante
  g.none = null;

  // --- Materiales ---
  const M = sharedAssets.mats;
  sharedAssets.coatMats = HORSE_COATS.map(c => new THREE.MeshStandardMaterial({ color: c.body, roughness: 0.38, metalness: 0.08 }));
  sharedAssets.maneMats = HORSE_COATS.map(c => new THREE.MeshStandardMaterial({ color: c.mane, roughness: 0.85 }));
  sharedAssets.silkMats = JOCKEY_SILKS.map(s => new THREE.MeshStandardMaterial({ color: 0xffffff, map: createSilkTexture(s), roughness: 0.35, metalness: 0.05 }));
  sharedAssets.silk2Mats = JOCKEY_SILKS.map(s => new THREE.MeshStandardMaterial({ color: new THREE.Color(s.hex2), roughness: 0.3, metalness: 0.1 }));

  M.hoof = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.45 });
  M.sock = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.6 });
  M.eye = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.05, metalness: 0.3 });
  M.nostril = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 0.8 });
  M.tack = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.55 });
  M.saddle = new THREE.MeshStandardMaterial({ color: 0x3b2414, roughness: 0.4, metalness: 0.05 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.85 });
  M.skin = new THREE.MeshStandardMaterial({ color: 0xe0ac86, roughness: 0.6 });
  M.breeches = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
  M.boots = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.25, metalness: 0.2 });
  M.gloves = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 });
  M.goggles = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.7 });
  M.whip = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  M.reins = new THREE.LineBasicMaterial({ color: 0x2b1b10 });
  M.instHorse = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.06, vertexColors: true });
  M.instJockey = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.05, vertexColors: true });

  // --- Geometrías combinadas para la estampida (LOD instanciado) ---
  const W = [1, 1, 1], D = [0.22, 0.22, 0.22], H = [0.12, 0.12, 0.12];
  const neckLow = lathe([[0.3, -0.05], [0.24, 0.5], [0.15, 0.98]], 8, false); neckLow.scale(1, 1, 0.72);
  const headLow = lathe([[0, -0.12], [0.17, 0.0], [0.13, 0.3], [0.1, 0.55], [0, 0.62]], 8, true); headLow.scale(1, 1, 0.72);
  const torsoLow = lathe([[0, -1.02], [0.34, -0.88], [0.44, -0.45], [0.4, 0.15], [0.43, 0.6], [0.3, 0.93], [0, 1.02]], 10, true); torsoLow.scale(1, 1, 0.84);
  // Cuello + cabeza: el cuello sale de (0.82, 0.25) inclinado -0.9 rad; la cabeza de su punta
  const neckRot = -0.92;
  const neckTip = [0.82 + Math.sin(-neckRot) * 0.95, 0.25 + Math.cos(neckRot) * 0.95];
  g.instCore = mergeParts([
    { geo: torsoLow, matrix: m4(0, 0, 0), color: W },
    { geo: new THREE.SphereGeometry(0.42, 8, 6), matrix: m4(-0.62, 0.1, 0, 0, 1.12, 1, 0.95), color: W },
    { geo: new THREE.SphereGeometry(0.4, 8, 6), matrix: m4(0.7, -0.02, 0, 0, 1, 1.06, 0.92), color: W },
    { geo: neckLow, matrix: m4(0.82, 0.25, 0, neckRot), color: W },
    { geo: new THREE.BoxGeometry(0.12, 0.9, 0.06), matrix: m4(0.82 - 0.2, 0.25 + 0.4, 0, neckRot, 1, 1, 1), color: D },
    { geo: headLow, matrix: m4(neckTip[0], neckTip[1], 0, -0.62), color: W },
    { geo: new THREE.ConeGeometry(0.045, 0.17, 5), matrix: m4(neckTip[0] - 0.02, neckTip[1] + 0.17, 0.07, 0.4), color: W },
    { geo: new THREE.ConeGeometry(0.045, 0.17, 5), matrix: m4(neckTip[0] - 0.02, neckTip[1] + 0.17, -0.07, 0.4), color: W },
    { geo: new THREE.ConeGeometry(0.11, 1.0, 6), matrix: m4(-1.3, -0.12, 0, 2.5), color: D },
    { geo: new THREE.BoxGeometry(0.5, 0.07, 0.5), matrix: m4(0.08, 0.44, 0), color: [0.35, 0.22, 0.12] }
  ]);
  g.instLegF = mergeParts([
    { geo: lathe([[0.075, -0.56], [0.12, -0.22], [0.14, 0.04]], 6, false), matrix: m4(0, 0, 0), color: W },
    { geo: new THREE.CylinderGeometry(0.06, 0.055, 0.5, 6), matrix: m4(0, -0.8, 0), color: W },
    { geo: new THREE.CylinderGeometry(0.06, 0.08, 0.14, 6), matrix: m4(0, -1.1, 0), color: H }
  ]);
  g.instLegH = mergeParts([
    { geo: lathe([[0.08, -0.6], [0.165, -0.22], [0.19, 0.06]], 6, false), matrix: m4(0, 0, 0), color: W },
    { geo: new THREE.CylinderGeometry(0.06, 0.055, 0.48, 6), matrix: m4(0.03, -0.84, 0, -0.08), color: W },
    { geo: new THREE.CylinderGeometry(0.06, 0.08, 0.14, 6), matrix: m4(0.05, -1.13, 0), color: H }
  ]);
  const jt = lathe([[0.12, -0.02], [0.19, 0.3], [0.12, 0.54], [0.06, 0.57]], 8, true); jt.scale(1, 0.95, 0.88);
  g.instJockey = mergeParts([
    { geo: jt, matrix: m4(0, 0.06, 0, 0.25), color: W },
    { geo: new THREE.SphereGeometry(0.13, 8, 6), matrix: m4(0.6, 0.24, 0), color: W },
    { geo: new THREE.BoxGeometry(0.34, 0.08, 0.1), matrix: m4(0.62, 0.02, 0.18, -0.5), color: W },
    { geo: new THREE.BoxGeometry(0.34, 0.08, 0.1), matrix: m4(0.62, 0.02, -0.18, -0.5), color: W },
    { geo: new THREE.BoxGeometry(0.3, 0.09, 0.1), matrix: m4(0.16, -0.12, 0.2, -0.9), color: [0.9, 0.9, 0.9] },
    { geo: new THREE.BoxGeometry(0.3, 0.09, 0.1), matrix: m4(0.16, -0.12, -0.2, -0.9), color: [0.9, 0.9, 0.9] },
    { geo: new THREE.BoxGeometry(0.66, 0.34, 0.78), matrix: m4(-0.07, -0.44, 0), color: W }
  ]);
  [neckLow, headLow, torsoLow, jt].forEach(x => x.dispose());

  // Registro para no liberar recursos compartidos
  Object.values(g).forEach(x => x && sharedAssets.all.add(x));
  Object.values(M).forEach(x => sharedAssets.all.add(x));
  [...sharedAssets.coatMats, ...sharedAssets.maneMats, ...sharedAssets.silkMats, ...sharedAssets.silk2Mats].forEach(x => sharedAssets.all.add(x));

  sharedAssets.initialized = true;
}

// -------------------------------------------------------------------------
// Etiqueta flotante compacta (posición + nombre) – tamaño constante en pantalla
// -------------------------------------------------------------------------
function createHorseLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0);
  sprite.scale.set(0.16, 0.036, 1);
  sprite.position.set(0.3, 3.05, 0);
  sprite.renderOrder = 30;
  return { sprite, canvas, ctx, tex, lastKey: '' };
}

function updateHorseLabel(label, p) {
  const key = `${p.id}|${p.rank}|${p.state}`;
  if (label.lastKey === key) return;
  label.lastKey = key;
  const ctx = label.ctx;
  const W = label.canvas.width, H = label.canvas.height;
  ctx.clearRect(0, 0, W, H);
  const info = STATE_INFO[p.state] || STATE_INFO.normal;

  roundRectPath(ctx, 4, 6, W - 8, H - 12, 26);
  ctx.fillStyle = 'rgba(8, 13, 26, 0.82)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = p.rank === 1 ? '#fbbf24' : info.border;
  ctx.stroke();

  const pillColor = p.rank === 1 ? '#fbbf24' : p.rank === 2 ? '#cbd5e1' : p.rank === 3 ? '#b45309' : '#334155';
  ctx.fillStyle = pillColor;
  ctx.beginPath(); ctx.arc(36, H / 2, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.rank <= 2 ? '#0f172a' : '#ffffff';
  ctx.font = '900 26px Outfit, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(p.rank), 36, H / 2 + 1);

  ctx.fillStyle = p.silkHex;
  ctx.beginPath(); ctx.arc(74, H / 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 25px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  let name = p.name;
  if (name.length > 14) name = name.slice(0, 13) + '…';
  ctx.fillText(name + (info.icon ? ' ' + info.icon : ''), 90, H / 2 + 1);
  label.tex.needsUpdate = true;
}

// Textura del número en la mantilla
function drawClothNumber(rig, p) {
  const ctx = rig.clothCtx;
  const silk = JOCKEY_SILKS[p.silkIdx];
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 128, 72);
  ctx.fillStyle = silk.hex;
  ctx.fillRect(0, 0, 128, 10);
  ctx.fillRect(0, 62, 128, 10);
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 46px Outfit, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(p.id + 1), 64, 38);
  rig.clothTex.needsUpdate = true;
}

// -------------------------------------------------------------------------
// Caballo detallado articulado con jinete completo
// -------------------------------------------------------------------------
function createArticulatedHorseRig() {
  const g = sharedAssets.geo;
  const M = sharedAssets.mats;
  const coat = sharedAssets.coatMats[0];
  const mane = sharedAssets.maneMats[0];
  const silk = sharedAssets.silkMats[0];
  const silk2 = sharedAssets.silk2Mats[0];

  const coatMeshes = [], maneMeshes = [], silkMeshes = [], silk2Meshes = [];
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, list = null, shadow = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (shadow) m.castShadow = true;
    parent.add(m);
    if (list) list.push(m);
    return m;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 1.32;
  root.add(bodyGroup);

  // Cuerpo
  add(bodyGroup, g.torso, coat, 0, 0, 0, coatMeshes, true);
  add(bodyGroup, g.rump, coat, -0.62, 0.1, 0, coatMeshes, true);
  add(bodyGroup, g.chest, coat, 0.7, -0.02, 0, coatMeshes, true);
  add(bodyGroup, g.withers, coat, 0.48, 0.3, 0, coatMeshes);

  // Cuello con crin ondulante
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0.82, 0.25, 0);
  neckGroup.rotation.z = -0.92;
  bodyGroup.add(neckGroup);
  add(neckGroup, g.neck, coat, 0, 0, 0, coatMeshes, true);
  const maneStrands = [];
  for (let k = 0; k < 8; k++) {
    const t = k / 7;
    const s = add(neckGroup, g.maneStrand, mane, -0.27 + t * 0.12, 0.05 + t * 0.88, 0, maneMeshes);
    s.scale.set(1.3 - t * 0.4, 1, 1);
    maneStrands.push(s);
  }

  // Cabeza
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.95, 0);
  headGroup.rotation.z = 0.3;
  neckGroup.add(headGroup);
  add(headGroup, g.head, coat, 0, 0, 0, coatMeshes, true);
  add(headGroup, g.jaw, coat, 0.04, -0.06, 0, coatMeshes);
  [-1, 1].forEach(side => {
    add(headGroup, g.eye, M.eye, 0.1, 0.06, side * 0.118);
    add(headGroup, g.nostril, M.nostril, 0.57, -0.02, side * 0.05);
  });
  const earL = add(headGroup, g.ear, coat, -0.07, 0.13, -0.07, coatMeshes);
  const earR = add(headGroup, g.ear, coat, -0.07, 0.13, 0.07, coatMeshes);
  add(headGroup, g.forelock, mane, 0.02, 0.15, 0, maneMeshes).rotation.z = -0.5;
  const blaze = add(headGroup, g.blaze, M.sock, 0.27, 0.136, 0);
  blaze.rotation.z = -0.14;
  add(headGroup, g.noseband, M.tack, 0.42, 0.0, 0);
  add(headGroup, g.browband, M.tack, 0.02, 0.05, 0);
  const bit = new THREE.Object3D();
  bit.position.set(0.5, -0.07, 0);
  headGroup.add(bit);

  // Cola de varios mechones
  const tailGroup = new THREE.Group();
  tailGroup.position.set(-1.0, 0.28, 0);
  bodyGroup.add(tailGroup);
  add(tailGroup, g.tailBase, mane, 0, 0, 0, maneMeshes);
  const tailStrands = [];
  for (let k = 0; k < 4; k++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, -0.02 * k, (k - 1.5) * 0.04);
    tailGroup.add(pivot);
    const s = add(pivot, g.tailStrand, mane, 0, 0, 0, maneMeshes);
    s.scale.set(1, 0.85 + k * 0.08, 1);
    tailStrands.push(pivot);
  }

  // Montura, cincha y mantilla con número
  add(bodyGroup, g.saddle, M.saddle, 0.06, 0.43, 0);
  add(bodyGroup, g.girth, M.tack, 0.18, 0, 0);
  const clothCanvas = document.createElement('canvas');
  clothCanvas.width = 128; clothCanvas.height = 72;
  const clothCtx = clothCanvas.getContext('2d');
  const clothTex = new THREE.CanvasTexture(clothCanvas);
  const clothMat = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.6, side: THREE.DoubleSide });
  [-1, 1].forEach(side => {
    const cloth = add(bodyGroup, g.saddleCloth, clothMat, -0.02, 0.2, side * 0.36);
    cloth.rotation.x = -side * 0.12;
    if (side < 0) cloth.rotation.y = Math.PI;
  });

  // --- Jinete agachado (postura de carrera) ---
  const jockeyGroup = new THREE.Group();
  jockeyGroup.position.set(0.0, 0.66, 0);
  bodyGroup.add(jockeyGroup);

  const torsoPivot = new THREE.Group();
  torsoPivot.rotation.z = 0.22;
  jockeyGroup.add(torsoPivot);
  add(torsoPivot, g.jTorso, silk, 0, 0, 0, silkMeshes, true);

  const headPivot = new THREE.Group();
  headPivot.position.set(0.6, 0.1, 0);
  torsoPivot.add(headPivot);
  add(headPivot, g.jHead, M.skin, 0.04, 0.02, 0);
  const helmet = add(headPivot, g.jHelmet, silk2, 0.02, 0.04, 0, silk2Meshes, true);
  helmet.rotation.z = -0.25;
  add(headPivot, g.jPeak, silk2, 0.14, 0.06, 0, silk2Meshes).rotation.z = -0.3;
  add(headPivot, g.jPom, silk, -0.01, 0.17, 0, silkMeshes);
  add(headPivot, g.jGoggles, M.goggles, 0.115, 0.03, 0);

  // Brazos (hombro → codo → mano), las manos sujetan las riendas junto al cuello
  const arms = [];
  [-1, 1].forEach(side => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.46, 0.05, side * 0.17);
    torsoPivot.add(shoulder);
    add(shoulder, g.jUpperArm, silk, 0, 0, 0, silkMeshes);
    shoulder.rotation.z = 0.3;
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.27, 0);
    shoulder.add(elbow);
    add(elbow, g.jForearm, silk, 0, 0, 0, silkMeshes);
    elbow.rotation.z = 0.75;
    const hand = add(elbow, g.jHand, M.gloves, 0, -0.27, 0);
    let whip = null;
    if (side === 1) {
      whip = add(hand, g.whip, M.whip, 0, 0, 0);
      whip.rotation.z = -0.9;
    }
    arms.push({ shoulder, elbow, hand, whip, side });
  });

  // Piernas: muslo hacia adelante, bota hacia el estribo
  [-1, 1].forEach(side => {
    const hip = new THREE.Group();
    hip.position.set(0.02, -0.02, side * 0.15);
    hip.rotation.z = 1.2;
    hip.rotation.x = -side * 0.55;
    jockeyGroup.add(hip);
    add(hip, g.jThigh, M.breeches, 0, 0, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -0.31, 0);
    knee.rotation.z = -1.56;
    hip.add(knee);
    add(knee, g.jShin, M.boots, 0, 0, 0);
    const foot = add(knee, g.jFoot, M.boots, 0.03, -0.34, 0);
    foot.rotation.z = 0.36;
    add(knee, g.stirrup, M.metal, 0.0, -0.36, 0).rotation.y = Math.PI / 2;
  });

  // Riendas (línea dinámica de las manos al bocado)
  const reinGeo = new THREE.BufferGeometry();
  reinGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  const reins = new THREE.LineSegments(reinGeo, M.reins);
  reins.frustumCulled = false;
  root.add(reins);

  // Patas multisegmento
  function makeLeg(x, z, isFront) {
    const upper = new THREE.Group();
    upper.position.set(x, isFront ? -0.08 : -0.04, z);
    bodyGroup.add(upper);
    add(upper, isFront ? g.forearm : g.gaskin, coat, 0, 0, 0, coatMeshes, true);
    const jointY = isFront ? -0.56 : -0.6;
    add(upper, g.knee, coat, 0, jointY, 0, coatMeshes);
    const middle = new THREE.Group();
    middle.position.set(0, jointY, 0);
    upper.add(middle);
    const cannon = add(middle, g.cannon, coat, 0, 0, 0, null, true);
    const fetlock = new THREE.Group();
    fetlock.position.set(0, -0.45, 0);
    middle.add(fetlock);
    const fetBall = add(fetlock, g.fetlock, coat, 0, 0, 0);
    const pastern = add(fetlock, g.pastern, coat, 0, 0, 0);
    add(fetlock, g.hoof, M.hoof, 0, 0, 0);
    const hoofTip = new THREE.Object3D();
    hoofTip.position.set(0, -0.22, 0);
    fetlock.add(hoofTip);
    return { upper, middle, fetlock, hoofTip, sockMeshes: [cannon, fetBall, pastern], prevAngle: 0, isFront, zOffset: z };
  }
  const legs = {
    fl: makeLeg(0.68, -0.2, true),
    fr: makeLeg(0.68, 0.2, true),
    bl: makeLeg(-0.7, -0.21, false),
    br: makeLeg(-0.7, 0.21, false)
  };

  const label = createHorseLabel();
  root.add(label.sprite);

  return {
    root, bodyGroup, neckGroup, headGroup, earL, earR, blaze, bit, maneStrands,
    tailGroup, tailStrands, jockeyGroup, torsoPivot, headPivot, arms, legs, reins,
    clothCtx, clothTex, label,
    coatMeshes, maneMeshes, silkMeshes, silk2Meshes,
    coatIdx: -1, silkIdx: -1, markKey: '', assignedParticipantId: -1,
    // Skins especiales: se ocultan las piezas del caballo (el jinete queda) y se muestra otro modelo
    horseParts: bodyGroup.children.filter(c => c !== jockeyGroup),
    riderLegs: jockeyGroup.children.filter(c => c !== torsoPivot),
    skinModels: {}, skin: null, skinPid: -1
  };
}

function applyHorseAppearance(rig, p) {
  if (rig.coatIdx !== p.coatIdx) {
    const cMat = sharedAssets.coatMats[p.coatIdx];
    const mMat = sharedAssets.maneMats[p.coatIdx];
    for (const m of rig.coatMeshes) m.material = cMat;
    for (const m of rig.maneMeshes) m.material = mMat;
    rig.coatIdx = p.coatIdx;
    rig.markKey = '';
  }
  if (rig.silkIdx !== p.silkIdx) {
    for (const m of rig.silkMeshes) m.material = sharedAssets.silkMats[p.silkIdx];
    for (const m of rig.silk2Meshes) m.material = sharedAssets.silk2Mats[p.silkIdx];
    rig.silkIdx = p.silkIdx;
  }
  const mk = `${p.id}|${p.coatIdx}`;
  if (rig.markKey !== mk) {
    rig.markKey = mk;
    rig.blaze.visible = p.blaze;
    const legOrder = [rig.legs.fl, rig.legs.fr, rig.legs.bl, rig.legs.br];
    legOrder.forEach((leg, i) => {
      const mat = (p.socks >> i) & 1 ? sharedAssets.mats.sock : sharedAssets.coatMats[p.coatIdx];
      leg.sockMeshes.forEach(m => { m.material = mat; });
    });
    drawClothNumber(rig, p);
    rig.label.lastKey = '';
  }
  applySkin(rig, p);
}



// Texturas procedurales
function createSkyGradientTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#1d4ed8');
  grad.addColorStop(0.35, '#38bdf8');
  grad.addColorStop(0.68, '#bae6fd');
  grad.addColorStop(1.0, '#e0f2fe');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(canvas);
}

function createTrackTexture(surfaceType) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (surfaceType === 'dirt') {
    ctx.fillStyle = '#9e7248';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 6) {
      ctx.fillStyle = y % 12 === 0 ? 'rgba(65, 42, 22, 0.14)' : 'rgba(218, 178, 134, 0.11)';
      ctx.fillRect(0, y, 512, 3);
    }
    for (let i = 0; i < 12000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const s = Math.random() * 2 + 0.6;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(72, 46, 24, 0.22)' : 'rgba(232, 196, 152, 0.20)';
      ctx.fillRect(x, y, s, s);
    }
  } else {
    const stripeW = 64;
    for (let x = 0; x < 512; x += stripeW) {
      ctx.fillStyle = (x / stripeW) % 2 === 0 ? '#2f7a38' : '#3a8c44';
      ctx.fillRect(x, 0, stripeW, 512);
    }
    for (let i = 0; i < 12000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(22, 68, 28, 0.24)' : 'rgba(134, 214, 126, 0.16)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function createGrassMeadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#397834';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(30, 75, 28, 0.25)' : 'rgba(115, 185, 85, 0.18)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createCheckeredGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const sq = 32;
  for (let y = 0; y < 512; y += sq) {
    for (let x = 0; x < 128; x += sq) {
      ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? '#ffffff' : '#0f172a';
      ctx.fillRect(x, y, sq, sq);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createCheckeredBannerTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const sq = 32;
  for (let y = 0; y < 128; y += sq) {
    for (let x = 0; x < 512; x += sq) {
      ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? '#ffffff' : '#111827';
      ctx.fillRect(x, y, sq, sq);
    }
  }
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(110, 22, 292, 84);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 5;
  ctx.strokeRect(110, 22, 292, 84);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 48px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  return new THREE.CanvasTexture(canvas);
}

function createDistanceSignTexture(labelText) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 54px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, 128, 68);
  return new THREE.CanvasTexture(canvas);
}

// -------------------------------------------------------------------------


// -------------------------------------------------------------------------
// Partículas con shader propio (puntos suaves con tamaño, color y alfa por partícula)
// -------------------------------------------------------------------------
function createSoftParticleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const PARTICLE_VS = `
  attribute float size;
  attribute vec4 pcolor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const PARTICLE_FS = `
  uniform sampler2D map;
  varying vec4 vColor;
  void main() {
    float a = vColor.a * texture2D(map, gl_PointCoord).a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }`;

// Dirección de avance del caballo que emite (tangente de la pista)
let emitDX = 1, emitDZ = 0;

class ParticlePool {
  constructor(max, additive, tex) {
    this.max = max;
    this.cursor = 0;
    this.alive = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('pcolor', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 800 } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r0, g0, b0, r1, g1, b1, a0, grav = 0, drag = 0) {
    const fwd = vx, side = vz;
    vx = fwd * emitDX - side * emitDZ;
    vz = fwd * emitDZ + side * emitDX;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i3] = r0; this.c0[i3 + 1] = g0; this.c0[i3 + 2] = b0;
    this.c1[i3] = r1; this.c1[i3 + 1] = g1; this.c1[i3 + 2] = b1;
    this.a0[i] = a0; this.grav[i] = grav; this.drag[i] = drag;
    this.size[i] = s0;
    this.col[i * 4] = r0; this.col[i * 4 + 1] = g0; this.col[i * 4 + 2] = b0; this.col[i * 4 + 3] = 0;
    this.alive = this.max; // fuerza actualización
  }

  update(dt) {
    if (this.alive === 0) return;
    let alive = 0;
    const { pos, vel, life, maxLife, col, size } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const i3 = i * 3, i4 = i * 4;
      if (life[i] <= 0) {
        size[i] = 0; col[i4 + 3] = 0; pos[i3 + 1] = -999;
        continue;
      }
      alive++;
      const t = 1 - life[i] / maxLife[i];
      const dragF = Math.max(0, 1 - this.drag[i] * dt);
      vel[i3] *= dragF; vel[i3 + 2] *= dragF;
      vel[i3 + 1] = vel[i3 + 1] * dragF + this.grav[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.02) { pos[i3 + 1] = 0.02; vel[i3 + 1] *= -0.25; }
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      col[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      col[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      col[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      const fadeIn = t < 0.12 ? t / 0.12 : 1;
      col[i4 + 3] = this.a0[i] * fadeIn * (1 - t) * (1 - t * 0.3);
    }
    this.alive = alive;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.size.fill(0);
    for (let i = 0; i < this.max; i++) { this.pos[i * 3 + 1] = -999; this.col[i * 4 + 3] = 0; }
    this.alive = this.max;
  }
}

let firePool = null;   // fuego, chispas, brillos (aditivo)
let smokePool = null;  // tierra, vapor, sudor (normal)

function initParticleSystems() {
  const tex = createSoftParticleTexture();
  firePool = new ParticlePool(6000, true, tex);
  smokePool = new ParticlePool(3500, false, tex);
  scene.add(smokePool.points);
  scene.add(firePool.points);
}

function updateParticleScale() {
  if (!renderer || !camera) return;
  const h = renderer.domElement.height;
  const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  firePool.material.uniforms.uScale.value = s;
  smokePool.material.uniforms.uScale.value = s;
}

function updateDustColor() { /* el color del polvo se elige al emitir según la superficie */ }

const rnd = (a, b) => a + Math.random() * (b - a);

// Fuego que envuelve casco y menudillo: nace en la pata, sube y se apaga rápido.
// Hereda casi toda la velocidad del caballo, así que queda pegado a la pata (sin estela larga).
function emitLegFire(x, y, z, horseSpeed, kind) {
  const inherit = horseSpeed * 0.86;
  const h = rnd(0, 0.32);
  if (kind === 'attack') {
    firePool.spawn(x + rnd(-0.05, 0.05), y + h, z + rnd(-0.06, 0.06),
      inherit + rnd(-0.6, 0.4), rnd(1.6, 3.2), rnd(-0.35, 0.35),
      rnd(0.14, 0.26), rnd(0.2, 0.32), 0.04,
      0.6, 0.85, 1.0, 0.1, 0.3, 1.0, 0.65, 1.5, 1.5);
    if (Math.random() < 0.18) {
      firePool.spawn(x, y + h, z, inherit + rnd(-3, 3), rnd(-1, 4), rnd(-3, 3), 0.09, 0.12, 0.04, 1, 1, 1, 0.5, 0.8, 1, 1, 0, 0);
    }
  } else {
    firePool.spawn(x + rnd(-0.05, 0.05), y + h, z + rnd(-0.06, 0.06),
      inherit + rnd(-0.6, 0.4), rnd(1.4, 3.0), rnd(-0.3, 0.3),
      rnd(0.16, 0.28), rnd(0.22, 0.34), 0.05,
      1.0, 0.78, 0.32, 0.85, 0.12, 0.01, 0.62, 1.8, 1.6);
    if (Math.random() < 0.12) {
      // Halo naranja tenue alrededor del casco
      firePool.spawn(x, y + 0.1, z, inherit, rnd(0.4, 0.8), 0, 0.12, 0.5, 0.3, 1.0, 0.45, 0.08, 0.8, 0.12, 0.02, 0.18, 0, 1);
    }
  }
}

// Pisada: polvo bajo + brasas o chispas que saltan
function emitHoofStrike(x, z, horseSpeed, kind) {
  const dirt = state.surface === 'dirt';
  for (let k = 0; k < 2; k++) {
    smokePool.spawn(x + rnd(-0.12, 0.12), 0.06, z + rnd(-0.12, 0.12),
      horseSpeed * rnd(0.55, 0.8), rnd(0.5, 1.2), rnd(-0.6, 0.6),
      rnd(0.3, 0.45), 0.18, rnd(0.45, 0.7),
      dirt ? 0.62 : 0.3, dirt ? 0.48 : 0.42, dirt ? 0.33 : 0.2,
      dirt ? 0.72 : 0.38, dirt ? 0.6 : 0.5, dirt ? 0.45 : 0.28,
      0.26, -1.2, 1.8);
  }
  if (kind === 'turbo' || kind === 'attack') {
    const fire = kind === 'turbo';
    for (let k = 0; k < 5; k++) {
      firePool.spawn(x, 0.12, z,
        horseSpeed * 0.7 + rnd(-2, 2), rnd(2, 4.5), rnd(-2, 2),
        rnd(0.35, 0.6), 0.16, 0.05,
        fire ? 1 : 0.8, fire ? 0.85 : 0.95, fire ? 0.4 : 1,
        fire ? 0.9 : 0.2, fire ? 0.2 : 0.5, fire ? 0.02 : 1,
        1, -9, 0.6);
    }
  }
}

function emitSteam(x, y, z, horseSpeed) {
  smokePool.spawn(x, y, z + rnd(-0.06, 0.06), horseSpeed * 0.9 + rnd(0.2, 0.8), rnd(-0.2, 0.3), rnd(-0.3, 0.3),
    rnd(0.4, 0.6), 0.12, 0.55, 0.95, 0.97, 1, 0.9, 0.92, 0.95, 0.55, 0.4, 2.5);
}

function emitSweat(x, y, z, horseSpeed) {
  smokePool.spawn(x + rnd(-0.3, 0.3), y, z + rnd(-0.25, 0.25), horseSpeed * 0.85, rnd(0.6, 1.4), rnd(-0.8, 0.8),
    rnd(0.35, 0.5), 0.07, 0.05, 0.55, 0.8, 1, 0.4, 0.7, 1, 0.9, -7, 0.5);
}

function emitSparkle(x, y, z, horseSpeed) {
  firePool.spawn(x + rnd(-0.8, 0.6), y + rnd(0, 1.2), z + rnd(-0.5, 0.5), horseSpeed, rnd(0.8, 1.8), 0,
    rnd(0.4, 0.7), 0.22, 0.04, 0.6, 1, 0.75, 0.2, 0.9, 0.5, 0.9, 0, 0.5);
}

// -------------------------------------------------------------------------
// Animación biomecánica del galope + efectos de estado
// -------------------------------------------------------------------------
const LEG_OFFSETS = [
  { key: 'br', offset: 0.0, isFront: false },
  { key: 'bl', offset: 1.25, isFront: false },
  { key: 'fr', offset: 3.15, isFront: true },
  { key: 'fl', offset: 4.3, isFront: true }
];

function animateHorseRig(rig, p, speedRatio, dt) {
  const phase = p.gallopPhase;
  const st = p.state;
  const isTired = st === 'tired', isTurbo = st === 'turbo', isAttack = st === 'attack', isRecovery = st === 'recovery';
  const amp = Math.min(1.22, speedRatio * (isTurbo ? 1.12 : isTired ? 0.86 : 1.0));
  const racing = state.phase === 'racing' || state.phase === 'finished' || state.phase === 'replay';

  // Cuerpo
  const lift = (Math.sin(phase - 0.8) * 0.13 + Math.sin(phase * 2 - 0.5) * 0.04) * amp;
  rig.bodyGroup.position.y = 1.32 + lift - (isTired ? 0.04 : 0);
  rig.bodyGroup.rotation.z = Math.cos(phase - 0.4) * 0.085 * amp;
  rig.bodyGroup.rotation.x = isTired ? Math.sin(phase * 0.5) * 0.035 : 0;

  // Cuello y cabeza
  const neckExtend = Math.sin(phase - 0.65) * 0.13 * amp;
  rig.neckGroup.rotation.z = -0.92 + neckExtend + (isTired ? 0.12 : 0) + ((isTurbo || isAttack) ? -0.14 : 0);
  rig.headGroup.rotation.z = 0.3 - neckExtend * 0.6 + (isTired ? -0.22 : 0);
  const earPitch = (isTurbo || isAttack) ? -0.15 : isTired ? 0.95 : 0.25;
  rig.earL.rotation.z = earPitch; rig.earR.rotation.z = earPitch;
  rig.earL.rotation.x = -0.18; rig.earR.rotation.x = 0.18;
  for (let k = 0; k < rig.maneStrands.length; k++) {
    rig.maneStrands[k].rotation.z = 0.25 + Math.sin(phase * 2 + k * 0.8) * 0.22 * amp + amp * 0.25;
  }

  // Cola al viento
  const wind = Math.min(0.85, amp * 0.75);
  rig.tailGroup.rotation.z = -0.45 - wind + Math.sin(phase * 1.4) * 0.1 * amp;
  for (let k = 0; k < rig.tailStrands.length; k++) {
    const s = rig.tailStrands[k];
    s.rotation.z = Math.sin(phase * 1.4 - k * 0.7) * 0.16 * amp;
    s.rotation.x = (k - 1.5) * 0.14 + Math.sin(phase * 2 + k) * 0.05 * amp;
  }

  // Jinete: absorbe el rebote del caballo, empuja con las manos al ritmo del cuello
  const crouch = isTurbo ? -0.1 : isAttack ? -0.06 : isTired ? 0.08 : 0;
  rig.jockeyGroup.position.y = 0.66 - lift * 0.65;
  rig.jockeyGroup.position.x = Math.sin(phase - 0.3) * 0.03 * amp;
  rig.torsoPivot.rotation.z = 0.22 + crouch + Math.sin(phase - 0.3) * 0.05 * amp;
  rig.headPivot.rotation.z = -0.22 - crouch;
  const push = Math.sin(phase - 0.65) * amp;
  for (const arm of rig.arms) {
    if (arm.side === 1 && (isTurbo || isAttack)) {
      // Brazo de la fusta: la levanta y azota cada dos trancos
      const w = 0.5 + 0.5 * Math.sin(phase * 0.5);
      arm.shoulder.rotation.z = 0.3 - 1.5 * w;
      arm.elbow.rotation.z = 0.75 - 0.4 * w;
      if (arm.whip) arm.whip.rotation.z = -0.9 + 1.4 * w;
    } else {
      arm.shoulder.rotation.z = 0.3 + push * 0.22;
      arm.elbow.rotation.z = 0.75 - push * 0.18;
      if (arm.whip) arm.whip.rotation.z = -0.9;
    }
  }

  // Patas: galope de 4 tiempos
  const showFlames = (isTurbo || isAttack) && racing && dt > 0 && !(p.skin && SKINS[p.skin].vehicle);
  for (let i = 0; i < 4; i++) {
    const cfg = LEG_OFFSETS[i];
    const leg = rig.legs[cfg.key];
    const t = phase + cfg.offset;
    const upperAngle = (Math.sin(t) * 0.78 + Math.sin(2 * t) * 0.14) * amp;
    leg.upper.rotation.z = upperAngle + (cfg.isFront ? 0.05 : -0.06);
    const swing = Math.max(0, Math.cos(t - 0.25));
    if (cfg.isFront) {
      leg.middle.rotation.z = -swing * 1.18 * amp;
      leg.fetlock.rotation.z = -swing * 0.35 * amp + Math.max(0, -Math.sin(t)) * 0.28 * amp;
    } else {
      leg.middle.rotation.z = swing * 0.88 * amp - 0.15 * amp;
      leg.fetlock.rotation.z = -Math.max(0, Math.sin(t + 0.5)) * 0.45 * amp;
    }
    leg.strike = dt > 0 && (state.phase === 'racing' || state.phase === 'replay') && p.speed > 5 && leg.prevAngle > 0.12 && upperAngle <= 0.12;
    leg.prevAngle = upperAngle;
  }

  // Efectos de partículas (necesitan posiciones de mundo actualizadas)
  if (dt > 0 && racing) {
    rig.root.updateMatrixWorld(true);
    const speed = p.speed;
    emitDX = rig.dirX; emitDZ = rig.dirZ;
    const wx = rig.root.position.x, wz = rig.root.position.z;
    for (let i = 0; i < 4; i++) {
      const leg = rig.legs[LEG_OFFSETS[i].key];
      leg.hoofTip.getWorldPosition(tmpV1);
      if (leg.strike) emitHoofStrike(tmpV1.x, tmpV1.z, speed, st);
      if (showFlames) {
        leg.emitAcc = (leg.emitAcc || 0) + dt * (isTurbo ? 60 : 50);
        while (leg.emitAcc >= 1) {
          leg.emitAcc -= 1;
          emitLegFire(tmpV1.x, Math.max(0.05, tmpV1.y), tmpV1.z, speed, st);
        }
      }
    }
    if (isRecovery && Math.random() < dt * 30) emitSparkle(wx, 0.6, wz, speed);
    if (isTired) {
      if (Math.random() < dt * 9) {
        rig.bit.getWorldPosition(tmpV2);
        emitSteam(tmpV2.x + 0.05, tmpV2.y, tmpV2.z, speed);
      }
      if (Math.random() < dt * 6) emitSweat(wx + rig.dirX * 0.6, 1.9, wz + rig.dirZ * 0.6, speed);
    }
  }

  // Riendas: de cada mano al bocado
  rig.root.updateMatrixWorld(true);
  const arr = rig.reins.geometry.attributes.position.array;
  rig.bit.getWorldPosition(tmpV2);
  rig.root.worldToLocal(tmpV2);
  for (let k = 0; k < 2; k++) {
    rig.arms[k].hand.getWorldPosition(tmpV3);
    rig.root.worldToLocal(tmpV3);
    arr[k * 6] = tmpV3.x; arr[k * 6 + 1] = tmpV3.y; arr[k * 6 + 2] = tmpV3.z;
    arr[k * 6 + 3] = tmpV2.x; arr[k * 6 + 4] = tmpV2.y; arr[k * 6 + 5] = tmpV2.z + (k === 0 ? -0.06 : 0.06);
  }
  rig.reins.geometry.attributes.position.needsUpdate = true;

  // Etiqueta flotante
  const showLabel = false; // los nombres ahora se dibujan en HTML (updateHtmlLabels)
  rig.label.sprite.visible = showLabel;
  if (showLabel) updateHorseLabel(rig.label, p);
}

// -------------------------------------------------------------------------
// Estampida instanciada (todo el pelotón fuera de los 20 punteros)
// -------------------------------------------------------------------------
// Matriz = traslación * RotY(a) * RotZ(b), escrita directo en el buffer (rápido para miles de instancias)
function setYZMatrix(arr, idx, x, y, z, ca, sa, angle) {
  const o = idx * 16, cb = Math.cos(angle), sb = Math.sin(angle);
  arr[o] = ca * cb; arr[o + 1] = sb; arr[o + 2] = -sa * cb; arr[o + 3] = 0;
  arr[o + 4] = -ca * sb; arr[o + 5] = cb; arr[o + 6] = sa * sb; arr[o + 7] = 0;
  arr[o + 8] = sa; arr[o + 9] = 0; arr[o + 10] = ca; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
function setHiddenMatrix(arr, idx) {
  const o = idx * 16;
  for (let k = 0; k < 15; k++) arr[o + k] = 0;
  arr[o + 15] = 1;
}

function rebuildStampedeInstancedMeshes() {
  if (stampedeGroup) {
    scene.remove(stampedeGroup);
    stampedeGroup.children.forEach(m => m.dispose && m.dispose());
    stampedeGroup = null;
  }
  inst = { capacity: 0, core: null, legsF: null, legsH: null, jockey: null };
  const n = state.participants.length;
  if (n <= MAX_DETAILED_HORSES) return;

  stampedeGroup = new THREE.Group();
  const g = sharedAssets.geo, M = sharedAssets.mats;
  const make = (geo, mat, count, shadow) => {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    stampedeGroup.add(mesh);
    return mesh;
  };
  inst.capacity = n;
  inst.core = make(g.instCore, M.instHorse, n, true);
  inst.legsF = make(g.instLegF, M.instHorse, n * 2, false);
  inst.legsH = make(g.instLegH, M.instHorse, n * 2, false);
  inst.jockey = make(g.instJockey, M.instJockey, n, true);

  const white = new THREE.Color(0xf1efe9);
  for (const p of state.participants) {
    const coat = tmpColor.setHex(HORSE_COATS[p.coatIdx].body);
    inst.core.setColorAt(p.id, coat);
    for (let s = 0; s < 2; s++) {
      inst.legsF.setColorAt(p.id * 2 + s, (p.socks >> s) & 1 ? white : coat);
      inst.legsH.setColorAt(p.id * 2 + s, (p.socks >> (s + 2)) & 1 ? white : coat);
    }
    inst.jockey.setColorAt(p.id, tmpColor.setHex(JOCKEY_SILKS[p.silkIdx].num));
  }
  [inst.core, inst.legsF, inst.legsH, inst.jockey].forEach(m => { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  scene.add(stampedeGroup);
}

function updateStampedeInstances() {
  if (!inst.core) return;
  const idle = state.phase === 'ready' || state.phase === 'countdown';
  const aC = inst.core.instanceMatrix.array, aF = inst.legsF.instanceMatrix.array;
  const aH = inst.legsH.instanceMatrix.array, aJ = inst.jockey.instanceMatrix.array;
  const list = state.participants;
  for (let k = 0; k < list.length; k++) {
    const p = list[k];
    const i = p.id;
    const et = p.lodDetailed ? null : elimTransform(p);
    if (p.lodDetailed || (et && !et.visible)) {
      setHiddenMatrix(aC, i); setHiddenMatrix(aJ, i);
      setHiddenMatrix(aF, i * 2); setHiddenMatrix(aF, i * 2 + 1);
      setHiddenMatrix(aH, i * 2); setHiddenMatrix(aH, i * 2 + 1);
      continue;
    }
    if (et) {
      // Caballo eliminado: se dibuja con la transformación del evento (escala, giro, altura)
      const sc = Math.max(0.01, et.s), ca = Math.cos(et.ry), sa = Math.sin(et.ry);
      const X = et.x, Z = et.z, Y = et.y + 1.32 * sc;
      const put = (arr, idx, lx, ly, lz, ang) => {
        setYZMatrix(arr, idx, X + (ca * lx + sa * lz) * sc, Y + ly * sc, Z + (-sa * lx + ca * lz) * sc, ca, sa, et.rz + ang);
        const o = idx * 16;
        for (let q = 0; q < 11; q++) if (q !== 3 && q !== 7) arr[o + q] *= sc;
      };
      put(aC, i, 0, 0, 0, 0);
      put(aJ, i, 0, 0.66, 0, 0.02);
      put(aF, i * 2, 0.68, -0.08, -0.2, 0); put(aF, i * 2 + 1, 0.68, -0.08, 0.2, 0);
      put(aH, i * 2, -0.7, -0.04, -0.21, 0); put(aH, i * 2 + 1, -0.7, -0.04, 0.21, 0);
      continue;
    }
    const ph = p.gallopPhase;
    const amp = idle ? 0.06 : Math.min(1.15, p.speed / 17.5);
    const bob = (Math.sin(ph - 0.8) * 0.13) * amp;
    const pitch = Math.cos(ph - 0.4) * 0.08 * amp;
    const y = 1.32 + bob;
    const f = trackPos(p.x, p.z, tmpV1);
    const ca = Math.cos(f.heading), sa = Math.sin(f.heading);
    const X = tmpV1.x, Z = tmpV1.z;
    // desplazamiento local (ox adelante, oz lateral) girado con el rumbo
    const ox = (lx, lz) => X + ca * lx + sa * lz;
    const oz = (lx, lz) => Z - sa * lx + ca * lz;
    setYZMatrix(aC, i, X, y, Z, ca, sa, pitch);
    setYZMatrix(aJ, i, X, y + 0.66 - bob * 0.6, Z, ca, sa, pitch * 0.4 + 0.02);
    setYZMatrix(aF, i * 2, ox(0.68, -0.2), y - 0.08, oz(0.68, -0.2), ca, sa, Math.sin(ph + 4.3) * 0.78 * amp);
    setYZMatrix(aF, i * 2 + 1, ox(0.68, 0.2), y - 0.08, oz(0.68, 0.2), ca, sa, Math.sin(ph + 3.15) * 0.78 * amp);
    setYZMatrix(aH, i * 2, ox(-0.7, -0.21), y - 0.04, oz(-0.7, -0.21), ca, sa, Math.sin(ph + 1.25) * 0.78 * amp);
    setYZMatrix(aH, i * 2 + 1, ox(-0.7, 0.21), y - 0.04, oz(-0.7, 0.21), ca, sa, Math.sin(ph) * 0.78 * amp);
  }
  inst.core.instanceMatrix.needsUpdate = true;
  inst.legsF.instanceMatrix.needsUpdate = true;
  inst.legsH.instanceMatrix.needsUpdate = true;
  inst.jockey.instanceMatrix.needsUpdate = true;
}

// Polvo ligero levantado por la estampida (muestreo aleatorio para no saturar)
function emitStampedeDust(simDt) {
  if (!inst.core || (state.phase !== 'racing' && state.phase !== 'replay') || simDt <= 0) return;
  const list = state.participants;
  const n = Math.min(40, Math.floor(list.length * simDt * 1.2) + 1);
  for (let k = 0; k < n; k++) {
    const p = list[(Math.random() * list.length) | 0];
    if (p.lodDetailed || p.speed < 5) continue;
    const f = trackPos(p.x - 0.7, p.z + rnd(-0.2, 0.2), tmpV1);
    emitDX = f.tx; emitDZ = f.tz;
    emitHoofStrike(tmpV1.x, tmpV1.z, p.speed, 'normal');
  }
}

// -------------------------------------------------------------------------
// Pool de caballos detallados: se asignan a los primeros del ranking
// -------------------------------------------------------------------------
function rebuildHorsePool(count) {
  // Los punteros + algunas skins especiales del pelotón (para que se vean aunque vayan atrás)
  const specials = count > MAX_DETAILED_HORSES ? state.participants.filter(p => p.skin).length : 0;
  const needed = Math.min(count, MAX_DETAILED_HORSES) + Math.min(specials, MAX_SPECIAL_RIGS);
  if (!horsePoolGroup) {
    horsePoolGroup = new THREE.Group();
    scene.add(horsePoolGroup);
  }
  while (horseRigs.length < needed) {
    const rig = createArticulatedHorseRig();
    horsePoolGroup.add(rig.root);
    horseRigs.push(rig);
  }
  for (let i = 0; i < horseRigs.length; i++) {
    horseRigs[i].root.visible = false;
    horseRigs[i].assignedParticipantId = -1;
    horseRigs[i].label.lastKey = '';
    horseRigs[i].markKey = '';
    horseRigs[i].active = i < needed;
  }
}

function syncHorseRigsToScene(dt) {
  const sorted = state.sortedParticipants;
  const activeRigs = horseRigs.filter(r => r.active);
  if (sorted.length === 0 || activeRigs.length === 0) return;
  const nTop = Math.min(MAX_DETAILED_HORSES, activeRigs.length);
  const desired = sorted.slice(0, nTop);
  for (let i = nTop; i < sorted.length && desired.length < activeRigs.length; i++) if (sorted[i].skin) desired.push(sorted[i]);
  const desiredIds = new Set(desired.map(p => p.id));

  for (const p of state.participants) p.lodDetailed = false;

  // Mantener asignaciones vigentes para evitar parpadeos
  const assigned = new Set();
  for (const rig of activeRigs) {
    if (rig.assignedParticipantId !== -1 && desiredIds.has(rig.assignedParticipantId)) assigned.add(rig.assignedParticipantId);
    else rig.assignedParticipantId = -1;
  }
  let r = 0;
  for (const p of desired) {
    if (assigned.has(p.id)) continue;
    while (r < activeRigs.length && activeRigs[r].assignedParticipantId !== -1) r++;
    if (r >= activeRigs.length) break;
    activeRigs[r].assignedParticipantId = p.id;
    activeRigs[r].markKey = '';
    assigned.add(p.id);
  }

  const idle = state.phase === 'ready' || state.phase === 'countdown';
  for (const rig of activeRigs) {
    const p = rig.assignedParticipantId >= 0 ? state.participants[rig.assignedParticipantId] : null;
    if (!p) { rig.root.visible = false; continue; }
    p.lodDetailed = true;
    rig.root.visible = true;
    const f = trackPos(p.x, p.z, rig.root.position);
    rig.root.rotation.set(0, f.heading, 0);
    rig.root.scale.setScalar(1);
    rig.dirX = f.tx; rig.dirZ = f.tz;
    const et = elimTransform(p);
    if (et) {
      if (!et.visible) { rig.root.visible = false; continue; }
      rig.root.position.set(et.x, et.y, et.z);
      rig.root.rotation.set(0, et.ry, et.rz);
      rig.root.scale.setScalar(Math.max(0.01, et.s));
    }
    applyHorseAppearance(rig, p);
    const speedRatio = idle ? 0.06 : Math.min(1.22, p.speed / 17.5);
    animateHorseRig(rig, p, speedRatio, dt);
    if (p.skin) animateSkin(rig, p, speedRatio, dt);
  }
}

// -------------------------------------------------------------------------
// Limpieza de memoria
// -------------------------------------------------------------------------
function disposeGroup(group) {
  if (!group) return;
  group.traverse(obj => {
    if (obj.geometry && !sharedAssets.all.has(obj.geometry)) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        if (sharedAssets.all.has(mat)) return;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
    }
  });
  scene.remove(group);
}



// -------------------------------------------------------------------------
// Geometría de la pista OVALADA
// La simulación usa "s" = distancia recorrida desde la largada y "lat" = carril
// (negativo = palo interior, positivo = exterior). Estas funciones lo pasan al mundo 3D.
// Óvalo: recta principal (con la meta) en z = +R corriendo hacia +x, curva 1,
// recta opuesta (donde se larga) y curva 2.
// -------------------------------------------------------------------------
let metricsCacheKey = '';
let metricsCache = null;
function getTrackMetrics() {
  const count = Math.max(2, state.names.length);
  const laps = getLaps();
  const key = `${state.distanceKey}|${count}|${laps}`;
  if (key === metricsCacheKey && metricsCache) return metricsCache;
  const preset = DISTANCE_PRESETS[state.distanceKey];
  const isStampede = count > MAX_DETAILED_HORSES;
  let trackWidth;
  if (!isStampede) {
    const laneSpacing = count <= 12 ? 1.85 : 1.5;
    trackWidth = Math.max(16, Math.min(38, count * laneSpacing + 4));
  } else {
    trackWidth = Math.max(36, Math.min(70, Math.sqrt(count) * 2.1 + 8));
  }
  const halfWidth = trackWidth / 2;
  const perRow = isStampede ? Math.max(14, Math.floor((trackWidth - 3.6) / 1.45)) : count;
  const rows = isStampede ? Math.ceil(count / perRow) : 1;
  const startDepth = isStampede ? rows * 2.8 + 16 : 24;
  const lapLen = preset.worldLength;   // distancia de la primera (o única) vuelta

  // Una vuelta: se larga al inicio de la recta opuesta y la meta queda en la recta principal
  const R = Math.max(50, halfWidth + 30);
  const S = Math.max(110, (lapLen + 30 + 26 - Math.PI * R) / 2);
  const P = 2 * S + 2 * Math.PI * R;
  const uFinish = S - 34;
  const uStart = ((uFinish - lapLen) % P + P) % P;
  // Cada vuelta extra suma el perímetro completo del óvalo
  const L = lapLen + (laps - 1) * P;
  const scale = L / lapLen;

  metricsCacheKey = key;
  metricsCache = {
    meters: Math.round(preset.meters * scale / 10) * 10, lapMeters: preset.meters, laps,
    worldLength: L, targetDuration: preset.targetDuration * scale,
    trackWidth, halfWidth, isStampede, perRow, rows, startDepth,
    R, S, P, uFinish, uStart
  };
  return metricsCache;
}

// Punto y tangente del óvalo para el parámetro u (0..P) sobre la línea central
const TF = { x: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: 1, heading: 0 };
function ovalAt(u, m) {
  const { S, R, P } = m;
  u = ((u % P) + P) % P;
  const arc = Math.PI * R;
  if (u < S) {
    TF.x = -S / 2 + u; TF.z = R; TF.tx = 1; TF.tz = 0;
  } else if (u < S + arc) {
    const a = (u - S) / R;
    TF.x = S / 2 + R * Math.sin(a); TF.z = R * Math.cos(a);
    TF.tx = Math.cos(a); TF.tz = -Math.sin(a);
  } else if (u < 2 * S + arc) {
    const v = u - S - arc;
    TF.x = S / 2 - v; TF.z = -R; TF.tx = -1; TF.tz = 0;
  } else {
    const a = (u - 2 * S - arc) / R;
    TF.x = -S / 2 - R * Math.sin(a); TF.z = -R * Math.cos(a);
    TF.tx = -Math.cos(a); TF.tz = Math.sin(a);
  }
  TF.nx = -TF.tz; TF.nz = TF.tx;               // normal hacia afuera del óvalo
  TF.heading = Math.atan2(-TF.tz, TF.tx);      // rotación Y para mirar en la tangente
  return TF;
}

// Marco de la pista en la distancia de carrera s
function trackFrame(s) {
  const m = getTrackMetrics();
  return ovalAt(m.uStart + s, m);
}

// Posición de mundo para (s, lat); escribe en out (Vector3) y devuelve el marco
function trackPos(s, lat, out) {
  const f = trackFrame(s);
  out.set(f.x + f.nx * lat, 0, f.z + f.nz * lat);
  return f;
}

// Conversión lineal alrededor de un ancla (para cámaras): x = s, y = altura, z = carril
function trackToWorld(anchorS, x, y, z, out) {
  const f = trackFrame(anchorS);
  const d = x - anchorS;
  out.set(f.x + f.tx * d + f.nx * z, y, f.z + f.tz * d + f.nz * z);
  return out;
}



// =========================================================================
// ESTADIO: PISTA OVALADA, TRIBUNA, PANTALLA GIGANTE Y DECORACIÓN
// =========================================================================
let bigScreen = null;      // { ctx, tex, canvas, last }
let crowdGroup = null;
let flagMeshes = [];

function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// Cinta (ribbon) sobre el óvalo entre dos carriles, a altura y
function buildRibbon(m, latA, latB, y, step, uvScaleU, uvScaleV) {
  const n = Math.ceil(m.P / step);
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  const nor = new Float32Array((n + 1) * 2 * 3);
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * m.P;
    const f = ovalAt(u, m);
    const k = i * 2;
    pos[k * 3] = f.x + f.nx * latA; pos[k * 3 + 1] = y; pos[k * 3 + 2] = f.z + f.nz * latA;
    pos[k * 3 + 3] = f.x + f.nx * latB; pos[k * 3 + 4] = y; pos[k * 3 + 5] = f.z + f.nz * latB;
    uv[k * 2] = u / uvScaleU; uv[k * 2 + 1] = 0;
    uv[k * 2 + 2] = u / uvScaleU; uv[k * 2 + 3] = Math.abs(latB - latA) / uvScaleV;
    nor[k * 3 + 1] = 1; nor[k * 3 + 4] = 1;
    if (i < n) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Baranda: cinta vertical de altura h a lo largo del carril lat (con huecos opcionales)
function buildRail(m, lat, yCenter, h, step, skip) {
  const pos = [];
  const nor = [];
  const n = Math.ceil(m.P / step);
  for (let i = 0; i < n; i++) {
    const u0 = (i / n) * m.P, u1 = ((i + 1) / n) * m.P;
    if (skip && (skip(u0) || skip(u1))) continue;
    const a = ovalAt(u0, m); const ax = a.x + a.nx * lat, az = a.z + a.nz * lat, anx = a.nx, anz = a.nz;
    const b = ovalAt(u1, m); const bx = b.x + b.nx * lat, bz = b.z + b.nz * lat;
    const y0 = yCenter - h / 2, y1 = yCenter + h / 2;
    pos.push(ax, y0, az, bx, y0, bz, ax, y1, az, ax, y1, az, bx, y0, bz, bx, y1, bz);
    for (let k = 0; k < 6; k++) nor.push(anx, 0, anz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// Instancia algo cada "spacing" a lo largo del óvalo, girado con la pista
function instanceAlong(m, geo, mat, spacing, lat, y, skip, scaleFn) {
  const items = [];
  for (let u = 0; u < m.P; u += spacing) {
    if (skip && skip(u)) continue;
    items.push(u);
  }
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const d = new THREE.Object3D();
  items.forEach((u, i) => {
    const f = ovalAt(u, m);
    d.position.set(f.x + f.nx * lat, y, f.z + f.nz * lat);
    d.rotation.set(0, f.heading, 0);
    if (scaleFn) scaleFn(d, i); else d.scale.set(1, 1, 1);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// Grupo alineado con la pista en la distancia de carrera s (x local = sentido de carrera, z local = hacia afuera)
function groupAtRace(s, lat = 0) {
  const g = new THREE.Group();
  const f = trackPos(s, lat, g.position);
  g.rotation.y = f.heading;
  return g;
}

function drawBigScreen(force) {
  if (!bigScreen) return;
  const now = performance.now();
  if (!force && now - bigScreen.last < 350) return;
  bigScreen.last = now;
  const ctx = bigScreen.ctx, W = bigScreen.canvas.width, H = bigScreen.canvas.height;
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0b1222'); grd.addColorStop(1, '#111c35');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#10b981'; ctx.fillRect(0, 0, W, 54);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 38px Outfit, Inter, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const live = state.phase === 'racing';
  ctx.fillText(live ? '● EN VIVO' : state.phase === 'finished' ? 'RESULTADO OFICIAL' : 'HIPÓDROMO 3D', 24, 28);
  ctx.textAlign = 'right';
  ctx.fillText(state.raceTime.toFixed(1) + 's', W - 24, 28);
  const list = state.sortedParticipants;
  const medals = ['#fbbf24', '#cbd5e1', '#d97706'];
  for (let i = 0; i < 3 && i < list.length; i++) {
    const p = list[i];
    const y = 100 + i * 66;
    ctx.fillStyle = medals[i];
    ctx.beginPath(); ctx.arc(52, y, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 30px Outfit, Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 52, y + 1);
    ctx.fillStyle = p.silkHex;
    ctx.fillRect(92, y - 18, 14, 36);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 34px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    let name = p.name; if (name.length > 20) name = name.slice(0, 19) + '…';
    ctx.fillText(name, 122, y + 1);
  }
  bigScreen.tex.needsUpdate = true;
}

function buildRacetrackEnvironment() {
  disposeGroup(trackGroup);
  trackGroup = new THREE.Group();
  gateDoors = [];
  stampedeBarrier = null;
  flagMeshes = [];
  crowdGroup = null;

  const m = getTrackMetrics();
  const L = m.worldLength;
  const halfW = m.halfWidth;
  const W = m.trackWidth;
  const { S, R, P } = m;
  const dummy = new THREE.Object3D();
  const innerEdge = R - halfW - 1.4;
  const outerEdge = R + halfW + 1.4;
  const finishF = { ...trackFrame(L) };
  const nearFinish = (u, before, after) => {
    let d = u - m.uFinish; if (d > P / 2) d -= P; if (d < -P / 2) d += P;
    return d > -before && d < after;
  };

  // Pradera exterior
  const meadowTex = createGrassMeadowTexture();
  meadowTex.repeat.set(160, 110);
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(S + 2 * R + 900, 2 * R + 800),
    new THREE.MeshStandardMaterial({ map: meadowTex, roughness: 0.95 }));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = -0.08;
  meadow.receiveShadow = true;
  trackGroup.add(meadow);

  // Césped del centro con franjas de corte
  const infieldTex = makeCanvasTexture(256, 256, (ctx) => {
    for (let x = 0; x < 256; x += 32) { ctx.fillStyle = (x / 32) % 2 ? '#3f8f3f' : '#4aa04a'; ctx.fillRect(x, 0, 32, 256); }
    for (let i = 0; i < 2500; i++) { ctx.fillStyle = Math.random() > 0.5 ? 'rgba(20,70,25,0.2)' : 'rgba(150,220,130,0.14)'; ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  });
  infieldTex.wrapS = infieldTex.wrapT = THREE.RepeatWrapping;
  infieldTex.repeat.set(0.06, 0.06);
  const shape = new THREE.Shape();
  shape.moveTo(-S / 2, -innerEdge);
  shape.lineTo(S / 2, -innerEdge);
  shape.absarc(S / 2, 0, innerEdge, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-S / 2, innerEdge);
  shape.absarc(-S / 2, 0, innerEdge, Math.PI / 2, Math.PI * 1.5, false);
  const infield = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), new THREE.MeshStandardMaterial({ map: infieldTex, roughness: 0.9 }));
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = -0.03;
  infield.receiveShadow = true;
  trackGroup.add(infield);

  // Pista
  const trackTex = createTrackTexture(state.surface);
  const track = new THREE.Mesh(buildRibbon(m, -halfW - 1.4, halfW + 1.4, 0, 2, 16, 12),
    new THREE.MeshStandardMaterial({ map: trackTex, roughness: 0.9 }));
  track.receiveShadow = true;
  trackGroup.add(track);

  // Barandas blancas (la exterior se abre frente a la meta para que nada tape la llegada)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, side: THREE.DoubleSide });
  const skipOuter = u => nearFinish(u, 26, 14);
  [[-halfW - 0.9, null], [halfW + 0.9, skipOuter]].forEach(([lat, skip]) => {
    trackGroup.add(new THREE.Mesh(buildRail(m, lat, 1.08, 0.14, 3, skip), railMat));
    trackGroup.add(new THREE.Mesh(buildRail(m, lat, 0.6, 0.1, 3, skip), railMat));
    trackGroup.add(instanceAlong(m, new THREE.BoxGeometry(0.12, 1.2, 0.12), railMat, 6, lat, 0.6, skip));
  });

  // Seto verde por dentro del palo interior
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x1f6b2a, roughness: 0.95 });
  trackGroup.add(instanceAlong(m, new THREE.BoxGeometry(1.7, 0.9, 0.9), hedgeMat, 1.6, -halfW - 2.4, 0.45, null,
    (d, i) => d.scale.set(1, 0.9 + (i % 5) * 0.04, 1)));

  // Línea de largada
  const startLine = groupAtRace(0);
  const sl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, W + 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sl.position.y = 0.02;
  startLine.add(sl);
  trackGroup.add(startLine);

  // --- META: línea a cuadros, láser y estructuras SOLO del lado interior ---
  const finishG = groupAtRace(L);
  const finishGroundTex = createCheckeredGroundTexture();
  finishGroundTex.repeat.set(1, Math.max(2, Math.round(W / 4)));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, W + 2.8), new THREE.MeshBasicMaterial({ map: finishGroundTex }));
  fg.rotation.x = -Math.PI / 2; fg.position.y = 0.025;
  finishG.add(fg);
  const laser = new THREE.Mesh(new THREE.PlaneGeometry(0.11, W + 2.8), new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false }));
  laser.rotation.x = -Math.PI / 2; laser.position.y = 0.04;
  finishG.add(laser);
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.8, 2.3), new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  curtain.rotation.y = Math.PI / 2; curtain.position.y = 1.15;
  finishG.add(curtain);

  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.5, roughness: 0.3 });
  // Poste de llegada clásico en el palo interior
  const postZ = -halfW - 1.3;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.2, 10), whiteMat);
  post.position.set(0, 2.1, postZ); finishG.add(post);
  [1.2, 2.2, 3.2].forEach(y => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.35, 10), redMat); r.position.set(0, y, postZ); finishG.add(r); });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.08, 20), new THREE.MeshStandardMaterial({ map: createCheckeredGroundTexture(), roughness: 0.5 }));
  disc.rotation.z = Math.PI / 2; disc.rotation.y = Math.PI / 2; disc.position.set(0, 4.7, postZ);
  finishG.add(disc);
  // Torre de jueces en el interior + letrero META en voladizo (sin pilar del lado de la cámara)
  const towerZ = -halfW - 6;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3.2, 11, 3.2), whiteMat);
  tower.position.set(0, 5.5, towerZ); tower.castShadow = true; finishG.add(tower);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 4.2), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.4 }));
  cabin.position.set(0, 9.6, towerZ); finishG.add(cabin);
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.4, 4.8), redMat);
  cabRoof.position.set(0, 11.0, towerZ); finishG.add(cabRoof);
  const armLen = W * 0.55 + 6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, armLen), goldMat);
  arm.position.set(0, 10.4, towerZ + armLen / 2); finishG.add(arm);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, armLen - 3),
    new THREE.MeshStandardMaterial({ map: createCheckeredBannerTexture('META'), roughness: 0.5 }));
  banner.position.set(0, 8.9, towerZ + 3 + (armLen - 3) / 2); finishG.add(banner);
  trackGroup.add(finishG);

  // --- LARGADA: partidor (<=20) o arco + barrera (estampida) ---
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.65, roughness: 0.35 });
  const gateAccentMat = new THREE.MeshStandardMaterial({ color: 0x059669, metalness: 0.3, roughness: 0.45 });
  const gateRoot = groupAtRace(0.9);
  const gateGroup = new THREE.Group();
  gateRoot.add(gateGroup);
  if (!m.isStampede) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, W + 2.6), gateAccentMat);
    beam.position.set(0, 3.6, 0); beam.castShadow = true; gateGroup.add(beam);
    [-halfW - 1.1, halfW + 1.1].forEach(z => { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.0, 0.6), gateMat); pl.position.set(0, 2.0, z); gateGroup.add(pl); });
    const stalls = Math.min(20, Math.max(6, Math.round(W / 1.8)));
    const sw = W / stalls;
    const divGeo = new THREE.BoxGeometry(2.6, 2.0, 0.08);
    const doorGeo = new THREE.BoxGeometry(0.08, 1.7, sw * 0.46); doorGeo.translate(0, 0, sw * 0.23);
    for (let i = 0; i <= stalls; i++) {
      const z = -halfW + i * sw;
      const dv = new THREE.Mesh(divGeo, gateMat); dv.position.set(-1.1, 1.05, z); gateGroup.add(dv);
      if (i < stalls) {
        const l = new THREE.Mesh(doorGeo, gateMat); l.position.set(0.2, 1.0, z + 0.05); gateGroup.add(l); gateDoors.push({ mesh: l, side: -1 });
        const r = new THREE.Mesh(doorGeo, gateMat); r.position.set(0.2, 1.0, z + sw - 0.05); r.rotation.y = Math.PI; gateGroup.add(r); gateDoors.push({ mesh: r, side: 1 });
      }
    }
  } else {
    const sb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, W + 3.4), new THREE.MeshStandardMaterial({ map: createCheckeredBannerTexture('LARGADA'), roughness: 0.5 }));
    sb.position.set(0, 7.6, 0); gateGroup.add(sb);
    [-halfW - 1.5, halfW + 1.5].forEach(z => { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 8.6, 10), gateMat); pl.position.set(0, 4.3, z); gateGroup.add(pl); });
    stampedeBarrier = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, W + 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x78350f, roughness: 0.3 }));
    stampedeBarrier.rotation.x = Math.PI / 2; stampedeBarrier.position.set(0, 1.45, 0);
    gateGroup.add(stampedeBarrier);
  }
  trackGroup.add(gateRoot);

  // Postes de distancia cada 50 m en el palo interior, mirando hacia afuera
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5 });
  for (let mRem = 50; mRem < Math.min(m.meters, m.lapMeters); mRem += 50) {
    const g = groupAtRace((1 - mRem / m.meters) * L, -halfW - 1.6);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.7, 8), poleMat);
    pole.position.y = 1.35; g.add(pole);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.05, 0.14), new THREE.MeshStandardMaterial({ map: createDistanceSignTexture(mRem + 'm'), roughness: 0.5 }));
    sign.position.y = 2.85; g.add(sign);
    trackGroup.add(g);
  }

  // --- TRIBUNA principal frente a la recta final (detrás de la cámara de llegada) ---
  const standG = new THREE.Group();
  const finishX = finishF.x;
  const standLen = Math.min(S + 40, 230);
  const standX = finishX - standLen * 0.55;
  const z0 = R + halfW + 11;
  standG.position.set(standX, 0, z0);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85 });
  const seatMats = [0x1d4ed8, 0x059669, 0xdc2626].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const tiers = 8;
  for (let t = 0; t < tiers; t++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(standLen, 1.0 + t * 1.0, 2.2), concrete);
    step.position.set(0, (1.0 + t * 1.0) / 2, 1.1 + t * 2.2);
    step.receiveShadow = true;
    standG.add(step);
    const seats = new THREE.Mesh(new THREE.BoxGeometry(standLen - 1, 0.25, 0.7), seatMats[Math.floor(t / 3) % 3]);
    seats.position.set(0, 1.12 + t * 1.0, 1.6 + t * 2.2);
    standG.add(seats);
  }
  // Muro frontal con publicidad (marcas inventadas)
  const adTex = makeCanvasTexture(1024, 64, (ctx, w, h) => {
    const ads = [['GALOPE COLA', '#dc2626'], ['HIPÓDROMO 3D', '#059669'], ['HERRADURA BANK', '#1d4ed8'], ['PASTO FRESCO', '#16a34a'], ['TURBO HENO', '#ea580c'], ['FOTO-FINISH TV', '#7c3aed']];
    const seg = w / ads.length;
    ads.forEach(([txt, col], i) => {
      ctx.fillStyle = col; ctx.fillRect(i * seg, 0, seg, h);
      ctx.fillStyle = '#fff'; ctx.font = '900 30px Outfit, Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, i * seg + seg / 2, h / 2 + 2);
    });
  });
  adTex.wrapS = THREE.RepeatWrapping; adTex.repeat.set(Math.max(1, Math.round(standLen / 60)), 1);
  const adWall = new THREE.Mesh(new THREE.BoxGeometry(standLen, 1.3, 0.3), [concrete, concrete, concrete, concrete, concrete, new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.5 })]);
  adWall.position.set(0, 0.65, -0.3);
  standG.add(adWall);
  // Techo voladizo con columnas SOLO al fondo
  const roofDepth = tiers * 2.2 + 6;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(standLen + 4, 0.5, roofDepth), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }));
  roof.position.set(0, tiers * 1.0 + 7.5, tiers * 2.2 - roofDepth / 2 + 4);
  roof.rotation.x = -0.06;
  roof.castShadow = true;
  standG.add(roof);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(standLen + 4, 0.7, 0.3), goldMat);
  trim.position.set(0, tiers * 1.0 + 7.2, roof.position.z - roofDepth / 2);
  standG.add(trim);
  for (let x = -standLen / 2 + 4; x <= standLen / 2 - 4; x += 22) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, tiers * 1.0 + 8, 8), poleMat);
    col.position.set(x, (tiers * 1.0 + 8) / 2, tiers * 2.2 + 1.5);
    standG.add(col);
  }
  // Banderines sobre el techo
  const flagColors = [0xef4444, 0xfbbf24, 0x10b981, 0x3b82f6, 0xa855f7, 0xf97316];
  for (let x = -standLen / 2 + 2, k = 0; x <= standLen / 2 - 2; x += 9, k++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), poleMat);
    pole.position.set(x, tiers * 1.0 + 9.7, roof.position.z - roofDepth / 2 + 1);
    standG.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshStandardMaterial({ color: flagColors[k % flagColors.length], side: THREE.DoubleSide, roughness: 0.6 }));
    flag.geometry.translate(0.9, 0, 0);
    flag.position.set(x, tiers * 1.0 + 11.1, pole.position.z);
    standG.add(flag);
    flagMeshes.push(flag);
  }
  // Público: cuerpos y cabezas instanciados con colores variados
  const crowd = [];
  for (let t = 0; t < tiers; t++) {
    for (let x = -standLen / 2 + 1; x < standLen / 2 - 1; x += 1.15) {
      if (Math.random() < 0.82) crowd.push({ x: x + rnd(-0.2, 0.2), y: 1.25 + t * 1.0, z: 2.0 + t * 2.2 + rnd(-0.15, 0.15) });
    }
  }
  crowdGroup = new THREE.Group();
  const bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 6), new THREE.MeshStandardMaterial({ roughness: 0.7 }), crowd.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.7 }), crowd.length);
  const shirt = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0xf8fafc, 0xec4899, 0x8b5cf6, 0x06b6d4, 0x111827, 0xfacc15];
  const skin = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  crowd.forEach((c, i) => {
    dummy.position.set(c.x, c.y + 0.45, c.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix); bodies.setColorAt(i, tmpColor.setHex(shirt[(Math.random() * shirt.length) | 0]));
    dummy.position.set(c.x, c.y + 1.08, c.z); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix); heads.setColorAt(i, tmpColor.setHex(skin[(Math.random() * skin.length) | 0]));
  });
  [bodies, heads].forEach(x => { x.instanceMatrix.needsUpdate = true; if (x.instanceColor) x.instanceColor.needsUpdate = true; crowdGroup.add(x); });
  standG.add(crowdGroup);
  trackGroup.add(standG);

  // --- CENTRO: pantalla gigante, lago con fuente, jardines y árboles ---
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512; screenCanvas.height = 300;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  bigScreen = { canvas: screenCanvas, ctx: screenCanvas.getContext('2d'), tex: screenTex, last: 0 };
  const scrG = new THREE.Group();
  scrG.position.set(finishX - 70, 0, R - halfW - 34);
  const scrFrame = new THREE.Mesh(new THREE.BoxGeometry(22, 13.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.5 }));
  scrFrame.position.set(0, 12, 0); scrG.add(scrFrame);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(20.5, 12), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  scr.position.set(0, 12, 0.42); scrG.add(scr);
  [-7, 7].forEach(x => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 0.8), poleMat); l.position.set(x, 3, 0); scrG.add(l); });
  trackGroup.add(scrG);
  drawBigScreen(true);

  // Lago con fuente
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x2b8fd6, roughness: 0.08, metalness: 0.35 }));
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(Math.min(S * 0.32, 70), Math.min(innerEdge * 0.38, 26), 1);
  lake.position.set(-S * 0.12, 0.0, -innerEdge * 0.1);
  trackGroup.add(lake);
  const fountain = new THREE.Mesh(new THREE.ConeGeometry(1.2, 7, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.55, roughness: 0.1 }));
  fountain.position.set(lake.position.x, 3.5, lake.position.z);
  trackGroup.add(fountain);
  // Canteros de flores frente a la pantalla
  const flowers = [];
  for (let i = 0; i < 700; i++) {
    const fx = finishX - 130 + Math.random() * 160;
    const fz = R - halfW - 10 - Math.random() * 6;
    flowers.push([fx, fz]);
  }
  const flowerInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.6 }), flowers.length);
  const flowerCols = [0xf43f5e, 0xfacc15, 0xa855f7, 0xf97316, 0xffffff, 0xec4899];
  flowers.forEach(([fx, fz], i) => {
    dummy.position.set(fx, 0.25, fz); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.7 + Math.random() * 0.6); dummy.updateMatrix();
    flowerInst.setMatrixAt(i, dummy.matrix);
    flowerInst.setColorAt(i, tmpColor.setHex(flowerCols[(i / 117 | 0) % flowerCols.length]));
  });
  flowerInst.instanceMatrix.needsUpdate = true; if (flowerInst.instanceColor) flowerInst.instanceColor.needsUpdate = true;
  trackGroup.add(flowerInst);

  // Árboles redondos: dentro del óvalo (lejos de la recta final) y alrededor por fuera
  const trees = [];
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * (S + innerEdge);
    const z = -innerEdge * 0.85 + Math.random() * innerEdge * 0.9;
    if (Math.abs(x - lake.position.x) < lake.scale.x + 6 && Math.abs(z - lake.position.z) < lake.scale.y + 6) continue;
    trees.push([x, z, 0.8 + Math.random() * 0.6]);
  }
  for (let u = 0; u < P; u += 14) {
    if (nearFinish(u, 200, 60)) continue; // nada entre la tribuna y la recta final
    const f = ovalAt(u, m);
    const d = outerEdge + 14 + Math.random() * 30;
    trees.push([f.x + f.nx * (d - R), f.z + f.nz * (d - R), 0.9 + Math.random() * 0.7]);
  }
  const trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.45, 3, 6), new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.9 }), trees.length);
  const crownInst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), trees.length);
  const leafCols = [0x2f7d32, 0x3f8f3a, 0x256d2a, 0x4caf50];
  trees.forEach(([x, z, s], i) => {
    dummy.position.set(x, 1.5 * s, z); dummy.rotation.set(0, Math.random() * 3, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 4.6 * s, z); dummy.scale.set(s, s * 1.1, s); dummy.updateMatrix();
    crownInst.setMatrixAt(i, dummy.matrix);
    crownInst.setColorAt(i, tmpColor.setHex(leafCols[i % leafCols.length]));
  });
  trunkInst.instanceMatrix.needsUpdate = true; crownInst.instanceMatrix.needsUpdate = true;
  if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
  trunkInst.castShadow = true; crownInst.castShadow = true;
  trackGroup.add(trunkInst); trackGroup.add(crownInst);

  // Banderas de colores en el palo interior de las curvas
  for (let u = S + 10; u < P; u += 34) {
    if (u > S + Math.PI * R && u < 2 * S + Math.PI * R) continue;
    const f = ovalAt(u, m);
    const g = new THREE.Group();
    g.position.set(f.x + f.nx * (-halfW - 4.5), 0, f.z + f.nz * (-halfW - 4.5));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), whiteMat);
    pole.position.y = 3.5; g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshStandardMaterial({ color: flagColors[(u / 34 | 0) % flagColors.length], side: THREE.DoubleSide }));
    flag.geometry.translate(1.1, 0, 0);
    flag.position.y = 6.2; g.add(flag);
    flagMeshes.push(flag);
    trackGroup.add(g);
  }

  // Torres de iluminación en las cuatro esquinas (lejos de la llegada)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 0.6 });
  [[S / 2 + R + halfW + 22, -R * 0.7], [-S / 2 - R - halfW - 22, -R * 0.7], [S / 2 + R * 0.5, -R - halfW - 26], [-S / 2 - R * 0.5, -R - halfW - 26]].forEach(([x, z]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 34, 8), poleMat);
    t.position.set(x, 17, z); trackGroup.add(t);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 0.8), lampMat);
    panel.position.set(x, 34.5, z); panel.lookAt(0, 0, 0); trackGroup.add(panel);
  });

  // Nubes
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const cloudGeo = new THREE.SphereGeometry(6, 8, 6);
  for (let c = 0; c < 26; c++) {
    const cg = new THREE.Group();
    const a = (c / 26) * Math.PI * 2;
    cg.position.set(Math.cos(a) * (S + 260), 70 + Math.random() * 30, Math.sin(a) * (R + 230));
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.position.set((k - 1) * 6.5, k === 1 ? 1.8 : 0, (Math.random() - 0.5) * 2);
      puff.scale.set(1.4, 0.65, 0.9);
      cg.add(puff);
    }
    trackGroup.add(cg);
  }

  scene.add(trackGroup);
  updateDustColor();
}

// Animación ligera del estadio (banderas al viento y público que salta en la llegada)
function animateStadium(dt) {
  const t = performance.now() * 0.001;
  for (let i = 0; i < flagMeshes.length; i++) {
    flagMeshes[i].rotation.y = Math.sin(t * 2.2 + i) * 0.35;
    flagMeshes[i].rotation.x = Math.sin(t * 3.1 + i * 0.7) * 0.08;
  }
  if (crowdGroup) {
    const m = getTrackMetrics();
    const leader = state.sortedParticipants[0];
    const excite = state.phase === 'racing' && leader ? Math.max(0, (leader.x / m.worldLength - 0.75) / 0.25) : (state.phase === 'finished' ? 0.6 : 0);
    crowdGroup.position.y = Math.abs(Math.sin(t * 9)) * 0.25 * Math.min(1, excite);
  }
  drawBigScreen(false);
}


function updateRecenterButtonVisibility() {
  const hasOffset = Math.abs(camDrag.yawOffset) > 0.3 || Math.abs(camDrag.pitchOffset) > 0.3 || Math.abs(camDrag.zoomOffset) > 0.3;
  document.getElementById('btn-recenter-cam').classList.toggle('hidden', !hasOffset);
}

function setupCanvasDragEvents(el) {
  el.addEventListener('mousedown', (e) => {
    camDrag.active = true;
    camDrag.lastX = e.clientX;
    camDrag.lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => { camDrag.active = false; });
  window.addEventListener('mousemove', (e) => {
    if (!camDrag.active) return;
    const dx = e.clientX - camDrag.lastX;
    const dy = e.clientY - camDrag.lastY;
    camDrag.lastX = e.clientX;
    camDrag.lastY = e.clientY;
    camDrag.yawOffset = Math.max(-22, Math.min(22, camDrag.yawOffset - dx * 0.045));
    camDrag.pitchOffset = Math.max(-4, Math.min(18, camDrag.pitchOffset + dy * 0.04));
    updateRecenterButtonVisibility();
  });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    camDrag.zoomOffset = Math.max(-7, Math.min(22, camDrag.zoomOffset + e.deltaY * 0.012));
    updateRecenterButtonVisibility();
  }, { passive: false });

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      camDrag.active = true;
      camDrag.lastX = e.touches[0].clientX;
      camDrag.lastY = e.touches[0].clientY;
    }
  }, { passive: true });
  window.addEventListener('touchend', () => { camDrag.active = false; });
  el.addEventListener('touchmove', (e) => {
    if (!camDrag.active || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - camDrag.lastX;
    const dy = e.touches[0].clientY - camDrag.lastY;
    camDrag.lastX = e.touches[0].clientX;
    camDrag.lastY = e.touches[0].clientY;
    camDrag.yawOffset = Math.max(-22, Math.min(22, camDrag.yawOffset - dx * 0.05));
    camDrag.pitchOffset = Math.max(-4, Math.min(18, camDrag.pitchOffset + dy * 0.045));
    updateRecenterButtonVisibility();
  }, { passive: true });
}


// -------------------------------------------------------------------------
// Inicialización Three.js
// -------------------------------------------------------------------------
function initThreeScene() {
  const viewport = document.getElementById('viewport-3d');
  const w = Math.max(1, viewport.clientWidth);
  const h = Math.max(1, viewport.clientHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0xaad8f5, 0.0014);

  skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(560, 16, 12),
    new THREE.MeshBasicMaterial({ map: createSkyGradientTexture(), side: THREE.BackSide, depthWrite: false, fog: false })
  );
  scene.add(skyDome);

  camera = new THREE.PerspectiveCamera(46, w / h, 0.3, 1200);
  camera.position.copy(currentCamPos);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  viewport.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x3f6212, 0.8));
  sunLight = new THREE.DirectionalLight(0xfff4dc, 1.25);
  sunLight.position.set(40, 75, 55);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 260;
  const d = 45;
  Object.assign(sunLight.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);
  scene.add(sunLight.target);
  // Luz de relleno lateral para dar volumen a los caballos
  const rim = new THREE.DirectionalLight(0xbfdbfe, 0.35);
  rim.position.set(-30, 20, -40);
  scene.add(rim);

  initSharedHorseAssets();
  initParticleSystems();
  setupCanvasDragEvents(viewport);

  const handleResize = () => {
    const vw = Math.max(1, viewport.clientWidth);
    const vh = Math.max(1, viewport.clientHeight);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    renderer.setSize(vw, vh, false);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(handleResize).observe(viewport);
  window.addEventListener('resize', handleResize);
}
