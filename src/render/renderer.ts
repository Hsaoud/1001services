/**
 * Moteur de rendu « diorama » de La Duchesse : caméra isométrique orthographique, ambiances
 * (biomes), salon fusionné, couches dynamiques (joueur, PNJ, télégraphes, particules, guidage,
 * marée de mousse) et post-traitement.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GameRendererApi, SalonView, ScreenPoint, View } from './api';
import type {
  DishId,
  FxKind,
  FxOptions,
  NpcKind,
  NpcViewState,
  PlayerViewState,
  SalonLayout,
  Settings,
  Telegraph,
  TideViewState,
  Vec2,
} from '../types';
import { createPlayerView } from './models/player';
import { createNpcView } from './models/npcs';
import { makeDishIcon, makeDuchessPortrait } from './models/icons';
import { disposeTree, damp } from './kit';
import { CameraRig } from './camera';
import { PostPipeline } from './post';
import { biomeStyle, type BiomeStyle } from './biomes';
import { backdropTexture, setMaxAnisotropy } from './textures';
import { SHARED } from './mats';
import { LightPool, POINTS_SHARED } from './glow';
import { FxSystem } from './fx';
import { TelegraphLayer } from './telegraphs';
import { GuideLayer } from './guide';
import { TideLayer } from './tide';
import { SalonViewImpl } from './salon';
import { WALL_H } from './salon/grid';
import { fixAdditiveBlending } from './blend';
import { isHandheld, isMidTierMobile } from '../core/device';

const QUALITY: Record<Settings['quality'], { pixelRatio: number; shadow: number; radius: number; aniso: number }> = {
  low: { pixelRatio: 1, shadow: 1024, radius: 2, aniso: 2 },
  medium: { pixelRatio: 1.5, shadow: 2048, radius: 3, aniso: 4 },
  high: { pixelRatio: 2, shadow: 2048, radius: 4, aniso: 8 },
};

interface Tracked {
  view: View<unknown>;
  outer: THREE.Object3D;
}

export class GameRenderer implements GameRendererApi {
  readonly canvas: HTMLCanvasElement;
  readonly webglRenderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  private container: HTMLElement;
  private post: PostPipeline;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private lights: LightPool;
  private world = new THREE.Group();
  readonly fxSys: FxSystem;
  private telegraphs: TelegraphLayer;
  private guide: GuideLayer;
  private tide: TideLayer;
  private salon: SalonViewImpl | null = null;
  private tracked = new Set<Tracked>();
  private style: BiomeStyle = biomeStyle('boudoir');
  private quality: Settings['quality'] = 'high';
  private ro: ResizeObserver;
  private icons = new Map<DishId, string>();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private focus = new THREE.Vector3();
  private focusSet = false;
  private focusOn = 0;
  private rush = 0;
  private rushTarget = 0;
  private flash = 0;
  private sunDir = new THREE.Vector3(-0.45, 1, 0.62).normalize();
  private width = 1;
  private height = 1;
  private showcase = false;
  private blendCheck = 0;
  private targetDpr = 1;
  private currentDpr = 1;
  private dprScale = 1.0;
  private avgDt = 0.016;
  private dynamicTimer = 0;
  private handheld = false;

  constructor(container: HTMLElement) {
    this.container = container;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    const gl = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    this.webglRenderer = gl;
    this.canvas = gl.domElement;
    Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%', position: 'absolute', inset: '0' });
    container.appendChild(this.canvas);

    this.scene.add(this.world);
    // lumières
    this.hemi = new THREE.HemisphereLight('#fff1e6', '#d9a9a0', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffd8a8', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight('#f3c6d0', 0.5);
    this.scene.add(this.fill, this.fill.target);
    this.lights = new LightPool(this.scene, 3);
    // environnement procédural pour les reflets métalliques
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    this.envRT = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envRT.texture;
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    pmrem.dispose();

    this.fxSys = new FxSystem(this.scene);
    this.telegraphs = new TelegraphLayer(this.scene);
    this.guide = new GuideLayer(this.fxSys);
    this.tide = new TideLayer(this.scene);
    this.post = new PostPipeline(gl, this.scene, this.rig.camera, container);

    this.applyStyle(this.style);
    this.setQuality('high');
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  // ─────────────────────────────────────── Salon

  buildSalon(layout: SalonLayout): SalonView {
    this.clearSalon();
    this.style = biomeStyle(layout.biome);
    this.applyStyle(this.style);
    const salon = new SalonViewImpl(layout, { parent: this.world, style: this.style, fx: this.fxSys, lights: this.lights });
    this.salon = salon;
    this.fxSys.groundAt = (x, z) => salon.groundY(x, z);
    this.telegraphs.groundMax = (x0, z0, x1, z1) => salon.grid.maxGround(x0, z0, x1, z1);
    this.tide.setSalon(layout);
    this.rig.setBounds(0, 0, layout.width, layout.depth, WALL_H + 0.3);
    this.rig.follow(layout.playerStart.x, layout.playerStart.z, true);
    return salon;
  }

  clearSalon(): void {
    for (const t of [...this.tracked]) this.untrack(t);
    this.tracked.clear();
    this.telegraphs.clear();
    this.fxSys.clear();
    this.guide.clear();
    this.tide.setSalon(null);
    this.lights.clear();
    if (this.salon) {
      this.salon.dispose();
      this.salon = null;
    }
    this.fxSys.groundAt = () => 0;
    this.telegraphs.groundMax = () => 0;
    this.focusSet = false;
  }

  /** Statistiques du salon courant (lab). */
  get salonStats(): { vertices: number; meshes: number; buildMs: number } | null {
    return this.salon ? this.salon.stats : null;
  }

  // ─────────────────────────────────────── Vues dynamiques

  createPlayer(): View<PlayerViewState> {
    const inner = createPlayerView();
    const outer = this.wrap(inner);
    const self = this;
    const view: View<PlayerViewState> = {
      root: outer,
      update(s: PlayerViewState, dt: number) {
        inner.update(s, dt);
        outer.position.y = damp(outer.position.y, self.groundAt(s.x, s.z), 14, dt);
        self.focus.set(s.x, outer.position.y, s.z);
        self.focusSet = true;
      },
      dispose() {
        self.removeView(view);
      },
    };
    outer.userData.player = true;
    this.tracked.add({ view, outer });
    return view;
  }

  createNpc(kind: NpcKind): View<NpcViewState> {
    const inner = createNpcView(kind);
    const outer = this.wrap(inner);
    const self = this;
    const view: View<NpcViewState> = {
      root: outer,
      update(s: NpcViewState, dt: number) {
        inner.update(s, dt);
        outer.position.y = damp(outer.position.y, self.groundAt(s.x, s.z), 14, dt);
      },
      dispose() {
        self.removeView(view);
      },
    };
    this.tracked.add({ view, outer });
    return view;
  }

  /** Enveloppe une vue de modèle : un groupe externe porte la hauteur du sol (estrades). */
  private wrap(inner: View<never>): THREE.Group {
    const outer = new THREE.Group();
    outer.add(inner.root);
    outer.userData.inner = inner;
    this.world.add(outer);
    return outer;
  }

  removeView(view: View<unknown>): void {
    for (const t of this.tracked) {
      if (t.view === view || t.outer === view.root) {
        this.untrack(t);
        return;
      }
    }
    // vue inconnue : retrait générique
    view.root.removeFromParent();
    disposeTree(view.root);
  }

  private untrack(t: Tracked): void {
    this.tracked.delete(t);
    if (t.outer.userData.player) this.focusSet = false;
    const inner = t.outer.userData.inner as View<unknown> | undefined;
    t.outer.removeFromParent();
    if (inner) inner.dispose();
    disposeTree(t.outer);
  }

  private groundAt(x: number, z: number): number {
    return this.salon ? this.salon.groundY(x, z) : 0;
  }

  // ─────────────────────────────────────── Couches

  setTelegraphs(list: readonly Telegraph[]): void {
    this.telegraphs.sync(list);
  }

  fx(kind: FxKind, x: number, z: number, opts?: FxOptions): void {
    this.fxSys.emit(kind, x, z, opts);
    if (kind === 'flash') {
      // voile blanc proportionnel à la proximité du centre de l'écran
      const d = Math.hypot(x - this.rig.center.x, z - this.rig.center.z);
      this.flash = Math.max(this.flash, 0.55 * Math.max(0, 1 - d / 14) * (opts?.scale ?? 1));
    }
  }

  setGuide(from: Vec2, targets: readonly Vec2[]): void {
    this.guide.set(from, targets);
  }

  setTide(state: TideViewState | null): void {
    this.tide.set(state);
  }

  // ─────────────────────────────────────── Caméra

  cameraFollow(x: number, z: number, snap = false): void {
    this.rig.follow(x, z, snap);
  }

  shake(amount: number): void {
    this.rig.shake(amount);
  }

  setShowcase(on: boolean): void {
    this.showcase = on;
    this.rig.setShowcase(on);
  }

  worldToScreen(x: number, y: number, z: number, out: ScreenPoint = { x: 0, y: 0, visible: false }): ScreenPoint {
    _v.set(x, y, z).project(this.rig.camera);
    out.x = (_v.x * 0.5 + 0.5) * this.width;
    out.y = (-_v.y * 0.5 + 0.5) * this.height;
    out.visible = _v.x >= -1 && _v.x <= 1 && _v.y >= -1 && _v.y <= 1 && _v.z >= -1 && _v.z <= 1;
    return out;
  }

  dishIcon(id: DishId): string {
    let url = this.icons.get(id);
    if (url === undefined) {
      url = makeDishIcon(this.webglRenderer, id);
      this.icons.set(id, url);
    }
    return url;
  }

  duchessPortrait(): string {
    return makeDuchessPortrait(this.webglRenderer);
  }

  // ─────────────────────────────────────── Qualité, ambiance

  setQuality(q: Settings['quality']): void {
    this.quality = q;
    const Q = QUALITY[q];
    this.handheld = isHandheld();
    const midTier = isMidTierMobile();
    // Sur mobile milieu de gamme (ex. Xiaomi Redmi Note avec Adreno 610/619 ou Mali-G52/G57),
    // un DPR de 1.45 sur écran 1080p offre une netteté visuelle parfaite sans saturer la bande passante GPU.
    const mobileHighDpr = midTier ? 1.45 : 1.75;
    const maxRatio = this.handheld ? (q === 'high' ? mobileHighDpr : q === 'medium' ? 1.3 : 1) : Q.pixelRatio;
    this.targetDpr = Math.min(window.devicePixelRatio || 1, maxRatio);
    this.currentDpr = this.targetDpr;
    this.dprScale = 1.0;
    this.webglRenderer.setPixelRatio(this.currentDpr);

    const sh = this.sun.shadow;
    const shadowSize = this.handheld ? (midTier ? 1024 : (q === 'high' ? 1536 : 1024)) : Q.shadow;
    if (sh.mapSize.x !== shadowSize) {
      sh.mapSize.set(shadowSize, shadowSize);
      sh.map?.dispose();
      sh.map = null;
    }
    sh.radius = this.handheld ? (midTier ? 2.2 : (q === 'high' ? 3 : 2)) : Q.radius;
    const anisoMax = this.handheld ? (midTier ? 2 : 4) : Q.aniso;
    setMaxAnisotropy(Math.min(anisoMax, this.webglRenderer.capabilities.getMaxAnisotropy()));
    this.post.setQuality(q);
    this.post.setSize(this.width, this.height, this.currentDpr);
  }



  setRush(amount: number): void {
    this.rushTarget = Math.max(0, Math.min(1, amount));
  }

  private applyStyle(s: BiomeStyle): void {
    this.hemi.color.set(s.hemi.sky);
    this.hemi.groundColor.set(s.hemi.ground);
    this.hemi.intensity = s.hemi.intensity;
    this.sun.color.set(s.sun.color);
    this.sun.intensity = s.sun.intensity;
    this.sunDir.set(...s.sun.dir).normalize();
    this.fill.color.set(s.fill.color);
    this.fill.intensity = s.fill.intensity;
    this.fill.position.set(...s.fill.dir).multiplyScalar(20);
    this.scene.environmentIntensity = s.env;
    this.webglRenderer.toneMappingExposure = s.exposure;
    const bg = backdropTexture(s.backdrop.top, s.backdrop.bottom, s.backdrop.glow, s.backdrop.bokeh);
    this.post.setStyle(s, bg);
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.webglRenderer.setSize(w, h, false);
    this.rig.resize(w, h);
    this.post.setSize(w, h, this.currentDpr);
  }

  // ─────────────────────────────────────── Image

  render(dt: number, time: number): void {
    const d = Math.min(0.1, Math.max(0, dt));
    SHARED.uTime.value = time;
    this.rig.update(d);
    // uniformes partagés : axes caméra, joueur (tramage du décor haut)
    SHARED.uCamRight.value.copy(this.rig.right);
    SHARED.uCamUp.value.copy(this.rig.up);
    SHARED.uCamFwd.value.copy(this.rig.toCam);
    this.focusOn = damp(this.focusOn, this.focusSet && !this.showcase ? 1 : 0, 6, d);
    SHARED.uFocus.value.copy(this.focus);
    SHARED.uFocusOn.value = this.focusOn;
    POINTS_SHARED.uPx.value = this.webglRenderer.getDrawingBufferSize(_v2).y / this.rig.viewH;
    // ombres : la caméra d'ombre suit le centre visible
    this.updateShadowCamera();
    this.fill.target.position.set(this.rig.center.x, 0, this.rig.center.z);
    this.fill.position.set(...this.style.fill.dir).multiplyScalar(20).add(this.fill.target.position);
    if (this.salon) {
      this.salon.frame(d, time);
      const r = this.rig;
      this.salon.cull(r.center.x, r.center.z, r.right, r.up, r.halfW, r.halfH);
    }
    this.telegraphs.update(d);
    this.guide.update(d);
    this.fxSys.update(d);
    this.tide.update(d);
    this.lights.flush(this.rig.center.x, this.rig.center.z);
    this.rush = damp(this.rush, this.rushTarget, 4, d);
    this.post.rush = this.rush;
    this.flash *= Math.exp(-7 * d);
    this.post.flash = this.flash;
    // lueurs additives créées en cours de jeu (plats dorés, effets…) : alpha préservé (voir blend.ts)
    this.blendCheck -= d;
    if (this.blendCheck <= 0) {
      this.blendCheck = 0.5;
      fixAdditiveBlending(this.scene);
    }
    this.post.render(d, time);
    if (this.handheld) {
      this.monitorPerformance(d);
    }
  }

  private monitorPerformance(dt: number): void {
    this.avgDt = this.avgDt * 0.92 + dt * 0.08;
    this.dynamicTimer += dt;
    if (this.dynamicTimer < 0.75) return;
    this.dynamicTimer = 0;

    let changed = false;
    if (this.avgDt > 0.028 && this.dprScale > 0.75) {
      this.dprScale = Math.max(0.75, this.dprScale - 0.08);
      changed = true;
    } else if (this.avgDt < 0.018 && this.dprScale < 1.0) {
      this.dprScale = Math.min(1.0, this.dprScale + 0.04);
      changed = true;
    }

    if (changed) {
      const nextDpr = Math.round(this.targetDpr * this.dprScale * 100) / 100;
      if (Math.abs(nextDpr - this.currentDpr) >= 0.05) {
        this.currentDpr = nextDpr;
        this.webglRenderer.setPixelRatio(this.currentDpr);
        this.post.setSize(this.width, this.height, this.currentDpr);
      }
    }
  }

  private updateShadowCamera(): void {
    const sh = this.sun.shadow;
    const cam = sh.camera as THREE.OrthographicCamera;
    const c = this.rig.center;
    // étendue : demi-diagonale de la zone visible au sol
    const hw = this.rig.halfW;
    const hh = this.rig.halfH / Math.sin(this.rig.elevation);
    const ext = Math.min(40, Math.hypot(hw, hh) + 2.5);
    const dist = 30;
    // calage sur la grille des texels (ombres stables quand la caméra bouge)
    const texel = (ext * 2) / sh.mapSize.x;
    const lightRot = _m.lookAt(_zero, _dir.copy(this.sunDir).negate(), _up);
    const inv = _m2.copy(lightRot).invert();
    const p = _v.copy(c).applyMatrix4(inv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(lightRot);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, dist);
    if (cam.right !== ext || cam.far !== dist * 2 + 10) {
      cam.left = -ext;
      cam.right = ext;
      cam.top = ext;
      cam.bottom = -ext;
      cam.near = 1;
      cam.far = dist * 2 + 10;
      cam.updateProjectionMatrix();
    }
  }

  /** Libère tout (fin de vie de l'application). */
  dispose(): void {
    this.clearSalon();
    this.ro.disconnect();
    this.telegraphs.dispose();
    this.fxSys.dispose();
    this.tide.dispose();
    this.post.dispose();
    this.envRT?.dispose();
    this.webglRenderer.dispose();
    this.canvas.remove();
  }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector2();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _zero = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
