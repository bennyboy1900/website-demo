/**
 * Baut die Deutschlandkarte: extrudierte Bundesländer, glühender Umriss,
 * Flüsse, Meer und Raster.
 */
import * as THREE from 'three';
import { project, PLATE_H } from './config.js';
import { WET_MATERIALS } from './models.js';

/* Zurückhaltende, leicht variierende Landfarben – „clean“, nicht bunt. */
const STATE_TINT = {
  'DE-SH': '#dde2dc', 'DE-HH': '#e3e5de', 'DE-MV': '#d9dfdb', 'DE-NI': '#e0e2da',
  'DE-HB': '#e3e5de', 'DE-BB': '#dadeda', 'DE-BE': '#e5e4da', 'DE-ST': '#dfe0d8',
  'DE-NW': '#e4e2d8', 'DE-SN': '#dbddd8', 'DE-HE': '#e1e0d6', 'DE-TH': '#dddfd7',
  'DE-RP': '#e3e1d6', 'DE-BY': '#dedfd6', 'DE-BW': '#e2e1d6', 'DE-SL': '#e4e2d7',
};

/** Grobe Verläufe der wichtigsten Flüsse (lon/lat). */
const RIVERS = {
  Rhein: [[7.59, 47.56], [7.62, 48.02], [8.05, 48.62], [8.24, 48.98], [8.30, 49.11], [8.45, 49.32],
    [8.42, 49.63], [8.34, 49.87], [8.27, 50.00], [7.90, 49.97], [7.72, 50.14], [7.60, 50.36],
    [7.30, 50.55], [7.12, 50.74], [6.96, 50.94], [6.85, 51.10], [6.72, 51.24], [6.76, 51.43],
    [6.60, 51.63], [6.44, 51.83], [6.10, 51.86]],
  Elbe: [[14.29, 50.87], [13.85, 50.93], [13.74, 51.05], [13.47, 51.16], [13.29, 51.31],
    [13.00, 51.56], [12.65, 51.87], [12.25, 51.86], [11.90, 52.02], [11.63, 52.13], [11.98, 52.55],
    [11.75, 52.99], [11.30, 53.14], [10.55, 53.37], [10.20, 53.45], [9.98, 53.54], [9.42, 53.79],
    [8.90, 53.88], [8.60, 53.92]],
  Donau: [[8.50, 47.95], [8.85, 48.06], [9.22, 48.09], [9.60, 48.20], [9.99, 48.40], [10.40, 48.62],
    [10.78, 48.72], [11.43, 48.76], [11.85, 48.86], [12.10, 49.02], [12.57, 48.88], [12.96, 48.83],
    [13.46, 48.57]],
  Main: [[10.89, 49.89], [10.55, 50.03], [10.22, 50.05], [9.93, 49.79], [9.51, 49.76],
    [9.15, 49.97], [8.90, 50.06], [8.68, 50.11], [8.27, 50.00]],
  Weser: [[9.65, 51.41], [9.38, 51.78], [9.36, 52.10], [9.10, 52.22], [8.92, 52.29], [9.21, 52.66],
    [8.80, 53.08], [8.58, 53.55], [8.50, 53.87]],
  Oder: [[14.75, 51.95], [14.65, 52.15], [14.55, 52.35], [14.13, 52.85], [14.28, 53.06], [14.40, 53.42]],
  Mosel: [[6.36, 49.47], [6.64, 49.76], [7.07, 49.92], [7.17, 50.15], [7.60, 50.36]],
  Neckar: [[8.98, 48.50], [9.18, 48.79], [9.22, 49.14], [9.05, 49.30], [8.69, 49.41], [8.47, 49.49]],
  Saale: [[11.60, 50.30], [11.59, 50.93], [11.87, 51.35], [11.97, 51.48], [11.88, 51.86]],
  Spree: [[14.30, 51.00], [14.05, 51.50], [13.90, 52.05], [13.42, 52.51], [13.30, 52.52]],
};

function shapeFromRing(ring) {
  const s = new THREE.Shape();
  for (let i = 0; i < ring.length; i++) {
    const [x, z] = project(ring[i][0], ring[i][1]);
    // Shape liegt in XY; nach rotateX(-90°) wird lokal-Y zu Welt-(-Z)
    if (i === 0) s.moveTo(x, -z); else s.lineTo(x, -z);
  }
  s.closePath();
  return s;
}

/** Flaches Band entlang eines Polygonzugs (für Umriss & Flüsse). */
function ribbon(points2d, width, y, closed) {
  const pos = [];
  const n = points2d.length;
  const normalAt = (i) => {
    const a = points2d[Math.max(0, i - 1)];
    const b = points2d[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    return [-dz / len, dx / len];
  };
  for (let i = 0; i < n - 1; i++) {
    const [nx1, nz1] = normalAt(i);
    const [nx2, nz2] = normalAt(i + 1);
    const p1 = points2d[i], p2 = points2d[i + 1];
    const w = width / 2;
    const a = [p1[0] + nx1 * w, y, p1[1] + nz1 * w];
    const b = [p1[0] - nx1 * w, y, p1[1] - nz1 * w];
    const c = [p2[0] + nx2 * w, y, p2[1] + nz2 * w];
    const d = [p2[0] - nx2 * w, y, p2[1] - nz2 * w];
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  void closed;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Meer / Grundebene mit weichem Raster. */
function makeSea() {
  const uniforms = {
    uColor: { value: new THREE.Color('#0d1a24') },
    uGrid: { value: new THREE.Color('#2a4a5e') },
    uGridStrength: { value: 0.5 },
    uFade: { value: 240.0 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: true,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uGrid;
      uniform float uGridStrength; uniform float uFade;
      varying vec3 vW;
      float grid(vec2 p, float s, float w) {
        vec2 q = abs(fract(p / s - 0.5) - 0.5) / fwidth(p / s);
        float l = min(q.x, q.y);
        return 1.0 - min(l * w, 1.0);
      }
      void main() {
        float d = length(vW.xz);
        float fade = 1.0 - smoothstep(uFade * 0.25, uFade, d);
        float g1 = grid(vW.xz, 8.0, 1.0) * 0.45;
        float g2 = grid(vW.xz, 40.0, 1.2) * 0.9;
        float g = clamp(g1 + g2, 0.0, 1.0) * uGridStrength * fade;
        vec3 col = mix(uColor, uGrid, g);
        gl_FragColor = vec4(col, 0.92 * fade + 0.08);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(760, 760, 1, 1), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.12;
  mesh.receiveShadow = false;
  mesh.renderOrder = -5;
  return { mesh, uniforms };
}

/**
 * Erzeugt die komplette Karte.
 * @param {object} geo geladenes germany.geo.json
 */
export function buildMap(geo) {
  const root = new THREE.Group();
  root.name = 'karte';

  const capMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e2e2da'), roughness: 0.94, metalness: 0.0,
    vertexColors: true,
  });
  capMat.userData.baseRough = 0.94;
  WET_MATERIALS.push(capMat);

  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7f857f'), roughness: 0.86, metalness: 0.02,
  });
  wallMat.userData.baseRough = 0.86;
  WET_MATERIALS.push(wallMat);

  /* ── Bundesländer als extrudierte Platten ── */
  const statesGroup = new THREE.Group();
  statesGroup.name = 'bundeslaender';
  const stateMeshes = {};
  for (const st of geo.states) {
    const shapes = st.rings.map(shapeFromRing);
    const g = new THREE.ExtrudeGeometry(shapes, {
      depth: PLATE_H, bevelEnabled: true, bevelThickness: 0.05,
      bevelSize: 0.05, bevelSegments: 1, curveSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    // Farbton je Bundesland über Vertexfarben (ein Material für alle)
    const tint = new THREE.Color(STATE_TINT[st.id] || '#e2ded0');
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tint.r; colors[i * 3 + 1] = tint.g; colors[i * 3 + 2] = tint.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(g, [capMat, wallMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = st.id;
    mesh.userData.state = st;
    statesGroup.add(mesh);
    stateMeshes[st.id] = mesh;
  }
  root.add(statesGroup);

  /* ── Bundeslandgrenzen als feine Linien ── */
  const borderPos = [];
  for (const st of geo.states) {
    for (const ring of st.rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, z1] = project(ring[i][0], ring[i][1]);
        const [x2, z2] = project(ring[i + 1][0], ring[i + 1][1]);
        borderPos.push(x1, PLATE_H + 0.012, z1, x2, PLATE_H + 0.012, z2);
      }
    }
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderPos, 3));
  const borderMat = new THREE.LineBasicMaterial({
    color: new THREE.Color('#9a9384'), transparent: true, opacity: 0.55,
  });
  const stateBorders = new THREE.LineSegments(bGeo, borderMat);
  stateBorders.name = 'landesgrenzen';
  root.add(stateBorders);

  /* ── Nationaler Umriss als leuchtendes Band ── */
  const outlineMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#f6cb8a'), transparent: true, opacity: 1.0,
    side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  });
  const outline = new THREE.Group();
  outline.name = 'umriss';
  for (const ring of geo.country) {
    const pts = ring.map(([lo, la]) => project(lo, la));
    outline.add(new THREE.Mesh(ribbon(pts, 0.34, PLATE_H + 0.03, true), outlineMat));
    // zweites, breiteres Band als weicher Schein
    const glowMat = outlineMat.clone();
    glowMat.opacity = 0.2;
    outline.add(new THREE.Mesh(ribbon(pts, 1.5, PLATE_H + 0.022, true), glowMat));
  }
  outline.renderOrder = 3;
  root.add(outline);

  /* ── Küstensaum unterhalb der Platte ── */
  const skirtMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6f6b62'), roughness: 0.95,
  });
  void skirtMat;

  /* ── Flüsse ── */
  const riverMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5d9dc4'), roughness: 0.16, metalness: 0.4,
    transparent: true, opacity: 0.85,
  });
  riverMat.userData.baseRough = 0.16;
  const rivers = new THREE.Group();
  rivers.name = 'fluesse';
  for (const key of Object.keys(RIVERS)) {
    const pts = RIVERS[key].map(([lo, la]) => project(lo, la));
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const steps = 6;
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    dense.push(pts[pts.length - 1]);
    const width = key === 'Rhein' || key === 'Elbe' || key === 'Donau' ? 0.34 : 0.22;
    const mesh = new THREE.Mesh(ribbon(dense, width, PLATE_H + 0.018, false), riverMat);
    mesh.name = key;
    rivers.add(mesh);
  }
  root.add(rivers);

  /* ── Meer & Raster ── */
  const sea = makeSea();
  root.add(sea.mesh);

  return {
    root, statesGroup, stateMeshes, stateBorders, outline, rivers,
    sea: sea.mesh, seaUniforms: sea.uniforms,
    capMat, wallMat, outlineMat, riverMat, borderMat,
  };
}
