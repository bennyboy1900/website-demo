/**
 * Wahrzeichen Deutschland · 3D
 * Einstiegspunkt: baut Szene, Karte und Welt auf und verbindet alles mit der Oberfläche.
 */
import * as THREE from 'three';
import { GEO } from './data/germany.geo.js';
import { LANDMARKS, TOUR_ORDER, CATEGORIES, STATES } from './data/landmarks.js';
import { VIEW, QUALITY, PLATE_H } from './config.js';
import { clamp, damp } from './util.js';
import { buildMap } from './map.js';
import { World } from './world.js';
import { Environment } from './environment.js';
import { createComposer } from './postfx.js';
import { CameraRig } from './cameraRig.js';
import { Labels } from './labels.js';
import { UI } from './ui.js';

const canvas = document.getElementById('stage');
document.body.classList.add('is-loading');

/* ══════════════ Renderer & Szene ══════════════ */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.35, 1600);
camera.position.set(0, 190, 220);

const rig = new CameraRig(camera, canvas);
const ui = new UI({});
const S = ui.settings;

let quality = QUALITY[S.quality] || QUALITY.medium;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.pixelRatio));

/* ══════════════ Karte ══════════════ */
const map = buildMap(GEO);
scene.add(map.root);

/* ══════════════ Umwelt & Nachbearbeitung ══════════════ */
const env = new Environment(scene, renderer, { ...quality, rain: QUALITY.high.rain });
env.rainScale = quality.rain / QUALITY.high.rain;
const fx = createComposer(renderer, scene, camera, quality);

/* ══════════════ Welt ══════════════ */
const world = new World(scene);
const labels = new Labels(document.getElementById('labels'), world,
  (id) => selectLandmark(id, true),
  (city) => flyToCity(city));

/* ══════════════ Zustand ══════════════ */
let selectedId = null;
let tourOn = false;
let tourTimer = 0;
let cityIndex = 0;
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsT = 0;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoverId = null;
let hoverTick = 0;

/* ══════════════ Aufbau ══════════════ */
const loaderBar = document.getElementById('loaderBar');
const loaderStatus = document.getElementById('loaderStatus');

async function boot() {
  loaderStatus.textContent = 'Deutschlandkarte wird extrudiert …';
  loaderBar.style.width = '12%';
  await new Promise((r) => setTimeout(r, 40));

  await world.build((p, city) => {
    loaderBar.style.width = `${12 + p * 84}%`;
    if (city) loaderStatus.textContent = `Wahrzeichen werden gebaut · ${city}`;
  });

  loaderStatus.textContent = `${LANDMARKS.length} Wahrzeichen · ${world.clusters.length} Orte · bereit`;
  loaderBar.style.width = '100%';
  applyAllSettings();
  hookUI();

  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = false;
  startBtn.classList.add('ready');
  startBtn.onclick = start;
  // Nach kurzer Zeit von selbst starten, falls niemand klickt
  setTimeout(() => { if (!started) startBtn.focus(); }, 400);
}

let started = false;
function start() {
  if (started) return;
  started = true;
  document.getElementById('loader').classList.add('done');
  document.body.classList.remove('is-loading');
  camera.position.set(-140, 300, 330);
  rig.controls.target.set(0, 0, 6);
  overview(3.4);
  ui.toast('Mit den Pfeilen am Rand durch die Wahrzeichen blättern');
  setTimeout(() => ui.ticker('Tipp: In eine Stadt zoomen – dort fächern sich alle Wahrzeichen auf.'), 4200);
  setTimeout(() => ui.ticker(''), 12000);
}

/* ══════════════ Navigation ══════════════ */
function overview(dur = 1.8) {
  selectedId = null;
  world.select(null);
  ui.closeInfo();
  ui.setPlace('Deutschland');
  ui.markActive(null);
  rig.flyTo({ target: new THREE.Vector3(0, 0, 6), dist: VIEW.overview.dist, polar: VIEW.overview.polar, azim: 0, dur });
}

function selectLandmark(id, fly = true, dur) {
  const it = world.itemOf(id);
  if (!it) return;
  selectedId = id;
  world.select(id);
  const l = it.data;
  const neighbours = LANDMARKS.filter((n) => n.city === l.city && n.id !== l.id).slice(0, 6);
  ui.showInfo(l, neighbours);
  ui.setPlace(`${l.city} · ${STATES[l.state]}`);
  const idx = TOUR_ORDER.findIndex((x) => x.id === id);
  const prev = TOUR_ORDER[(idx - 1 + TOUR_ORDER.length) % TOUR_ORDER.length];
  const next = TOUR_ORDER[(idx + 1) % TOUR_ORDER.length];
  ui.setEdges(prev?.n, next?.n, nextClusterName());
  cityIndex = world.clusters.findIndex((c) => c.city === l.city);

  if (fly) {
    const target = new THREE.Vector3(it.expanded.x, PLATE_H + it.height * 0.42, it.expanded.y);
    const dist = clamp(it.height * 1.35 + it.radius * 1.5 + 3.2, 7.5, 24);
    rig.flyTo({ target, dist, polar: 1.06, azim: rig._current().azim + 0.42, dur: dur ?? 1.7 });
  }
}

function flyToCity(city, dur = 1.7) {
  const c = world.clusters.find((x) => x.city === city);
  if (!c) return;
  cityIndex = world.clusters.indexOf(c);
  ui.setPlace(`${c.city} · ${STATES[c.state]}`);
  const dist = clamp(c.targetRadius * 2.5 + 14, 26, 90);
  rig.flyTo({
    target: new THREE.Vector3(c.center.x, PLATE_H + 1.5, c.center.y),
    dist, polar: 0.9, azim: rig._current().azim, dur,
  });
}

function nextClusterName() {
  const c = world.clusters[(cityIndex + 1) % world.clusters.length];
  return c?.city;
}

function step(dir) {
  const idx = selectedId ? TOUR_ORDER.findIndex((x) => x.id === selectedId) : -1;
  const next = TOUR_ORDER[((idx + dir) % TOUR_ORDER.length + TOUR_ORDER.length) % TOUR_ORDER.length];
  selectLandmark(next.id, true);
}

function nextCity() {
  cityIndex = (cityIndex + 1) % world.clusters.length;
  flyToCity(world.clusters[cityIndex].city);
}

function toggleTour() {
  tourOn = !tourOn;
  document.getElementById('tourBtn').classList.toggle('on', tourOn);
  document.body.classList.toggle('cine', tourOn || ui.settings.cinema);
  if (tourOn) {
    tourTimer = 0;
    ui.toast('Kinotour läuft – Klicken beendet sie');
    if (!selectedId) selectLandmark(TOUR_ORDER[0].id, true);
  } else {
    ui.ticker('');
    ui.toast('Kinotour beendet');
  }
}

/* ══════════════ Oberfläche verbinden ══════════════ */
function hookUI() {
  Object.assign(ui.h, {
    onSelect: (id) => { if (tourOn) toggleTour(); selectLandmark(id, true); },
    onDeselect: () => { selectedId = null; world.select(null); ui.markActive(null); },
    onOverview: () => { if (tourOn) toggleTour(); overview(); },
    onNextCity: () => { if (tourOn) toggleTour(); nextCity(); },
    onCity: (city) => flyToCity(city),
    onStep: (d) => { if (tourOn) toggleTour(); step(d); },
    onTour: () => toggleTour(),
    onSetting: (k, v) => applySetting(k, v),
  });
  ui.setEdges(TOUR_ORDER[TOUR_ORDER.length - 1].n, TOUR_ORDER[0].n, world.clusters[1]?.city);
}

function applySetting(k, v) {
  switch (k) {
    case 'quality': {
      quality = QUALITY[v] || QUALITY.medium;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.pixelRatio));
      env.setQuality({ ...quality, rain: QUALITY.high.rain });
      env.rainScale = quality.rain / QUALITY.high.rain;
      onResize();
      break;
    }
    case 'fov': camera.fov = v; camera.updateProjectionMatrix(); break;
    case 'labels': labels.enabled = !!v; break;
    case 'stateFill':
      map.capMat.vertexColors = !!v;
      map.capMat.color.set(v ? 0xffffff : 0xe2e2da);
      map.capMat.needsUpdate = true;
      break;
    case 'rivers': map.rivers.visible = !!v; break;
    case 'grid': map.seaUniforms.uGridStrength.value = v ? 0.5 : 0.0; break;
    case 'cinema': document.body.classList.toggle('cine', !!v || tourOn); break;
    case 'autoOrbit': rig.autoOrbit = !!v; break;
    case 'orbitSpeed': rig.orbitSpeed = v; break;
    default: break;
  }
}

function applyAllSettings() {
  for (const k of Object.keys(ui.settings)) applySetting(k, ui.settings[k]);
  labels.enabled = ui.settings.labels;
  rig.autoOrbit = ui.settings.autoOrbit;
  rig.orbitSpeed = ui.settings.orbitSpeed;
  camera.fov = ui.settings.fov;
  camera.updateProjectionMatrix();
}

/* ══════════════ Zeigergeschehen ══════════════ */
let downX = 0, downY = 0, downT = 0;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
  canvas.classList.add('grabbing');
  rig.cancel();
});
canvas.addEventListener('pointerup', (e) => {
  canvas.classList.remove('grabbing');
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 6 || performance.now() - downT > 450) return;
  const hit = pick(e.clientX, e.clientY);
  if (tourOn) toggleTour();
  if (hit) selectLandmark(hit, true);
  else {
    // Auf eine Stadtmarke geklickt?
    const c = pickCluster(e.clientX, e.clientY);
    if (c) flyToCity(c.city);
  }
});
canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
});
canvas.addEventListener('pointerleave', () => canvas.classList.remove('grabbing'));

function pick(cx, cy) {
  pointer.x = (cx / innerWidth) * 2 - 1;
  pointer.y = -(cy / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.pickTargets, false);
  for (const h of hits) if (h.object.visible) return h.object.userData.id;
  return null;
}

function pickCluster(cx, cy) {
  pointer.x = (cx / innerWidth) * 2 - 1;
  pointer.y = -(cy / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const rings = world.beacons.filter((b) => b.group.visible).map((b) => b.ring);
  const hits = raycaster.intersectObjects(rings, false);
  if (!hits.length) return null;
  const g = hits[0].object.parent;
  return world.clusters.find((c) => c.beacon && c.beacon.group === g) || null;
}

/* ══════════════ Größenänderung ══════════════ */
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camera.clearViewOffset();
  viewShift = 0;
  renderer.setSize(innerWidth, innerHeight);
  fx.composer.setSize(innerWidth, innerHeight);
  fx.bloom.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

/* ══════════════ Blitz ══════════════ */
const flashEl = document.getElementById('flash');
env.onFlash = (strength) => {
  flashEl.style.transition = 'none';
  flashEl.style.opacity = String(0.35 * strength);
  requestAnimationFrame(() => {
    flashEl.style.transition = 'opacity .45s ease-out';
    flashEl.style.opacity = '0';
  });
};

/* ══════════════ Bildschleife ══════════════ */
let elapsed = 0;
let viewShift = 0;

/** Verschiebt das Bild, damit offene Panels das Motiv nicht verdecken. */
function updateViewOffset(dt) {
  const wide = innerWidth > 980;
  const pw = 380;
  const right = wide ? ((document.getElementById('infoPanel').classList.contains('open') ? pw : 0)
    + (document.getElementById('setPanel').classList.contains('open') ? pw : 0)) : 0;
  const left = wide && document.getElementById('listPanel').classList.contains('open') ? pw : 0;
  const want = clamp(right - left, -innerWidth * 0.45, innerWidth * 0.45);
  viewShift = damp(viewShift, want, 7, dt);
  if (Math.abs(viewShift) < 1) {
    if (camera.view && camera.view.enabled) camera.clearViewOffset();
    return;
  }
  const a = Math.abs(viewShift);
  camera.setViewOffset(innerWidth + a, innerHeight, viewShift > 0 ? a : 0, 0, innerWidth, innerHeight);
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  const St = ui.settings;

  if (St.autoTime) {
    St.timeOfDay = (St.timeOfDay + dt * St.timeSpeed * 0.22) % 24;
    if (elapsed % 0.25 < dt) ui.syncTime(St.timeOfDay);
  }

  updateViewOffset(dt);
  rig.update(dt);
  const focusCluster = world.update(dt, camera, rig.controls.target);
  env.update(dt, St, camera, rig.controls.target);
  labels.update(camera);

  // Der Umriss darf nachts nicht das ganze Bild überstrahlen
  map.outlineMat.opacity = 0.92 - env.nightFactor * 0.5;

  // Bildlook
  fx.bloom.strength = St.bloom;
  fx.bloom.threshold = clamp(0.86 - env.nightFactor * 0.34, 0.3, 0.95);
  const gu = fx.grade.uniforms;
  gu.uTime.value = elapsed;
  gu.uGrain.value = St.grain;
  gu.uVignette.value = St.vignette;
  gu.uChroma.value = St.chroma;
  gu.uSaturation.value = St.saturation;
  gu.uFlash.value = damp(gu.uFlash.value, env.flash * 0.18, 12, dt);
  document.getElementById('vignette').style.setProperty('--vig', String(clamp(St.vignette * 0.55, 0, 1)));

  // Zeiger: über einem Wahrzeichen?
  hoverTick += dt;
  if (hoverTick > 0.07) {
    hoverTick = 0;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(world.pickTargets, false);
    const id = hits.length ? hits[0].object.userData.id : null;
    if (id !== hoverId) {
      hoverId = id;
      canvas.classList.toggle('pointing', !!id);
    }
  }

  // Ort im HUD
  if (!selectedId && !rig.flight) {
    const near = focusCluster;
    ui.setPlace(near && world.open > 0.3
      ? `${near.city} · ${near.count} ${near.count === 1 ? 'Wahrzeichen' : 'Wahrzeichen'}`
      : 'Deutschland');
  }
  ui.setWeatherHud(St.timeOfDay, St.weather);
  document.getElementById('edgeUp').toggleAttribute('disabled', !selectedId && world.open < 0.12 && !rig.flight);

  // Kinotour
  if (tourOn) {
    tourTimer += dt;
    if (tourTimer > 8.5) {
      tourTimer = 0;
      step(1);
    }
    const cur = world.itemOf(selectedId);
    if (cur) ui.ticker(`${cur.data.n} · ${cur.data.t}`);
  }

  fx.composer.render();

  // Bildrate
  fpsAcc += dt; fpsN++;
  if (fpsAcc - fpsT > 0.6) {
    ui.setFps(Math.round(fpsN / (fpsAcc - fpsT)));
    fpsT = fpsAcc; fpsN = 0;
    if (fpsAcc > 6) { fpsAcc = 0; fpsT = 0; }
  }
}

boot().then(() => frame());

// Für die Konsole – praktisch beim Ausprobieren
window.WD = {
  scene, camera, world, env, ui, map, rig, THREE, CATEGORIES,
  select: selectLandmark, flyToCity, overview, step, nextCity,
};
