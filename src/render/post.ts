/**
 * Post-traitement : RenderPass (fond transparent) → bloom discret (reflets dorés, émissifs) →
 * OutputPass (ACES + sRGB) → finition en espace d'affichage (fond dégradé du biome composé sous
 * l'image, chaleur, saturation, contraste, lift/gain, vignette, teinte d'urgence) → FXAA / SMAA.
 * En qualité basse : rendu direct (fond = scene.background), teinte d'urgence par calque CSS.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { Settings } from '../types';
import type { BiomeStyle } from './biomes';

const FinishShader = {
  name: 'DuchesseFinish',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tBackdrop: { value: null as THREE.Texture | null },
    uWarmth: { value: 0 },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.2 },
    uRush: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBackdrop;
    uniform float uWarmth;
    uniform float uSat;
    uniform float uContrast;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uVignette;
    uniform float uRush;
    uniform float uFlash;
    uniform float uTime;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      // le fond (texture sRGB lue en linéaire) est ramené en espace d'affichage
      vec3 bg = texture2D(tBackdrop, vUv).rgb;
      bg = mix(bg * 12.92, 1.055 * pow(max(bg, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, bg));
      // image prémultipliée par l'alpha (fond transparent) composée sur le dégradé
      vec3 c = src.rgb + bg * (1.0 - clamp(src.a, 0.0, 1.0));
      // balance des blancs
      c *= vec3(1.0 + uWarmth * 0.035, 1.0 + uWarmth * 0.006, 1.0 - uWarmth * 0.045);
      // lift / gain
      c = c * uGain + uLift * (1.0 - c);
      // saturation
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      // contraste doux autour du gris moyen
      c = (c - 0.5) * uContrast + 0.5;
      // urgence : teinte rose chaud + vignette pulsée
      vec2 p = vUv - 0.5;
      p.x *= uAspect;
      float r = length(p);
      float pulse = 0.5 + 0.5 * sin(uTime * 5.5);
      float v = smoothstep(0.35, 1.05, r);
      c = mix(c, c * vec3(1.05, 0.92, 0.92) + vec3(0.03, 0.0, 0.01), uRush * 0.55);
      c *= 1.0 - v * (uVignette + uRush * (0.16 + 0.2 * pulse));
      c += vec3(0.32, 0.04, 0.09) * smoothstep(0.5, 1.1, r) * uRush * (0.3 + 0.4 * pulse);
      // flash photo : voile blanc bref
      c = mix(c, vec3(1.0, 0.99, 0.96), clamp(uFlash, 0.0, 1.0) * (1.0 - 0.4 * r));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

const RUSH_BG = 'radial-gradient(ellipse at center, rgba(255,140,150,0) 45%, rgba(190,50,80,0.5) 100%)';

export class PostPipeline {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private finish: ShaderPass | null = null;
  private quality: Settings['quality'] = 'high';
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private gradeParams: BiomeStyle['grade'] | null = null;
  private bloomParams: BiomeStyle['bloom'] = { strength: 0.3, threshold: 1.2, radius: 0.5 };
  private backdrop: THREE.Texture | null = null;
  rush = 0;
  /** Voile blanc du flash photo (0..1, décroît côté GameRenderer). */
  flash = 0;
  /** Calque CSS de secours pour la teinte d'urgence (qualité basse). */
  private overlay: HTMLDivElement;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    container: HTMLElement,
  ) {
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      opacity: '0',
      background: RUSH_BG,
    } satisfies Partial<CSSStyleDeclaration>);
    container.appendChild(this.overlay);
  }

  get enabled(): boolean {
    return this.composer !== null;
  }

  setQuality(q: Settings['quality']): void {
    this.quality = q;
    this.rebuild();
  }

  setStyle(style: BiomeStyle, backdrop: THREE.Texture): void {
    this.gradeParams = style.grade;
    this.bloomParams = style.bloom;
    this.backdrop = backdrop;
    this.applyParams();
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.width = w;
    this.height = h;
    this.pixelRatio = pixelRatio;
    if (this.composer) {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(w, h);
    }
    if (this.finish) this.finish.uniforms.uAspect.value = w / Math.max(1, h);
  }

  private rebuild(): void {
    this.disposeComposer();
    if (this.quality === 'low') {
      this.applyParams();
      return;
    }
    const high = this.quality === 'high';
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(this.pixelRatio);
    composer.setSize(this.width, this.height);
    composer.addPass(new RenderPass(this.scene, this.camera, undefined, new THREE.Color(0, 0, 0), 0));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width / 2, this.height / 2), 0.3, 0.5, 1.2);
    // ajoute le halo à la couleur sans toucher à l'alpha (le fond reste transparent)
    const bm = this.bloom.blendMaterial;
    bm.blending = THREE.CustomBlending;
    bm.blendEquation = THREE.AddEquation;
    bm.blendSrc = THREE.OneFactor;
    bm.blendDst = THREE.OneFactor;
    bm.blendSrcAlpha = THREE.ZeroFactor;
    bm.blendDstAlpha = THREE.OneFactor;
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.finish.uniforms.uAspect.value = this.width / Math.max(1, this.height);
    composer.addPass(this.finish);
    composer.addPass(high ? new SMAAPass() : new FXAAPass());
    this.composer = composer;
    this.applyParams();
  }

  private applyParams(): void {
    // fond : composé en finition (composer) ou dessiné par la scène (rendu direct)
    this.scene.background = this.composer ? null : this.backdrop;
    if (this.bloom) {
      this.bloom.strength = this.bloomParams.strength;
      this.bloom.threshold = this.bloomParams.threshold;
      this.bloom.radius = this.bloomParams.radius;
    }
    const g = this.gradeParams;
    if (this.finish) {
      const u = this.finish.uniforms;
      u.tBackdrop.value = this.backdrop;
      if (g) {
        u.uWarmth.value = g.warmth;
        u.uSat.value = g.saturation;
        u.uContrast.value = g.contrast;
        (u.uLift.value as THREE.Vector3).set(...g.lift);
        (u.uGain.value as THREE.Vector3).set(...g.gain);
        u.uVignette.value = g.vignette;
      }
    }
  }

  render(dt: number, time: number): void {
    void dt;
    const rush = Math.max(0, Math.min(1, this.rush));
    if (this.composer && this.finish) {
      this.finish.uniforms.uRush.value = rush;
      this.finish.uniforms.uFlash.value = this.flash;
      this.finish.uniforms.uTime.value = time;
      this.overlay.style.opacity = '0';
      this.composer.render();
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      const pulse = 0.5 + 0.5 * Math.sin(time * 5.5);
      if (this.flash > 0.02) {
        this.overlay.style.background = 'rgba(255,252,245,1)';
        this.overlay.style.opacity = String(this.flash * 0.7);
      } else {
        this.overlay.style.background = RUSH_BG;
        this.overlay.style.opacity = rush > 0.001 ? String(rush * (0.55 + 0.35 * pulse)) : '0';
      }
    }
  }

  private disposeComposer(): void {
    if (!this.composer) return;
    for (const p of this.composer.passes) (p as { dispose?: () => void }).dispose?.();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer = null;
    this.bloom = null;
    this.finish = null;
  }

  dispose(): void {
    this.disposeComposer();
    this.overlay.remove();
  }
}
