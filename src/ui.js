/** Alles, was aus HTML besteht: Panels, Steckbrief, Suche, Einstellungen, HUD. */
import { CATEGORIES, STATES, LANDMARKS, TOUR_ORDER } from './data/landmarks.js';
import { DEFAULTS } from './config.js';
import { formatTime, formatCoord, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'wahrzeichen-de-3d/v1';

/* ══════════════ Einstellungs-Schema ══════════════ */
const SCHEMA = [
  {
    title: 'Tageszeit',
    fields: [
      { type: 'seg', key: '_preset', label: 'Stimmung', options: [
        { v: 5.6, l: 'Dämmerung' }, { v: 8.5, l: 'Morgen' }, { v: 12.5, l: 'Mittag' },
        { v: 17.4, l: 'Goldene Stunde' }, { v: 20.4, l: 'Blaue Stunde' }, { v: 23.5, l: 'Nacht' },
      ] },
      { type: 'range', key: 'timeOfDay', label: 'Uhrzeit', min: 0, max: 24, step: 0.05,
        format: (v) => formatTime(v) },
      { type: 'toggle', key: 'autoTime', label: 'Zeit läuft weiter' },
      { type: 'range', key: 'timeSpeed', label: 'Tempo des Tageslaufs', min: 0.1, max: 8, step: 0.1,
        format: (v) => `${v.toFixed(1)}×`, dep: 'autoTime' },
    ],
  },
  {
    title: 'Wetter',
    fields: [
      { type: 'seg', key: 'weather', label: 'Lage', options: [
        { v: 'klar', l: 'Klar' }, { v: 'wolkig', l: 'Bewölkt' }, { v: 'regen', l: 'Regen' },
        { v: 'gewitter', l: 'Gewitter' }, { v: 'schnee', l: 'Schnee' }, { v: 'nebel', l: 'Nebel' },
      ] },
      { type: 'range', key: 'intensity', label: 'Intensität', min: 0, max: 1, step: 0.01,
        format: (v) => `${Math.round(v * 100)} %` },
      { type: 'range', key: 'wind', label: 'Wind', min: 0, max: 1, step: 0.01,
        format: (v) => `${Math.round(v * 100)} %` },
      { type: 'range', key: 'fog', label: 'Dunst & Ferne', min: 0, max: 1, step: 0.01,
        format: (v) => `${Math.round(v * 100)} %` },
    ],
  },
  {
    title: 'Bildlook',
    fields: [
      { type: 'range', key: 'bloom', label: 'Leuchten', min: 0, max: 1.6, step: 0.02,
        format: (v) => v.toFixed(2) },
      { type: 'range', key: 'vignette', label: 'Vignette', min: 0, max: 1.6, step: 0.02,
        format: (v) => v.toFixed(2) },
      { type: 'range', key: 'grain', label: 'Filmkorn', min: 0, max: 1, step: 0.01,
        format: (v) => `${Math.round(v * 100)} %` },
      { type: 'range', key: 'chroma', label: 'Farbsaum', min: 0, max: 1, step: 0.01,
        format: (v) => `${Math.round(v * 100)} %` },
      { type: 'range', key: 'saturation', label: 'Sättigung', min: 0.4, max: 1.6, step: 0.01,
        format: (v) => v.toFixed(2) },
      { type: 'toggle', key: 'cinema', label: 'Kinobalken' },
    ],
  },
  {
    title: 'Kamera',
    fields: [
      { type: 'range', key: 'fov', label: 'Blickwinkel', min: 25, max: 68, step: 1,
        format: (v) => `${v}°` },
      { type: 'toggle', key: 'autoOrbit', label: 'Sanftes Kreisen' },
      { type: 'range', key: 'orbitSpeed', label: 'Kreisgeschwindigkeit', min: 0.05, max: 2, step: 0.05,
        format: (v) => `${v.toFixed(2)}×`, dep: 'autoOrbit' },
    ],
  },
  {
    title: 'Karte',
    fields: [
      { type: 'toggle', key: 'labels', label: 'Beschriftungen' },
      { type: 'toggle', key: 'stateFill', label: 'Bundesländer einfärben' },
      { type: 'toggle', key: 'rivers', label: 'Flüsse' },
      { type: 'toggle', key: 'grid', label: 'Raster auf dem Meer' },
    ],
  },
  {
    title: 'Leistung',
    fields: [
      { type: 'seg', key: 'quality', label: 'Qualität', options: [
        { v: 'low', l: 'Niedrig' }, { v: 'medium', l: 'Mittel' }, { v: 'high', l: 'Hoch' },
      ] },
    ],
  },
];

/* ══════════════ Steckbrief-Kopfgrafik ══════════════ */
const SIL = {
  cathedral: (c, w, h) => { spireP(c, w * 0.36, h, 0.9); spireP(c, w * 0.64, h, 0.9); body(c, w * 0.5, h, 0.5, 0.44); },
  church: (c, w, h) => { spireP(c, w * 0.4, h, 0.92); body(c, w * 0.56, h, 0.42, 0.4); },
  domechurch: (c, w, h) => { domeP(c, w * 0.5, h, 0.6); body(c, w * 0.5, h, 0.44, 0.36); },
  palace: (c, w, h) => { body(c, w * 0.5, h, 0.72, 0.4); roofP(c, w * 0.5, h, 0.4, 0.72); },
  castle: (c, w, h) => { body(c, w * 0.5, h, 0.5, 0.42); spireP(c, w * 0.32, h, 0.66); spireP(c, w * 0.68, h, 0.72); },
  tower: (c, w, h) => { body(c, w * 0.5, h, 0.2, 0.82); },
  tvtower: (c, w, h) => { body(c, w * 0.5, h, 0.08, 0.92); circle(c, w * 0.5, h * 0.36, w * 0.07); },
  skyscraper: (c, w, h) => { body(c, w * 0.36, h, 0.16, 0.6); body(c, w * 0.56, h, 0.18, 0.86); body(c, w * 0.74, h, 0.14, 0.5); },
  bridge: (c, w, h) => { arcP(c, w, h); },
  mountain: (c, w, h) => { triangle(c, w * 0.5, h, 0.78, 0.86); },
  cliff: (c, w, h) => { body(c, w * 0.42, h, 0.34, 0.6); body(c, w * 0.66, h, 0.28, 0.44); },
  lake: (c, w, h) => { waveP(c, w, h); },
  statue: (c, w, h) => { body(c, w * 0.5, h, 0.18, 0.4); circle(c, w * 0.5, h * 0.42, w * 0.05); },
  gate: (c, w, h) => { for (let i = 0; i < 5; i++) body(c, w * (0.3 + i * 0.1), h, 0.035, 0.5); body(c, w * 0.5, h, 0.48, 0.62, 0.5); },
  stadium: (c, w, h) => { ellipse(c, w * 0.5, h * 0.62, w * 0.3, h * 0.16); },
  industrial: (c, w, h) => { body(c, w * 0.4, h, 0.3, 0.4); body(c, w * 0.62, h, 0.09, 0.78); },
  default: (c, w, h) => { body(c, w * 0.5, h, 0.42, 0.5); roofP(c, w * 0.5, h, 0.22, 0.5); },
};
function body(c, x, h, wRel, hRel, yBase = 1) {
  const w = c._W;
  c.fillRect(x - (w * wRel) / 2, h * yBase - h * hRel, w * wRel, h * hRel);
}
function roofP(c, x, h, hRel, wRel) {
  const w = c._W;
  c.beginPath();
  c.moveTo(x - (w * wRel) / 2, h - h * 0.4);
  c.lineTo(x, h - h * (0.4 + hRel));
  c.lineTo(x + (w * wRel) / 2, h - h * 0.4);
  c.closePath(); c.fill();
}
function spireP(c, x, h, hRel) {
  const w = c._W;
  c.fillRect(x - w * 0.035, h - h * hRel, w * 0.07, h * hRel);
  c.beginPath();
  c.moveTo(x - w * 0.045, h - h * hRel);
  c.lineTo(x, h - h * (hRel + 0.14));
  c.lineTo(x + w * 0.045, h - h * hRel);
  c.closePath(); c.fill();
}
function domeP(c, x, h, hRel) {
  c.beginPath();
  c.arc(x, h - h * hRel, c._W * 0.11, Math.PI, 0);
  c.closePath(); c.fill();
}
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function triangle(c, x, h, wRel, hRel) {
  const w = c._W;
  c.beginPath();
  c.moveTo(x - (w * wRel) / 2, h);
  c.lineTo(x, h - h * hRel);
  c.lineTo(x + (w * wRel) / 2, h);
  c.closePath(); c.fill();
}
function arcP(c, w, h) {
  c.fillRect(0, h * 0.56, w, h * 0.06);
  c.beginPath();
  c.arc(w * 0.5, h * 0.62, w * 0.26, Math.PI, 0);
  c.lineTo(w * 0.5 + w * 0.2, h * 0.62);
  c.arc(w * 0.5, h * 0.62, w * 0.2, 0, Math.PI, true);
  c.closePath(); c.fill();
}
function waveP(c, w, h) {
  c.beginPath();
  c.moveTo(0, h * 0.7);
  for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.7 + Math.sin(x * 0.05) * h * 0.05);
  c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
}

function drawHero(canvas, l) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 380, h = canvas.clientHeight || 168;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const col = CATEGORIES[l.cat]?.color || '#f2c078';
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#101822');
  g.addColorStop(0.55, shade(col, -0.62));
  g.addColorStop(1, shade(col, -0.28));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // Sonne / Mond
  c.fillStyle = 'rgba(255,255,255,.13)';
  c.beginPath(); c.arc(w * 0.78, h * 0.3, h * 0.17, 0, Math.PI * 2); c.fill();
  // Silhouette
  c.save();
  c.translate(0, h * 0.1);
  c.fillStyle = 'rgba(8,11,16,.72)';
  const draw = SIL[l.m?.t] || SIL.default;
  c._W = w;
  draw(c, w, h * 0.9);
  c.restore();
  // Horizontlinie
  c.fillStyle = 'rgba(255,255,255,.07)';
  c.fillRect(0, h - 1, w, 1);
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(clamp(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/* ══════════════ UI-Klasse ══════════════ */
export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.settings = this.load();
    this.filter = new Set();
    this.query = '';
    this.searchIdx = -1;
    this._toastT = 0;
    this._bind();
    this._syncLayout();
    this.renderSettings();
    this.renderChips();
    this.renderList();
  }

  /* ── Persistenz ── */
  load() {
    let s = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) s = { ...s, ...JSON.parse(raw) };
    } catch { /* Speicher nicht verfügbar – Voreinstellungen genügen */ }
    return s;
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.settings)); } catch { /* egal */ }
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
    this.h.onSetting?.(key, value, this.settings);
  }

  /* ── Ereignisse ── */
  _bind() {
    $('brandBtn').onclick = () => this.h.onOverview?.();
    $('edgePrev').onclick = () => this.h.onStep?.(-1);
    $('edgeNext').onclick = () => this.h.onStep?.(1);
    $('edgeUp').onclick = () => this.h.onOverview?.();
    $('edgeDown').onclick = () => this.h.onNextCity?.();
    $('tourBtn').onclick = () => this.h.onTour?.();
    $('fsBtn').onclick = () => this.toggleFullscreen();

    $('listBtn').onclick = () => this.togglePanel('list');
    $('setBtn').onclick = () => this.togglePanel('set');
    $('listClose').onclick = () => this.closePanel('list');
    $('setClose').onclick = () => this.closePanel('set');
    $('infoClose').onclick = () => this.closeInfo();

    const si = $('searchInput');
    si.addEventListener('input', () => { this.query = si.value.trim(); this.renderSearch(); this.renderList(); });
    si.addEventListener('focus', () => this.renderSearch());
    si.addEventListener('blur', () => setTimeout(() => $('searchResults').classList.remove('open'), 180));
    si.addEventListener('keydown', (e) => this.onSearchKey(e));

    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  onKey(e) {
    const typing = document.activeElement && /input|textarea/i.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); $('searchInput').focus(); return; }
    if (typing) return;
    switch (e.key) {
      case 'ArrowLeft':  this.h.onStep?.(-1); break;
      case 'ArrowRight': this.h.onStep?.(1); break;
      case 'ArrowUp':    this.h.onOverview?.(); break;
      case 'ArrowDown':  this.h.onNextCity?.(); break;
      case 'Escape':     this.closeInfo(); this.closePanel('list'); this.closePanel('set'); break;
      case 'l': case 'L': this.togglePanel('list'); break;
      case 'e': case 'E': this.togglePanel('set'); break;
      case 't': case 'T': this.h.onTour?.(); break;
      case 'f': case 'F': this.toggleFullscreen(); break;
      case 'c': case 'C': this.set('cinema', !this.settings.cinema); this.renderSettings(); break;
      default: break;
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  /* Randpfeile und Bildausschnitt an offene Panels anpassen. */
  _syncLayout() {
    const right = (document.getElementById('infoPanel').classList.contains('open') ? 1 : 0)
      + (document.getElementById('setPanel').classList.contains('open') ? 1 : 0);
    document.body.dataset.right = String(right);
    document.body.dataset.left = document.getElementById('listPanel').classList.contains('open') ? '1' : '0';
  }

  /* ── Panels ── */
  togglePanel(which) {
    const el = which === 'list' ? $('listPanel') : $('setPanel');
    const open = el.classList.contains('open');
    if (open) this.closePanel(which); else this.openPanel(which);
  }

  openPanel(which) {
    const el = which === 'list' ? $('listPanel') : $('setPanel');
    if (which === 'set') { this.closePanel('list'); $('setBtn').classList.add('on'); }
    else { this.closePanel('set'); $('listBtn').classList.add('on'); }
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    if (which === 'set') $('infoPanel').classList.add('shifted');
    this._syncLayout();
  }

  closePanel(which) {
    const el = which === 'list' ? $('listPanel') : $('setPanel');
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    (which === 'list' ? $('listBtn') : $('setBtn')).classList.remove('on');
    if (which === 'set') $('infoPanel').classList.remove('shifted');
    this._syncLayout();
  }

  closeInfo() {
    $('infoPanel').classList.remove('open');
    $('infoPanel').setAttribute('aria-hidden', 'true');
    this._syncLayout();
    this.h.onDeselect?.();
  }

  /* ── Suche ── */
  matches(q) {
    if (!q) return [];
    const n = q.toLowerCase();
    return LANDMARKS
      .map((l) => {
        const hay = `${l.n} ${l.alt || ''} ${l.city} ${STATES[l.state]} ${(l.tags || []).join(' ')}`.toLowerCase();
        const i = hay.indexOf(n);
        if (i < 0) return null;
        const startsName = l.n.toLowerCase().startsWith(n);
        return { l, score: (startsName ? -100 : 0) + i };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((r) => r.l);
  }

  renderSearch() {
    const box = $('searchResults');
    const res = this.matches(this.query);
    this.searchRes = res;
    this.searchIdx = -1;
    if (!this.query) { box.classList.remove('open'); box.innerHTML = ''; return; }
    box.innerHTML = res.length
      ? res.map((l, i) => `
        <button class="sres" data-i="${i}" data-id="${l.id}">
          <span class="sres__dot" style="background:${CATEGORIES[l.cat].color}"></span>
          <span class="sres__t">${l.n}</span>
          <span class="sres__s">${l.city}</span>
        </button>`).join('')
      : '<div class="sres__empty">Nichts gefunden</div>';
    box.classList.add('open');
    box.querySelectorAll('.sres').forEach((b) => {
      b.onmousedown = (e) => { e.preventDefault(); this.h.onSelect?.(b.dataset.id, true); box.classList.remove('open'); };
    });
  }

  onSearchKey(e) {
    const res = this.searchRes || [];
    if (e.key === 'Escape') { $('searchInput').blur(); return; }
    if (!res.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.searchIdx = clamp(this.searchIdx + (e.key === 'ArrowDown' ? 1 : -1), 0, res.length - 1);
      $('searchResults').querySelectorAll('.sres').forEach((b, i) => b.classList.toggle('active', i === this.searchIdx));
    } else if (e.key === 'Enter') {
      const l = res[Math.max(0, this.searchIdx)];
      if (l) { this.h.onSelect?.(l.id, true); $('searchInput').blur(); }
    }
  }

  /* ── Liste ── */
  renderChips() {
    const box = $('catChips');
    box.innerHTML = Object.entries(CATEGORIES).map(([k, v]) =>
      `<button class="chip" data-k="${k}"><i style="background:${v.color}"></i>${v.label}</button>`).join('');
    box.querySelectorAll('.chip').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k;
        if (this.filter.has(k)) this.filter.delete(k); else this.filter.add(k);
        b.classList.toggle('on', this.filter.has(k));
        this.renderList();
      };
    });
  }

  renderList() {
    const box = $('listBody');
    const q = this.query.toLowerCase();
    const items = LANDMARKS.filter((l) => {
      if (this.filter.size && !this.filter.has(l.cat)) return false;
      if (!q) return true;
      return `${l.n} ${l.alt || ''} ${l.city} ${STATES[l.state]}`.toLowerCase().includes(q);
    });
    const groups = new Map();
    for (const l of items) {
      if (!groups.has(l.city)) groups.set(l.city, []);
      groups.get(l.city).push(l);
    }
    const cities = [...groups.keys()].sort((a, b) =>
      (a === 'Münster' ? -1 : b === 'Münster' ? 1 : groups.get(b).length - groups.get(a).length || a.localeCompare(b, 'de')));
    box.innerHTML = cities.map((city) => `
      <div class="grp">${city} <em>· ${groups.get(city).length}</em></div>
      ${groups.get(city).map((l) => `
        <button class="row" data-id="${l.id}">
          <span class="row__dot" style="background:${CATEGORIES[l.cat].color}"></span>
          <span>
            <span class="row__t">${l.n}</span>
            <span class="row__s">${CATEGORIES[l.cat].label} · ${STATES[l.state]}</span>
          </span>
          <span class="row__h">${(l.f.height || '').split(',')[0].slice(0, 12)}</span>
        </button>`).join('')}
    `).join('') || '<div class="sres__empty">Keine Treffer</div>';
    box.querySelectorAll('.row').forEach((b) => {
      b.onclick = () => this.h.onSelect?.(b.dataset.id, true);
    });
    $('hudCount').textContent = `${items.length} Wahrzeichen`;
  }

  markActive(id) {
    document.querySelectorAll('#listBody .row').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  }

  /* ── Steckbrief ── */
  showInfo(l, neighbours) {
    const cat = CATEGORIES[l.cat];
    const cells = [
      ['Baujahr', l.f.built], ['Größe', l.f.height], ['Stil', l.f.style],
      ['Bauherr / Entwurf', l.f.arch], ['Nutzung heute', l.f.use], ['Besuch', l.f.visit],
    ].filter(([, v]) => v);

    $('infoBody').innerHTML = `
      <div class="sb__hero"><canvas id="sbHero"></canvas>
        <div class="sb__heroText">
          <div class="sb__cat"><i></i>${cat.label}${l.f.unesco ? ' · UNESCO' : ''}</div>
          <h2 class="sb__name">${l.n}</h2>
          ${l.alt ? `<p class="sb__alt">${l.alt}</p>` : ''}
        </div>
      </div>
      <div class="sb__body stagger">
        <div class="sb__where" style="animation-delay:.02s">
          <svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
          <b>${l.city}</b> · ${STATES[l.state]} <span style="opacity:.55">· ${formatCoord(l.lat, l.lon)}</span>
        </div>
        <div class="sb__grid" style="animation-delay:.06s">
          ${cells.map(([k, v]) => `<div class="sb__cell"><div class="sb__k">${k}</div><div class="sb__v">${v}</div></div>`).join('')}
        </div>
        <div style="animation-delay:.10s">
          <div class="sb__h">Über das Bauwerk</div>
          <p class="sb__p">${l.d}</p>
        </div>
        <div style="animation-delay:.14s">
          <div class="sb__h">Wusstest du?</div>
          <p class="sb__note">${l.t}</p>
        </div>
        ${l.tags?.length ? `<div class="sb__tags" style="animation-delay:.18s">${l.tags.map((t) => `<span class="sb__tag">${t}</span>`).join('')}</div>` : ''}
        <div class="sb__acts" style="animation-delay:.22s">
          <button class="sb__act" id="sbFly"><svg viewBox="0 0 24 24"><path d="M12 3l9 18-9-4-9 4z" fill="currentColor"/></svg>Hinfliegen</button>
          <button class="sb__act" id="sbCity"><svg viewBox="0 0 24 24"><path d="M4 20V9l5-3v14M13 20V4l7 4v12M4 20h16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>Stadt zeigen</button>
        </div>
        ${neighbours?.length ? `
        <div class="sb__nb" style="animation-delay:.26s">
          <div class="sb__nbT">Weitere in ${l.city}</div>
          ${neighbours.map((n) => `
            <button class="sb__nbRow" data-id="${n.id}">
              <i style="background:${CATEGORIES[n.cat].color}"></i>
              <span>${n.n}</span><em>${CATEGORIES[n.cat].label}</em>
            </button>`).join('')}
        </div>` : ''}
      </div>`;

    drawHero($('sbHero'), l);
    $('sbFly').onclick = () => this.h.onSelect?.(l.id, true);
    $('sbCity').onclick = () => this.h.onCity?.(l.city);
    $('infoBody').querySelectorAll('.sb__nbRow').forEach((b) => {
      b.onclick = () => this.h.onSelect?.(b.dataset.id, true);
    });

    const p = $('infoPanel');
    p.classList.add('open');
    p.setAttribute('aria-hidden', 'false');
    $('infoBody').scrollTop = 0;
    this._syncLayout();
    this.markActive(l.id);
  }

  /* ── Einstellungen ── */
  renderSettings() {
    const S = this.settings;
    const body = $('setBody');
    const html = ['<div class="set">'];
    for (const grp of SCHEMA) {
      html.push(`<div class="set__grp"><div class="set__gt">${grp.title}</div>`);
      for (const f of grp.fields) {
        if (f.dep && !S[f.dep]) continue;
        if (f.type === 'range') {
          html.push(`<div class="fld">
            <div class="fld__l"><span>${f.label}</span><span class="fld__v" data-v="${f.key}">${f.format ? f.format(S[f.key]) : S[f.key]}</span></div>
            <input type="range" data-k="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${S[f.key]}" />
          </div>`);
        } else if (f.type === 'seg') {
          html.push(`<div class="fld"><div class="fld__l"><span>${f.label}</span></div>
            <div class="seg">${f.options.map((o) => {
              const on = f.key === '_preset'
                ? Math.abs(S.timeOfDay - o.v) < 0.05
                : String(S[f.key]) === String(o.v);
              return `<button data-k="${f.key}" data-v="${o.v}" class="${on ? 'on' : ''}">${o.l}</button>`;
            }).join('')}</div></div>`);
        } else if (f.type === 'toggle') {
          html.push(`<button class="tog ${S[f.key] ? 'on' : ''}" data-k="${f.key}">
            <span>${f.label}</span><span class="tog__sw"></span></button>`);
        }
      }
      html.push('</div>');
    }
    html.push('<button class="set__reset" id="setReset">Auf Voreinstellungen zurücksetzen</button>');
    html.push(`<p class="set__hint" style="margin-top:16px">Tastatur: ← → Wahrzeichen · ↑ Übersicht · ↓ nächste Stadt · <b>/</b> Suche · <b>L</b> Liste · <b>E</b> Einstellungen · <b>T</b> Tour · <b>C</b> Kinobalken · <b>F</b> Vollbild</p>`);
    html.push('</div>');
    body.innerHTML = html.join('');

    body.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        const v = parseFloat(inp.value);
        this.set(k, v);
        const f = SCHEMA.flatMap((g) => g.fields).find((x) => x.key === k);
        const out = body.querySelector(`[data-v="${k}"]`);
        if (out) out.textContent = f?.format ? f.format(v) : v;
        if (k === 'timeOfDay') this.syncTimePreset();
      });
    });
    body.querySelectorAll('.seg button').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k;
        let v = b.dataset.v;
        if (k === '_preset') { this.set('timeOfDay', parseFloat(v)); this.renderSettings(); return; }
        if (!isNaN(parseFloat(v)) && String(parseFloat(v)) === v) v = parseFloat(v);
        this.set(k, v);
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      };
    });
    body.querySelectorAll('.tog').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k;
        const v = !this.settings[k];
        this.set(k, v);
        b.classList.toggle('on', v);
        if (k === 'autoTime' || k === 'autoOrbit') this.renderSettings();
      };
    });
    $('setReset').onclick = () => {
      this.settings = { ...DEFAULTS };
      this.save();
      this.renderSettings();
      for (const k of Object.keys(DEFAULTS)) this.h.onSetting?.(k, DEFAULTS[k], this.settings);
      this.toast('Einstellungen zurückgesetzt');
    };
  }

  /** Beim Weiterlaufen der Zeit den Regler nachführen, ohne alles neu zu bauen. */
  syncTime(v) {
    const inp = $('setBody')?.querySelector('input[data-k="timeOfDay"]');
    if (inp && document.activeElement !== inp) inp.value = String(v);
    const out = $('setBody')?.querySelector('[data-v="timeOfDay"]');
    if (out) out.textContent = formatTime(v);
    this.syncTimePreset();
  }

  syncTimePreset() {
    const S = this.settings;
    $('setBody')?.querySelectorAll('.seg button[data-k="_preset"]').forEach((b) => {
      b.classList.toggle('on', Math.abs(S.timeOfDay - parseFloat(b.dataset.v)) < 0.05);
    });
  }

  /* ── HUD ── */
  setPlace(text) { $('hudPlace').textContent = text; }

  setEdges(prev, next, city) {
    $('edgePrevLabel').textContent = prev || 'Zurück';
    $('edgeNextLabel').textContent = next || 'Weiter';
    $('edgeDownLabel').textContent = city ? `Nach ${city}` : 'Nächste Stadt';
  }

  setWeatherHud(t, w) {
    $('hudTime').textContent = formatTime(t);
    const names = { klar: 'Klar', wolkig: 'Bewölkt', regen: 'Regen', gewitter: 'Gewitter', schnee: 'Schnee', nebel: 'Nebel' };
    $('hudWeather').textContent = names[w] || w;
  }

  setFps(v) { $('hudFps').textContent = `${v} fps`; }

  ticker(text) {
    const el = $('hudTicker');
    el.textContent = text || '';
    el.classList.toggle('show', !!text);
  }

  toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  get tourOrder() { return TOUR_ORDER; }
}
