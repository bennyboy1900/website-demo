/** HTML-Beschriftungen, die den 3D-Objekten folgen. */
import * as THREE from 'three';
import { CATEGORIES } from './data/landmarks.js';
import { clamp } from './util.js';

const MAX_LABELS = 46;

export class Labels {
  constructor(container, world, onSelect, onCluster) {
    this.el = container;
    this.world = world;
    this.onSelect = onSelect;
    this.onCluster = onCluster;
    this.pool = new Map();
    this.guards = ['edgeUp', 'edgeDown', 'edgePrev', 'edgeNext']
      .map((id) => document.getElementById(id)).filter(Boolean);
    this._v = new THREE.Vector3();
    this.enabled = true;
  }

  _node(key, kind) {
    let n = this.pool.get(key);
    if (!n) {
      n = document.createElement('button');
      n.className = kind === 'cluster' ? 'lbl lbl--cluster' : 'lbl';
      n.style.opacity = '0';
      n.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (kind === 'cluster') this.onCluster?.(key.slice(2));
        else this.onSelect?.(key.slice(2));
      });
      this.el.appendChild(n);
      this.pool.set(key, n);
    }
    return n;
  }

  update(camera) {
    if (!this.enabled) {
      for (const n of this.pool.values()) { n.style.opacity = '0'; n.style.pointerEvents = 'none'; }
      return;
    }
    const seen = new Set();
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const cand = [];

    for (const it of this.world.items) {
      if (!it.group.visible || it.scale < 0.34) continue;
      this._v.copy(it.pos);
      this._v.y += it.height * it.scale + 0.35;
      const dist = camera.position.distanceTo(this._v);
      const sel = this.world.selected === it.data.id;
      if (dist > 205 && !sel) continue;
      this._v.project(camera);
      if (this._v.z > 1 || Math.abs(this._v.x) > 1.1 || Math.abs(this._v.y) > 1.1) continue;
      cand.push({
        key: 'l:' + it.data.id, kind: 'landmark', item: it, dist, sel,
        prio: sel ? -1e6 : dist,
        text: it.data.n,
        x: (this._v.x * 0.5 + 0.5) * w, y: (-this._v.y * 0.5 + 0.5) * h,
      });
    }

    for (const c of this.world.clusters) {
      if (!c.big || c.t > 0.55) continue;
      this._v.set(c.center.x, 6.4, c.center.y);
      const dist = camera.position.distanceTo(this._v);
      this._v.project(camera);
      if (this._v.z > 1 || Math.abs(this._v.x) > 1.08 || Math.abs(this._v.y) > 1.08) continue;
      cand.push({
        key: 'c:' + c.city, kind: 'cluster', cluster: c, dist,
        prio: -1e5 + dist - c.count * 40,
        text: `${c.city} ${c.count}`,
        x: (this._v.x * 0.5 + 0.5) * w, y: (-this._v.y * 0.5 + 0.5) * h,
      });
    }

    cand.sort((a, b) => a.prio - b.prio);

    /* Überlappungen vermeiden: grobes Belegungsraster über den Bildschirm */
    const CW = 96, CH = 30;
    const cols = Math.ceil(w / CW) + 2;
    const taken = this._taken || (this._taken = new Uint8Array(4096));
    taken.fill(0);
    const claim = (x, y, pw) => {
      const c0 = Math.floor((x - pw / 2) / CW), c1 = Math.floor((x + pw / 2) / CW);
      const r0 = Math.floor((y - 13) / CH), r1 = Math.floor((y + 13) / CH);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) if (taken[(r * cols + c + 2048) % 4096]) return false;
      }
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) taken[(r * cols + c + 2048) % 4096] = 1;
      }
      return true;
    };

    // Flächen der Randpfeile freihalten
    const zones = [];
    for (const el of this.guards) {
      if (el.hasAttribute('disabled')) continue;
      const r = el.getBoundingClientRect();
      if (r.width) zones.push([r.left - 26, r.top - 14, r.right + 26, r.bottom + 14]);
    }
    const blocked = (x, y) => zones.some((z) => x > z[0] && x < z[2] && y > z[1] && y < z[3]);

    let shown = 0;
    for (const c of cand) {
      if (shown >= MAX_LABELS) break;
      if (blocked(c.x, c.y)) {
        if (!c.sel) continue;
        // Die Marke des gewählten Bauwerks bleibt sichtbar und weicht aus
        c.y += c.y < h / 2 ? 40 : -40;
      }
      const pw = c.text.length * 6.6 + (c.kind === 'cluster' ? 44 : 34);
      if (!c.sel && !claim(c.x, c.y, pw)) continue;
      if (c.sel) claim(c.x, c.y, pw);
      shown++;
      const n = this._node(c.key, c.kind);
      seen.add(c.key);
      n.style.transform = `translate(-50%,-50%) translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px)`;
      if (c.kind === 'cluster') {
        const fade = 1 - c.cluster.t / 0.55;
        if (n.dataset.n !== c.cluster.city) {
          n.dataset.n = c.cluster.city;
          n.innerHTML = `<b>${c.cluster.city}</b> <em>${c.cluster.count}</em>`;
        }
        n.style.opacity = String(clamp(fade, 0, 1) * clamp(1 - (c.dist - 230) / 110, 0, 1));
        n.style.zIndex = '4';
      } else {
        const it = c.item;
        if (n.dataset.n !== it.data.id) {
          n.dataset.n = it.data.id;
          const col = CATEGORIES[it.data.cat]?.color || '#f2c078';
          n.innerHTML = `<i style="background:${col};color:${col}"></i>${it.data.n}`;
        }
        n.classList.toggle('sel', c.sel);
        n.classList.toggle('lbl--muted', !c.sel && c.dist > 96);
        const fade = clamp((it.scale - 0.34) / 0.3, 0, 1) * clamp(1 - (c.dist - 168) / 38, 0, 1);
        n.style.opacity = String(c.sel ? Math.max(0.92, fade) : fade);
        n.style.zIndex = c.sel ? '6' : String(Math.max(1, 200 - Math.round(c.dist)));
      }
      n.style.pointerEvents = parseFloat(n.style.opacity) > 0.08 ? 'auto' : 'none';
    }

    for (const [key, n] of this.pool) {
      if (!seen.has(key)) { n.style.opacity = '0'; n.style.pointerEvents = 'none'; }
    }
  }
}
