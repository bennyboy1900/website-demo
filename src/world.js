/**
 * Die Wahrzeichen-Welt: Modelle, Städtegruppen und deren Auf- und Zuklappen.
 *
 * Städte mit vielen Wahrzeichen liegen geografisch nur Hunderte Meter
 * auseinander – auf der Deutschlandkarte wäre das ein einziger Punkt.
 * Deshalb bekommt jede Gruppe einen Öffnungsgrad `t`: bei 0 stehen nur die
 * Leitbauten am Stadtpunkt, bei 1 fächert sich die Stadt begehbar auf.
 */
import * as THREE from 'three';
import { project, PLATE_H, CLUSTER } from './config.js';
import { CATEGORIES, LANDMARKS } from './data/landmarks.js';
import { buildLandmark, initMaterials } from './models.js';
import { clamp, smoothstep, damp, lerp } from './util.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'wahrzeichen';
    scene.add(this.root);

    this.items = [];        // { data, group, cluster, base, collapsed, expanded, … }
    this.byId = new Map();
    this.clusters = [];
    this.pickTargets = [];
    this.focusCluster = null;
    this.open = 0;
    this.selected = null;
    this._tmp = new THREE.Vector3();
    initMaterials();
  }

  /** Baut alle Modelle – häppchenweise, damit der Ladebalken laufen kann. */
  async build(onProgress) {
    this._makeClusters();
    const total = LANDMARKS.length;
    let done = 0;
    for (const l of LANDMARKS) {
      const accent = CATEGORIES[l.cat]?.color || '#f2c078';
      const group = buildLandmark(l, accent);
      group.position.set(0, PLATE_H, 0);
      group.visible = false;
      this.root.add(group);

      const bbox = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const height = Math.max(0.8, size.y);
      const radius = Math.max(0.7, Math.max(size.x, size.z) * 0.5);

      // Unsichtbarer Trefferkörper – großzügiger als das Modell selbst
      const proxy = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, height * 1.05, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.position.y = height * 0.5;
      proxy.userData.id = l.id;
      group.add(proxy);

      const cl = this.clusterOf.get(l.id);
      const item = {
        data: l, group, proxy, cluster: cl, height, radius,
        base: new THREE.Vector2(...project(l.lon, l.lat)),
        pos: new THREE.Vector3(), scale: 0, opacity: 0,
        accent,
      };
      cl.items.push(item);
      this.items.push(item);
      this.byId.set(l.id, item);
      this.pickTargets.push(proxy);

      done++;
      if (done % 8 === 0) {
        onProgress?.(done / total, l.city);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    this._layoutClusters();
    this._makeBeacons();
    onProgress?.(1, '');
    return this;
  }

  /* ── Gruppen nach Stadt ── */
  _makeClusters() {
    const map = new Map();
    this.clusterOf = new Map();
    for (const l of LANDMARKS) {
      let c = map.get(l.city);
      if (!c) {
        c = { city: l.city, state: l.state, items: [], center: new THREE.Vector2(), t: 0, tTarget: 0 };
        map.set(l.city, c);
        this.clusters.push(c);
      }
      this.clusterOf.set(l.id, c);
    }
  }

  _layoutClusters() {
    for (const c of this.clusters) {
      // Mittelpunkt
      c.center.set(0, 0);
      for (const it of c.items) c.center.add(it.base);
      c.center.multiplyScalar(1 / c.items.length);

      let maxD = 0.0001;
      for (const it of c.items) maxD = Math.max(maxD, it.base.distanceTo(c.center));
      c.count = c.items.length;
      c.big = c.count >= CLUSTER.minCount;
      c.targetRadius = clamp(3.2 * Math.sqrt(c.count), 5, 19);
      c.spread = clamp(c.targetRadius / maxD, 1, 900);

      // Leitbauten: sichtbar auch im eingeklappten Zustand
      const heroes = c.big ? c.items.filter((i) => i.data.hero) : c.items.slice();
      c.heroes = heroes.length ? heroes : [c.items[0]];

      const nh = c.heroes.length;
      const ringR = nh > 1 ? 1.0 + nh * 0.42 : 0;
      c.heroes.forEach((it, i) => {
        const a = (i / nh) * Math.PI * 2 - Math.PI / 2;
        it.collapsed = new THREE.Vector2(
          c.center.x + Math.cos(a) * ringR,
          c.center.y + Math.sin(a) * ringR,
        );
        it.isHero = true;
      });
      for (const it of c.items) {
        if (!it.collapsed) { it.collapsed = c.center.clone(); it.isHero = false; }
        const off = it.base.clone().sub(c.center);
        const d = off.length();
        if (d < 1e-5) {
          it.expanded = c.center.clone();
        } else {
          // Ein einzelner Ausreißer soll den Kern nicht zusammenquetschen.
          const r = c.targetRadius * Math.pow(d / maxD, 0.5);
          it.expanded = off.multiplyScalar(r / d).add(c.center);
        }
      }
    }
    // Reihenfolge für „nächste Stadt“
    this.clusters.sort((a, b) => (a.city === 'Münster' ? -1 : b.city === 'Münster' ? 1 : b.count - a.count));
  }

  /* ── Stadt-Signale: Ring, Lichtsäule, Bodenscheibe ── */
  _makeBeacons() {
    const ringGeo = new THREE.RingGeometry(0.94, 1, 48);
    const discGeo = new THREE.CircleGeometry(1, 48);
    const shaftGeo = new THREE.CylinderGeometry(0.14, 0.34, 1, 12, 1, true);
    this.beacons = [];
    for (const c of this.clusters) {
      if (!c.big) { c.beacon = null; continue; }
      const g = new THREE.Group();
      g.position.set(c.center.x, PLATE_H + 0.02, c.center.y);

      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#f2c078'), transparent: true, opacity: 0.6,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 4;

      const discMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#8fb6cd'), transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = -0.006;
      disc.renderOrder = 3;

      const shaftMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#f2c078'), transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.scale.set(1, 7, 1);
      shaft.position.y = 3.5;
      shaft.renderOrder = 4;

      g.add(disc, ring, shaft);
      this.root.add(g);
      c.beacon = { group: g, ring, ringMat, disc, discMat, shaft, shaftMat };
      this.beacons.push(c.beacon);
    }
  }

  /** Welche Gruppe soll sich öffnen? Die der Kamera nächste. */
  _pickFocus(camPos, target) {
    if (this.selected) {
      const c = this.clusterOf.get(this.selected);
      if (c && c.big) return { cluster: c, dist: 0 };
    }
    let best = null, bestD = Infinity;
    for (const c of this.clusters) {
      const dx = target.x - c.center.x, dz = target.z - c.center.y;
      const dTarget = Math.hypot(dx, dz);
      const dCam = Math.hypot(camPos.x - c.center.x, camPos.z - c.center.y);
      const d = dTarget * 0.75 + dCam * 0.25;
      if (d < bestD) { bestD = d; best = c; }
    }
    return { cluster: best, dist: bestD };
  }

  /**
   * Pro Bild: Öffnungsgrad, Positionen, Sichtbarkeit.
   * @returns {object|null} die aktuell geöffnete Stadtgruppe
   */
  update(dt, camera, target) {
    const { cluster: focus } = this._pickFocus(camera.position, target);
    const camDist = camera.position.distanceTo(target);
    this.focusCluster = focus;

    // Wie weit ist die Kamera in die fokussierte Stadt hineingefahren?
    let openTarget = 0;
    if (focus) {
      const d3 = Math.hypot(
        camera.position.x - focus.center.x, camera.position.y,
        camera.position.z - focus.center.y,
      );
      openTarget = smoothstep(CLUSTER.start, CLUSTER.end, d3);
      openTarget = Math.max(openTarget, smoothstep(78, 30, camDist) * 0.92);
      if (this.selected && this.clusterOf.get(this.selected) === focus) openTarget = Math.max(openTarget, 0.95);
    }
    this.open = damp(this.open, clamp(openTarget, 0, 1), 3.0, dt);

    for (const c of this.clusters) {
      c.tTarget = !c.big ? 1 : (c === focus ? this.open : 0);
      c.t = damp(c.t, c.tTarget, 3.2, dt);
    }

    for (const it of this.items) {
      const c = it.cluster;
      const t = c.t;
      const e = t * t * (3 - 2 * t);
      const x = lerp(it.collapsed.x, it.expanded.x, e);
      const z = lerp(it.collapsed.y, it.expanded.y, e);
      it.pos.set(x, PLATE_H, z);

      let sc;
      if (!c.big || it.isHero) sc = 1;
      else sc = smoothstep(0.08, 0.52, t);
      // Ist eine Stadt aufgefächert, tritt der Rest der Republik zurück.
      if (c !== focus) sc *= 1 - smoothstep(0.12, 0.58, this.open);
      it.scale = sc;

      const vis = sc > 0.05;
      it.group.visible = vis;
      if (vis) {
        it.group.position.copy(it.pos);
        it.group.scale.setScalar(sc);
        if (it.group.userData.spinner) it.group.userData.spinner.rotation.z += dt * 0.5;
        const sel = this.selected === it.data.id;
        const disc = it.group.userData.disc;
        if (disc) {
          disc.material.opacity = sel ? 0.75 : 0.16 + 0.2 * (c.big ? t : 1);
          const pulse = sel ? 1 + Math.sin(performance.now() * 0.004) * 0.09 : 1;
          disc.scale.setScalar((Math.min(it.radius, 2.6) * 1.4 + 0.7) * pulse);
        }
      }
      it.proxy.visible = vis;
    }

    for (const c of this.clusters) {
      if (!c.beacon) continue;
      const b = c.beacon;
      const t = c.t;
      const r = lerp(2.4, c.targetRadius * 1.2, t);
      b.ring.scale.setScalar(r);
      b.disc.scale.setScalar(r * 0.98);
      b.ringMat.opacity = lerp(0.55, 0.42, t);
      b.discMat.opacity = t * 0.09;
      b.shaftMat.opacity = (1 - t) * 0.2;
      const away = c === focus ? 1 : 1 - smoothstep(0.12, 0.58, this.open);
      b.ringMat.opacity *= away;
      b.discMat.opacity *= away;
      b.shaftMat.opacity *= away;
      b.shaft.visible = b.shaftMat.opacity > 0.01;
      b.group.visible = away > 0.02;
    }
    return focus;
  }

  select(id) { this.selected = id; }

  /** Weltposition eines Wahrzeichens (für Beschriftungen und Kameraflüge). */
  positionOf(id) {
    const it = this.byId.get(id);
    return it ? it.pos : null;
  }

  itemOf(id) { return this.byId.get(id); }
}
