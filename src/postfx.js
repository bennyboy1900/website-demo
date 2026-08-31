/** Nachbearbeitung: Bloom, Vignette, Filmkorn, leichte Farbverschiebung. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.22 },
    uVignette: { value: 0.85 },
    uChroma: { value: 0.3 },
    uSaturation: { value: 1.06 },
    uFlash: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uChroma, uSaturation, uFlash;
    uniform vec3 uTint;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // leichte chromatische Aberration zum Rand hin
      float k = uChroma * 0.0032 * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * k).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * k).b;

      // Sättigung
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col *= uTint;

      // Blitz
      col += vec3(0.82, 0.88, 1.0) * uFlash;

      // Vignette
      float vig = 1.0 - uVignette * smoothstep(0.16, 0.78, r2);
      col *= vig;

      // Filmkorn
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * 0.09;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createComposer(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.75, 0.82,
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass());
  void quality;
  return { composer, bloom, grade };
}
