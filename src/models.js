/**
 * Modellbibliothek: baut aus der kompakten Beschreibung (`landmark.m`)
 * eine stilisierte 3D-Gruppe. Alle Modelle stehen mit y = 0 auf dem Boden
 * und blicken nach +Z.
 *
 * Geometrien werden als Einheitsformen zwischengespeichert und über
 * mesh.scale angepasst – so bleiben trotz 180+ Bauwerken wenige hundert
 * Geometrien im Speicher.
 */
import * as THREE from 'three';
import { rng, hashStr, clamp } from './util.js';

/* ══════════════════ Einheitsgeometrien ══════════════════ */
const cache = new Map();
const memo = (key, make) => {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g;
};

const G = {
  box: () => memo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  plane: () => memo('plane', () => new THREE.PlaneGeometry(1, 1)),
  cyl: (s = 16) => memo('cyl' + s, () => new THREE.CylinderGeometry(0.5, 0.5, 1, s)),
  taper: (s = 16, t = 0.7) => memo(`tp${s}_${t}`, () => new THREE.CylinderGeometry(0.5 * t, 0.5, 1, s)),
  cone: (s = 16) => memo('cone' + s, () => new THREE.ConeGeometry(0.5, 1, s)),
  sph: (s = 20) => memo('sph' + s, () => new THREE.SphereGeometry(0.5, s, Math.max(6, s / 2))),
  half: (s = 20) => memo('half' + s, () => new THREE.SphereGeometry(0.5, s, s / 2, 0, Math.PI * 2, 0, Math.PI / 2)),
  torus: (s = 24) => memo('torus' + s, () => new THREE.TorusGeometry(0.5, 0.08, 8, s)),
  ring: (s = 32) => memo('ring' + s, () => new THREE.RingGeometry(0.38, 0.5, s)),
  circle: (s = 32) => memo('circ' + s, () => new THREE.CircleGeometry(0.5, s)),
  prism: () => memo('prism', makePrism),
  arch: (s = 14) => memo('arch' + s, () => makeArch(s)),
};

/** Satteldach: Grundfläche 1×1, Höhe 1, First entlang Z. */
function makePrism() {
  const v = [
    [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5],
    [0, 1, -0.5], [0, 1, 0.5],
  ];
  const tri = [
    [0, 4, 5], [0, 5, 3],      // linke Dachfläche
    [1, 2, 5], [1, 5, 4],      // rechte Dachfläche
    [0, 1, 4],                 // Giebel hinten
    [3, 5, 2],                 // Giebel vorn
  ];
  const pos = [];
  for (const t of tri) for (const i of t) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Rundbogen-Öffnung als extrudierte Form (Breite 1, Höhe 1, Tiefe 1). */
function makeArch(seg) {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(-0.5, 0.5);
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI - (i / seg) * Math.PI;
    s.lineTo(Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  s.lineTo(0.5, 0);
  s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, -0.5);
  return g;
}

/** Rotationskörper aus einem Profil [[r, y], …]. */
function lathe(profile, seg = 20) {
  const key = 'la' + seg + profile.flat().map((n) => n.toFixed(3)).join(',');
  return memo(key, () => new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg));
}

/* ══════════════════ Materialien ══════════════════ */
const M = {};
/** Materialien, deren Emission nachts hochgefahren wird. */
export const NIGHT_MATERIALS = [];
/** Materialien, die bei Regen glänzender werden. */
export const WET_MATERIALS = [];

function std(name, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.86,
    metalness: opts.metalness ?? 0.02,
    flatShading: !!opts.flat,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
  m.userData.baseRough = m.roughness;
  M[name] = m;
  if (opts.night) NIGHT_MATERIALS.push(m);
  if (opts.wet !== false) WET_MATERIALS.push(m);
  return m;
}

export function initMaterials() {
  if (M.stone) return M;
  std('stone',    '#e7e0d1');
  std('stone2',   '#d6cbb6');
  std('sand',     '#dcc6a0');
  std('white',    '#f4f1ea', { roughness: 0.8 });
  std('brick',    '#a05a49', { roughness: 0.92 });
  std('brick2',   '#8c4b40', { roughness: 0.92 });
  std('roofTile', '#8d5a48', { roughness: 0.9 });
  std('roofSlate','#5b6670', { roughness: 0.78 });
  std('copper',   '#79b7a1', { roughness: 0.55, metalness: 0.25 });
  std('gold',     '#e0b258', { roughness: 0.3,  metalness: 0.75 });
  std('dark',     '#414851', { roughness: 0.72, metalness: 0.15 });
  std('steel',    '#8b939b', { roughness: 0.48, metalness: 0.55 });
  std('rust',     '#9a5a3c', { roughness: 0.95 });
  std('concrete', '#b5b9be', { roughness: 0.9 });
  std('wood',     '#8a6a4d', { roughness: 0.94 });
  std('timber',   '#4c3a2c', { roughness: 0.95 });
  std('green',    '#7ea36a', { roughness: 0.96 });
  std('greenDark','#5d7f52', { roughness: 0.96 });
  std('chalk',    '#efeee9', { roughness: 0.95 });
  std('rock',     '#a2988a', { roughness: 0.98, flat: true });
  std('snow',     '#f6f8fb', { roughness: 0.7 });
  std('asphalt',  '#3b3f46', { roughness: 0.9 });
  std('silver',   '#c8cfd6', { roughness: 0.32, metalness: 0.6 });

  M.water = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3f7fa8'), roughness: 0.12, metalness: 0.4,
    transparent: true, opacity: 0.88,
  });
  WET_MATERIALS.push(M.water);

  M.glass = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8fb6cd'), roughness: 0.1, metalness: 0.35,
    transparent: true, opacity: 0.62,
    emissive: new THREE.Color('#ffcf94'), emissiveIntensity: 0,
  });
  M.glass.userData.nightScale = 0.3;
  NIGHT_MATERIALS.push(M.glass);

  M.window = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2c333c'), roughness: 0.25, metalness: 0.2,
    emissive: new THREE.Color('#ffca82'), emissiveIntensity: 0,
  });
  M.window.userData.nightScale = 0.7;
  NIGHT_MATERIALS.push(M.window);

  M.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0') });
  return M;
}

export function mat(name) { return M[name] || M.stone; }

/* ══════════════════ Bau-Helfer ══════════════════ */
function place(mesh, x, y, z, ry = 0) {
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function box(m, w, h, d, x, y, z, ry = 0) {
  const o = new THREE.Mesh(G.box(), m);
  o.scale.set(w, h, d);
  return place(o, x, y, z, ry);
}
function cyl(m, r, h, x, y, z, seg = 16, rTop = r) {
  const o = new THREE.Mesh(rTop === r ? G.cyl(seg) : G.taper(seg, rTop / r), m);
  o.scale.set(r * 2, h, r * 2);
  return place(o, x, y, z);
}
function cone(m, r, h, x, y, z, seg = 16) {
  const o = new THREE.Mesh(G.cone(seg), m);
  o.scale.set(r * 2, h, r * 2);
  return place(o, x, y, z);
}
function sphere(m, r, x, y, z, seg = 18) {
  const o = new THREE.Mesh(G.sph(seg), m);
  o.scale.setScalar(r * 2);
  return place(o, x, y, z);
}
function dome(m, r, h, x, y, z, seg = 20) {
  const o = new THREE.Mesh(G.half(seg), m);
  o.scale.set(r * 2, h * 2, r * 2);
  return place(o, x, y, z);
}
function roof(m, w, h, d, x, y, z, ry = 0) {
  const o = new THREE.Mesh(G.prism(), m);
  o.scale.set(w, h, d);
  return place(o, x, y, z, ry);
}
function latheMesh(m, profile, sx, sy, x, y, z, seg = 20) {
  const o = new THREE.Mesh(lathe(profile, seg), m);
  o.scale.set(sx, sy, sx);
  return place(o, x, y, z);
}

/** Fensterraster auf den vier Seiten eines Quaders (eine InstancedMesh). */
function windows(w, h, d, cols, rows, y0, y1, opts = {}) {
  const sides = opts.sides ?? 4;
  const total = cols * rows * (sides >= 4 ? 2 : 1) + (sides >= 4 ? Math.max(1, Math.round(cols * d / w)) * rows * 2 : 0);
  const cnt = sides >= 4
    ? (cols * rows * 2) + (Math.max(1, Math.round(cols * (d / w))) * rows * 2)
    : cols * rows * 2;
  const inst = new THREE.InstancedMesh(G.plane(), M.window, cnt);
  inst.castShadow = false;
  inst.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const ww = opts.w ?? Math.min(0.32, (w / cols) * 0.42);
  const hh = opts.h ?? Math.min(0.34, ((y1 - y0) / rows) * 0.5);
  let i = 0;
  const put = (x, y, z, ry) => {
    if (i >= cnt) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(ww, hh, 1);
    dummy.updateMatrix();
    inst.setMatrixAt(i++, dummy.matrix);
  };
  for (let r = 0; r < rows; r++) {
    const y = y0 + ((r + 0.5) / rows) * (y1 - y0);
    for (let c = 0; c < cols; c++) {
      const x = (-w / 2) + ((c + 0.5) / cols) * w;
      put(x, y, d / 2 + 0.012, 0);
      put(x, y, -d / 2 - 0.012, Math.PI);
    }
    if (sides >= 4) {
      const dc = Math.max(1, Math.round(cols * (d / w)));
      for (let c = 0; c < dc; c++) {
        const z = (-d / 2) + ((c + 0.5) / dc) * d;
        put(w / 2 + 0.012, y, z, Math.PI / 2);
        put(-w / 2 - 0.012, y, z, -Math.PI / 2);
      }
    }
  }
  inst.count = i;
  inst.instanceMatrix.needsUpdate = true;
  void total;
  return inst;
}

/** Baumgruppe (Instanced) – für Parks, Wälder, Alleen. */
function trees(count, radius, seedv, opts = {}) {
  const rand = rng(seedv);
  const grp = new THREE.Group();
  const trunk = new THREE.InstancedMesh(G.cyl(6), M.timber, count);
  const crown = new THREE.InstancedMesh(G.sph(8), opts.dark ? M.greenDark : M.green, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = opts.line ? 0 : Math.sqrt(rand()) * radius;
    const x = opts.line ? (i / (count - 1) - 0.5) * radius * 2 : Math.cos(a) * r;
    const z = opts.line ? (rand() - 0.5) * (opts.width ?? 0.6) : Math.sin(a) * r;
    const s = 0.55 + rand() * 0.55;
    d.position.set(x, 0.16 * s, z); d.scale.set(0.07, 0.34 * s, 0.07);
    d.rotation.set(0, 0, 0); d.updateMatrix();
    trunk.setMatrixAt(i, d.matrix);
    d.position.set(x, 0.42 * s, z); d.scale.setScalar(0.44 * s); d.updateMatrix();
    crown.setMatrixAt(i, d.matrix);
  }
  trunk.castShadow = crown.castShadow = true;
  crown.receiveShadow = true;
  grp.add(trunk, crown);
  return grp;
}

/* ══════════════════ Bausteine ══════════════════ */

/** Turmhelm in verschiedenen Stilen. */
function spire(style, r, h, x, y, z, accent) {
  const g = new THREE.Group();
  switch (style) {
    case 'gothic': {
      g.add(cone(M.roofSlate, r * 1.02, h, x, y + h / 2, z, 8));
      g.add(sphere(M.gold, r * 0.13, x, y + h + r * 0.1, z, 10));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        g.add(cone(M.roofSlate, r * 0.2, h * 0.3, x + Math.cos(a) * r * 0.85, y + h * 0.14, z + Math.sin(a) * r * 0.85, 6));
      }
      break;
    }
    case 'openwork': {
      g.add(cone(M.stone2, r * 1.0, h, x, y + h / 2, z, 8));
      const o = new THREE.Mesh(G.cone(8), M.stone2);
      o.scale.set(r * 1.5, h * 0.42, r * 1.5);
      place(o, x, y + h * 0.2, z);
      o.material = M.stone2;
      g.add(o);
      break;
    }
    case 'baroque': {
      g.add(latheMesh(M.copper, [[0.02, 0], [0.5, 0.02], [0.46, 0.2], [0.2, 0.42], [0.3, 0.5],
        [0.16, 0.68], [0.06, 0.82], [0.02, 0.92], [0.0, 1.0]], r * 2.1, h, x, y, z, 18));
      g.add(sphere(M.gold, r * 0.12, x, y + h * 1.02, z, 10));
      break;
    }
    case 'onion': {
      g.add(latheMesh(M.copper, [[0.02, 0], [0.5, 0.06], [0.52, 0.3], [0.36, 0.52], [0.14, 0.7],
        [0.2, 0.78], [0.06, 0.9], [0, 1]], r * 2.2, h, x, y, z, 20));
      g.add(sphere(M.gold, r * 0.12, x, y + h * 1.0, z, 10));
      break;
    }
    case 'cone':
      g.add(cone(M.roofTile, r * 1.05, h, x, y + h / 2, z, 12));
      break;
    case 'broken': {
      const c = cone(M.stone2, r * 1.0, h, x, y + h / 2, z, 8);
      c.scale.y *= 0.72;
      c.rotation.z = 0.06;
      g.add(c);
      break;
    }
    case 'flat':
    default:
      g.add(box(M.roofSlate, r * 2.2, h * 0.22, r * 2.2, x, y + h * 0.11, z));
      if (accent) g.add(sphere(M.gold, r * 0.1, x, y + h * 0.28, z, 8));
      break;
  }
  return g;
}

/** Klassisches Kirchenschiff mit Dach und Strebepfeilern. */
function nave(w, len, h, roofM, wallM, opts = {}) {
  const g = new THREE.Group();
  g.add(box(wallM, w, h, len, 0, h / 2, 0));
  g.add(roof(roofM, w * 1.05, h * 0.44, len, 0, h, 0));
  if (opts.buttress !== false) {
    const n = Math.max(2, Math.round(len / 0.9));
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + ((i + 0.5) / n) * len;
      g.add(box(wallM, 0.12, h * 0.82, 0.16, w / 2 + 0.05, h * 0.41, z));
      g.add(box(wallM, 0.12, h * 0.82, 0.16, -w / 2 - 0.05, h * 0.41, z));
    }
  }
  if (opts.apse !== false) {
    g.add(cyl(wallM, w * 0.42, h * 0.92, 0, h * 0.46, -len / 2 - w * 0.16, 12));
    g.add(cone(roofM, w * 0.46, h * 0.34, 0, h * 0.92 + h * 0.17, -len / 2 - w * 0.16, 12));
  }
  return g;
}

/** Sockelstufen. */
function steps(m, w, d, n, x, y, z) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const k = 1 + (n - i) * 0.09;
    g.add(box(m, w * k, 0.08, d * k, x, y + i * 0.08 + 0.04, z));
  }
  return g;
}

/* ══════════════════════════════════════════════════════════════════════
   Die Bauwerkstypen
   ══════════════════════════════════════════════════════════════════════ */
const B = {};

/* ── Sakralbauten ───────────────────────────────────────────── */
B.cathedral = (s, r) => {
  const g = new THREE.Group();
  const wall = s.brick ? M.brick : M.stone;
  const rm = s.roof ? matFrom(s.roof) : M.roofSlate;
  const w = s.w ?? 3, len = s.len ?? 5, h = s.h ?? 8;
  const bodyH = h * 0.42;
  g.add(nave(w, len, bodyH, rm, wall));
  const tw = w * 0.34, tz = len / 2 + tw * 0.35;
  const tHalf = h * 0.62;
  for (let i = 0; i < (s.towers ?? 2); i++) {
    const x = (s.towers === 1 ? 0 : (i === 0 ? -1 : 1)) * (w / 2 - tw / 2 + 0.06);
    g.add(box(wall, tw, tHalf, tw, x, tHalf / 2, tz));
    g.add(box(wall, tw * 1.08, 0.1, tw * 1.08, x, tHalf, tz));
    g.add(spire(s.spire ?? 'gothic', tw / 2, h - tHalf, x, tHalf, tz, true));
    g.add(windows(tw, tHalf, tw, 1, 4, tHalf * 0.28, tHalf * 0.9, { sides: 4, w: 0.1, h: 0.24 }));
    g.children[g.children.length - 1].position.set(x, 0, tz);
  }
  // Westfassade mit Rosette
  g.add(box(wall, w * 0.95, bodyH * 1.25, 0.18, 0, bodyH * 0.62, tz));
  const rose = new THREE.Mesh(G.circle(24), M.glass);
  rose.scale.setScalar(w * 0.3);
  place(rose, 0, bodyH * 0.85, tz + 0.1);
  g.add(rose);
  // Vierungsturm
  g.add(box(wall, w * 0.34, bodyH * 0.5, w * 0.34, 0, bodyH * 1.2, -len * 0.05));
  g.add(spire('gothic', w * 0.17, h * 0.2, 0, bodyH * 1.45, -len * 0.05));
  void r;
  return g;
};

B.church = (s, r) => {
  const g = new THREE.Group();
  const wall = s.brick ? M.brick : s.white ? M.white : M.stone;
  const rm = M.roofTile;
  const w = s.w ?? 1.9, len = s.len ?? 3.2, h = s.h ?? 5;
  const bodyH = s.ruin ? h * 0.5 : h * 0.36;
  g.add(nave(w, len, bodyH, s.brick ? M.roofSlate : rm, wall, { apse: !s.ruin }));
  if (s.cloister) {
    g.add(box(M.stone2, w * 1.5, bodyH * 0.42, w * 1.5, w * 1.1, bodyH * 0.21, -len * 0.1));
    g.add(roof(rm, w * 1.55, bodyH * 0.22, w * 1.55, w * 1.1, bodyH * 0.42, -len * 0.1));
  }
  const tw = w * (s.twin || s.fourTowers ? 0.36 : 0.44);
  const tz = len / 2 + tw * 0.4;
  const towerH = s.h * (s.ruin ? 0.62 : 0.74);
  const n = s.twin || s.fourTowers ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i ? 1 : -1) * (w / 2 - tw / 2 + 0.08);
    g.add(box(wall, tw, towerH, tw, x, towerH / 2, tz));
    g.add(box(wall, tw * 1.1, 0.09, tw * 1.1, x, towerH, tz));
    if (!s.ruin) g.add(spire(s.spire ?? 'gothic', tw / 2, h - towerH, x, towerH, tz, true));
    const wi = windows(tw, towerH, tw, 1, 3, towerH * 0.35, towerH * 0.88, { w: 0.09, h: 0.22 });
    wi.position.set(x, 0, tz); g.add(wi);
    if (s.cages && i === 0) {
      for (let k = 0; k < 3; k++) {
        const cg = new THREE.Mesh(G.cyl(8), M.dark);
        cg.scale.set(0.13, 0.22, 0.13);
        place(cg, x - 0.16 + k * 0.16, towerH * 0.72, tz + tw / 2 + 0.06);
        g.add(cg);
      }
    }
  }
  if (s.fourTowers) {
    for (let i = 0; i < 2; i++) {
      const x = (i ? 1 : -1) * (w / 2 - tw * 0.4);
      g.add(cyl(wall, tw * 0.3, towerH * 0.78, x, towerH * 0.39, -len / 2 - 0.1, 10));
      g.add(cone(M.roofSlate, tw * 0.34, h * 0.18, x, towerH * 0.78 + h * 0.09, -len / 2 - 0.1, 10));
    }
  }
  if (s.turrets) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(cyl(wall, 0.11, bodyH * 0.7, Math.cos(a) * w * 0.42, bodyH * 1.1, Math.sin(a) * w * 0.42 - len * 0.1, 8));
      g.add(cone(M.roofSlate, 0.14, bodyH * 0.3, Math.cos(a) * w * 0.42, bodyH * 1.6, Math.sin(a) * w * 0.42 - len * 0.1, 8));
    }
    g.add(box(wall, w * 0.62, bodyH * 0.75, w * 0.62, 0, bodyH * 1.12, -len * 0.1));
    g.add(cone(M.roofSlate, w * 0.4, bodyH * 0.7, 0, bodyH * 1.85, -len * 0.1, 10));
  }
  if (s.modernAnnex) {
    g.add(box(M.concrete, w * 1.3, bodyH * 0.9, w * 1.3, w * 1.35, bodyH * 0.45, -len * 0.18));
    const bl = new THREE.Mesh(G.box(), M.glass);
    bl.scale.set(w * 1.24, bodyH * 0.7, w * 1.24);
    place(bl, w * 1.35, bodyH * 0.45, -len * 0.18);
    g.add(bl);
  }
  if (s.steps) g.add(steps(M.stone2, w * 2.2, 0.9, 5, 0, 0, tz + 0.9));
  void r;
  return g;
};

B.domechurch = (s, r) => {
  const g = new THREE.Group();
  const wall = s.stone ? M.stone2 : M.stone;
  const rr = s.r ?? 1.1, h = s.h ?? 3.6;
  const drumH = h * 0.42;
  if (s.octagon) {
    g.add(cyl(wall, rr, drumH, 0, drumH / 2, 0, 8));
    g.add(cyl(wall, rr * 1.04, 0.1, 0, drumH, 0, 8));
    g.add(dome(matFrom(s.dome ?? '#7f8f86'), rr * 0.94, h * 0.3, 0, drumH, 0, 8));
  } else {
    g.add(cyl(wall, rr * 1.15, drumH * 0.7, 0, drumH * 0.35, 0, 24));
    g.add(cyl(wall, rr, drumH, 0, drumH / 2, 0, 24));
    g.add(dome(matFrom(s.dome ?? '#8fa79b'), rr * 1.0, h * 0.34, 0, drumH, 0, 24));
  }
  const wi = windows(rr * 1.8, drumH, rr * 1.8, 3, 1, drumH * 0.45, drumH * 0.85, { w: 0.13, h: 0.26 });
  g.add(wi);
  if (s.lantern) {
    g.add(cyl(wall, rr * 0.22, h * 0.16, 0, drumH + h * 0.34 + h * 0.08, 0, 12));
    g.add(cone(M.copper, rr * 0.26, h * 0.12, 0, drumH + h * 0.34 + h * 0.22, 0, 12));
    g.add(sphere(M.gold, rr * 0.07, 0, drumH + h * 0.34 + h * 0.3, 0, 10));
  }
  if (s.corners) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * rr * 1.25, z = Math.sin(a) * rr * 1.25;
      g.add(box(wall, rr * 0.4, drumH * 1.1, rr * 0.4, x, drumH * 0.55, z));
      g.add(dome(matFrom(s.dome ?? '#7d9188'), rr * 0.22, h * 0.12, x, drumH * 1.1, z, 12));
    }
  }
  g.add(steps(M.stone2, rr * 2.4, rr * 1.2, 3, 0, 0, rr * 1.2));
  void r;
  return g;
};

/* ── Bürgerhäuser & Stadtbild ───────────────────────────────── */
B.gablehouse = (s, r) => {
  const g = new THREE.Group();
  const wall = s.brick ? M.brick : M.stone;
  const w = s.w ?? 2, h = s.h ?? 4, d = w * 0.75;
  const bodyH = h * 0.62;
  g.add(box(wall, w, bodyH, d, 0, bodyH / 2, 0));
  g.add(roof(matFrom(s.roof ?? '#5f6b74'), w * 1.03, h * 0.3, d * 1.02, 0, bodyH, 0, Math.PI / 2));
  // Schaugiebel zur Front
  const gab = new THREE.Mesh(G.prism(), wall);
  gab.scale.set(w, h - bodyH, 0.16);
  place(gab, 0, bodyH, d / 2 + 0.02);
  g.add(gab);
  if (s.tracery) {
    for (let i = 0; i < 5; i++) {
      const x = (-0.34 + i * 0.17) * w;
      const hh = (h - bodyH) * (1 - Math.abs(i - 2) * 0.24);
      g.add(box(M.stone2, w * 0.05, hh * 0.9, 0.07, x, bodyH + hh * 0.45, d / 2 + 0.11));
      g.add(cone(M.stone2, w * 0.045, hh * 0.24, x, bodyH + hh * 0.95, d / 2 + 0.11, 6));
    }
  }
  if (s.arcade) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = new THREE.Mesh(G.arch(12), wall);
      a.scale.set(w / n * 0.86, bodyH * 0.34, 0.3);
      place(a, (-w / 2) + ((i + 0.5) / n) * w, 0, d / 2 + 0.14);
      g.add(a);
    }
  }
  g.add(windows(w, bodyH, d, 4, 2, bodyH * 0.24, bodyH * 0.86));
  if (s.carillon) {
    g.add(box(wall, w * 0.2, h * 0.55, w * 0.2, 0, h * 0.72, -d * 0.1));
    g.add(spire('gothic', w * 0.1, h * 0.3, 0, h * 1.0, -d * 0.1));
  }
  if (s.roland) {
    g.add(cyl(M.stone2, 0.13, 0.36, w * 0.72, 0.18, d * 0.4, 10));
    g.add(box(M.stone, 0.13, 0.5, 0.1, w * 0.72, 0.6, d * 0.4));
    g.add(sphere(M.stone, 0.08, w * 0.72, 0.9, d * 0.4, 10));
  }
  if (s.island) g.add(waterDisc(w * 1.6, 0, -0.02, 0));
  if (s.fresco) {
    const f = new THREE.Mesh(G.plane(), matFrom('#d8c8a8'));
    f.scale.set(w * 0.7, bodyH * 0.5, 1);
    place(f, 0, bodyH * 0.55, d / 2 + 0.09);
    g.add(f);
  }
  void r;
  return g;
};

B.rowhouses = (s, r) => {
  const g = new THREE.Group();
  const n = s.count ?? 8, len = s.len ?? 5, h = s.h ?? 3;
  const wall = s.brick ? M.brick : M.stone;
  const bw = len / n;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const x = t * len;
    const z = (s.curve ?? 0) * (t * t * 4 - 1) * -1.2;
    const hh = h * (0.86 + ((i * 37) % 11) / 40);
    const bodyH = hh * 0.66;
    const d = bw * (s.canal ? 2.0 : 1.3);
    const m = s.brick ? (i % 3 ? M.brick : M.brick2) : (i % 2 ? M.stone : M.stone2);
    g.add(box(m, bw * 0.94, bodyH, d, x, bodyH / 2, z));
    if (s.stepgable || s.gothic) {
      for (let k = 0; k < 4; k++) {
        const sw = bw * 0.94 * (1 - k * 0.22);
        g.add(box(m, sw, (hh - bodyH) * 0.3, d * 0.2, x, bodyH + (hh - bodyH) * (0.15 + k * 0.26), z + d / 2 - 0.02));
      }
      g.add(roof(matFrom(s.roofC ?? '#6d5347'), bw * 0.94, hh - bodyH, d, x, bodyH, z, Math.PI / 2));
    } else if (s.expressionist) {
      g.add(box(m, bw * 0.94, (hh - bodyH) * 0.55, d, x, bodyH + (hh - bodyH) * 0.27, z));
      g.add(roof(M.brick2, bw * 0.94, (hh - bodyH) * 0.6, d, x, bodyH + (hh - bodyH) * 0.55, z, Math.PI / 2));
    } else {
      const gab = new THREE.Mesh(G.prism(), m);
      gab.scale.set(bw * 0.94, hh - bodyH, 0.14);
      place(gab, x, bodyH, z + d / 2 + 0.02);
      g.add(gab);
      g.add(roof(matFrom(s.brick ? '#6a4b40' : '#6d5347'), bw * 0.9, (hh - bodyH) * 0.9, d, x, bodyH, z, Math.PI / 2));
    }
    if (s.arcade) {
      const a = new THREE.Mesh(G.arch(12), m);
      a.scale.set(bw * 0.72, bodyH * 0.36, 0.34);
      place(a, x, 0, z + d / 2 + 0.16);
      g.add(a);
    }
    const wi = windows(bw * 0.94, bodyH, d, 2, 3, bodyH * (s.arcade ? 0.42 : 0.2), bodyH * 0.9, { sides: 2 });
    wi.position.set(x, 0, z);
    g.add(wi);
  }
  if (s.canal) g.add(waterDisc(len * 0.42, 0, -0.03, len * 0.42, len * 0.9));
  if (s.pavilion) {
    g.add(cyl(M.stone2, 0.34, 0.5, 0, 0.25, len * 0.34, 12));
    g.add(cone(M.copper, 0.42, 0.36, 0, 0.68, len * 0.34, 12));
    g.add(sphere(M.gold, 0.08, 0, 0.92, len * 0.34, 10));
  }
  void r;
  return g;
};

B.townhouse = (s, r) => {
  const g = new THREE.Group();
  const w = s.w ?? 2.4, h = s.h ?? 2.4, d = w * 0.66;
  const bodyH = h * 0.72;
  const wall = M.stone;
  if (s.curved) {
    g.add(cyl(wall, w * 0.5, bodyH, 0, bodyH / 2, 0, 20));
    g.add(cone(matFrom(s.roof ?? '#7a5a4e'), w * 0.55, h * 0.36, 0, bodyH + h * 0.18, 0, 20));
  } else {
    g.add(box(wall, w, bodyH, d, 0, bodyH / 2, 0));
    g.add(roof(matFrom(s.roof ?? '#7a5a4e'), w * 1.03, h * 0.34, d * 1.03, 0, bodyH, 0, Math.PI / 2));
    // Mittelrisalit
    g.add(box(M.stone2, w * 0.34, bodyH * 1.06, d * 0.16, 0, bodyH * 0.53, d / 2 + 0.04));
    const ped = new THREE.Mesh(G.prism(), M.stone2);
    ped.scale.set(w * 0.36, h * 0.14, 0.14);
    place(ped, 0, bodyH * 1.06, d / 2 + 0.05);
    g.add(ped);
  }
  if (s.baroque) {
    for (let i = 0; i < 4; i++) {
      const x = (-0.36 + i * 0.24) * w;
      g.add(cyl(M.stone2, 0.05, bodyH * 0.78, x, bodyH * 0.39, d / 2 + 0.03, 8));
    }
  }
  if (s.tower) {
    g.add(box(wall, w * 0.22, h * 0.85, w * 0.22, -w * 0.32, h * 0.42, -d * 0.1));
    g.add(spire('baroque', w * 0.12, h * 0.36, -w * 0.32, h * 0.85, -d * 0.1));
  }
  if (s.dome) {
    g.add(dome(M.copper, w * 0.2, h * 0.22, 0, bodyH + h * 0.1, 0, 16));
    g.add(sphere(M.gold, 0.05, 0, bodyH + h * 0.34, 0, 10));
  }
  if (s.beerhall) {
    g.add(box(M.stone2, w * 1.1, bodyH * 0.4, d * 1.5, 0, bodyH * 0.2, d * 0.6));
    g.add(trees(6, w * 0.7, 31));
    g.children[g.children.length - 1].position.set(w * 0.9, 0, d * 0.5);
  }
  g.add(windows(w, bodyH, d, 5, 2, bodyH * 0.26, bodyH * 0.86));
  if (s.moat) g.add(waterRing(w * 0.98, w * 1.35));
  if (s.fountain) g.add(fountain(0, 0, d * 1.5, 0.5));
  if (s.garden) g.add(gardenPatch(w * 1.6, d * 1.4, 0, -d * 1.5, 17));
  void r;
  return g;
};

B.halftimber = (s, r) => {
  const g = new THREE.Group();
  const n = s.count ?? 9, h = s.h ?? 2.4;
  const rand = rng(hashStr('ht' + n));
  const spread = s.tight ? 0.5 : 0.75;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const rr = (s.manor ? 0.7 : 1) * (0.5 + rand() * 1.1) * n * spread * 0.16;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr * (s.valley ? 0.4 : 1);
    const hh = h * (0.6 + rand() * 0.55);
    const w = 0.5 + rand() * 0.3, d = 0.45 + rand() * 0.28;
    const bodyH = hh * 0.66;
    g.add(box(M.white, w, bodyH, d, x, bodyH / 2, z, a));
    // Fachwerkbalken
    g.add(box(M.timber, w * 1.01, 0.05, d * 1.01, x, bodyH * 0.5, z, a));
    g.add(box(M.timber, 0.05, bodyH, d * 1.01, x + Math.cos(a) * w * 0.4, bodyH / 2, z + Math.sin(a) * w * 0.4, a));
    g.add(roof(M.roofTile, w * 1.06, hh - bodyH, d * 1.06, x, bodyH, z, a + Math.PI / 2));
    const wi = windows(w, bodyH, d, 2, 2, bodyH * 0.24, bodyH * 0.84, { sides: 2, w: 0.1, h: 0.12 });
    wi.position.set(x, 0, z); wi.rotation.y = a; g.add(wi);
  }
  if (s.church) {
    g.add(box(M.stone, 0.5, h * 0.9, 0.7, 0, h * 0.45, -n * 0.13));
    g.add(box(M.stone, 0.32, h * 1.3, 0.32, 0, h * 0.65, -n * 0.13 + 0.45));
    g.add(spire('gothic', 0.17, h * 0.55, 0, h * 1.3, -n * 0.13 + 0.45));
  }
  if (s.gate) {
    g.add(box(M.stone2, 0.55, h * 1.15, 0.55, n * 0.14, h * 0.57, 0));
    g.add(cone(M.roofTile, 0.34, h * 0.4, n * 0.14, h * 1.35, 0, 8));
  }
  if (s.valley) g.add(waterDisc(n * 0.2, 0, -0.02, n * 0.16, n * 0.5));
  void r;
  return g;
};

/* ── Schlösser & Burgen ─────────────────────────────────────── */
B.palace = (s, r) => {
  const g = new THREE.Group();
  const w = s.w ?? 5, d = s.d ?? 2.2, h = s.h ?? 2.8;
  const wall = s.romanesque ? M.stone2 : M.stone;
  const bodyH = h * 0.74;
  const rm = matFrom(s.roof ?? '#7a5a4e');
  const corps = (cw, cd, cx, cz, extra = 0) => {
    g.add(box(wall, cw, bodyH + extra, cd, cx, (bodyH + extra) / 2, cz));
    g.add(roof(rm, cw * 1.03, h * 0.3, cd * 1.03, cx, bodyH + extra, cz, cw > cd ? Math.PI / 2 : 0));
    const wi = windows(cw, bodyH + extra, cd, Math.max(3, Math.round(cw * 2.4)), 2, bodyH * 0.24, bodyH * 0.88);
    wi.position.set(cx, 0, cz); g.add(wi);
  };
  corps(w, d, 0, 0);
  if (s.wings) {
    const wingW = d * 0.9, wingD = d * 1.7;
    corps(wingW, wingD, -w / 2 + wingW / 2, d / 2 + wingD / 2 - d * 0.1);
    corps(wingW, wingD, w / 2 - wingW / 2, d / 2 + wingD / 2 - d * 0.1);
  }
  if (s.courtyard) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(cyl(wall, d * 0.22, bodyH * 1.15, Math.cos(a) * w * 0.42, bodyH * 0.58, Math.sin(a) * d * 0.62, 12));
      g.add(cone(matFrom('#7d8f86'), d * 0.26, h * 0.3, Math.cos(a) * w * 0.42, bodyH * 1.15 + h * 0.15, Math.sin(a) * d * 0.62, 12));
    }
  }
  // Mittelrisalit
  g.add(box(M.stone2, w * 0.22, bodyH * 1.12, d * 0.14, 0, bodyH * 0.56, d / 2 + 0.04));
  if (s.corners) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(box(wall, w * 0.1, bodyH * 1.2, d * 0.16, sx * w * 0.45, bodyH * 0.6, sz * d * 0.44));
      g.add(cone(rm, w * 0.07, h * 0.34, sx * w * 0.45, bodyH * 1.2 + h * 0.17, sz * d * 0.44, 8));
    }
  }
  if (s.dome || s.glassDome) {
    const dm = s.glassDome ? M.glass : M.copper;
    g.add(cyl(wall, w * 0.11, h * 0.28, 0, bodyH + h * 0.14, 0, 18));
    g.add(dome(dm, w * 0.12, h * 0.3, 0, bodyH + h * 0.28, 0, 18));
    g.add(sphere(M.gold, w * 0.02, 0, bodyH + h * 0.62, 0, 10));
  }
  if (s.tower) {
    g.add(box(wall, d * 0.4, h * 1.5, d * 0.4, -w * 0.3, h * 0.75, -d * 0.1));
    g.add(spire('gothic', d * 0.22, h * 0.7, -w * 0.3, h * 1.5, -d * 0.1, true));
  }
  if (s.crown) {
    g.add(box(wall, w * 0.24, bodyH * 1.3, d * 0.3, 0, bodyH * 0.65, d * 0.55));
    g.add(latheMesh(M.copper, [[0.5, 0], [0.36, 0.3], [0.18, 0.5], [0.26, 0.62], [0.05, 0.9], [0, 1]],
      w * 0.3, h * 0.5, 0, bodyH * 1.3, d * 0.55, 14));
    g.add(sphere(M.gold, w * 0.022, 0, bodyH * 1.3 + h * 0.52, d * 0.55, 10));
  }
  if (s.terraces) {
    for (let i = 0; i < 5; i++) {
      g.add(box(M.stone2, w * (1.1 + i * 0.12), 0.16, 0.5, 0, -0.08 - i * 0.16, d / 2 + 0.4 + i * 0.55));
      const vine = trees(5, w * 0.4, 40 + i, { dark: true, line: true, width: 0.2 });
      vine.position.set(0, -0.16 - i * 0.16, d / 2 + 0.68 + i * 0.55);
      vine.scale.set(w / 3, 0.5, 1);
      g.add(vine);
    }
  }
  if (s.mural) {
    const mu = new THREE.Mesh(G.plane(), matFrom('#c9b493'));
    mu.scale.set(w * 0.92, bodyH * 0.3, 1);
    place(mu, 0, bodyH * 0.55, -d / 2 - 0.03);
    mu.rotation.y = Math.PI;
    g.add(mu);
  }
  if (s.moat) g.add(waterRing(Math.max(w, d) * 0.78, Math.max(w, d) * 1.05));
  if (s.island) g.add(waterDisc(Math.max(w, d) * 1.15, 0, -0.04, 0));
  if (s.canal) g.add(waterDisc(w * 0.3, 0, -0.03, d * 2.6, w * 0.34));
  if (s.garden) g.add(gardenPatch(w * 0.95, d * 1.7, 0, -d / 2 - d * 0.95, 51));
  if (s.fountain) g.add(fountain(0, 0, d / 2 + 1.5, 0.7));
  void r;
  return g;
};

B.castle = (s, r) => {
  const g = new THREE.Group();
  const h = s.h ?? 3.4, nT = s.towers ?? 3;
  const wall = s.red ? matFrom('#b98a72') : s.white ? M.white : M.stone2;
  const rm = s.neogothic ? M.roofSlate : M.roofTile;
  const rad = 0.55 + nT * 0.13;
  if (s.hill) g.add(hill(rad * 2.5, h * (s.steep ? 0.55 : 0.34), s.forest));
  const baseY = s.hill ? h * (s.steep ? 0.5 : 0.3) : 0;
  const bodyH = h * (s.tall ? 0.62 : 0.46);
  g.add(cyl(wall, rad, bodyH * 0.55, 0, baseY + bodyH * 0.27, 0, 10));
  g.add(box(wall, rad * 1.5, bodyH, rad * 1.1, 0, baseY + bodyH / 2, 0));
  if (!s.ruin) g.add(roof(rm, rad * 1.55, h * 0.24, rad * 1.15, 0, baseY + bodyH, 0, Math.PI / 2));
  const rand = rng(hashStr('c' + nT + h));
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2 + 0.6;
    const tr = rad * (0.72 + rand() * 0.35);
    const x = Math.cos(a) * tr, z = Math.sin(a) * tr;
    const th = bodyH * (0.9 + rand() * 0.95) * (s.keep && i === 0 ? 1.5 : 1);
    const tw = 0.16 + rand() * 0.1;
    g.add(cyl(wall, tw, th, x, baseY + th / 2, z, 10));
    g.add(cyl(wall, tw * 1.2, 0.08, x, baseY + th, z, 10));
    if (!s.ruin) g.add(cone(rm, tw * 1.25, th * 0.5, x, baseY + th + th * 0.25, z, 10));
    const wi = windows(tw * 2, th, tw * 2, 1, 3, th * 0.3, th * 0.85, { w: 0.06, h: 0.12 });
    wi.position.set(x, baseY, z); g.add(wi);
  }
  if (s.halftimberWing) {
    g.add(box(M.white, rad * 0.9, bodyH * 0.8, rad * 0.6, rad * 1.1, baseY + bodyH * 0.4, 0));
    g.add(box(M.timber, rad * 0.92, 0.05, rad * 0.62, rad * 1.1, baseY + bodyH * 0.4, 0));
    g.add(roof(M.roofTile, rad * 0.95, h * 0.2, rad * 0.65, rad * 1.1, baseY + bodyH * 0.8, 0, Math.PI / 2));
  }
  if (s.church) {
    g.add(box(wall, rad * 0.5, bodyH * 0.9, rad * 0.9, -rad * 1.15, baseY + bodyH * 0.45, 0));
    g.add(spire('gothic', rad * 0.16, h * 0.5, -rad * 1.15, baseY + bodyH * 0.9, rad * 0.3));
  }
  if (s.dome) {
    g.add(dome(s.gold ? M.gold : M.copper, rad * 0.3, h * 0.28, 0, baseY + bodyH + h * 0.12, 0, 18));
    g.add(sphere(M.gold, 0.06, 0, baseY + bodyH + h * 0.46, 0, 10));
  }
  if (s.skywalk) {
    g.add(box(M.steel, 0.1, 0.05, rad * 2.2, rad * 0.2, baseY + bodyH * 0.9, rad * 1.6));
  }
  if (s.flag) {
    g.add(cyl(M.steel, 0.02, h * 0.5, 0, baseY + bodyH + h * 0.25, 0, 6));
    g.add(box(matFrom('#d4b13c'), 0.3, 0.1, 0.02, 0.15, baseY + bodyH + h * 0.42, 0));
    g.add(box(matFrom('#c0392b'), 0.3, 0.1, 0.02, 0.15, baseY + bodyH + h * 0.32, 0));
  }
  if (s.island) g.add(waterDisc(rad * 3.2, 0, -0.05, 0));
  void r;
  return g;
};

/* ── Tore, Türme, Denkmäler ─────────────────────────────────── */
B.gate = (s, r) => {
  const g = new THREE.Group();
  const w = s.w ?? 3.2, h = s.h ?? 3;
  if (s.hut) {
    g.add(box(M.white, w * 0.5, h * 0.6, w * 0.4, 0, h * 0.3, 0));
    g.add(box(M.dark, w * 0.55, h * 0.08, w * 0.45, 0, h * 0.62, 0));
    g.add(cyl(M.steel, 0.03, h * 0.9, w * 0.42, h * 0.45, 0, 6));
    g.add(box(M.stone, w * 0.34, h * 0.5, 0.06, -w * 0.42, h * 0.55, 0));
    return g;
  }
  const cols = s.cols ?? 6, ch = h * 0.72;
  g.add(box(M.stone, w * 1.06, h * 0.06, w * 0.32, 0, h * 0.03, 0));
  for (let i = 0; i < cols; i++) {
    const x = (-0.5 + (i + 0.5) / cols) * w;
    for (const z of [-w * 0.1, w * 0.1]) g.add(cyl(M.stone, w * 0.045, ch, x, ch / 2 + h * 0.06, z, 14));
  }
  g.add(box(M.stone, w * 1.02, h * 0.16, w * 0.34, 0, ch + h * 0.14, 0));
  g.add(box(M.stone2, w * 0.9, h * 0.1, w * 0.3, 0, ch + h * 0.27, 0));
  if (s.quadriga) {
    const q = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      q.add(box(M.gold, 0.12, 0.2, 0.3, -0.22 + i * 0.15, 0.14, 0.06));
      q.add(box(M.gold, 0.09, 0.12, 0.1, -0.22 + i * 0.15, 0.3, -0.06));
    }
    q.add(cyl(M.gold, 0.11, 0.1, 0, 0.1, -0.34, 12));
    q.add(box(M.gold, 0.1, 0.3, 0.1, 0, 0.3, -0.34));
    q.position.set(0, ch + h * 0.32, 0);
    q.scale.setScalar(w * 0.28);
    q.traverse((o) => { o.castShadow = true; });
    g.add(q);
  }
  void r;
  return g;
};

B.stonegate = (s, r) => {
  const g = new THREE.Group();
  const w = s.w ?? 2.6, h = s.h ?? 3;
  const wall = s.brick ? M.brick : s.roman ? matFrom('#8e8578') : M.sand;
  if (s.round) {
    for (const sx of [-1, 1]) {
      g.add(cyl(wall, w * 0.24, h * 0.78, sx * w * 0.32, h * 0.39, 0, 14));
      g.add(cone(M.roofSlate, w * 0.28, h * 0.34, sx * w * 0.32, h * 0.78 + h * 0.17, 0, 14));
      const wi = windows(w * 0.48, h * 0.78, w * 0.48, 1, 3, h * 0.28, h * 0.68, { w: 0.07, h: 0.13 });
      wi.position.set(sx * w * 0.32, 0, 0); g.add(wi);
    }
    g.add(box(wall, w * 0.42, h * 0.72, w * 0.4, 0, h * 0.36, 0));
    const gab = new THREE.Mesh(G.prism(), wall);
    gab.scale.set(w * 0.44, h * 0.3, w * 0.42);
    place(gab, 0, h * 0.72, 0, Math.PI / 2);
    g.add(gab);
  } else {
    g.add(box(wall, w, h * 0.86, w * 0.42, 0, h * 0.43, 0));
    for (const sx of [-1, 1]) {
      g.add(cyl(wall, w * 0.17, h, sx * w * 0.42, h / 2, 0, 14));
      if (!s.carolingian) g.add(cyl(wall, w * 0.19, h * 0.06, sx * w * 0.42, h, 0, 14));
    }
    if (s.roman) {
      for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
        const a = new THREE.Mesh(G.arch(10), M.dark);
        a.scale.set(w * 0.13, h * 0.11, 0.12);
        place(a, (-0.34 + i * 0.17) * w, h * (0.24 + row * 0.22), w * 0.21 + 0.02);
        g.add(a);
      }
    }
    if (s.carolingian) {
      g.add(roof(M.roofTile, w * 1.04, h * 0.3, w * 0.46, 0, h * 0.86, 0, Math.PI / 2));
      for (let i = 0; i < 3; i++) {
        const a = new THREE.Mesh(G.arch(10), matFrom('#c9b9a2'));
        a.scale.set(w * 0.24, h * 0.24, 0.1);
        place(a, (-0.28 + i * 0.28) * w, 0, w * 0.22);
        g.add(a);
      }
      for (let i = 0; i < 8; i++) {
        g.add(box(matFrom('#b8a48c'), w * 0.09, h * 0.28, 0.05, (-0.42 + i * 0.12) * w, h * 0.6, w * 0.22));
      }
    }
  }
  void r;
  return g;
};

B.tower = (s, r) => {
  const g = new THREE.Group();
  const h = s.h ?? 4, w = s.w ?? 0.8;
  const wall = s.ruin ? M.stone2 : M.stone;
  if (s.shape === 'round' || s.ruin) {
    g.add(cyl(wall, w / 2, h, 0, h / 2, 0, 16));
    g.add(cyl(wall, w / 2 * 1.14, h * 0.05, 0, h, 0, 16));
    if (s.crown === 'cone') g.add(cone(M.roofTile, w * 0.6, h * 0.32, 0, h + h * 0.16, 0, 14));
  } else if (s.shape === 'sail') {
    const prof = [[0.5, 0], [0.42, 0.35], [0.3, 0.72], [0.1, 0.95], [0.04, 1]];
    g.add(latheMesh(M.stone2, prof, w * 2, h, 0, 0, 0, 5));
    if (s.sub) {
      g.add(cyl(M.dark, 0.2, 1.8, w * 1.6, 0.2, 0, 12));
      g.children[g.children.length - 1].rotation.z = Math.PI / 2;
      g.add(box(M.dark, 0.16, 0.3, 0.3, w * 1.6, 0.42, 0));
    }
  } else {
    g.add(box(wall, w, h, w, 0, h / 2, 0));
    g.add(box(wall, w * 1.14, h * 0.05, w * 1.14, 0, h, 0));
    if (s.crown === 'gothic') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        g.add(cone(M.roofSlate, w * 0.14, h * 0.16, Math.cos(a) * w * 0.5, h * 1.05, Math.sin(a) * w * 0.5, 6));
      }
      g.add(spire('gothic', w * 0.5, h * 0.34, 0, h * 1.02, 0, true));
    }
  }
  const wi = windows(w, h, w, 1, Math.max(3, Math.round(h * 1.2)), h * 0.2, h * 0.9, { w: 0.08, h: 0.14 });
  g.add(wi);
  if (s.ruin) g.add(trees(4, w * 1.6, 63));
  void r;
  return g;
};

B.column = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 5;
  g.add(cyl(M.stone2, 0.42, h * 0.1, 0, h * 0.05, 0, 20));
  g.add(cyl(M.stone, 0.26, h * 0.16, 0, h * 0.18, 0, 20));
  for (let i = 0; i < 3; i++) {
    g.add(cyl(M.stone, 0.16 - i * 0.012, h * 0.22, 0, h * (0.28 + i * 0.22), 0, 18));
    g.add(cyl(M.gold, 0.17 - i * 0.012, h * 0.02, 0, h * (0.39 + i * 0.22), 0, 18));
  }
  g.add(cyl(M.stone, 0.22, h * 0.05, 0, h * 0.93, 0, 18));
  g.add(figure(s.figure ?? 'winged', h * 0.16, 0, h * 0.95, 0));
  return g;
};

B.monolith = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 4, rr = s.r ?? 1.2;
  if (s.hill) g.add(hill(rr * 3, h * 0.22, true));
  const y0 = s.hill ? h * 0.2 : 0;
  g.add(box(M.stone2, rr * 2.2, h * 0.14, rr * 2.2, 0, y0 + h * 0.07, 0));
  g.add(box(M.stone2, rr * 1.9, h * 0.5, rr * 1.9, 0, y0 + h * 0.39, 0));
  if (s.massive) {
    g.add(cyl(M.stone2, rr * 0.85, h * 0.34, 0, y0 + h * 0.81, 0, 16));
    g.add(dome(M.stone2, rr * 0.85, h * 0.2, 0, y0 + h * 0.98, 0, 16));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(box(M.stone, rr * 0.3, h * 0.28, rr * 0.3, Math.cos(a) * rr * 0.9, y0 + h * 0.72, Math.sin(a) * rr * 0.9));
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(cyl(M.stone, rr * 0.11, h * 0.32, Math.cos(a) * rr * 0.95, y0 + h * 0.8, Math.sin(a) * rr * 0.95, 10));
    }
    g.add(cyl(M.stone2, rr * 1.25, h * 0.08, 0, y0 + h * 0.99, 0, 20));
    if (s.figure) g.add(figure('rider', h * 0.2, 0, y0 + h * 0.64, rr * 0.1));
  }
  if (s.water) g.add(waterDisc(rr * 1.4, 0, -0.02, rr * 3.4, rr * 2.6));
  return g;
};

B.statue = (s) => {
  const g = new THREE.Group();
  const ph = s.pedestal ?? 1, h = s.h ?? 2;
  if (s.hill) g.add(hill(2.2, h * 0.3, true));
  const y0 = s.hill ? h * 0.28 : 0;
  g.add(box(M.stone2, ph * 0.95, ph * 0.16, ph * 0.95, 0, y0 + ph * 0.08, 0));
  g.add(box(M.stone, ph * 0.72, ph * 0.86, ph * 0.72, 0, y0 + ph * 0.55, 0));
  g.add(box(M.stone2, ph * 0.86, ph * 0.1, ph * 0.86, 0, y0 + ph * 1.02, 0));
  g.add(figure(s.figure ?? 'person', (h - ph) * 0.95, 0, y0 + ph * 1.07, 0));
  if (s.water) g.add(waterDisc(2.6, 0, -0.03, 2.2, 3.4));
  return g;
};

/** Stark stilisierte Figuren – aus der Ferne als Silhouette lesbar. */
function figure(kind, h, x, y, z) {
  const g = new THREE.Group();
  const m = M.copper;
  const torso = (sc = 1, yOff = 0) => {
    g.add(cyl(m, h * 0.11 * sc, h * 0.45 * sc, 0, yOff + h * 0.22 * sc, 0, 10));
    g.add(sphere(m, h * 0.1 * sc, 0, yOff + h * 0.53 * sc, 0, 12));
  };
  switch (kind) {
    case 'warrior':
      torso();
      g.add(cyl(M.gold, h * 0.025, h * 0.75, h * 0.16, h * 0.62, 0, 6));
      g.add(box(m, h * 0.05, h * 0.3, h * 0.05, -h * 0.16, h * 0.4, 0));
      break;
    case 'winged':
      torso();
      for (const sx of [-1, 1]) {
        const wg = box(M.gold, h * 0.05, h * 0.5, h * 0.18, sx * h * 0.14, h * 0.42, 0);
        wg.rotation.z = sx * 0.35;
        g.add(wg);
      }
      g.add(cyl(M.gold, h * 0.02, h * 0.5, h * 0.18, h * 0.45, 0, 6));
      break;
    case 'rider':
      g.add(box(m, h * 0.18, h * 0.28, h * 0.5, 0, h * 0.34, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(cyl(m, h * 0.035, h * 0.22, sx * h * 0.07, h * 0.11, sz * h * 0.18, 6));
      }
      g.add(box(m, h * 0.1, h * 0.18, h * 0.14, 0, h * 0.54, h * 0.24));
      torso(0.6, h * 0.44);
      break;
    case 'animals':
      g.add(cyl(m, h * 0.11, h * 0.3, 0, h * 0.15, 0, 10));
      for (let i = 0; i < 4; i++) {
        const sc = 1 - i * 0.16;
        g.add(sphere(m, h * 0.13 * sc, 0, h * (0.34 + i * 0.19), 0, 12));
      }
      break;
    default:
      torso();
      g.add(box(m, h * 0.3, h * 0.14, h * 0.16, 0, h * 0.4, h * 0.1));
      break;
  }
  g.position.set(x, y, z);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/* ── Landschafts- und Umgebungsbausteine ────────────────────── */
const colorCache = new Map();
function matFrom(hex) {
  let m = colorCache.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.88, metalness: 0.02 });
    m.userData.baseRough = m.roughness;
    WET_MATERIALS.push(m);
    colorCache.set(hex, m);
  }
  return m;
}

/** Wasserfläche als flache Scheibe/Ellipse. */
function waterDisc(rx, x = 0, y = -0.03, z = 0, rz = rx) {
  const m = new THREE.Mesh(G.circle(36), M.water);
  m.scale.set(rx * 2, rz * 2, 1);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

/** Gräfte / Wassergraben als Ring. */
function waterRing(inner, outer) {
  const g = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40), M.water);
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.02;
  g.receiveShadow = true;
  return g;
}

/** Grüner Hügel als abgeflachter Kegel. */
function hill(radius, height, forest = false) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(G.taper(18, 0.42), M.greenDark);
  m.scale.set(radius * 2, height, radius * 2);
  place(m, 0, height / 2, 0);
  g.add(m);
  if (forest) {
    const t = trees(14, radius * 0.85, 88, { dark: true });
    t.position.y = height * 0.1;
    g.add(t);
  }
  return g;
}

/** Barockparterre: Rasenfelder mit Hecken. */
function gardenPatch(w, d, x, z, seed) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(G.plane(), M.green);
  base.scale.set(w * 2.1, d * 2, 1);
  base.rotation.x = -Math.PI / 2;
  base.position.set(x, -0.01, z);
  base.receiveShadow = true;
  g.add(base);
  const rand = rng(seed);
  for (let i = 0; i < 4; i++) {
    const px = x + (i % 2 ? 1 : -1) * w * 0.45;
    const pz = z + (i < 2 ? -1 : 1) * d * 0.42;
    g.add(box(M.greenDark, w * 0.6, 0.07, d * 0.5, px, 0.035, pz));
    g.add(box(matFrom('#c8bfa8'), w * 0.62, 0.02, d * 0.52, px, 0.012, pz));
  }
  const t = trees(8, Math.max(w, d) * 0.9, seed + 3, { dark: true });
  t.position.set(x, 0, z);
  g.add(t);
  void rand;
  return g;
}

/** Brunnen mit Fontäne. */
function fountain(x, y, z, r) {
  const g = new THREE.Group();
  g.add(cyl(M.stone2, r, 0.12, x, y + 0.06, z, 22));
  const w = new THREE.Mesh(G.circle(24), M.water);
  w.scale.setScalar(r * 1.75);
  w.rotation.x = -Math.PI / 2;
  w.position.set(x, y + 0.13, z);
  g.add(w);
  const jet = new THREE.Mesh(G.cyl(8), M.glass);
  jet.scale.set(0.05, r * 1.6, 0.05);
  place(jet, x, y + r * 0.8, z);
  g.add(jet);
  return g;
}

/* ── Technik, Industrie, Verkehr ────────────────────────────── */
B.tvtower = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 8, rr = s.r ?? 0.3;
  g.add(cyl(M.concrete, rr * 1.9, h * 0.03, 0, h * 0.015, 0, 20));
  g.add(cyl(M.concrete, rr, h * 0.72, 0, h * 0.36, 0, 20, rr * 0.55));
  const sy = h * (s.sphereY ?? 0.66);
  g.add(sphere(M.silver, rr * 1.55, 0, sy, 0, 22));
  const band = new THREE.Mesh(G.cyl(24), M.glass);
  band.scale.set(rr * 3.15, rr * 0.9, rr * 3.15);
  place(band, 0, sy + rr * 0.15, 0);
  g.add(band);
  g.add(cyl(M.steel, rr * 0.34, h * 0.16, 0, sy + h * 0.1, 0, 12, rr * 0.16));
  g.add(cyl(M.steel, rr * 0.1, h * 0.24, 0, h * 0.88, 0, 8, rr * 0.03));
  const tip = new THREE.Mesh(G.sph(8), M.lamp);
  tip.scale.setScalar(rr * 0.22);
  tip.position.set(0, h, 0);
  g.add(tip);
  return g;
};

B.skyscraper = (s) => {
  const g = new THREE.Group();
  const n = s.count ?? 3, h = s.h ?? 5, w = s.w ?? 1.2;
  const rand = rng(hashStr('sk' + n + h));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = n === 1 ? 0 : w * (0.9 + rand() * 0.8);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.7;
    const hh = h * (n === 1 ? 1 : 0.5 + rand() * 0.55);
    const ww = w * (0.6 + rand() * 0.5);
    if (s.round) {
      g.add(cyl(M.glass, ww * 0.5, hh, x, hh / 2, z, 20));
      g.add(cyl(M.steel, ww * 0.53, hh * 0.02, x, hh, z, 20));
    } else {
      g.add(box(M.glass, ww, hh, ww * 0.8, x, hh / 2, z));
      g.add(box(M.steel, ww * 1.04, hh * 0.02, ww * 0.84, x, hh, z));
      const wi = windows(ww, hh, ww * 0.8, 4, Math.max(5, Math.round(hh * 2)), hh * 0.08, hh * 0.95, { w: 0.09, h: 0.06 });
      wi.position.set(x, 0, z); g.add(wi);
    }
    if (s.dome && i === 0) g.add(dome(M.silver, ww * 0.6, hh * 0.08, x, hh, z, 16));
    if (i === 0) {
      g.add(cyl(M.steel, 0.03, hh * 0.18, x, hh + hh * 0.09, z, 6));
      const l = new THREE.Mesh(G.sph(6), M.lamp);
      l.scale.setScalar(0.08); l.position.set(x, hh + hh * 0.19, z);
      g.add(l);
    }
  }
  if (s.tent) {
    const t = new THREE.Mesh(G.cone(12), M.glass);
    t.scale.set(w * 3.2, h * 0.22, w * 3.2);
    place(t, 0, h * 0.34, 0);
    g.add(t);
  }
  if (s.kraftwerk) {
    for (let i = 0; i < 4; i++) {
      g.add(cyl(M.brick, 0.12, h * 0.72, -w * 2.6, h * 0.36, -w * 0.9 + i * w * 0.6, 12));
    }
    g.add(box(M.brick, w * 1.2, h * 0.3, w * 2.2, -w * 2.6, h * 0.15, 0));
  }
  return g;
};

B.modernblock = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 2.6, d = s.d ?? 2, h = s.h ?? 2.6;
  const stone = matFrom(s.stone ?? '#d9d2c6');
  const bodies = s.count ?? (s.split ? 2 : 1);
  for (let i = 0; i < bodies; i++) {
    const off = bodies === 1 ? 0 : (i - (bodies - 1) / 2) * (w / bodies + 0.18);
    const bw = w / bodies * (s.crane ? 0.8 : 1);
    const hh = h * (bodies === 1 ? 1 : 0.78 + (i % 2) * 0.3);
    g.add(box(stone, bw, hh, d, off, hh / 2, 0));
    const gl = new THREE.Mesh(G.box(), M.glass);
    const gf = clamp(s.glass ?? 0.4, 0, 1);
    gl.scale.set(bw * 0.98, hh * gf, d * 1.01);
    place(gl, off, hh * (1 - gf / 2) - hh * 0.03, 0);
    g.add(gl);
    const wi = windows(bw, hh, d, 4, Math.max(2, Math.round(hh * 1.5)), hh * 0.12, hh * 0.92);
    wi.position.set(off, 0, 0); g.add(wi);
    if (s.crane) {
      g.add(box(stone, bw * 1.5, hh * 0.2, d * 0.9, off + bw * 0.4, hh * 0.9, 0));
    }
  }
  if (s.colonnade) {
    for (let i = 0; i < 8; i++) {
      g.add(cyl(stone, 0.07, h * 0.72, (-0.44 + i * 0.125) * w, h * 0.36, d / 2 + 0.12, 12));
    }
    const ped = new THREE.Mesh(G.prism(), stone);
    ped.scale.set(w * 0.5, h * 0.2, 0.2);
    place(ped, 0, h * 0.76, d / 2 + 0.12);
    g.add(ped);
    g.add(box(stone, w, h * 0.06, 0.36, 0, h * 0.75, d / 2 + 0.12));
  }
  if (s.quadriga) {
    g.add(box(M.dark, 0.5, 0.24, 0.2, 0, h * 1.02, 0));
    g.add(figure('rider', 0.5, 0, h * 1.14, 0));
  }
  if (s.statue) {
    g.add(figure('person', 0.5, -0.2, 0, d / 2 + 0.7));
    g.add(figure('person', 0.5, 0.2, 0, d / 2 + 0.7));
    g.add(box(M.stone2, 0.8, 0.2, 0.4, 0, 0.1, d / 2 + 0.7));
  }
  if (s.letterU) {
    const u = new THREE.Mesh(G.torus(20), M.gold);
    u.scale.setScalar(w * 0.5);
    place(u, 0, h + w * 0.24, 0);
    g.add(u);
  }
  if (s.gold) {
    g.add(cyl(M.gold, 0.03, h * 2.2, w * 0.7, h * 1.1, -d * 0.4, 6));
  }
  if (s.tilt) g.rotation.z = 0.05;
  if (s.fly) g.add(box(stone, w * 0.34, h * 0.5, d * 0.6, 0, h * 1.2, -d * 0.15));
  return g;
};

B.bauhaus = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 3.4, d = s.d ?? 2.4, h = s.h ?? 2.2;
  g.add(box(M.white, w * 0.52, h, d * 0.8, -w * 0.24, h / 2, 0));
  const gl = new THREE.Mesh(G.box(), M.glass);
  gl.scale.set(w * 0.53, h * 0.82, d * 0.82);
  place(gl, -w * 0.24, h * 0.5, 0);
  g.add(gl);
  for (let i = 0; i < 5; i++) g.add(box(M.white, w * 0.54, 0.045, d * 0.83, -w * 0.24, h * (0.1 + i * 0.2), 0));
  g.add(box(M.white, w * 0.46, h * 0.78, d * 0.55, w * 0.3, h * 0.39, d * 0.1));
  const wi = windows(w * 0.46, h * 0.78, d * 0.55, 5, 3, h * 0.12, h * 0.7);
  wi.position.set(w * 0.3, 0, d * 0.1); g.add(wi);
  g.add(box(M.white, w * 0.3, h * 0.22, d * 0.3, 0, h * 0.11, -d * 0.5));
  g.add(box(M.dark, w * 0.36, 0.14, 0.05, -w * 0.24, h * 1.06, d * 0.42));
  return g;
};

B.hundertwasser = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 2.6, d = s.d ?? 2, h = s.h ?? 2.6;
  const pink = matFrom('#e8c4c9');
  const rand = rng(4711);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const rr = w * 0.32;
    const hh = h * (0.55 + rand() * 0.55);
    g.add(box(pink, w * 0.42, hh, d * 0.42, Math.cos(a) * rr, hh / 2, Math.sin(a) * rr, a * 0.3));
    const wi = windows(w * 0.42, hh, d * 0.42, 2, 3, hh * 0.15, hh * 0.9, { sides: 2 });
    wi.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); wi.rotation.y = a * 0.3; g.add(wi);
    if (i % 2 === 0) {
      g.add(cyl(M.gold, 0.09, hh * 0.12, Math.cos(a) * rr, hh + hh * 0.06, Math.sin(a) * rr, 10));
      g.add(sphere(M.gold, 0.14, Math.cos(a) * rr, hh + hh * 0.18, Math.sin(a) * rr, 12));
    }
    const t = trees(3, w * 0.16, 90 + i);
    t.position.set(Math.cos(a) * rr, hh, Math.sin(a) * rr);
    t.scale.setScalar(0.6);
    g.add(t);
  }
  return g;
};

B.industrial = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 3.2, halls = s.halls ?? 3;
  if (s.hill) g.add(hill(2.6, h * 0.2, true));
  const y0 = s.hill ? h * 0.18 : 0;
  for (let i = 0; i < halls; i++) {
    const x = (i - (halls - 1) / 2) * 0.85;
    const hh = h * (0.28 + (i % 2) * 0.1);
    g.add(box(M.brick, 0.78, hh, 1.5, x, y0 + hh / 2, 0));
    g.add(box(M.rust, 0.82, 0.06, 1.54, x, y0 + hh, 0));
    const wi = windows(0.78, hh, 1.5, 3, 2, hh * 0.25, hh * 0.85);
    wi.position.set(x, y0, 0); g.add(wi);
  }
  if (s.headframe) {
    const fh = h;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = cyl(M.rust, 0.045, fh, sx * 0.3, y0 + fh / 2, sz * 0.3, 6);
      g.add(leg);
    }
    for (let i = 0; i < 4; i++) g.add(box(M.rust, 0.66, 0.05, 0.66, 0, y0 + fh * (0.25 + i * 0.24), 0));
    g.add(box(M.rust, 0.72, 0.1, 0.72, 0, y0 + fh, 0));
    for (const sx of [-1, 1]) {
      const wheel = new THREE.Mesh(G.torus(20), M.rust);
      wheel.scale.setScalar(0.52);
      place(wheel, sx * 0.16, y0 + fh + 0.24, 0);
      g.add(wheel);
    }
    g.add(box(M.rust, 0.1, 0.06, 1.5, 0, y0 + fh + 0.24, 0));
  }
  if (s.blast) {
    for (let i = 0; i < 2; i++) {
      const x = -1.1 + i * 2.2;
      g.add(cyl(M.rust, 0.24, h * 0.8, x, y0 + h * 0.4, -1.0, 14, 0.16));
      g.add(cyl(M.dark, 0.1, h * 0.35, x, y0 + h * 0.95, -1.0, 10));
      g.add(cyl(M.rust, 0.34, h * 0.1, x, y0 + h * 0.1, -1.0, 14));
    }
  }
  if (s.pipes) {
    for (let i = 0; i < 5; i++) {
      const p = cyl(M.steel, 0.045, 2.6, -1.4 + i * 0.7, y0 + h * 0.55, 0.9, 8);
      p.rotation.z = Math.PI / 2;
      g.add(p);
    }
  }
  for (let i = 0; i < 2; i++) g.add(cyl(M.brick2, 0.09, h * 1.1, 1.5 - i * 0.5, y0 + h * 0.55, 0.9, 12, 0.06));
  return g;
};

B.gasometer = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 1.3, h = s.h ?? 4.2;
  g.add(cyl(M.steel, rr, h, 0, h / 2, 0, 30));
  for (let i = 0; i < 6; i++) g.add(cyl(M.dark, rr * 1.01, 0.05, 0, h * (0.12 + i * 0.15), 0, 30));
  g.add(dome(M.dark, rr * 1.0, h * 0.12, 0, h, 0, 30));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.add(box(M.dark, 0.05, h, 0.05, Math.cos(a) * rr, h / 2, Math.sin(a) * rr));
  }
  return g;
};

B.harbor = (s) => {
  const g = new THREE.Group();
  const len = s.len ?? 3.4, h = s.h ?? 2.4;
  g.add(waterDisc(len * 0.7, 0, -0.03, -len * 0.5, len * 0.4));
  g.add(box(M.concrete, len * 1.4, 0.16, 0.6, 0, 0.08, -len * 0.12));
  if (s.pontoon) {
    g.add(box(M.wood, len * 1.3, 0.1, 0.5, 0, 0.05, -len * 0.42));
    for (let i = 0; i < (s.domes ?? 0); i++) {
      const x = (i - 0.5) * len * 0.55;
      g.add(cyl(M.stone2, 0.2, h * 0.4, x, h * 0.2, -len * 0.12, 14));
      g.add(dome(M.copper, 0.24, h * 0.2, x, h * 0.4, -len * 0.12, 14));
      g.add(sphere(M.gold, 0.05, x, h * 0.66, -len * 0.12, 8));
    }
  }
  const n = 3;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * len * 0.42;
    const hh = h * (0.75 + (i % 2) * 0.25);
    g.add(box(M.brick, len * 0.32, hh, 0.8, x, hh / 2, len * 0.32));
    g.add(roof(M.roofSlate, len * 0.33, hh * 0.22, 0.82, x, hh, len * 0.32, Math.PI / 2));
    const wi = windows(len * 0.32, hh, 0.8, 3, 4, hh * 0.15, hh * 0.9);
    wi.position.set(x, 0, len * 0.32); g.add(wi);
  }
  for (let i = 0; i < (s.cranes ?? 0); i++) {
    const x = (i - ((s.cranes - 1) / 2)) * len * 0.5;
    g.add(cyl(M.rust, 0.05, h * 1.1, x, h * 0.55, -len * 0.16, 8));
    const arm = box(M.rust, 1.5, 0.08, 0.1, x + 0.5, h * 1.08, -len * 0.16);
    arm.rotation.z = -0.22;
    g.add(arm);
    g.add(box(M.rust, 0.18, 0.2, 0.2, x - 0.24, h * 1.02, -len * 0.16));
  }
  return g;
};

B.bridge = (s) => {
  const g = new THREE.Group();
  const span = s.span ?? 3, h = s.h ?? 2;
  const deckY = h * 0.62;
  g.add(waterDisc(span * 0.75, 0, -0.03, 0, span * 0.3));
  g.add(box(M.stone2, span * 1.5, 0.14, 0.42, 0, deckY, 0));
  if (s.type === 'stone' || s.type === 'houses') {
    const n = s.arches ?? 6;
    for (let i = 0; i < n; i++) {
      const x = (-0.5 + (i + 0.5) / n) * span * 1.4;
      const a = new THREE.Mesh(G.arch(12), M.stone2);
      a.scale.set(span * 1.4 / n * 0.82, deckY * 0.72, 0.4);
      place(a, x, 0, 0);
      g.add(a);
      g.add(box(M.stone2, span * 1.4 / n * 0.2, deckY, 0.44, x + span * 0.7 / n, deckY / 2, 0));
    }
    if (s.type === 'houses') {
      for (let i = 0; i < 10; i++) {
        const x = (-0.45 + i * 0.1) * span * 1.4;
        const hh = 0.5 + ((i * 7) % 5) * 0.09;
        for (const sz of [-1, 1]) {
          g.add(box(i % 2 ? M.white : M.stone, span * 0.13, hh, 0.34, x, deckY + hh / 2 + 0.07, sz * 0.36));
          g.add(roof(M.roofTile, span * 0.135, hh * 0.35, 0.36, x, deckY + hh + 0.07, sz * 0.36, Math.PI / 2));
        }
      }
    }
  } else if (s.type === 'arch') {
    const n = s.arches ?? 1;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (-0.5 + (i + 0.5) / n) * span * 1.4;
      const a = new THREE.Mesh(G.arch(20), s.basalt ? M.dark : M.steel);
      a.scale.set(span * 1.4 / n * 0.92, deckY * 1.25, 0.34);
      place(a, x, 0, 0);
      g.add(a);
      for (let k = 1; k < 5; k++) {
        const px = x + (k / 5 - 0.5) * span * 1.4 / n * 0.9;
        g.add(box(s.basalt ? M.dark : M.steel, 0.05, deckY * 0.5, 0.05, px, deckY * 0.75, 0));
      }
    }
    if (s.reflect) g.add(waterDisc(span * 0.9, 0, -0.02, 0, span * 0.5));
  } else if (s.type === 'truss') {
    for (const sz of [-1, 1]) {
      const a = new THREE.Mesh(G.arch(20), M.steel);
      a.scale.set(span * 1.3, deckY * 1.35, 0.08);
      place(a, 0, 0, sz * 0.2);
      g.add(a);
    }
    for (let i = 0; i < 12; i++) {
      const x = (-0.46 + i * 0.084) * span * 1.4;
      g.add(box(M.steel, 0.04, deckY, 0.04, x, deckY / 2, 0.2));
      g.add(box(M.steel, 0.04, deckY, 0.04, x, deckY / 2, -0.2));
    }
    if (s.ferry) {
      g.add(box(M.steel, 0.5, 0.06, 0.5, 0, deckY * 0.12, 0));
      for (let i = 0; i < 2; i++) g.add(cyl(M.steel, 0.02, deckY * 0.5, -0.2 + i * 0.4, deckY * 0.36, 0, 6));
    }
  } else if (s.type === 'cable') {
    for (const sx of [-1, 1]) {
      g.add(box(M.concrete, 0.16, h * 1.6, 0.5, sx * span * 0.34, h * 0.8, 0));
      for (let i = 1; i <= 6; i++) {
        const len = (span * 0.34 * i) / 6;
        const c = box(M.steel, 0.03, Math.hypot(len, h * 1.6 - deckY), 0.03,
          sx * (span * 0.34 - len / 2), (h * 1.6 + deckY) / 2, 0);
        c.rotation.z = sx * Math.atan2(len, h * 1.6 - deckY);
        g.add(c);
      }
    }
  }
  if (s.towers) {
    for (const sx of [-1, 1]) {
      g.add(cyl(M.brick, 0.22, h * 0.9, sx * span * 0.62, deckY + h * 0.45, 0, 12));
      g.add(cone(M.roofSlate, 0.26, h * 0.4, sx * span * 0.62, deckY + h * 1.1, 0, 12));
    }
  }
  return g;
};

B.suspendrail = (s) => {
  const g = new THREE.Group();
  const len = s.len ?? 4.6, h = s.h ?? 2.6;
  g.add(waterDisc(len * 0.52, 0, -0.03, 0, 0.5));
  for (let i = 0; i < 6; i++) {
    const x = (-0.5 + i / 5) * len;
    for (const sz of [-1, 1]) {
      const leg = cyl(M.steel, 0.045, h, x, h / 2, sz * 0.45, 8);
      leg.rotation.z = sz * 0.06;
      g.add(leg);
    }
    g.add(box(M.steel, 0.06, 0.06, 1.0, x, h, 0));
  }
  g.add(box(M.steel, len * 1.02, 0.07, 0.12, 0, h * 0.98, 0));
  const car = box(matFrom('#3f6fa8'), len * 0.2, h * 0.3, 0.3, -len * 0.16, h * 0.78, 0);
  g.add(car);
  g.add(box(M.glass, len * 0.19, h * 0.14, 0.32, -len * 0.16, h * 0.84, 0));
  return g;
};

B.shiplift = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 3.4, w = s.w ?? 2;
  g.add(waterDisc(w * 0.9, 0, -0.03, w * 1.1, w * 0.4));
  g.add(box(M.concrete, w * 1.2, h * 0.28, w * 0.9, 0, h * 0.14, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(cyl(M.steel, 0.05, h, sx * w * 0.45, h / 2, sz * w * 0.35, 8));
  }
  for (let i = 0; i < 5; i++) {
    g.add(box(M.steel, w * 1.0, 0.05, 0.05, 0, h * (0.25 + i * 0.18), w * 0.35));
    g.add(box(M.steel, w * 1.0, 0.05, 0.05, 0, h * (0.25 + i * 0.18), -w * 0.35));
  }
  g.add(box(M.steel, w * 1.05, 0.12, w * 0.85, 0, h, 0));
  g.add(box(matFrom('#4a5a68'), w * 0.7, h * 0.2, w * 0.5, 0, h * 0.55, 0));
  const boat = box(M.white, w * 0.5, h * 0.08, w * 0.22, 0, h * 0.68, 0);
  g.add(boat);
  return g;
};

B.lighthouse = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 3;
  if (s.teapot) {
    g.add(cyl(M.white, 0.22, h * 0.82, -0.5, h * 0.41, 0, 18, 0.15));
    for (let i = 0; i < 3; i++) g.add(cyl(matFrom('#c0392b'), 0.225 - i * 0.02, h * 0.07, -0.5, h * (0.2 + i * 0.24), 0, 18));
    g.add(cyl(M.glass, 0.14, h * 0.12, -0.5, h * 0.88, 0, 14));
    g.add(cone(M.dark, 0.17, h * 0.12, -0.5, h * 1.0, 0, 14));
    const shell = new THREE.Mesh(G.half(24), M.concrete);
    shell.scale.set(1.9, 0.7, 1.9);
    place(shell, 0.75, 0.3, 0);
    g.add(shell);
    g.add(cyl(M.glass, 0.85, 0.32, 0.75, 0.16, 0, 22));
    return g;
  }
  g.add(cyl(M.white, 0.3, 0.14, 0, 0.07, 0, 18));
  g.add(cyl(M.white, 0.2, h * 0.78, 0, h * 0.39 + 0.1, 0, 18, 0.15));
  for (let i = 0; i < 3; i++) g.add(cyl(matFrom('#c0392b'), 0.205 - i * 0.018, h * 0.09, 0, h * (0.22 + i * 0.24), 0, 18));
  g.add(cyl(M.dark, 0.19, h * 0.05, 0, h * 0.88, 0, 18));
  g.add(cyl(M.glass, 0.13, h * 0.11, 0, h * 0.94, 0, 14));
  const lamp = new THREE.Mesh(G.sph(10), M.lamp);
  lamp.scale.setScalar(0.14);
  lamp.position.set(0, h * 0.94, 0);
  g.add(lamp);
  g.add(cone(M.dark, 0.16, h * 0.1, 0, h * 1.03, 0, 14));
  for (let i = 0; i < (s.houses ?? 0); i++) {
    const x = (i ? 1 : -1) * 0.62;
    g.add(box(M.white, 0.5, 0.34, 0.42, x, 0.17, 0.1));
    g.add(roof(matFrom('#8a2f2a'), 0.53, 0.2, 0.45, x, 0.34, 0.1, Math.PI / 2));
  }
  return g;
};

B.beacon = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 2.6;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = cyl(M.timber, 0.05, h * 0.9, Math.cos(a) * 0.3, h * 0.45, Math.sin(a) * 0.3, 6);
    leg.rotation.x = -Math.sin(a) * 0.18;
    leg.rotation.z = Math.cos(a) * 0.18;
    g.add(leg);
  }
  for (let i = 0; i < 3; i++) g.add(box(M.timber, 0.6 - i * 0.14, 0.05, 0.6 - i * 0.14, 0, h * (0.25 + i * 0.24), 0));
  const ball = new THREE.Mesh(G.sph(12), M.timber);
  ball.scale.setScalar(0.34);
  place(ball, 0, h * 0.94, 0);
  g.add(ball);
  g.add(cyl(M.timber, 0.03, h * 0.2, 0, h * 1.1, 0, 6));
  return g;
};

B.dish = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 1.5, h = s.h ?? 3;
  g.add(cyl(M.concrete, 0.4, h * 0.3, 0, h * 0.15, 0, 16));
  g.add(cyl(M.steel, 0.22, h * 0.3, 0, h * 0.42, 0, 12));
  const d = new THREE.Mesh(lathe([[0, 0], [rr * 0.3, 0.06], [rr * 0.62, 0.24], [rr, 0.55]], 30), M.silver);
  d.rotation.x = -0.55;
  place(d, 0, h * 0.62, 0);
  g.add(d);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(M.steel, 0.02, rr * 1.1, Math.cos(a) * rr * 0.4, h * 0.62 + rr * 0.5, Math.sin(a) * rr * 0.4 - rr * 0.3, 6);
    leg.rotation.x = 0.35;
    g.add(leg);
  }
  g.add(sphere(M.dark, 0.14, 0, h * 0.62 + rr * 1.0, -rr * 0.55, 12));
  return g;
};

B.tetra = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 3.2;
  if (s.hill) g.add(hill(2.2, h * 0.32, false));
  const y0 = s.hill ? h * 0.3 : 0;
  const r0 = h * 0.42;
  const pts = [[0, y0 + h, 0]];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    pts.push([Math.cos(a) * r0, y0, Math.sin(a) * r0]);
  }
  const strut = (a, b, rad) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = new THREE.Mesh(G.cyl(6), M.steel);
    m.scale.set(rad * 2, len, rad * 2);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    m.castShadow = true;
    return m;
  };
  for (let i = 1; i <= 3; i++) {
    g.add(strut(pts[0], pts[i], 0.035));
    g.add(strut(pts[i], pts[(i % 3) + 1], 0.035));
  }
  for (let k = 1; k <= 2; k++) {
    const t = k / 3;
    const ring = pts.slice(1).map((p) => [
      p[0] + (pts[0][0] - p[0]) * t, p[1] + (pts[0][1] - p[1]) * t, p[2] + (pts[0][2] - p[2]) * t,
    ]);
    for (let i = 0; i < 3; i++) g.add(strut(ring[i], ring[(i + 1) % 3], 0.022));
  }
  return g;
};

/* ── Sport, Natur, Sonderformen ─────────────────────────────── */
B.stadium = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 2.2, h = s.h ?? 2.2;
  const shell = matFrom(s.stone ?? '#c7cbd0');
  const bowl = new THREE.Mesh(lathe([[rr * 0.62, 0], [rr * 0.66, h * 0.18], [rr, h * 0.85], [rr * 1.02, h * 0.9]], 34), shell);
  place(bowl, 0, 0, 0);
  g.add(bowl);
  const inner = new THREE.Mesh(lathe([[rr * 0.6, h * 0.86], [rr * 0.34, h * 0.2], [rr * 0.34, 0]], 34), matFrom('#4d7a52'));
  place(inner, 0, 0, 0);
  g.add(inner);
  const pitch = new THREE.Mesh(G.circle(30), matFrom('#4d8a55'));
  pitch.scale.setScalar(rr * 0.66);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.02;
  g.add(pitch);
  if (s.roof === 'full' || s.roof === 'ring') {
    const ro = new THREE.Mesh(new THREE.RingGeometry(rr * 0.58, rr * 1.08, 40), s.roof === 'ring' ? M.glass : M.steel);
    ro.rotation.x = -Math.PI / 2;
    ro.position.y = h * 0.95;
    ro.material.side = THREE.DoubleSide;
    g.add(ro);
  } else if (s.roof === 'partial') {
    for (const sz of [-1, 1]) {
      const ro = box(M.steel, rr * 1.5, 0.05, rr * 0.42, 0, h * 0.94, sz * rr * 0.72);
      ro.rotation.x = sz * 0.08;
      g.add(ro);
    }
  }
  if (s.pylons) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(cyl(M.steel, 0.05, h * 1.5, Math.cos(a) * rr * 0.98, h * 0.75, Math.sin(a) * rr * 0.98, 8));
      const lamp = new THREE.Mesh(G.box(), M.lamp);
      lamp.scale.set(0.3, 0.16, 0.06);
      lamp.position.set(Math.cos(a) * rr * 0.94, h * 1.48, Math.sin(a) * rr * 0.94);
      lamp.lookAt(0, h * 0.5, 0);
      g.add(lamp);
    }
  }
  return g;
};

B.arena = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 2.2, h = s.h ?? 2.4;
  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#eef1f4'), roughness: 0.45, metalness: 0.05,
    emissive: new THREE.Color('#e04a54'), emissiveIntensity: 0,
    transparent: true, opacity: 0.95,
  });
  skin.userData.nightScale = 0.85;
  NIGHT_MATERIALS.push(skin);
  const body = new THREE.Mesh(lathe([[rr * 0.72, 0], [rr, h * 0.35], [rr * 1.0, h * 0.7], [rr * 0.82, h], [rr * 0.6, h * 0.98]], 40), skin);
  place(body, 0, 0, 0);
  g.add(body);
  for (let i = 0; i < 9; i++) {
    const ring = new THREE.Mesh(G.torus(40), M.silver);
    const t = i / 8;
    const rad = rr * (0.74 + Math.sin(t * Math.PI) * 0.28);
    ring.scale.set(rad * 2, rad * 2, 0.7);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = t * h;
    g.add(ring);
  }
  const pitch = new THREE.Mesh(G.circle(30), matFrom('#4d8a55'));
  pitch.scale.setScalar(rr * 0.62);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.03;
  g.add(pitch);
  return g;
};

B.windmill = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 3;
  g.add(box(M.timber, 0.5, h * 0.22, 0.5, 0, h * 0.11, 0));
  g.add(cyl(M.timber, 0.09, h * 0.34, 0, h * 0.2, 0, 8));
  const body = box(M.wood, 0.72, h * 0.46, 0.62, 0, h * 0.52, 0);
  g.add(body);
  g.add(roof(M.timber, 0.76, h * 0.2, 0.66, 0, h * 0.75, 0, Math.PI / 2));
  const hub = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = box(M.timber, 0.06, h * 0.86, 0.03, 0, 0, 0);
    b.rotation.z = (i / 4) * Math.PI * 2;
    const s2 = box(matFrom('#d8cdb6'), 0.16, h * 0.34, 0.02, 0, h * 0.24, 0.02);
    s2.rotation.z = (i / 4) * Math.PI * 2;
    s2.position.set(-Math.sin((i / 4) * Math.PI * 2) * h * 0.26, Math.cos((i / 4) * Math.PI * 2) * h * 0.26, 0.03);
    hub.add(b, s2);
  }
  hub.position.set(0, h * 0.6, 0.38);
  hub.userData.spin = 0.35;
  g.add(hub);
  g.userData.spinner = hub;
  if (s.farm) {
    for (let i = 0; i < 3; i++) {
      const x = -1.4 + i * 0.7, z = -1.1;
      g.add(box(M.white, 0.5, 0.3, 0.42, x, 0.15, z));
      g.add(box(M.timber, 0.51, 0.04, 0.43, x, 0.16, z));
      g.add(roof(M.roofTile, 0.54, 0.24, 0.46, x, 0.3, z, Math.PI / 2));
    }
    g.add(trees(6, 1.3, 22));
  }
  return g;
};

B.lake = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 2, len = s.len ?? 3;
  const bank = new THREE.Mesh(G.circle(44), M.green);
  bank.scale.set(rr * 2.5, len * 2.5, 1);
  bank.rotation.x = -Math.PI / 2;
  bank.position.y = 0.005;
  bank.receiveShadow = true;
  g.add(bank);
  const w = new THREE.Mesh(G.circle(44), M.water);
  w.scale.set(rr * 2.2, len * 2.2, 1);
  w.rotation.x = -Math.PI / 2;
  w.position.y = 0.02;
  g.add(w);
  g.userData.water = w;
  if (s.island) {
    g.add(cyl(M.green, rr * 0.2, 0.1, rr * 0.3, 0.05, len * 0.2, 14));
    g.add(trees(4, rr * 0.16, 12));
    g.children[g.children.length - 1].position.set(rr * 0.3, 0.1, len * 0.2);
  }
  if (s.boats) {
    const rand = rng(9);
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2, d2 = rand() * 0.7;
      const x = Math.cos(a) * rr * d2, z = Math.sin(a) * len * d2;
      g.add(box(M.white, 0.16, 0.05, 0.36, x, 0.05, z, a));
      const sail = box(M.white, 0.02, 0.34, 0.2, x, 0.22, z, a);
      g.add(sail);
    }
  }
  if (s.fountain) {
    const jet = new THREE.Mesh(G.cyl(10), M.glass);
    jet.scale.set(0.1, rr * 0.9, 0.1);
    place(jet, 0, rr * 0.45, 0);
    g.add(jet);
    g.add(sphere(M.glass, 0.2, 0, rr * 0.92, 0, 12));
  }
  if (s.forest) {
    const t = trees(20, Math.max(rr, len) * 1.15, 44, { dark: true });
    g.add(t);
  }
  return g;
};

B.mountain = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 2.6, h = s.h ?? 4;
  const peak = new THREE.Mesh(G.cone(9), M.rock);
  peak.scale.set(rr * 2, h, rr * 2);
  place(peak, 0, h / 2, 0);
  g.add(peak);
  const sub = new THREE.Mesh(G.cone(8), M.rock);
  sub.scale.set(rr * 1.3, h * 0.55, rr * 1.3);
  place(sub, rr * 0.7, h * 0.28, rr * 0.3);
  g.add(sub);
  if (s.snow) {
    const cap = new THREE.Mesh(G.cone(9), M.snow);
    cap.scale.set(rr * 0.72, h * 0.36, rr * 0.72);
    place(cap, 0, h - h * 0.18, 0);
    g.add(cap);
  }
  if (s.dome) g.add(dome(M.white, rr * 0.22, h * 0.1, 0, h, 0, 14));
  if (s.tower) {
    g.add(cyl(M.white, 0.1, h * 0.28, rr * 0.12, h + h * 0.14, 0, 12));
    g.add(dome(M.silver, 0.14, 0.12, rr * 0.12, h + h * 0.28, 0, 12));
  }
  if (s.cross) {
    g.add(box(M.gold, 0.05, h * 0.2, 0.05, 0, h + h * 0.1, 0));
    g.add(box(M.gold, h * 0.1, 0.05, 0.05, 0, h + h * 0.14, 0));
  }
  if (s.cable) {
    const c = box(M.steel, 0.03, 0.03, rr * 3.4, rr * 0.5, h * 0.62, rr * 1.5);
    c.rotation.x = -0.42;
    g.add(c);
    g.add(box(matFrom('#c0392b'), 0.22, 0.2, 0.3, rr * 0.5, h * 0.55, rr * 1.1));
  }
  if (s.rail) {
    const t = trees(16, rr * 1.5, 71, { dark: true });
    t.position.y = 0.02;
    g.add(t);
  }
  return g;
};

B.cliff = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 3.4, w = s.w ?? 2.6;
  const m = s.chalk ? M.chalk : s.slate ? matFrom('#77726a') : M.rock;
  const rand = rng(hashStr('cl' + h + w));
  const n = s.pillars || 0;
  if (n > 0) {
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * w * 1.6;
      const hh = h * (0.55 + rand() * 0.6);
      const pw = 0.22 + rand() * 0.2;
      const p = new THREE.Mesh(G.cyl(7), m);
      p.scale.set(pw * 2, hh, pw * 1.5);
      place(p, x, hh / 2, (rand() - 0.5) * 0.6, rand() * 1.2);
      g.add(p);
    }
    if (s.bridge) {
      g.add(box(M.stone2, w * 1.7, 0.1, 0.4, 0, h * 0.72, 0));
      for (let i = 0; i < 4; i++) {
        const a = new THREE.Mesh(G.arch(12), M.stone2);
        a.scale.set(w * 0.36, h * 0.2, 0.36);
        place(a, (-0.42 + i * 0.28) * w * 1.6, h * 0.52, 0);
        g.add(a);
      }
    }
  } else {
    const face = new THREE.Mesh(G.box(), m);
    face.scale.set(w * 2, h, w * 0.9);
    place(face, 0, h / 2, 0);
    g.add(face);
    const slope = new THREE.Mesh(G.prism(), m);
    slope.scale.set(w * 2.2, h * 0.45, w * 1.6);
    place(slope, 0, h * 0.9, -w * 0.7, Math.PI / 2);
    g.add(slope);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(G.cone(7), m);
      const sc = 0.4 + rand() * 0.5;
      c.scale.set(w * sc, h * sc * 0.7, w * sc * 0.7);
      place(c, (rand() - 0.5) * w * 1.7, h * 0.9 * sc * 0.35, w * 0.3 + rand() * 0.4);
      g.add(c);
    }
  }
  if (s.dune) {
    const d = new THREE.Mesh(G.taper(14, 0.5), matFrom('#d9c9a6'));
    d.scale.set(w * 2.6, h * 0.3, w * 1.6);
    place(d, 0, h * 0.15, -w * 0.9);
    g.add(d);
  }
  if (s.forest) {
    const t = trees(14, w * 1.2, 55, { dark: true });
    t.position.set(0, h * (n > 0 ? 0.1 : 0.9), -w * 0.75);
    g.add(t);
  }
  if (s.chalk || s.river) g.add(waterDisc(w * 1.8, 0, -0.02, w * 2.0, w * 1.1));
  return g;
};

B.avenue = (s) => {
  const g = new THREE.Group();
  const len = s.len ?? 5, curve = s.curve ?? 0;
  const n = s.trees ?? 20;
  const path = new THREE.Mesh(G.plane(), matFrom('#c9bda4'));
  path.scale.set(len * 2, 0.45, 1);
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.01;
  g.add(path);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const x = t * len * 2;
    const z = curve * (t * t * 4 - 1) * 1.1;
    for (const sz of [-1, 1]) {
      const sc = 0.7 + ((i * 13) % 7) / 20;
      g.add(cyl(M.timber, 0.05, 0.5 * sc, x, 0.25 * sc, z + sz * 0.34, 6));
      g.add(sphere(M.green, 0.32 * sc, x, 0.66 * sc, z + sz * 0.34, 10));
    }
  }
  if (s.pagoda) {
    for (let i = 0; i < 4; i++) {
      g.add(cyl(M.timber, 0.28 - i * 0.05, 0.36, 0, 0.18 + i * 0.42, 0, 10));
      g.add(cone(matFrom('#b04a3a'), 0.44 - i * 0.07, 0.22, 0, 0.42 + i * 0.42, 0, 10));
    }
  }
  return g;
};

B.greenhouse = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 2.4, h = s.h ?? 1.8;
  if (s.island) g.add(waterDisc(w * 2.1, 0, -0.03, 0));
  const base = new THREE.Mesh(G.plane(), M.green);
  base.scale.set(w * 2.6, w * 2.0, 1);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.008;
  base.receiveShadow = true;
  g.add(base);
  g.add(box(M.white, w * 0.9, h * 0.6, w * 0.5, 0, h * 0.3, 0));
  const glassRoof = new THREE.Mesh(G.prism(), M.glass);
  glassRoof.scale.set(w * 0.92, h * 0.45, w * 0.52);
  place(glassRoof, 0, h * 0.6, 0, Math.PI / 2);
  g.add(glassRoof);
  const gl = new THREE.Mesh(G.box(), M.glass);
  gl.scale.set(w * 0.88, h * 0.5, w * 0.48);
  place(gl, 0, h * 0.3, 0);
  g.add(gl);
  if (s.parterre) {
    for (let i = 0; i < 4; i++) {
      const px = (i % 2 ? 1 : -1) * w * 0.62, pz = (i < 2 ? -1 : 1) * w * 0.62;
      g.add(box(M.greenDark, w * 0.42, 0.06, w * 0.42, px, 0.03, pz));
      g.add(box(matFrom('#cfc4a8'), w * 0.46, 0.02, w * 0.46, px, 0.01, pz));
    }
    g.add(fountain(0, 0, w * 1.1, 0.34));
  }
  if (s.palace) {
    g.add(box(M.white, w * 0.8, h * 0.7, w * 0.4, -w * 1.0, h * 0.35, -w * 0.5));
    g.add(roof(M.roofTile, w * 0.83, h * 0.3, w * 0.43, -w * 1.0, h * 0.7, -w * 0.5, Math.PI / 2));
  }
  g.add(trees(s.trees ?? 12, w * 1.15, 61));
  return g;
};

B.zoo = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 1.5, h = s.h ?? 2.2;
  const base = new THREE.Mesh(G.circle(30), M.green);
  base.scale.setScalar(rr * 2.6);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.008;
  base.receiveShadow = true;
  g.add(base);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * rr * 0.9, z = Math.sin(a) * rr * 0.9;
    g.add(cyl(M.white, 0.34, h * 0.28, x, h * 0.14, z, 10));
    g.add(cone(matFrom('#7f9a86'), 0.42, h * 0.24, x, h * 0.4, z, 10));
  }
  g.add(cyl(M.white, 0.5, h * 0.4, 0, h * 0.2, 0, 16));
  g.add(dome(M.glass, 0.56, h * 0.3, 0, h * 0.4, 0, 18));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const arc = box(M.glass, rr * 0.9, 0.05, 0.3, Math.cos(a) * rr * 0.48, h * 0.45, Math.sin(a) * rr * 0.48, -a);
    g.add(arc);
  }
  g.add(trees(10, rr * 1.9, 33, { dark: true }));
  return g;
};

B.planetarium = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 1.1, h = s.h ?? 2.2;
  g.add(box(matFrom('#c3bdb2'), rr * 3.2, h * 0.42, rr * 2.0, 0, h * 0.21, -rr * 0.8));
  const wi = windows(rr * 3.2, h * 0.42, rr * 2.0, 6, 2, h * 0.1, h * 0.36);
  wi.position.set(0, 0, -rr * 0.8); g.add(wi);
  g.add(cyl(M.concrete, rr, h * 0.34, 0, h * 0.17, rr * 0.7, 24));
  g.add(dome(M.silver, rr, h * 0.62, 0, h * 0.34, rr * 0.7, 26));
  g.add(cyl(M.dark, rr * 1.03, 0.06, 0, h * 0.34, rr * 0.7, 24));
  return g;
};

B.spheres = (s) => {
  const g = new THREE.Group();
  const n = s.count ?? 3, rr = s.r ?? 0.6;
  const base = new THREE.Mesh(G.circle(28), M.green);
  base.scale.setScalar(rr * 7);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.008;
  g.add(base);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.add(sphere(M.silver, rr, Math.cos(a) * rr * 1.5, rr * 0.92, Math.sin(a) * rr * 1.5, 26));
  }
  g.add(waterDisc(rr * 5, 0, -0.02, rr * 6.5, rr * 3));
  return g;
};

B.waveroof = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 2.4, d = s.d ?? 1.8, h = s.h ?? 4;
  if (s.blobs) {
    const rand = rng(21);
    for (let i = 0; i < s.blobs; i++) {
      const a = (i / s.blobs) * Math.PI * 2;
      const rr = w * 0.36;
      const bl = new THREE.Mesh(G.sph(20), M.white);
      const hh = h * (0.5 + rand() * 0.5);
      bl.scale.set(rr * 1.6, hh, rr * 1.3);
      place(bl, Math.cos(a) * rr, hh * 0.36, Math.sin(a) * rr, a);
      g.add(bl);
    }
    return g;
  }
  if (s.shell) {
    const shell = new THREE.Mesh(lathe([[0, h], [w * 0.28, h * 0.9], [w * 0.5, h * 0.6], [w * 0.6, h * 0.2], [w * 0.62, 0]], 32), M.silver);
    place(shell, 0, 0, 0);
    g.add(shell);
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(G.torus(34), M.steel);
      const t = i / 6;
      const rad = w * 0.62 * Math.sqrt(1 - t * t * 0.85);
      ring.scale.set(rad * 2, rad * 2, 0.4);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = t * h * 0.92;
      g.add(ring);
    }
    return g;
  }
  // Sockel (Speicher) + Glaskörper mit Wellenkrone
  const baseH = h * 0.42;
  g.add(box(s.silver ? M.silver : M.brick, w, baseH, d, 0, baseH / 2, 0));
  const wi = windows(w, baseH, d, 6, 4, baseH * 0.12, baseH * 0.9);
  g.add(wi);
  g.add(box(M.glass, w * 1.02, h - baseH - h * 0.12, d * 1.02, 0, (baseH + h - h * 0.12) / 2, 0));
  const wi2 = windows(w * 1.02, h, d * 1.02, 5, 3, baseH * 1.12, h * 0.86, { w: 0.09, h: 0.06 });
  g.add(wi2);
  // Wellendach
  const seg = 9;
  for (let i = 0; i < seg; i++) {
    const t = i / (seg - 1);
    const x = (t - 0.5) * w;
    const yy = h - h * 0.12 + Math.sin(t * Math.PI * 2.2) * h * 0.1;
    g.add(box(M.silver, w / seg * 1.05, h * 0.06, d * 1.04, x, yy, 0));
  }
  return g;
};

B.tentroof = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 4, h = s.h ?? 2.6;
  const rand = rng(3);
  const canopy = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#dfe6ec'), roughness: 0.3, metalness: 0.1,
    transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  });
  const masts = 6;
  const pts = [];
  for (let i = 0; i < masts; i++) {
    const a = (i / masts) * Math.PI * 2;
    const rr = w * (0.3 + rand() * 0.25);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const mh = h * (0.6 + rand() * 0.6);
    g.add(cyl(M.steel, 0.04, mh, x, mh / 2, z, 8));
    pts.push([x, mh, z]);
  }
  for (let i = 0; i < masts; i++) {
    const a = pts[i], b = pts[(i + 1) % masts];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h * 0.18, (a[2] + b[2]) / 2];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const panel = new THREE.Mesh(G.plane(), canopy);
    panel.scale.set(len * 1.2, w * 0.55, 1);
    panel.position.set(mid[0], mid[1], mid[2]);
    panel.rotation.set(-Math.PI / 2 + 0.5, Math.atan2(b[0] - a[0], b[2] - a[2]), 0);
    g.add(panel);
  }
  const bowl = new THREE.Mesh(lathe([[w * 0.28, 0], [w * 0.34, h * 0.25], [w * 0.36, h * 0.3]], 30), matFrom('#b9bec4'));
  g.add(bowl);
  if (s.tower) {
    const th = s.tower;
    g.add(cyl(M.concrete, 0.12, th * 0.8, w * 0.85, th * 0.4, -w * 0.4, 16, 0.08));
    g.add(cyl(M.silver, 0.26, th * 0.1, w * 0.85, th * 0.82, -w * 0.4, 16));
    g.add(cyl(M.glass, 0.3, th * 0.06, w * 0.85, th * 0.88, -w * 0.4, 16));
    g.add(cyl(M.steel, 0.03, th * 0.18, w * 0.85, th * 0.98, -w * 0.4, 6));
  }
  return g;
};

B.wall = (s) => {
  const g = new THREE.Group();
  const len = s.len ?? 5, h = s.h ?? 1.4;
  const n = 16;
  const rand = rng(1234);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * len * 2;
    const seg = box(M.concrete, len * 2 / n * 0.96, h, 0.16, x, h / 2, 0);
    g.add(seg);
    if (s.painted) {
      const p = new THREE.Mesh(G.plane(), matFrom(['#d3524d', '#e2ac48', '#4d8fd1', '#63a86e', '#a86fb0'][i % 5]));
      p.scale.set(len * 2 / n * 0.9, h * 0.82, 1);
      p.position.set(x, h * 0.5, 0.09);
      g.add(p);
    }
    g.add(box(M.concrete, len * 2 / n * 0.98, 0.08, 0.24, x, h + 0.04, 0));
    void rand;
  }
  return g;
};

B.temple = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 2.6, cols = s.cols ?? 8;
  if (s.hill) g.add(hill(3.2, h * 0.4, false));
  const y0 = s.hill ? h * 0.38 : 0;
  if (s.cascade) {
    for (let i = 0; i < 8; i++) {
      g.add(box(M.stone2, 1.6 + i * 0.16, 0.12, 0.5, 0, y0 - i * 0.16, 1.0 + i * 0.5));
      const wsl = new THREE.Mesh(G.plane(), M.water);
      wsl.scale.set(1.2 + i * 0.14, 0.5, 1);
      wsl.rotation.x = -Math.PI / 2;
      wsl.position.set(0, y0 - i * 0.16 + 0.07, 1.0 + i * 0.5);
      g.add(wsl);
    }
  }
  if (s.pyramid) {
    for (let i = 0; i < 5; i++) {
      g.add(box(M.stone2, 2.0 - i * 0.3, h * 0.12, 2.0 - i * 0.3, 0, y0 + h * (0.06 + i * 0.12), 0));
    }
    g.add(cyl(M.stone2, 0.34, h * 0.28, 0, y0 + h * 0.74, 0, 12));
    if (s.figure) g.add(figure('warrior', h * 0.4, 0, y0 + h * 0.88, 0));
  } else {
    if (s.steps) g.add(steps(M.stone2, 3.2, 1.2, 5, 0, y0, 1.2));
    g.add(box(M.stone2, 3.0, h * 0.12, 1.9, 0, y0 + h * 0.06, 0));
    for (let i = 0; i < cols; i++) {
      const x = (-0.5 + (i + 0.5) / cols) * 2.8;
      for (const sz of [-0.8, 0.8]) g.add(cyl(M.stone, 0.09, h * 0.6, x, y0 + h * 0.42, sz, 14));
    }
    g.add(box(M.stone2, 3.0, h * 0.12, 1.9, 0, y0 + h * 0.78, 0));
    const ped = new THREE.Mesh(G.prism(), M.stone2);
    ped.scale.set(3.0, h * 0.3, 1.9);
    place(ped, 0, y0 + h * 0.84, 0, Math.PI / 2);
    g.add(ped);
  }
  return g;
};

B.helix = (s) => {
  const g = new THREE.Group();
  const rr = s.r ?? 1.4, h = s.h ?? 3;
  const turns = 2.2, seg = 40;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < seg; i++) {
      const t = i / seg;
      const a = t * Math.PI * 2 * turns + k * Math.PI;
      const y = t * h;
      const m = box(k ? M.silver : M.concrete, rr * 0.5, h / seg * 1.25, 0.5,
        Math.cos(a) * rr, y, Math.sin(a) * rr, -a);
      g.add(m);
    }
  }
  const core = new THREE.Mesh(G.cyl(20), M.glass);
  core.scale.set(rr * 1.15, h, rr * 1.15);
  place(core, 0, h / 2, 0);
  g.add(core);
  return g;
};

B.waterfall = (s) => {
  const g = new THREE.Group();
  const h = s.h ?? 3, w = s.w ?? 1.6;
  for (let i = 0; i < 5; i++) {
    const y = h - (i / 5) * h;
    g.add(box(M.rock, w * (1 + i * 0.28), h * 0.22, w * (0.7 + i * 0.3), 0, y - h * 0.11, i * w * 0.45));
    const wsl = new THREE.Mesh(G.plane(), M.water);
    wsl.scale.set(w * 0.6, h * 0.24, 1);
    wsl.position.set(0, y - h * 0.12, i * w * 0.45 + w * (0.35 + i * 0.15));
    g.add(wsl);
  }
  g.add(waterDisc(w * 0.9, 0, 0.02, w * 2.6, w * 0.6));
  if (s.forest) {
    const t = trees(16, w * 2.0, 77, { dark: true });
    g.add(t);
  }
  return g;
};

B.dam = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 3.2, h = s.h ?? 2.4;
  const body = new THREE.Mesh(G.box(), M.stone2);
  body.scale.set(w * 2, h, 0.55);
  place(body, 0, h / 2, 0);
  g.add(body);
  for (let i = 0; i < 9; i++) {
    const x = (-0.44 + i * 0.11) * w * 2;
    const a = new THREE.Mesh(G.arch(10), M.stone);
    a.scale.set(w * 0.16, h * 0.16, 0.6);
    place(a, x, h * 0.7, 0);
    g.add(a);
  }
  g.add(box(M.stone, w * 2.05, 0.12, 0.7, 0, h, 0));
  for (const sx of [-1, 1]) {
    g.add(cyl(M.stone2, 0.2, h * 0.7, sx * w, h * 0.35 + h * 0.4, 0, 12));
    g.add(cone(M.roofSlate, 0.24, h * 0.3, sx * w, h * 1.2, 0, 12));
  }
  g.add(waterDisc(w * 1.1, 0, h * 0.82, -w * 1.3, w * 0.9));
  return g;
};

B.riverbend = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 3.4, h = s.h ?? 2.6;
  const hillM = new THREE.Mesh(G.taper(20, 0.55), M.greenDark);
  hillM.scale.set(w * 1.5, h, w * 1.5);
  place(hillM, 0, h / 2, 0);
  g.add(hillM);
  const ring = new THREE.Mesh(new THREE.RingGeometry(w * 0.82, w * 1.15, 44, 1, 0.5, Math.PI * 1.6), M.water);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  g.add(trees(22, w * 0.65, 99, { dark: true }));
  if (s.walkway) {
    for (let i = 0; i < 10; i++) {
      const a = 0.4 + (i / 10) * Math.PI * 1.1;
      g.add(cyl(M.wood, 0.04, h * 0.8, Math.cos(a) * w * 0.6, h * 0.6, Math.sin(a) * w * 0.6, 6));
    }
    const tower = cyl(M.wood, 0.3, h * 1.1, w * 0.4, h * 0.55 + h * 0.3, w * 0.4, 14);
    g.add(tower);
  }
  return g;
};

B.track = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 3.4;
  const shape = new THREE.Shape();
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = w * (0.72 + Math.sin(a * 3) * 0.22 + Math.cos(a * 5) * 0.1);
    pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr * 0.72));
  }
  shape.setFromPoints(pts);
  const hole = new THREE.Path();
  hole.setFromPoints(pts.map((p) => p.clone().multiplyScalar(0.93)));
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, 24);
  const m = new THREE.Mesh(geo, M.asphalt);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.receiveShadow = true;
  g.add(m);
  if (s.forest) g.add(trees(26, w * 0.55, 101, { dark: true }));
  g.add(box(M.white, w * 0.5, 0.5, 0.3, 0, 0.25, w * 0.62));
  g.add(box(M.steel, w * 0.6, 0.06, 0.4, 0, 0.55, w * 0.62));
  return g;
};

B.pier = (s) => {
  const g = new THREE.Group();
  const len = s.len ?? 3.2, h = s.h ?? 1.8;
  g.add(waterDisc(len * 0.9, 0, -0.02, len * 0.4, len * 0.8));
  g.add(box(M.wood, 0.7, 0.08, len * 1.6, 0, h * 0.24, len * 0.2));
  for (let i = 0; i < 10; i++) {
    const z = -len * 0.5 + (i / 9) * len * 1.5;
    for (const sx of [-1, 1]) g.add(cyl(M.timber, 0.035, h * 0.5, sx * 0.3, h * 0.1, z, 6));
  }
  g.add(box(M.white, 1.0, h * 0.5, 0.9, 0, h * 0.5, len * 0.85));
  g.add(roof(M.white, 1.05, h * 0.28, 0.95, 0, h * 0.75, len * 0.85, Math.PI / 2));
  for (const sx of [-1, 1]) {
    g.add(cyl(M.white, 0.13, h * 0.55, sx * 0.42, h * 0.52, len * 0.55, 12));
    g.add(cone(M.white, 0.17, h * 0.3, sx * 0.42, h * 0.94, len * 0.55, 12));
  }
  return g;
};

B.mudflat = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 5, d = s.d ?? 3;
  const flat = new THREE.Mesh(G.plane(), matFrom('#9d8f78'));
  flat.scale.set(w * 2, d * 2, 1);
  flat.rotation.x = -Math.PI / 2;
  flat.position.y = 0.01;
  flat.receiveShadow = true;
  g.add(flat);
  const rand = rng(303);
  for (let i = 0; i < 12; i++) {
    const ch = new THREE.Mesh(G.plane(), M.water);
    ch.scale.set(w * (0.4 + rand()), 0.16 + rand() * 0.2, 1);
    ch.rotation.x = -Math.PI / 2;
    ch.rotation.z = (rand() - 0.5) * 0.9;
    ch.position.set((rand() - 0.5) * w * 1.7, 0.02, (rand() - 0.5) * d * 1.7);
    g.add(ch);
  }
  for (let i = 0; i < 5; i++) {
    g.add(cyl(M.timber, 0.03, 0.5, (rand() - 0.5) * w, 0.25, (rand() - 0.5) * d, 6));
  }
  return g;
};

B.heath = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 4.4, d = s.d ?? 3.2;
  const base = new THREE.Mesh(G.circle(40), matFrom('#9b8aa0'));
  base.scale.set(w * 2, d * 2, 1);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.01;
  base.receiveShadow = true;
  g.add(base);
  const rand = rng(404);
  const hillM = new THREE.Mesh(G.taper(16, 0.6), matFrom('#8e7f96'));
  hillM.scale.set(w * 0.9, (s.h ?? 1.4), w * 0.9);
  place(hillM, 0, (s.h ?? 1.4) / 2, 0);
  g.add(hillM);
  for (let i = 0; i < 10; i++) {
    const t = trees(3, 0.4, 500 + i, { dark: true });
    t.position.set((rand() - 0.5) * w * 1.6, 0, (rand() - 0.5) * d * 1.6);
    g.add(t);
  }
  const flock = new THREE.InstancedMesh(G.sph(6), M.white, 22);
  const dmy = new THREE.Object3D();
  for (let i = 0; i < 22; i++) {
    dmy.position.set((rand() - 0.5) * w * 0.9, 0.11, (rand() - 0.5) * d * 0.9);
    dmy.scale.set(0.2, 0.16, 0.3);
    dmy.updateMatrix();
    flock.setMatrixAt(i, dmy.matrix);
  }
  flock.castShadow = true;
  g.add(flock);
  return g;
};

B.stelae = (s) => {
  const g = new THREE.Group();
  const cols = s.cols ?? 12, rows = s.rows ?? 9, h = s.h ?? 1.6;
  const inst = new THREE.InstancedMesh(G.box(), M.concrete, cols * rows);
  const d = new THREE.Object3D();
  let i = 0;
  for (let x = 0; x < cols; x++) {
    for (let z = 0; z < rows; z++) {
      const u = x / (cols - 1) - 0.5, v = z / (rows - 1) - 0.5;
      const hh = h * (0.18 + (Math.sin(u * 5) * 0.5 + 0.5) * (Math.cos(v * 4) * 0.5 + 0.5) * 1.35);
      d.position.set(u * cols * 0.26, hh / 2, v * rows * 0.3);
      d.scale.set(0.19, hh, 0.24);
      d.rotation.set(0, (u + v) * 0.05, 0);
      d.updateMatrix();
      inst.setMatrixAt(i++, d.matrix);
    }
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  g.add(inst);
  return g;
};

B.hangar = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 3.4, d = s.d ?? 2.4, h = s.h ?? 2.6;
  const shell = new THREE.Mesh(lathe([[0, h], [w * 0.34, h * 0.94], [w * 0.5, h * 0.66], [w * 0.55, 0]], 26), M.silver);
  shell.scale.set(1, 1, d / w * 1.8);
  place(shell, 0, 0, 0);
  g.add(shell);
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(G.torus(30), M.steel);
    const t = i / 5;
    const rad = w * 0.55 * Math.sqrt(Math.max(0.02, 1 - t * t));
    ring.scale.set(rad * 2, rad * 2, 0.5);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = t * h * 0.98;
    ring.scale.z = 0.5;
    g.add(ring);
  }
  g.add(box(M.glass, w * 0.5, h * 0.4, 0.1, 0, h * 0.2, d * 0.9));
  return g;
};

B.wetland = (s) => {
  const g = new THREE.Group();
  const w = s.w ?? 4, d = s.d ?? 3;
  const base = new THREE.Mesh(G.circle(40), matFrom('#5f7f55'));
  base.scale.set(w * 2, d * 2, 1);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.008;
  base.receiveShadow = true;
  g.add(base);
  const rand = rng(808);
  for (let i = 0; i < 9; i++) {
    const ch = new THREE.Mesh(G.plane(), M.water);
    ch.scale.set(w * (0.5 + rand() * 0.9), 0.22 + rand() * 0.2, 1);
    ch.rotation.x = -Math.PI / 2;
    ch.rotation.z = (rand() - 0.5) * 1.6;
    ch.position.set((rand() - 0.5) * w * 1.4, 0.02, (rand() - 0.5) * d * 1.4);
    g.add(ch);
  }
  g.add(trees(26, Math.max(w, d) * 0.95, 909, { dark: true }));
  if (s.boats) {
    for (let i = 0; i < 3; i++) {
      const x = (rand() - 0.5) * w, z = (rand() - 0.5) * d;
      g.add(box(M.wood, 0.14, 0.05, 0.6, x, 0.06, z, rand() * 3));
    }
  }
  return g;
};

/* ══════════════════════════════════════════════════════════════════════
   Aufbau eines Wahrzeichens
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Baut die 3D-Gruppe für ein Wahrzeichen inklusive Sockelscheibe.
 * @returns {THREE.Group} Gruppe mit userData.spinner (optional animiert)
 */
export function buildLandmark(l, accentColor) {
  initMaterials();
  const spec = l.m || { t: 'tower' };
  const maker = B[spec.t] || B.tower;
  const rand = rng(hashStr(l.id));
  let body;
  try {
    body = maker(spec, rand);
  } catch (err) {
    console.warn('Modell fehlgeschlagen:', l.id, err);
    body = B.tower({ h: 3, w: 0.8, shape: 'square' }, rand);
  }
  const g = new THREE.Group();
  g.name = l.id;
  g.add(body);

  // Sockelscheibe in der Kategoriefarbe – markiert den Standort
  const discMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(accentColor), transparent: true, opacity: 0.32,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const disc = new THREE.Mesh(G.ring(40), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.012;
  disc.scale.setScalar(2.6);
  disc.renderOrder = 2;
  g.add(disc);
  g.userData.disc = disc;
  g.userData.spinner = body.userData.spinner || null;
  return g;
}

export { B as BUILDERS };
