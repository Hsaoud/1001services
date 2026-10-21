/**
 * Matériaux du moteur de rendu : variantes « couleurs par sommet » pour la fusion géométrique,
 * effet de transparence tramée (le décor haut devant le joueur s'efface) et balancement des feuillages.
 */
import * as THREE from 'three';

/** Uniformes partagés par tous les matériaux patchés (mis à jour une fois par image). */
export const SHARED = {
  uTime: { value: 0 },
  /** Point focal (joueur) en monde. */
  uFocus: { value: new THREE.Vector3(1e5, 0, 1e5) },
  uFocusOn: { value: 0 },
  uCamRight: { value: new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2) },
  uCamUp: { value: new THREE.Vector3(0, 1, 0) },
  /** Direction vers la caméra (normalisée). */
  uCamFwd: { value: new THREE.Vector3(0.5, 0.7, 0.5) },
  uWind: { value: 1 },
};

export type VcKind = 'matte' | 'velvet' | 'satin' | 'ceramic' | 'gold' | 'brass' | 'silver' | 'chrome' | 'lacquer' | 'foliage' | 'wood';

const VC_PARAMS: Record<VcKind, THREE.MeshStandardMaterialParameters> = {
  matte: { roughness: 0.72, metalness: 0 },
  velvet: { roughness: 0.88, metalness: 0 },
  satin: { roughness: 0.5, metalness: 0 },
  ceramic: { roughness: 0.32, metalness: 0 },
  wood: { roughness: 0.55, metalness: 0 },
  lacquer: { roughness: 0.16, metalness: 0.05 },
  gold: { roughness: 0.22, metalness: 0.85 },
  brass: { roughness: 0.32, metalness: 0.8 },
  silver: { roughness: 0.18, metalness: 0.9 },
  chrome: { roughness: 0.08, metalness: 1 },
  foliage: { roughness: 0.75, metalness: 0, side: THREE.DoubleSide },
};

const vcCache = new Map<string, THREE.MeshStandardMaterial>();

/** Matériau à couleurs par sommet (couleur de base blanche) : la teinte vient de la fusion. */
export function vc(kind: VcKind): THREE.MeshStandardMaterial {
  let m = vcCache.get(kind);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, ...VC_PARAMS[kind] });
    m.name = `vc:${kind}`;
    m.userData.shared = true;
    if (kind === 'foliage') m.userData.sway = true;
    vcCache.set(kind, m);
  }
  return m;
}

/** Émissif à couleurs par sommet (flammes, ampoules, vitres éclairées). */
export function vcGlow(intensity = 1.6): THREE.MeshStandardMaterial {
  const key = `glow:${intensity}`;
  let m = vcCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: '#000000', vertexColors: true, roughness: 0.6, emissive: '#ffffff', emissiveIntensity: intensity });
    // l'émission reprend la couleur par sommet
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;');
    };
    m.customProgramCacheKey = () => 'vcGlow';
    m.userData.shared = true;
    vcCache.set(key, m);
  }
  return m;
}

/** Verre teinté (couleurs par sommet), transparent. */
export function vcGlass(opacity = 0.32): THREE.MeshStandardMaterial {
  const key = `glass:${opacity}`;
  let m = vcCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    m.userData.shared = true;
    vcCache.set(key, m);
  }
  return m;
}

/** Indique si la fusion doit écrire l'attribut `color` pour ce matériau. */
export function wantsColor(m: THREE.Material): boolean {
  return (m as THREE.MeshStandardMaterial).vertexColors === true;
}

// ─────────────────────────────────────────── Patch : transparence tramée & balancement

const BAYER = /* glsl */ `
float stBayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // matrice de Bayer 4×4 aplatie
  float b = 0.0;
  if (i < 1.0) b = 0.0; else if (i < 2.0) b = 8.0; else if (i < 3.0) b = 2.0; else if (i < 4.0) b = 10.0;
  else if (i < 5.0) b = 12.0; else if (i < 6.0) b = 4.0; else if (i < 7.0) b = 14.0; else if (i < 8.0) b = 6.0;
  else if (i < 9.0) b = 3.0; else if (i < 10.0) b = 11.0; else if (i < 11.0) b = 1.0; else if (i < 12.0) b = 9.0;
  else if (i < 13.0) b = 15.0; else if (i < 14.0) b = 7.0; else if (i < 15.0) b = 13.0; else b = 5.0;
  return (b + 0.5) / 16.0;
}
`;

const patchCache = new Map<string, THREE.Material>();

/**
 * Variante patchée d'un matériau (mise en cache) :
 * - `seeThrough` : tramage qui efface l'objet quand il masque le joueur (point focal) ;
 * - `sway` : balancement doux selon l'attribut `aSway` (feuillages, fleurs).
 */
export function patched(base: THREE.Material, opts: { seeThrough?: boolean; sway?: boolean }): THREE.Material {
  const st = !!opts.seeThrough;
  const sw = !!opts.sway;
  if (!st && !sw) return base;
  const key = `${base.uuid}:${st ? 1 : 0}${sw ? 1 : 0}`;
  let m = patchCache.get(key);
  if (m) return m;
  m = base.clone();
  m.userData = { ...base.userData, shared: true, patchedFrom: base.uuid };
  const prev = base.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(base, sh, r);
    sh.uniforms.uTime = SHARED.uTime;
    sh.uniforms.uFocus = SHARED.uFocus;
    sh.uniforms.uFocusOn = SHARED.uFocusOn;
    sh.uniforms.uCamRight = SHARED.uCamRight;
    sh.uniforms.uCamUp = SHARED.uCamUp;
    sh.uniforms.uCamFwd = SHARED.uCamFwd;
    sh.uniforms.uWind = SHARED.uWind;
    let vs = sh.vertexShader;
    let head = 'uniform float uTime;\nuniform float uWind;\nvarying vec3 vStWorld;\n';
    if (sw) head += 'attribute float aSway;\n';
    vs = vs.replace('#include <common>', head + '#include <common>');
    let body = '#include <begin_vertex>\n';
    body += `
      #ifdef USE_INSTANCING
        mat4 stModel = modelMatrix * instanceMatrix;
      #else
        mat4 stModel = modelMatrix;
      #endif
    `;
    if (sw) {
      body += `{
        vec4 swW = stModel * vec4(transformed, 1.0);
        float ph = uTime * 1.6 + swW.x * 0.9 + swW.z * 0.7;
        float a = aSway * uWind;
        transformed.x += (sin(ph) * 0.035 + sin(ph * 2.3 + 1.0) * 0.012) * a;
        transformed.z += (cos(ph * 0.8 + 0.5) * 0.03) * a;
        transformed.y += sin(ph * 1.7) * 0.008 * a;
      }\n`;
    }
    body += 'vStWorld = (stModel * vec4(transformed, 1.0)).xyz;\n';
    vs = vs.replace('#include <begin_vertex>', body);
    sh.vertexShader = vs;
    let fs = sh.fragmentShader;
    fs = fs.replace(
      '#include <common>',
      `uniform vec3 uFocus;\nuniform float uFocusOn;\nuniform vec3 uCamRight;\nuniform vec3 uCamUp;\nuniform vec3 uCamFwd;\nvarying vec3 vStWorld;\n${BAYER}\n#include <common>`,
    );
    if (st) {
      fs = fs.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uFocusOn > 0.0) {
          vec3 dd = vStWorld - uFocus;
          float depthToCam = dot(dd, uCamFwd);
          vec2 sp = vec2(dot(dd, uCamRight), dot(dd, uCamUp) - 0.55);
          float rr = length(sp / vec2(1.05, 1.25));
          float k = (1.0 - smoothstep(0.65, 1.0, rr)) * smoothstep(0.15, 0.7, depthToCam) * uFocusOn;
          if (k > 0.0 && stBayer4(gl_FragCoord.xy) < k * 0.82) discard;
        }`,
      );
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `${base.customProgramCacheKey ? base.customProgramCacheKey() : ''}|st${st ? 1 : 0}sw${sw ? 1 : 0}`;
  patchCache.set(key, m);
  return m;
}

/** Matériau invisible qui ne fait que projeter des ombres (treillis de verrière, pergolas). */
export function shadowOnly(): THREE.MeshBasicMaterial {
  const key = 'shadowOnly';
  let m = patchCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    m.userData.shared = true;
    patchCache.set(key, m);
  }
  return m;
}
