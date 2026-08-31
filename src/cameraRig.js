/** Kamerasteuerung: OrbitControls plus weiche, gescriptete Flüge. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { easeInOut, clamp } from './util.js';
import { VIEW } from './config.js';

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.075;
    c.rotateSpeed = 0.65;
    c.panSpeed = 0.7;
    c.zoomSpeed = 0.9;
    c.screenSpacePanning = false;
    c.minDistance = VIEW.minDist;
    c.maxDistance = VIEW.maxDist;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI / 2 - 0.045;
    c.target.set(0, 0, 6);

    this.flight = null;
    this.autoOrbit = false;
    this.orbitSpeed = 0.35;
    this._spherical = new THREE.Spherical();
    this._tmp = new THREE.Vector3();
  }

  /** Aktuelle Kugelkoordinaten relativ zum Ziel. */
  _current() {
    this._tmp.copy(this.camera.position).sub(this.controls.target);
    this._spherical.setFromVector3(this._tmp);
    return {
      target: this.controls.target.clone(),
      dist: this._spherical.radius,
      polar: this._spherical.phi,
      azim: this._spherical.theta,
    };
  }

  /**
   * Weicher Flug zu einem Ziel.
   * @param {{target:THREE.Vector3, dist:number, polar?:number, azim?:number, dur?:number}} to
   */
  flyTo(to) {
    const from = this._current();
    let azim = to.azim ?? from.azim;
    // kürzesten Winkelweg wählen
    while (azim - from.azim > Math.PI) azim -= Math.PI * 2;
    while (azim - from.azim < -Math.PI) azim += Math.PI * 2;
    this.flight = {
      from,
      to: {
        target: to.target.clone(),
        dist: clamp(to.dist, VIEW.minDist, VIEW.maxDist),
        polar: clamp(to.polar ?? from.polar, 0.13, Math.PI / 2 - 0.05),
        azim,
      },
      t: 0,
      dur: to.dur ?? 1.6,
    };
    this.controls.enabled = false;
  }

  cancel() {
    if (this.flight) { this.flight = null; this.controls.enabled = true; }
  }

  get distance() {
    return this.camera.position.distanceTo(this.controls.target);
  }

  update(dt) {
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = easeInOut(f.t);
      const target = f.from.target.clone().lerp(f.to.target, e);
      const dist = f.from.dist + (f.to.dist - f.from.dist) * e;
      const polar = f.from.polar + (f.to.polar - f.from.polar) * e;
      const azim = f.from.azim + (f.to.azim - f.from.azim) * e;
      this._spherical.set(dist, polar, azim);
      this.camera.position.copy(target).add(this._tmp.setFromSpherical(this._spherical));
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      if (f.t >= 1) {
        this.flight = null;
        this.controls.enabled = true;
      }
    } else {
      if (this.autoOrbit) {
        const cur = this._current();
        this._spherical.set(cur.dist, cur.polar, cur.azim + this.orbitSpeed * dt * 0.12);
        this.camera.position.copy(cur.target).add(this._tmp.setFromSpherical(this._spherical));
      }
      this.controls.update();
    }
  }
}
