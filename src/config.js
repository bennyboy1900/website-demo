/** Globale Konstanten und die Kartenprojektion. */

/** Mittelpunkt der Projektion (etwa die geografische Mitte Deutschlands). */
export const ORIGIN = { lon: 10.45, lat: 51.16 };

/** Weltengrößen pro Breitengrad. 1 Einheit ≈ 7 km. */
export const SCALE = 16;

const COS0 = Math.cos((ORIGIN.lat * Math.PI) / 180);

/** Geokoordinate → Bühnenkoordinate (x, z). */
export function project(lon, lat) {
  return [(lon - ORIGIN.lon) * COS0 * SCALE, -(lat - ORIGIN.lat) * SCALE];
}

/** Bühnenkoordinate → Geokoordinate. */
export function unproject(x, z) {
  return [x / (COS0 * SCALE) + ORIGIN.lon, -z / SCALE + ORIGIN.lat];
}

/** Dicke der Landmasse (Extrusion der Bundesländer). */
export const PLATE_H = 1.15;

/** Kamera-Voreinstellungen. */
export const VIEW = {
  overview:  { dist: 156, polar: 0.62, azim: 0.0 },
  region:    { dist: 62,  polar: 0.78, azim: 0.35 },
  city:      { dist: 46,  polar: 0.86, azim: 0.5 },
  landmark:  { dist: 13,  polar: 1.06, azim: 0.6 },
  minDist: 4,
  maxDist: 320,
};

/** Ab wann eine Stadtgruppe aufklappt (Kameradistanz zum Gruppenmittelpunkt). */
export const CLUSTER = {
  start: 118,   // beginnt sich zu öffnen
  end: 42,      // vollständig geöffnet
  minCount: 3,  // ab dieser Größe wird eingeklappt
};

export const QUALITY = {
  low:    { pixelRatio: 1.0,  shadow: 0,    rain: 2600,  bloom: true,  aa: false, clouds: 10 },
  medium: { pixelRatio: 1.5,  shadow: 2048, rain: 7000,  bloom: true,  aa: true,  clouds: 18 },
  high:   { pixelRatio: 2.0,  shadow: 4096, rain: 14000, bloom: true,  aa: true,  clouds: 28 },
};

/** Voreinstellungen des Einstellungsdialogs. */
export const DEFAULTS = {
  timeOfDay: 16.6,      // Stunden (0–24)
  autoTime: false,
  timeSpeed: 1.0,
  weather: 'klar',      // klar | wolkig | regen | gewitter | schnee | nebel
  intensity: 0.6,
  wind: 0.35,
  fog: 0.38,
  bloom: 0.55,
  grain: 0.22,
  vignette: 0.72,
  chroma: 0.3,
  saturation: 1.06,
  cinema: false,
  autoOrbit: false,
  orbitSpeed: 0.35,
  labels: true,
  stateFill: true,
  rivers: true,
  grid: true,
  quality: 'medium',
  fov: 42,
};
