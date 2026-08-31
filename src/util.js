/** Kleine Helfer: Mathematik, Farben, prozedurale Texturen. */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

/** Zeitunabhängige Annäherung (frame-rate-sicher). */
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

/** Deterministischer Zufall, damit Modelle bei jedem Laden gleich aussehen. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ────────────────── Prozedurale Texturen ────────────────── */

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Weiche runde Punkt-Textur (Sterne, Schnee, Leuchtpunkte). */
export function dotTexture(size = 64, softness = 0.55) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(softness, 'rgba(255,255,255,0.42)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Senkrechter Regenstrich mit weichen Enden. */
export function streakTexture(w = 16, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0.0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.85, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(w * 0.35, 0, w * 0.3, h);
  g.filter = 'blur(1.5px)';
  g.drawImage(c, 0, 0);
  return c;
}

/** Wolkiges Rauschen für Wolken, Bodennebel und Dunst. */
export function cloudTexture(size = 256, seed = 7, contrast = 1.0) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const rand = rng(seed);
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const r = size * (0.06 + rand() * 0.24);
    const x = rand() * size;
    const y = size * (0.22 + rand() * 0.56);
    const a = 0.05 + rand() * 0.12;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Ränder ausblenden, damit sich Ebenen nahtlos überlagern
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, size, size);
  if (contrast !== 1) {
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}

/** Radialer Schein für Sonne und Mond. */
export function glowTexture(size = 128, core = 0.12) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(core, 'rgba(255,255,255,0.95)');
  grd.addColorStop(core + 0.1, 'rgba(255,255,255,0.35)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.06)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Formatiert eine Dezimalstunde als HH:MM. */
export function formatTime(h) {
  const hh = Math.floor(((h % 24) + 24) % 24);
  const mm = Math.floor((((h % 1) + 1) % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Grad → Grad-Minuten-Notation für den Steckbrief. */
export function formatCoord(lat, lon) {
  const f = (v, pos, neg) => {
    const d = Math.floor(Math.abs(v));
    const m = (Math.abs(v) - d) * 60;
    return `${d}° ${m.toFixed(2)}′ ${v >= 0 ? pos : neg}`;
  };
  return `${f(lat, 'N', 'S')} · ${f(lon, 'O', 'W')}`;
}
