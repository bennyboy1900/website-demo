/**
 * Himmel, Licht, Tageszeit und Wetter.
 * Alles läuft über prozedurale Shader und Canvas-Texturen – keine Assets.
 */
import * as THREE from 'three';
import { clamp, lerp, smoothstep, damp, rng, dotTexture, streakTexture, cloudTexture, glowTexture } from './util.js';
import { NIGHT_MATERIALS, WET_MATERIALS } from './models.js';

/* Farbstimmungen über den Sonnenstand s = sin(Höhenwinkel). */
const STOPS = [
  { s: -1.00, zen: '#03060d', hor: '#0b1424', sun: '#6a8ab8', fog: '#0a1120', amb: '#2b3d5e', sunI: 0.05, ambI: 0.52, hemI: 0.40 },
  { s: -0.28, zen: '#060c1a', hor: '#16233c', sun: '#8aa2cc', fog: '#0e1729', amb: '#2f4267', sunI: 0.10, ambI: 0.56, hemI: 0.44 },
  { s: -0.09, zen: '#12203c', hor: '#3a5484', sun: '#c58a86', fog: '#1c2a45', amb: '#3a4f78', sunI: 0.22, ambI: 0.58, hemI: 0.50 },
  { s: -0.02, zen: '#25375c', hor: '#7d6b83', sun: '#e08c62', fog: '#3a3f57', amb: '#455872', sunI: 0.55, ambI: 0.46, hemI: 0.48 },
  { s:  0.05, zen: '#3a5a86', hor: '#e0a071', sun: '#ff9c4d', fog: '#7c7a80', amb: '#6b7590', sunI: 1.35, ambI: 0.52, hemI: 0.62 },
  { s:  0.16, zen: '#3f74ac', hor: '#f0c295', sun: '#ffc177', fog: '#a9adae', amb: '#8896a8', sunI: 2.10, ambI: 0.60, hemI: 0.78 },
  { s:  0.42, zen: '#3078bd', hor: '#c3dcea', sun: '#ffe9c8', fog: '#c9d5dc', amb: '#a8bccb', sunI: 2.75, ambI: 0.68, hemI: 0.95 },
  { s:  1.00, zen: '#2469b8', hor: '#cfe3ef', sun: '#fff6e6', fog: '#d5e0e6', amb: '#b6c9d6', sunI: 3.00, ambI: 0.72, hemI: 1.05 },
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function pickStop(s) {
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].s < s) i++;
  const a = STOPS[i], b = STOPS[i + 1];
  const t = clamp((s - a.s) / (b.s - a.s || 1), 0, 1);
  const mix = (ka) => tmpA.set(a[ka]).lerp(tmpB.set(b[ka]), t).clone();
  return {
    zen: mix('zen'), hor: mix('hor'), sun: mix('sun'), fog: mix('fog'), amb: mix('amb'),
    sunI: lerp(a.sunI, b.sunI, t), ambI: lerp(a.ambI, b.ambI, t), hemI: lerp(a.hemI, b.hemI, t),
  };
}

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const SKY_FRAG = /* glsl */`
  uniform vec3 uZenith, uHorizon, uSunCol, uGround;
  uniform vec3 uSunDir, uMoonDir;
  uniform float uSunGlow, uNight, uHaze, uMoon;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float t = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.85);
    float band = smoothstep(0.0, 0.34 + uHaze * 0.4, max(h, 0.0));
    vec3 col = mix(uHorizon, uZenith, band);
    col = mix(uGround, col, smoothstep(-0.12, 0.02, h));

    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunCol * pow(sd, 8.0) * 0.35 * uSunGlow;
    col += uSunCol * pow(sd, 320.0) * 2.2 * uSunGlow;
    float disc = smoothstep(0.9986, 0.9992, sd);
    col += uSunCol * disc * 4.0 * uSunGlow;

    float md = max(dot(d, normalize(uMoonDir)), 0.0);
    col += vec3(0.72, 0.78, 0.95) * pow(md, 90.0) * 0.5 * uMoon;
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.9993, 0.99965, md) * 2.2 * uMoon;

    col *= 1.0 - uNight * 0.06;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Punktmaterial für Niederschlag mit gedeckelter Bildschirmgröße. */
function dropMaterial(map, color, size, maxPx, blending) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map }, uOpacity: { value: 0 },
      uSize: { value: size }, uMax: { value: maxPx },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true, depthWrite: false, blending,
    vertexShader: /* glsl */`
      uniform float uSize, uMax;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(uSize / max(0.4, -mv.z), 1.0, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uOpacity; uniform vec3 uColor;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a < 0.01) discard;
        gl_FragColor = vec4(uColor, t.a * uOpacity);
      }`,
  });
}

function texFrom(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.sunDir = new THREE.Vector3(0, 1, 0.3);
    this.moonDir = new THREE.Vector3(0, -1, -0.3);
    this.nightFactor = 0;
    this.wet = 0;
    this.flash = 0;
    this._nextBolt = 4 + Math.random() * 6;
    this.onFlash = null;
    this.horizonColor = new THREE.Color('#c9d5dc');

    this._buildSky();
    this._buildLights();
    this._buildStars();
    this._buildClouds(quality.clouds);
    this._buildPrecipitation(quality.rain);
    this._buildGroundFog();

    scene.fog = new THREE.FogExp2(0x9fb0bb, 0.0016);
  }

  /* ── Himmelskuppel ── */
  _buildSky() {
    this.skyUniforms = {
      uZenith: { value: new THREE.Color('#2469b8') },
      uHorizon: { value: new THREE.Color('#cfe3ef') },
      uGround: { value: new THREE.Color('#0d1620') },
      uSunCol: { value: new THREE.Color('#fff6e6') },
      uSunDir: { value: this.sunDir },
      uMoonDir: { value: this.moonDir },
      uSunGlow: { value: 1 },
      uMoon: { value: 0 },
      uNight: { value: 0 },
      uHaze: { value: 0.2 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  /* ── Lichter ── */
  _buildLights() {
    this.key = new THREE.DirectionalLight(0xfff4e2, 3);
    this.key.castShadow = this.quality.shadow > 0;
    if (this.key.castShadow) {
      this.key.shadow.mapSize.set(this.quality.shadow, this.quality.shadow);
      this.key.shadow.camera.near = 1;
      this.key.shadow.camera.far = 600;
      this.key.shadow.bias = -0.0006;
      this.key.shadow.normalBias = 0.035;
    }
    this.key.target.position.set(0, 0, 0);
    this.scene.add(this.key, this.key.target);

    this.hemi = new THREE.HemisphereLight(0xbcd6e8, 0x59564b, 1);
    this.scene.add(this.hemi);

    this.amb = new THREE.AmbientLight(0x8aa0b6, 0.6);
    this.scene.add(this.amb);

    // Zusätzliches Blitzlicht bei Gewitter
    this.bolt = new THREE.DirectionalLight(0xdfeaff, 0);
    this.bolt.position.set(40, 120, -60);
    this.scene.add(this.bolt);

    // Warmes Gegenlicht für plastischere Silhouetten
    this.rim = new THREE.DirectionalLight(0xffd9a8, 0.25);
    this.rim.position.set(-90, 40, -90);
    this.scene.add(this.rim);
  }

  /* ── Sterne ── */
  _buildStars() {
    const n = 1500;
    const pos = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const rand = rng(20240);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = Math.abs(u) * 0.98 + 0.02;
      pos[i * 3] = Math.cos(a) * r * 480;
      pos[i * 3 + 1] = y * 480;
      pos[i * 3 + 2] = Math.sin(a) * r * 480;
      sizes[i] = 1 + rand() * 2.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uMap: { value: texFrom(dotTexture(48, 0.35)) } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSize; varying float vS;
        void main() {
          vS = aSize;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 2.4;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity; uniform sampler2D uMap; varying float vS;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vec3(1.0, 0.98, 0.94), t.a * uOpacity * (0.4 + vS * 0.24));
        }`,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -900;
    this.scene.add(this.stars);

    // Sonnen- und Mondscheibe als weicher Schein
    const glow = texFrom(glowTexture(160, 0.14));
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffe6bd, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, opacity: 0.8,
    }));
    this.sunSprite.scale.setScalar(90);
    this.sunSprite.renderOrder = -890;
    this.scene.add(this.sunSprite);
  }

  /* ── Wolken ── */
  _buildClouds(count) {
    this.cloudGroup = new THREE.Group();
    this.cloudGroup.renderOrder = -800;
    const texA = texFrom(cloudTexture(256, 11));
    const texB = texFrom(cloudTexture(256, 47));
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: texA, transparent: true, opacity: 0.0, depthWrite: false,
      color: new THREE.Color('#ffffff'), side: THREE.DoubleSide, toneMapped: true,
    });
    this.cloudMat2 = this.cloudMat.clone();
    this.cloudMat2.map = texB;
    const rand = rng(777);
    this.clouds = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), i % 2 ? this.cloudMat : this.cloudMat2);
      const s = 90 + rand() * 180;
      m.scale.set(s, s * (0.45 + rand() * 0.3), 1);
      m.position.set((rand() - 0.5) * 620, 58 + rand() * 62, (rand() - 0.5) * 620);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rand() * Math.PI;
      m.userData.speed = 0.4 + rand() * 0.9;
      this.clouds.push(m);
      this.cloudGroup.add(m);
    }
    this.scene.add(this.cloudGroup);
  }

  /* ── Niederschlag ── */
  _buildPrecipitation(count) {
    this.rainCount = count;
    this.rainScale = 1;
    this.rainArea = { x: 150, y: 90, z: 150 };
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    const rand = rng(31337);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * this.rainArea.x;
      pos[i * 3 + 1] = rand() * this.rainArea.y;
      pos[i * 3 + 2] = (rand() - 0.5) * this.rainArea.z;
      spd[i] = 0.6 + rand() * 0.8;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainSpeeds = spd;
    this.rainMat = dropMaterial(texFrom(streakTexture(16, 128)), '#d7e8f5', 300, 54, THREE.AdditiveBlending);
    this.rain = new THREE.Points(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);

    const sg = g.clone();
    this.snowMat = dropMaterial(texFrom(dotTexture(48, 0.4)), '#ffffff', 110, 22, THREE.NormalBlending);
    this.snow = new THREE.Points(sg, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);
  }

  /* ── Bodennebel ── */
  _buildGroundFog() {
    this.fogGroup = new THREE.Group();
    this.fogMat = new THREE.MeshBasicMaterial({
      map: texFrom(cloudTexture(256, 5)), transparent: true, opacity: 0,
      depthWrite: false, color: new THREE.Color('#e9eef2'), side: THREE.DoubleSide,
    });
    const rand = rng(99);
    this.fogPlanes = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.fogMat);
      const s = 120 + rand() * 160;
      m.scale.set(s, s * 0.8, 1);
      m.position.set((rand() - 0.5) * 260, 1.6 + rand() * 3.4, (rand() - 0.5) * 260);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rand() * Math.PI;
      m.userData.speed = 0.15 + rand() * 0.3;
      this.fogPlanes.push(m);
      this.fogGroup.add(m);
    }
    this.scene.add(this.fogGroup);
  }

  /** Sonnenrichtung aus der Tageszeit. */
  _solar(hours) {
    const ang = ((hours - 12) / 24) * Math.PI * 2;
    const elev = Math.sin(((hours - 6) / 12) * Math.PI) * 1.02;
    const e = clamp(elev, -1, 1);
    const sinE = Math.sin(e * 1.05);
    const cosE = Math.max(0.06, Math.cos(e * 1.05));
    this.sunDir.set(-Math.sin(ang) * cosE, sinE, Math.cos(ang) * cosE).normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1);
    return sinE;
  }

  /**
   * Aktualisiert Himmel, Licht und Wetter.
   * @param {number} dt Sekunden
   * @param {object} S Einstellungen
   * @param {THREE.Camera} cam
   * @param {THREE.Vector3} focus Punkt, auf den sich Schatten und Regen beziehen
   */
  update(dt, S, cam, focus) {
    const s = this._solar(S.timeOfDay);
    const stop = pickStop(s);

    /* Wetterabhängige Korrekturen */
    const w = S.weather;
    const inten = clamp(S.intensity, 0, 1);
    const overcast = w === 'wolkig' ? 0.45 * inten
      : w === 'regen' ? 0.8 * inten
      : w === 'gewitter' ? 0.95 * inten
      : w === 'schnee' ? 0.7 * inten
      : w === 'nebel' ? 0.65 * inten : 0;
    const gray = new THREE.Color(0x8b959d).lerp(new THREE.Color(0x2b3138), clamp(-s + 0.3, 0, 1));

    const zen = stop.zen.clone().lerp(gray, overcast * 0.75);
    const hor = stop.hor.clone().lerp(gray, overcast * 0.6);
    const fogC = stop.fog.clone().lerp(gray, overcast * 0.7);

    this.skyUniforms.uZenith.value.copy(zen);
    this.skyUniforms.uHorizon.value.copy(hor);
    this.skyUniforms.uSunCol.value.copy(stop.sun);
    this.skyUniforms.uGround.value.copy(fogC).multiplyScalar(0.35);
    this.skyUniforms.uSunGlow.value = clamp(1 - overcast * 0.9, 0.08, 1);
    this.skyUniforms.uHaze.value = 0.15 + S.fog * 0.5 + overcast * 0.35;
    this.horizonColor.copy(hor);

    this.nightFactor = smoothstep(0.06, -0.16, s);
    this.skyUniforms.uNight.value = this.nightFactor;
    this.skyUniforms.uMoon.value = this.nightFactor * (1 - overcast * 0.8);
    this.starMat.uniforms.uOpacity.value = this.nightFactor * (1 - overcast) * 0.95;

    /* Licht */
    const above = s > -0.02;
    const dir = above ? this.sunDir : this.moonDir;
    const R = 190;
    const cx = focus ? focus.x : 0, cz = focus ? focus.z : 0;
    this.key.position.set(cx + dir.x * R, dir.y * R + 6, cz + dir.z * R);
    this.key.target.position.set(cx, 0, cz);
    this.key.target.updateMatrixWorld();
    this.key.color.copy(above ? stop.sun : new THREE.Color('#9fb4dd'));
    this.key.intensity = (above ? stop.sunI : 0.5) * (1 - overcast * 0.72);

    if (this.key.castShadow) {
      const dist = cam.position.distanceTo(focus || new THREE.Vector3());
      const size = clamp(dist * 0.62, 14, 190);
      const c = this.key.shadow.camera;
      if (Math.abs(c.right - size) > 0.5) {
        c.left = -size; c.right = size; c.top = size; c.bottom = -size;
        c.far = R * 2.4;
        c.updateProjectionMatrix();
      }
    }

    this.hemi.intensity = stop.hemI * (1 - overcast * 0.25) + overcast * 0.28;
    this.hemi.color.copy(hor);
    this.hemi.groundColor.copy(fogC).multiplyScalar(0.5);
    this.amb.intensity = stop.ambI * (0.85 + overcast * 0.5);
    this.amb.color.copy(stop.amb);
    this.rim.intensity = 0.18 * (1 - this.nightFactor * 0.5) * (1 - overcast * 0.5);

    /* Nebel */
    const base = 0.00035 + S.fog * 0.0022;
    const wf = w === 'nebel' ? 1 + inten * 5.5 : w === 'regen' ? 1 + inten * 1.4
      : w === 'gewitter' ? 1 + inten * 1.8 : w === 'schnee' ? 1 + inten * 1.6 : 1;
    this.scene.fog.density = base * wf;
    this.scene.fog.color.copy(fogC);

    /* Fensterlicht & Nassglanz */
    const lit = clamp(this.nightFactor * 1.15 + overcast * 0.28, 0, 1.25);
    for (const m of NIGHT_MATERIALS) m.emissiveIntensity = lit * (m.userData.nightScale ?? 0.92);
    const targetWet = (w === 'regen' || w === 'gewitter') ? inten : 0;
    this.wet = damp(this.wet, targetWet, 1.2, dt);
    for (const m of WET_MATERIALS) {
      const b = m.userData.baseRough ?? m.roughness;
      m.roughness = b * (1 - 0.72 * this.wet);
    }

    /* Sonnenscheibe */
    this.sunSprite.position.copy(above ? this.sunDir : this.moonDir).multiplyScalar(430).add(cam.position);
    this.sunSprite.material.opacity = (above ? 0.75 : 0.4) * (1 - overcast * 0.85);
    this.sunSprite.material.color.copy(above ? stop.sun : new THREE.Color('#cfd9f2'));
    this.sunSprite.scale.setScalar(above ? 110 : 55);

    /* Himmel & Sterne folgen der Kamera */
    this.sky.position.copy(cam.position);
    this.sky.scale.setScalar(Math.max(400, cam.position.length() * 0.6 + 400));
    this.stars.position.copy(cam.position);
    this.stars.rotation.y += dt * 0.004;

    /* Wolken */
    const cloudy = clamp(overcast * 1.25 + (w === 'klar' ? 0.1 : 0.25), 0, 1);
    const cloudTint = hor.clone().lerp(new THREE.Color(0xffffff), 0.35 * (1 - this.nightFactor));
    for (const cm of [this.cloudMat, this.cloudMat2]) {
      cm.opacity = damp(cm.opacity, 0.1 + cloudy * 0.55, 1.5, dt);
      cm.color.copy(cloudTint);
    }
    const windX = S.wind * 12;
    for (const c of this.clouds) {
      c.position.x += windX * c.userData.speed * dt;
      if (c.position.x > 340) c.position.x -= 680;
      if (c.position.x < -340) c.position.x += 680;
    }
    this.cloudGroup.position.set(cx, 0, cz);

    /* Bodennebel */
    const gf = w === 'nebel' ? inten : (S.fog > 0.7 ? (S.fog - 0.7) * 1.6 : 0);
    this.fogMat.opacity = damp(this.fogMat.opacity, gf * 0.34, 1.6, dt);
    this.fogMat.color.copy(fogC).lerp(new THREE.Color(0xffffff), 0.55);
    this.fogGroup.visible = this.fogMat.opacity > 0.005;
    for (const p of this.fogPlanes) {
      p.position.x += windX * 0.25 * p.userData.speed * dt;
      if (p.position.x > 150) p.position.x -= 300;
      if (p.position.x < -150) p.position.x += 300;
    }
    this.fogGroup.position.set(cx, 0, cz);

    /* Regen & Schnee */
    const raining = w === 'regen' || w === 'gewitter';
    const snowing = w === 'schnee';
    this.rain.visible = raining;
    this.snow.visible = snowing;
    this.rainMat.uniforms.uOpacity.value = raining ? 0.34 + inten * 0.5 : 0;
    this.snowMat.uniforms.uOpacity.value = snowing ? 0.5 + inten * 0.45 : 0;
    if (raining) this._fall(this.rain, dt, (28 + inten * 46), S.wind * 10, false, cx, cz, inten);
    if (snowing) this._fall(this.snow, dt, (2.2 + inten * 3), S.wind * 5, true, cx, cz, inten);

    /* Gewitter */
    this.flash = Math.max(0, this.flash - dt * 5.5);
    if (w === 'gewitter') {
      this._nextBolt -= dt * (0.5 + inten);
      if (this._nextBolt <= 0) {
        this._nextBolt = 2.5 + Math.random() * 7 * (1.2 - inten);
        this.flash = 1;
        if (this.onFlash) this.onFlash(0.55 + Math.random() * 0.45);
      }
    }
    this.bolt.intensity = this.flash * this.flash * 7;
  }

  _fall(points, dt, speed, wind, drift, cx, cz, inten) {
    const p = points.geometry.attributes.position.array;
    const A = this.rainArea;
    const count = Math.floor(this.rainCount * this.rainScale * (0.35 + inten * 0.65));
    const t = performance.now() * 0.001;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      p[k + 1] -= speed * this.rainSpeeds[i] * dt;
      p[k] += wind * this.rainSpeeds[i] * dt;
      if (drift) {
        p[k] += Math.sin(t * 1.4 + i) * 0.35 * dt * 8;
        p[k + 2] += Math.cos(t * 1.1 + i * 0.7) * 0.3 * dt * 8;
      }
      if (p[k + 1] < -2) { p[k + 1] = A.y; p[k] = (Math.random() - 0.5) * A.x; p[k + 2] = (Math.random() - 0.5) * A.z; }
      if (p[k] > A.x / 2) p[k] -= A.x;
      if (p[k] < -A.x / 2) p[k] += A.x;
    }
    points.geometry.setDrawRange(0, count);
    points.geometry.attributes.position.needsUpdate = true;
    points.position.set(cx, 0, cz);
  }

  setQuality(q) {
    this.quality = q;
    this.key.castShadow = q.shadow > 0;
    if (q.shadow > 0) {
      this.key.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    }
  }
}
