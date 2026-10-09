// Recorrido 3D: Buenos Aires de día o de noche, el Obelisco, nuestros departamentos
// y el ingreso por una ventana al interior del Urban Nest Obelisco.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const ease = t => t * t * (3 - 2 * t);
const C = hex => new THREE.Color(hex);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Interpola por tramos entre keyframes [t, pos, look] con aceleración suave en cada tramo.
function track(keys, t) {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) {
      const k = ease((t - a[0]) / (b[0] - a[0]));
      return [a[1].clone().lerp(b[1], k), a[2].clone().lerp(b[2], k)];
    }
  }
  const l = keys[keys.length - 1];
  return [l[1], l[2]];
}

// Paletas de día (0) y de noche (1). Sin verdes.
const PAL = {
  skyTop: [C("#7FA7D3"), C("#07040A")],
  skyBot: [C("#F6DCC8"), C("#3B1526")],
  fog: [C("#E9D3C6"), C("#1E0D16")],
  ground: [C("#6F6769"), C("#141013")],
  block: [C("#C9BDB4"), C("#262025")],
  water: [C("#7F96A8"), C("#0B0810")],
  hemiSky: [C("#FFF1E6"), C("#4A3150")],
  hemiGround: [C("#7A625C"), C("#0E080C")],
  sun: [C("#FFD9B0"), C("#8C97CC")],
  roomHemi: [C("#FFF3E8"), C("#2E2232")],
  windowSky: [C("#C3D6EA"), C("#0E0812")],
};
const pick = (k, m) => PAL[k][0].clone().lerp(PAL[k][1], m);

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const radial = (stops) => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, c]) => r.addColorStop(o, c));
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
}, false);

export function createTour({ canvas, mobile = false, reduce = false, night = false }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  } catch (e) {
    return null;
  }
  const HQ = !mobile;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = HQ;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1600);
  const state = { night: night ? 1 : 0, nightTarget: night ? 1 : 0, p: 0, pShown: 0, mx: 0, my: 0, time: 0, auto: false, autoT: 0 };
  const uNight = { value: state.night };
  const pmrem = new THREE.PMREMGenerator(renderer);

  /* ───────────── CIUDAD ───────────── */
  const city = new THREE.Scene();
  city.fog = new THREE.Fog(pick("fog", state.night), 160, 560);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: pick("skyTop", 0) }, bot: { value: pick("skyBot", 0) }, sunDir: { value: V(0.55, 0.32, -0.77).normalize() }, sunAmt: { value: 1 } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform float sunAmt; varying vec3 vP;
      void main(){ float h = clamp(vP.y*1.5+0.06,0.0,1.0); vec3 c = mix(bot, top, pow(h,0.7));
        float s = max(dot(vP, sunDir), 0.0); c += vec3(1.0,0.78,0.55) * (pow(s, 12.0)*0.35 + pow(s, 400.0)*2.5) * sunAmt;
        gl_FragColor = vec4(c,1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat);
  city.add(sky);

  // Entorno para reflejos en los vidrios: se genera a partir del mismo cielo.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
  let cityEnv = null;
  function refreshEnv() {
    const rt = pmrem.fromScene(envScene, 0, 0.1, 100);
    if (cityEnv) cityEnv.dispose();
    cityEnv = rt; city.environment = rt.texture;
  }

  // Estrellas, sol y luna
  const starGeo = new THREE.BufferGeometry(), starPos = [], sr = rng(7);
  for (let i = 0; i < 1400; i++) {
    const th = sr() * Math.PI * 2, ph = Math.acos(lerp(0.1, 1, sr()));
    starPos.push(Math.cos(th) * Math.sin(ph) * 900, Math.cos(ph) * 900, Math.sin(th) * Math.sin(ph) * 900);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  city.add(new THREE.Points(starGeo, starMat));
  const disc = radial([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,1)"], [0.42, "rgba(255,255,255,.3)"], [1, "rgba(255,255,255,0)"]]);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: 0xF6EAF0, transparent: true, fog: false, depthWrite: false }));
  moon.position.set(-380, 260, -600); moon.scale.set(60, 60, 1); city.add(moon);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0); city.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const SUN_DIR = V(0.62, 0.42, -0.66).normalize();
  sun.castShadow = HQ;
  if (HQ) {
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 500 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  }
  city.add(sun, sun.target);

  // Suelo, río, manzanas y calles
  const groundMat = new THREE.MeshStandardMaterial({ color: pick("ground", 0), roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; city.add(ground);
  const waterMat = new THREE.MeshStandardMaterial({ color: pick("water", 0), roughness: 0.18, metalness: 0.4 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 2000), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(108 + 450, 0.03, 0); city.add(water);

  const PITCH = 13.2, BLOCK = 10, N = mobile ? 8 : 10, ext = N * PITCH;
  const r = rng(2026), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = V(1, 1, 1), p3 = V(0, 0, 0);
  const blockMat = new THREE.MeshStandardMaterial({ color: pick("block", 0), roughness: 1 });
  const blocks = [];
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    if (i === 0) continue; // Av. 9 de Julio
    const x = i * PITCH, z = (j + 0.5) * PITCH;
    if (x > 100) continue;
    blocks.push([x, z]);
  }
  const blockInst = new THREE.InstancedMesh(new THREE.BoxGeometry(BLOCK + 0.6, 0.14, BLOCK + 0.6), blockMat, blocks.length);
  blocks.forEach(([x, z], k) => { m4.makeTranslation(x, 0.07, z); blockInst.setMatrixAt(k, m4); });
  blockInst.receiveShadow = true; city.add(blockInst);

  // Demarcación de carriles en la 9 de Julio
  const lineMat = new THREE.MeshBasicMaterial({ color: C("#E9E1D8"), transparent: true, opacity: 0.55 });
  const dashes = [];
  for (let z = -ext; z <= ext; z += 2.4) for (const x of [-6.6, -5.9, 5.9, 6.6, -2.2, 2.2]) dashes.push([x, z]);
  const dashInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 1.1), lineMat, dashes.length);
  dashes.forEach(([x, z], k) => { q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); m4.compose(V(x, 0.02, z), q, s3); dashInst.setMatrixAt(k, m4); });
  city.add(dashInst);

  // Canteros de la 9 de Julio y Plaza de la República
  const medianMat = new THREE.MeshStandardMaterial({ color: C("#CDB2A3"), roughness: 1 });
  for (const off of [-4.2, 4.2]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 2 * ext + PITCH), medianMat);
    s.position.set(off, 0.08, 0); s.receiveShadow = true; city.add(s);
  }
  const plazaMat = new THREE.MeshStandardMaterial({ color: C("#E4D2C4"), roughness: 0.9 });
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.18, 64), plazaMat);
  plaza.position.set(0, 0.09, 0); plaza.receiveShadow = true; city.add(plaza);

  // Edificios: una malla instanciada con fachadas procedurales en el shader.
  const HERO = { x: -3 * PITCH, z: 3.9, w: 6.2, d: 4.6, floors: 16 };
  const FLOOR = 0.42;
  const lots = [];
  blocks.forEach(([bx, bz]) => {
    const dist = Math.hypot(bx, bz);
    const split = r() < 0.5 ? 2 : 3, lw = BLOCK / split;
    for (let a = 0; a < split; a++) for (let b = 0; b < 2; b++) {
      const lx = bx - BLOCK / 2 + lw * (a + 0.5), lz = bz - BLOCK / 2 + (BLOCK / 2) * (b + 0.5);
      if (Math.abs(lx - HERO.x) < HERO.w / 2 + 1.2 && Math.abs(lz - HERO.z) < HERO.d / 2 + 1.2) continue;
      if (r() < 0.05) continue;
      let floors = Math.round(lerp(4, 14, Math.pow(r(), 1.4)) * (dist < 60 ? 1.15 : dist < 100 ? 0.85 : 0.65));
      let tower = false;
      if (bx > 60 && r() < 0.35) { floors = Math.round(lerp(24, 46, r())); tower = true; }
      if (dist < 30 && r() < 0.25) floors += 8;
      floors = Math.max(3, floors);
      lots.push({ x: lx, z: lz, w: lw - 0.45 - r() * 0.35, d: BLOCK / 2 - 0.45 - r() * 0.35, h: floors * FLOOR + 0.3, tower, seed: r() });
    }
  });
  const facade = ["#E9E1D8", "#D9CFC6", "#CDBFB6", "#E5D7D0", "#BFB2AE", "#D6C3BE", "#EFE6DE", "#C7B9B9", "#B9A9A2", "#DCCCC0"].map(C);

  function facadeMaterial(color) {
    const mtl = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
    mtl.onBeforeCompile = sh => {
      sh.uniforms.uNight = uNight;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          varying vec3 vWP; varying vec3 vWN; varying float vSeed;
          #ifdef USE_INSTANCING
            attribute float aSeed;
          #endif`)
        .replace("#include <project_vertex>", `#include <project_vertex>
          mat4 unM = modelMatrix;
          #ifdef USE_INSTANCING
            unM = modelMatrix * instanceMatrix; vSeed = aSeed;
          #else
            vSeed = 0.37;
          #endif
          vWP = (unM * vec4(transformed, 1.0)).xyz;
          vWN = normalize(mat3(unM) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vWP; varying vec3 vWN; varying float vSeed; uniform float uNight;
          float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float tower = step(1.5, vSeed);
          float sd = fract(vSeed);
          float wall = 1.0 - step(0.5, abs(vWN.y));
          vec2 fu = abs(vWN.x) > 0.5 ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y);
          float colW = mix(0.55, 0.8, sd);
          vec2 cell = vec2(fu.x / colW, (fu.y - 0.3) / ${FLOOR.toFixed(2)});
          vec2 f = fract(cell);
          float gw = mix(0.2, 0.32, fract(sd * 7.1));
          float win = step(gw, f.x) * step(f.x, 1.0 - gw) * step(0.26, f.y) * step(f.y, 0.86) * step(0.0, cell.y) * wall;
          // Torres: vidrio continuo con losas
          float slab = step(0.9, f.y);
          win = mix(win, (1.0 - slab) * wall * step(0.0, cell.y), tower);
          // Planta baja: locales
          float shop = wall * (1.0 - step(0.3, vWP.y - 0.14)) * step(0.06, vWP.y - 0.14) * step(0.12, fract(fu.x / 1.6)) * step(fract(fu.x / 1.6), 0.88);
          float rnd = h21(floor(cell) + vSeed * 31.0 + vWN.xz * 11.0);
          float lit = step(mix(0.68, 0.58, tower), rnd);
          vec3 glassDay = mix(vec3(0.24, 0.29, 0.36), vec3(0.42, 0.5, 0.6), h21(floor(cell) * 0.7 + sd));
          vec3 glass = mix(glassDay, vec3(0.03, 0.025, 0.04), uNight);
          // Oclusión aproximada: más oscuro cerca del suelo
          float ao = mix(0.6, 1.0, smoothstep(0.0, 2.5, vWP.y));
          diffuseColor.rgb *= ao * mix(1.0, 0.5, uNight);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, clamp(win * 0.85 + shop * 0.8, 0.0, 1.0));`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.12, clamp(win + shop, 0.0, 1.0));`)
        .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, 0.55, clamp(win + shop, 0.0, 1.0) * (1.0 - uNight * 0.7));`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float k = h21(floor(cell) * 1.7 + sd);
          vec3 warm = k < 0.75 ? vec3(1.0, 0.72, 0.42) : (k < 0.93 ? vec3(1.0, 0.88, 0.7) : vec3(0.62, 0.72, 1.0));
          float dim = mix(0.55, 1.4, h21(floor(cell) * 3.1 + 2.0));
          totalEmissiveRadiance += win * lit * warm * dim * uNight * 0.75;
          float shopLit = step(0.45, h21(vec2(floor(fu.x / 1.6), sd * 9.0)));
          totalEmissiveRadiance += shop * shopLit * vec3(1.0, 0.8, 0.55) * uNight * 1.0;`);
    };
    mtl.customProgramCacheKey = () => "facade";
    return mtl;
  }
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const bGeoI = bGeo.clone();
  const seeds = new Float32Array(lots.length);
  lots.forEach((l, k) => seeds[k] = l.seed + (l.tower ? 2 : 0));
  bGeoI.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  const bMat = facadeMaterial(0xffffff);
  const bInst = new THREE.InstancedMesh(bGeoI, bMat, lots.length);
  lots.forEach((l, k) => {
    m4.makeScale(l.w, l.h, l.d); m4.setPosition(l.x, 0.14, l.z);
    bInst.setMatrixAt(k, m4);
    bInst.setColorAt(k, l.tower ? C("#9FA6AE") : facade[(k * 7 + Math.floor(l.h * 3)) % facade.length]);
  });
  bInst.castShadow = bInst.receiveShadow = HQ;
  city.add(bInst);

  // Detalles de azotea: tanques y equipos
  const roofBits = [];
  lots.forEach(l => { if (!l.tower && r() < 0.6) { const n = 1 + Math.floor(r() * 3); for (let i = 0; i < n; i++) roofBits.push([l.x + (r() - 0.5) * l.w * 0.6, l.h + 0.14, l.z + (r() - 0.5) * l.d * 0.6, 0.3 + r() * 0.5, 0.2 + r() * 0.35]); } });
  const roofInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: C("#B7ACA6"), roughness: 0.9 }), roofBits.length);
  roofBits.forEach(([x, y, z, w, h], k) => { m4.makeScale(w, h, w); m4.setPosition(x, y, z); roofInst.setMatrixAt(k, m4); });
  roofInst.castShadow = HQ; city.add(roofInst);

  // Jacarandás en flor sobre la 9 de Julio y en algunas veredas
  const trees = [];
  for (let z = -ext; z <= ext; z += 3.1) for (const x of [-4.2, 4.2]) if (Math.hypot(x, z) > 6.5 && r() < 0.85) trees.push([x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 1.2]);
  blocks.forEach(([bx, bz]) => { if (r() < 0.35) for (let i = 0; i < 4; i++) trees.push([bx - BLOCK / 2 - 0.6, bz - BLOCK / 2 + 1.2 + i * 2.5]); });
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: C("#4A3830"), roughness: 1 }), trees.length);
  const lilac = ["#8E6CC2", "#A07ACC", "#B48FD8", "#9A72BF"].map(C);
  trees.forEach(([x, z], k) => {
    const sc = 0.75 + r() * 0.5;
    m4.compose(V(x, 1.15 * sc + 0.3, z), q.setFromEuler(new THREE.Euler(0, r() * 6, 0)), V(sc * 1.05, sc * 0.72, sc * 1.05)); canopy.setMatrixAt(k, m4);
    canopy.setColorAt(k, lilac[k % lilac.length]);
    m4.makeScale(1, 1.2 * sc, 1); m4.setPosition(x, 0.1, z); trunk.setMatrixAt(k, m4);
  });
  canopy.castShadow = trunk.castShadow = HQ;
  city.add(canopy, trunk);

  // Edificio Urban Nest (Corrientes y Callao)
  const heroMat = facadeMaterial(C("#C98B9C"));
  const heroH = HERO.floors * FLOOR + 0.3;
  const heroB = new THREE.Mesh(bGeo, heroMat);
  heroB.scale.set(HERO.w, heroH, HERO.d); heroB.position.set(HERO.x, 0.14, HERO.z);
  heroB.castShadow = heroB.receiveShadow = HQ; city.add(heroB);
  const crownMat = new THREE.MeshStandardMaterial({ color: C("#8B1D3D"), emissive: C("#FF4F7E"), emissiveIntensity: 0, roughness: 0.6 });
  const crown = new THREE.Mesh(new THREE.BoxGeometry(HERO.w + 0.15, 0.24, HERO.d + 0.15), crownMat);
  crown.position.set(HERO.x, heroH + 0.14 + 0.12, HERO.z); city.add(crown);

  // Ventana por la que entramos, sobre la cara que mira a Corrientes
  const WIN = V(HERO.x, 10 * FLOOR + 0.3 + 0.24, HERO.z - HERO.d / 2 - 0.012);
  const portalMat = new THREE.MeshBasicMaterial({ color: C("#FFD9A8") });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), portalMat);
  portal.position.copy(WIN); portal.rotation.y = Math.PI; city.add(portal);
  const frameMat = new THREE.MeshStandardMaterial({ color: C("#F5EEE8"), roughness: 0.6 });
  [[0.68, 0.03, 0, 0.165], [0.68, 0.03, 0, -0.165], [0.03, 0.36, 0.325, 0], [0.03, 0.36, -0.325, 0], [0.02, 0.3, 0, 0]].forEach(([w, h, dx, dy]) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), frameMat);
    f.position.set(WIN.x - dx, WIN.y + dy, WIN.z - 0.01); city.add(f);
  });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.03, 0.09), frameMat); sill.position.set(WIN.x, WIN.y - 0.19, WIN.z - 0.04); city.add(sill);

  // Haz de luz sobre cada departamento
  const beamTex = canvasTex(4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.7, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,.95)");
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  }, false);
  const PLACES = [
    { key: "obe", pos: V(HERO.x, heroH, HERO.z) },
    { key: "acu", pos: V(-4 * PITCH, 0, -4.5 * PITCH) },
    { key: "oll", pos: V(-8 * PITCH, 0, -8.5 * PITCH) },
  ];
  const beams = [];
  PLACES.forEach(pl => {
    if (pl.key !== "obe") {
      const h = 4.6;
      const b = new THREE.Mesh(bGeo, heroMat); b.scale.set(4, h, 4); b.position.set(pl.pos.x, 0.14, pl.pos.z); b.castShadow = HQ; city.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.22, 4.15), crownMat); c.position.set(pl.pos.x, h + 0.25, pl.pos.z); city.add(c);
      pl.pos.y = h + 0.3;
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.1, 50, 20, 1, true),
      new THREE.MeshBasicMaterial({ map: beamTex, color: C("#E25A82"), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(pl.pos.x, pl.pos.y + 25, pl.pos.z);
    city.add(beam); beams.push(beam);
    pl.label = V(pl.pos.x, pl.pos.y + 3, pl.pos.z);
  });

  // Obelisco con reflectores
  const obeMat = new THREE.MeshStandardMaterial({ color: C("#F4EFEA"), roughness: 0.55, emissive: C("#FFF4E6"), emissiveIntensity: 0 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 12.6, 4, 1), obeMat);
  shaft.rotation.y = Math.PI / 4; shaft.position.set(0, 6.3 + 0.18, 0); shaft.castShadow = HQ; city.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), obeMat);
  tip.rotation.y = Math.PI / 4; tip.position.set(0, 12.6 + 0.45 + 0.18, 0); city.add(tip);
  const OBELISCO = V(0, 13.6, 0);

  // Luces de calle, charcos de luz y autos
  const glow = radial([[0, "rgba(255,255,255,1)"], [0.22, "rgba(255,255,255,.75)"], [1, "rgba(255,255,255,0)"]]);
  const lampPos = [], pools = [];
  for (let z = -ext; z <= ext; z += 3.3) { lampPos.push(-7.7, 1.0, z, 7.7, 1.0, z, -3.3, 1.0, z, 3.3, 1.0, z); pools.push([-7.2, z], [7.2, z], [-3.6, z], [3.6, z]); }
  for (let x = -ext; x <= 100; x += 3.3) { lampPos.push(x, 1.0, -1.3, x, 1.0, 1.3); pools.push([x, -1.1], [x, 1.1]); }
  for (let i = -N; i <= N; i += 2) for (let x = -ext; x <= 100; x += 6.6) lampPos.push(x, 0.8, i * PITCH);
  const lampGeo = new THREE.BufferGeometry(); lampGeo.setAttribute("position", new THREE.Float32BufferAttribute(lampPos, 3));
  const lampMat = new THREE.PointsMaterial({ map: glow, color: C("#FFC27A"), size: 1.1, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  city.add(new THREE.Points(lampGeo, lampMat));
  const poolMat = new THREE.MeshBasicMaterial({ map: glow, color: C("#FFB25E"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const poolInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.2, 3.2), poolMat, pools.length);
  pools.forEach(([x, z], k) => { m4.compose(V(x, 0.03, z), q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), s3); poolInst.setMatrixAt(k, m4); });
  city.add(poolInst);

  const CARS = mobile ? 140 : 300;
  const cars = [], cr = rng(99);
  const carPos = new Float32Array(CARS * 3), carCol = new Float32Array(CARS * 3);
  const carColors = ["#F2F0EE", "#1B1A1C", "#8A8C90", "#5E1028", "#2C2F36", "#C9C4BE"].map(C);
  const carGeo = new RoundedBoxGeometry(0.34, 0.2, 0.78, 2, 0.06);
  const carMesh = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 }), CARS);
  for (let i = 0; i < CARS; i++) {
    const onJulio = i < CARS * 0.62, dir = cr() < 0.5 ? 1 : -1;
    const lane = onJulio ? (dir > 0 ? lerp(-7.1, -5.4, cr()) : lerp(5.4, 7.1, cr())) : (dir > 0 ? -0.55 : 0.55);
    cars.push({ onJulio, dir, lane, s: lerp(-ext, onJulio ? ext : 100, cr()), v: lerp(3.5, 8, cr()) });
    const col = dir > 0 ? C("#FFF1D6") : C("#FF2E4E");
    carCol.set([col.r, col.g, col.b], i * 3);
    const taxi = cr() < 0.28;
    carMesh.setColorAt(i, taxi ? C("#141214") : carColors[Math.floor(cr() * carColors.length)]);
  }
  carMesh.castShadow = HQ; city.add(carMesh);
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute("position", new THREE.BufferAttribute(carPos, 3));
  lightGeo.setAttribute("color", new THREE.BufferAttribute(carCol, 3));
  const carLightMat = new THREE.PointsMaterial({ map: glow, size: 0.7, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  city.add(new THREE.Points(lightGeo, carLightMat));
  const rotJ = new THREE.Quaternion(), rotC = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  function moveCars(dt) {
    for (let i = 0; i < CARS; i++) {
      const c = cars[i];
      if (!reduce) c.s += c.dir * c.v * dt;
      const max = c.onJulio ? ext : 100;
      if (c.s > max) c.s = -ext; if (c.s < -ext) c.s = max;
      const x = c.onJulio ? c.lane : c.s, z = c.onJulio ? c.s : c.lane;
      m4.compose(p3.set(x, 0.12, z), c.onJulio ? rotJ : rotC, s3); carMesh.setMatrixAt(i, m4);
      const fx = c.onJulio ? 0 : c.dir * 0.42, fz = c.onJulio ? c.dir * 0.42 : 0;
      carPos.set([x + fx, 0.2, z + fz], i * 3);
    }
    carMesh.instanceMatrix.needsUpdate = true;
    lightGeo.attributes.position.needsUpdate = true;
  }

  /* ───────────── INTERIOR ───────────── */
  const room = new THREE.Scene();
  room.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  room.environmentIntensity = 0.35;
  const rHemi = new THREE.HemisphereLight(0xffffff, 0x3a2a2a, 0.8); room.add(rHemi);
  const rSun = new THREE.DirectionalLight(0xFFE2C2, 3);
  rSun.position.set(-7, 4.5, 1.5); rSun.target.position.set(0, 0, -2); room.add(rSun, rSun.target);
  rSun.castShadow = true;
  rSun.shadow.mapSize.set(HQ ? 2048 : 1024, HQ ? 2048 : 1024);
  Object.assign(rSun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 });
  rSun.shadow.bias = -0.0005; rSun.shadow.normalBias = 0.02; rSun.shadow.radius = 5;

  const woodTex = canvasTex(1024, 1024, (g, w, h) => {
    const rr = rng(5);
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? -256 : 0; x < w; x += 512) {
      const l = lerp(0.86, 1.1, rr());
      g.fillStyle = `rgb(${172 * l | 0},${128 * l | 0},${88 * l | 0})`; g.fillRect(x, y, 512, 64);
      for (let k = 0; k < 9; k++) {
        g.strokeStyle = `rgba(${rr() < 0.5 ? "80,45,25" : "210,170,120"},${0.06 + rr() * 0.1})`; g.lineWidth = 1 + rr() * 2;
        g.beginPath(); const yy = y + 4 + k * 6.5; g.moveTo(x, yy); g.bezierCurveTo(x + 170, yy + (rr() - 0.5) * 8, x + 340, yy + (rr() - 0.5) * 8, x + 512, yy); g.stroke();
      }
      g.strokeStyle = "rgba(60,35,20,.45)"; g.lineWidth = 2; g.strokeRect(x, y, 512, 64);
    }
  });
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(2.4, 2.4);
  const rugTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#EADBC8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8B1D3D"; g.fillRect(0, 0, w, 24); g.fillRect(0, h - 24, w, 24); g.fillRect(0, 0, 24, h); g.fillRect(w - 24, 0, 24, h);
    const s = 48;
    for (let y = 40; y < h - 40; y += s) for (let x = 40; x < w - 40; x += s) {
      g.fillStyle = ((x + y) / s) % 2 ? "#5E1028" : "#C98B9C";
      g.beginPath(); g.moveTo(x + s / 2, y + 6); g.lineTo(x + s - 6, y + s / 2); g.lineTo(x + s / 2, y + s - 6); g.lineTo(x + 6, y + s / 2); g.closePath(); g.fill();
      g.fillStyle = "#EADBC8"; g.beginPath(); g.moveTo(x + s / 2, y + 16); g.lineTo(x + s - 16, y + s / 2); g.lineTo(x + s / 2, y + s - 16); g.lineTo(x + 16, y + s / 2); g.closePath(); g.fill();
    }
    const id = g.getImageData(0, 0, w, h), rr = rng(3);
    for (let i = 0; i < id.data.length; i += 4) { const n = (rr() - 0.5) * 22; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; }
    g.putImageData(id, 0, 0);
  });
  const fabricTex = canvasTex(256, 256, (g, w, h) => {
    const rr = rng(8); g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const v = 100 + rr() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rr() * w, rr() * h, 2, 1); }
  }, false);
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping; fabricTex.repeat.set(4, 4);
  const artTex = (a, b, c) => canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = "#F6EEE6"; g.fillRect(0, 0, w, h);
    g.fillStyle = a; g.beginPath(); g.arc(w * 0.35, h * 0.4, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = b; g.fillRect(w * 0.45, h * 0.45, 110, 130);
    g.fillStyle = c; g.beginPath(); g.ellipse(w * 0.6, h * 0.75, 70, 40, 0.4, 0, Math.PI * 2); g.fill();
  });
  const chartTex = canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = "#FBF6F2"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8B1D3D"; g.font = "bold 30px Inter, sans-serif"; g.fillText("USD 823", 28, 58);
    g.fillStyle = "#7A6C70"; g.font = "18px Inter, sans-serif"; g.fillText("Para vos en septiembre", 28, 86);
    [297, 312, 855, 710, 578, 487, 676, 676, 818, 1014, 1098, 507].forEach((x, i) => { const bh = x / 1100 * 180; g.fillStyle = x >= 495 ? "#8B1D3D" : "#E9A3B6"; g.fillRect(28 + i * 38, h - 24 - bh, 26, bh); });
  });
  const phoneTex = canvasTex(160, 320, (g, w) => {
    g.fillStyle = "#1A1216"; g.fillRect(0, 0, w, 320);
    g.fillStyle = "#FBF6F2"; g.beginPath(); g.roundRect(12, 70, w - 24, 70, 14); g.fill();
    g.fillStyle = "#8B1D3D"; g.font = "bold 18px Inter, sans-serif"; g.fillText("Nueva reserva", 24, 100);
    g.fillStyle = "#6B5E62"; g.font = "15px Inter, sans-serif"; g.fillText("Respondida en 4 min", 24, 124);
  });

  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color: C(color), roughness: 0.85, ...o });
  const add = (geo, m, x, y, z, parent = room) => {
    const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b;
  };
  const box = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const rbox = (w, h, d, rad, m, x, y, z) => add(new RoundedBoxGeometry(w, h, d, 4, rad), m, x, y, z);

  const RW = 6, RD = 6.5, RH = 2.8, Z0 = -4, Z1 = 2.5;
  const wallMat = mat("#F2EBE3", { roughness: 0.95 });
  const oak = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.5 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.38, envMapIntensity: 1.2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true; room.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), mat("#FBF7F2")); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, RH, (Z0 + Z1) / 2); room.add(ceil);
  const wall = (w, h, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); p.position.set(x, y, z); p.rotation.y = ry; p.receiveShadow = true; room.add(p); return p; };
  wall(RW, RH, 0, RH / 2, Z0, 0);
  wall(RD, RH, RW / 2, RH / 2, (Z0 + Z1) / 2, -Math.PI / 2);
  wall(RW, RH, 0, RH / 2, Z1, Math.PI);
  // Zócalos
  const baseM = mat("#FFFFFF", { roughness: 0.5 });
  box(RW, 0.09, 0.02, baseM, 0, 0.045, Z0 + 0.01); box(0.02, 0.09, RD, baseM, RW / 2 - 0.01, 0.045, (Z0 + Z1) / 2);

  // Pared izquierda con ventanal a la ciudad
  [[RD, 0.55, 0.275, (Z0 + Z1) / 2], [RD, 0.35, RH - 0.175, (Z0 + Z1) / 2], [1.2, RH, RH / 2, Z1 - 0.6], [1.0, RH, RH / 2, Z0 + 0.5]]
    .forEach(([w, h, y, z]) => wall(w, h, -RW / 2, y, z, Math.PI / 2));
  const skylineCanvas = document.createElement("canvas"); skylineCanvas.width = 1024; skylineCanvas.height = 512;
  const skylineTex = new THREE.CanvasTexture(skylineCanvas); skylineTex.colorSpace = THREE.SRGBColorSpace;
  const skylineMat = new THREE.MeshBasicMaterial({ map: skylineTex, toneMapped: false });
  const skyline = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), skylineMat);
  skyline.rotation.y = Math.PI / 2; skyline.position.set(-RW / 2 - 1.8, 1.6, (Z0 + Z1) / 2 - 0.5); room.add(skyline);
  function paintSkyline(m) {
    const g = skylineCanvas.getContext("2d"), w = 1024, h = 512;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#" + pick("skyTop", m).getHexString()); gr.addColorStop(1, "#" + pick("skyBot", m).getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rr = rng(11);
    for (let layer = 0; layer < 2; layer++) {
      let x = 0;
      while (x < w) {
        const bw = lerp(40, 110, rr()), bh = lerp(120, 330, rr()) * (layer ? 0.75 : 1);
        g.fillStyle = layer ? (m > 0.5 ? "#24161F" : "#CDBAB6") : (m > 0.5 ? "#150C12" : "#B09C9C");
        g.fillRect(x, h - bh, bw, bh);
        for (let yy = h - bh + 10; yy < h - 8; yy += 18) for (let xx = x + 6; xx < x + bw - 8; xx += 14) {
          if (m > 0.5 ? rr() < 0.42 : rr() < 0.05) { g.fillStyle = m > 0.5 ? "rgba(255,200,130,.95)" : "rgba(80,90,110,.5)"; g.fillRect(xx, yy, 7, 9); }
        }
        x += bw + lerp(2, 18, rr());
      }
    }
    g.fillStyle = m > 0.5 ? "#EDE2E6" : "#F5EFEA";
    g.beginPath(); g.moveTo(600, h - 360); g.lineTo(612, h - 340); g.lineTo(620, h); g.lineTo(580, h); g.lineTo(588, h - 340); g.closePath(); g.fill();
    skylineTex.needsUpdate = true;
  }
  const frameM = mat("#2B2326", { roughness: 0.45, metalness: 0.4 });
  [0.55, RH - 0.35].forEach(y => box(0.07, 0.05, RD - 2.2, frameM, -RW / 2 + 0.02, y, (Z0 + Z1) / 2 - 0.05));
  for (let k = 0; k <= 4; k++) box(0.07, RH - 0.9, 0.045, frameM, -RW / 2 + 0.02, (RH - 0.9) / 2 + 0.55, Z0 + 1.0 + k * (RD - 2.2) / 4);
  // Cortinas livianas con pliegues
  const curtainGeo = new THREE.PlaneGeometry(0.9, RH - 0.2, 40, 1);
  const cp = curtainGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 22) * 0.035);
  curtainGeo.computeVertexNormals();
  const curtainMat = new THREE.MeshStandardMaterial({ color: C("#FFFDF9"), roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  [Z0 + 0.95, Z1 - 1.05].forEach(z => { const c = new THREE.Mesh(curtainGeo, curtainMat); c.rotation.y = Math.PI / 2; c.position.set(-RW / 2 + 0.12, RH / 2 - 0.05, z); room.add(c); });
  // Haces de luz del ventanal (de día)
  const shaftTex = canvasTex(64, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "rgba(255,240,215,.0)"); gr.addColorStop(0.3, "rgba(255,240,215,.35)"); gr.addColorStop(1, "rgba(255,240,215,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); }, false);
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) { const sft = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.6), shaftMat); sft.position.set(-1.6, 1.3, -2.6 + k * 1.1); sft.rotation.set(0, Math.PI / 2, 0.95); room.add(sft); }

  // Tarima y cama
  box(2.4, 0.25, 2.1, oak, -1.8, 0.125, -2.95);
  rbox(1.7, 0.28, 2.0, 0.04, mat("#E8E0D8"), -1.95, 0.39, -2.95);
  const linen = new THREE.MeshStandardMaterial({ color: C("#FFFFFF"), roughness: 1, map: fabricTex });
  rbox(1.66, 0.14, 1.6, 0.06, linen, -1.95, 0.6, -2.7);
  rbox(1.74, 0.07, 0.75, 0.035, mat("#C98B9C", { roughness: 1 }), -1.95, 0.68, -2.25);
  rbox(0.6, 0.17, 0.36, 0.08, linen, -2.32, 0.72, -3.62); rbox(0.6, 0.17, 0.36, 0.08, linen, -1.58, 0.72, -3.62);
  rbox(1.9, 0.9, 0.09, 0.03, mat("#8B6A50", { roughness: 0.7 }), -1.95, 0.85, -3.93);
  // Mesa de luz con velador
  box(0.45, 0.45, 0.4, oak, -0.7, 0.475, -3.6);
  add(new THREE.CylinderGeometry(0.05, 0.07, 0.25, 16), mat("#F4EDE6", { roughness: 0.3 }), -0.7, 0.82, -3.6);
  const shadeNight = new THREE.MeshStandardMaterial({ color: C("#F8EEDF"), emissive: C("#FFC77E"), emissiveIntensity: 0, roughness: 1, side: THREE.DoubleSide });
  add(new THREE.CylinderGeometry(0.11, 0.15, 0.18, 24, 1, true), shadeNight, -0.7, 1.02, -3.6);
  const bedLamp = new THREE.PointLight(0xFFB870, 0, 4, 1.8); bedLamp.position.set(-0.7, 1.0, -3.5); room.add(bedLamp);
  // Listones divisores
  for (let k = 0; k < 12; k++) box(0.05, RH - 0.25, 0.08, oak, -2.85 + k * 0.19, 0.25 + (RH - 0.25) / 2, -1.82);
  // Consola con notebook y libros
  rbox(1.5, 0.05, 0.42, 0.01, mat("#E7DDD2", { roughness: 0.4 }), -1.8, 0.78, -1.5); box(1.5, 0.72, 0.4, mat("#D9CBBE"), -1.8, 0.4, -1.5);
  rbox(0.42, 0.015, 0.3, 0.005, mat("#3A3236", { metalness: 0.6, roughness: 0.3 }), -1.65, 0.81, -1.5);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.27), new THREE.MeshBasicMaterial({ map: chartTex, toneMapped: false }));
  screen.position.set(-1.65, 0.96, -1.66); screen.rotation.x = -0.18; room.add(screen);
  [["#8B1D3D", 0.05], ["#E9C6CF", 0.04], ["#3A3236", 0.035]].forEach(([c, h], i) => box(0.24, h, 0.17, mat(c), -2.3, 0.83 + i * 0.045, -1.48));
  // Sillón en carmesí con almohadones
  const sofaM = new THREE.MeshStandardMaterial({ color: C("#8B1D3D"), roughness: 0.95, map: fabricTex });
  rbox(2.0, 0.42, 0.9, 0.08, sofaM, 1.55, 0.31, -3.45); rbox(2.0, 0.55, 0.24, 0.1, sofaM, 1.55, 0.72, -3.83);
  rbox(0.22, 0.34, 0.92, 0.09, sofaM, 0.6, 0.6, -3.45); rbox(0.22, 0.34, 0.92, 0.09, sofaM, 2.5, 0.6, -3.45);
  rbox(0.46, 0.42, 0.14, 0.07, mat("#F1E4D6"), 1.0, 0.74, -3.62).rotation.z = 0.08; rbox(0.4, 0.38, 0.14, 0.07, mat("#D9A27E"), 2.05, 0.72, -3.62).rotation.z = -0.1;
  // Alfombra, mesa ratona, teléfono y florero
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(1.4, 0.006, -2.2); rug.receiveShadow = true; room.add(rug);
  rbox(1.0, 0.05, 0.6, 0.015, mat("#FBF8F4", { roughness: 0.25 }), 1.45, 0.42, -2.15);
  rbox(0.9, 0.03, 0.5, 0.01, mat("#FBF8F4"), 1.45, 0.16, -2.15);
  [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]].forEach(([dx, dz]) => box(0.05, 0.42, 0.05, oak, 1.45 + dx, 0.21, -2.15 + dz));
  rbox(0.09, 0.012, 0.18, 0.005, mat("#1A1216", { metalness: 0.5, roughness: 0.25 }), 1.3, 0.452, -2.05);
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.16), new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false }));
  phoneScreen.rotation.x = -Math.PI / 2; phoneScreen.position.set(1.3, 0.46, -2.05); room.add(phoneScreen);
  add(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 24), mat("#F6F1EC", { roughness: 0.15, metalness: 0.1 }), 1.7, 0.555, -2.2);
  for (let k = 0; k < 7; k++) {
    const st = add(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 4), mat("#C9A77E"), 1.7 + Math.sin(k) * 0.03, 0.85, -2.2 + Math.cos(k) * 0.03); st.rotation.z = Math.sin(k * 1.7) * 0.25;
    const plume = add(new THREE.SphereGeometry(0.035, 10, 10), mat("#E9D6BC"), st.position.x + Math.sin(k * 1.7) * -0.1, 1.07, st.position.z); plume.scale.set(1, 2.4, 1);
  }
  // Cuadros
  [[artTex("#C98B9C", "#8B1D3D", "#D9A27E"), 0.95], [artTex("#5E1028", "#E9C6CF", "#C9A77E"), 2.15]].forEach(([t, x]) => {
    box(0.82, 1.02, 0.03, mat("#C9A77E", { roughness: 0.5 }), x, 1.75, Z0 + 0.02);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.94), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); a.position.set(x, 1.75, Z0 + 0.04); room.add(a);
  });
  // Puerta de entrada (hacemos el check in en persona)
  box(0.05, 2.1, 0.95, mat("#A97C55", { roughness: 0.45 }), RW / 2 - 0.03, 1.05, -0.5);
  box(0.04, 2.2, 0.06, mat("#F4EEE8"), RW / 2 - 0.03, 1.1, -1.0); box(0.04, 2.2, 0.06, mat("#F4EEE8"), RW / 2 - 0.03, 1.1, 0.0); box(0.04, 0.06, 1.06, mat("#F4EEE8"), RW / 2 - 0.03, 2.18, -0.5);
  box(0.06, 0.03, 0.14, mat("#C9B9A8", { metalness: 0.9, roughness: 0.25 }), RW / 2 - 0.08, 1.02, -0.13);
  // Llavero sobre una repisa junto a la puerta
  box(0.4, 0.03, 0.18, oak, RW / 2 - 0.12, 1.2, 0.45);
  add(new THREE.TorusGeometry(0.03, 0.006, 8, 20), mat("#C9A77E", { metalness: 0.9, roughness: 0.3 }), RW / 2 - 0.14, 1.23, 0.42).rotation.x = Math.PI / 2;
  // Lámparas colgantes y spots de techo
  const lampShade = new THREE.LatheGeometry([0, 0.02, 0.1, 0.17, 0.2, 0.17, 0.08, 0.0].map((x, i) => new THREE.Vector2(x, -i * 0.05)), 32);
  const shadeM = new THREE.MeshStandardMaterial({ color: C("#C68B4E"), roughness: 0.55, emissive: C("#FFB466"), emissiveIntensity: 0, side: THREE.DoubleSide });
  const pend = [];
  [[1.15, -2.15], [1.8, -2.25]].forEach(([x, z], i) => {
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 4), mat("#222"), x, RH - 0.35, z);
    add(lampShade, shadeM, x, RH - 0.7, z).castShadow = false;
    const pl = new THREE.PointLight(0xFFB870, 0, 7, 1.6); pl.position.set(x, RH - 0.92, z);
    if (i === 0 && HQ) { pl.castShadow = true; pl.shadow.mapSize.set(512, 512); pl.shadow.bias = -0.002; pl.shadow.radius = 6; }
    room.add(pl); pend.push(pl);
  });
  const spotM = new THREE.MeshStandardMaterial({ color: C("#FFFFFF"), emissive: C("#FFF1DC"), emissiveIntensity: 0 });
  [[-1.5, -0.5], [1.5, 0.6], [0, 1.6]].forEach(([x, z]) => { const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), spotM); d.rotation.x = Math.PI / 2; d.position.set(x, RH - 0.005, z); room.add(d); });

  /* ───────────── POSTPROCESO ───────────── */
  let composer = null, renderPass = null, bloom = null;
  if (HQ) {
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(city, camera);
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.2, 0.55, 0.9);
    composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass());
  }

  /* ───────────── CÁMARA ───────────── */
  const CITY_KEYS = [
    [0.00, V(78, 92, 118), V(-12, 0, -12)],
    [0.18, V(36, 34, 58), V(0, 7, 0)],
    [0.34, V(14, 10.5, 24), V(0, 10, 0)],
    [0.52, V(-4, 36, 36), V(-72, 0, -72)],
    [0.68, V(HERO.x + 14, 11, HERO.z - 20), V(HERO.x, 4.2, HERO.z)],
    [0.84, V(HERO.x + 5, 6.5, HERO.z - 11), V(HERO.x, 4.5, HERO.z)],
    [0.94, V(WIN.x, WIN.y + 0.2, WIN.z - 2.2), V(WIN.x, WIN.y, WIN.z)],
    [1.00, V(WIN.x, WIN.y, WIN.z - 0.3), V(WIN.x, WIN.y, WIN.z + 2)],
  ];
  const ROOM_KEYS = [
    [0.00, V(0, 1.55, 2.35), V(0, 1.2, -2.5)],
    [0.22, V(0.9, 1.45, 1.1), V(-1.9, 0.75, -2.9)],
    [0.44, V(0.4, 1.45, 1.0), V(2.9, 1.05, -0.4)],
    [0.66, V(-0.1, 1.3, 0.2), V(1.3, 0.55, -2.1)],
    [0.80, V(0.6, 1.35, 0.4), V(-1.6, 0.9, -1.55)],
    [1.00, V(0.2, 1.75, 2.3), V(0, 0.95, -2.6)],
  ];
  const CUT = 0.6;
  const anchors = {
    obe: PLACES[0].label, acu: PLACES[1].label, oll: PLACES[2].label, obelisco: OBELISCO,
    bed: V(-1.9, 0.85, -2.8), door: V(RW / 2 - 0.08, 1.15, -0.4), phone: V(1.3, 0.5, -2.05), laptop: V(-1.65, 1.02, -1.6), sofa: V(1.55, 0.95, -3.45),
  };
  const ROOM_ANCHORS = new Set(["bed", "door", "phone", "laptop", "sofa"]);

  function applyTheme(m, full) {
    uNight.value = m;
    skyMat.uniforms.top.value.copy(pick("skyTop", m)); skyMat.uniforms.bot.value.copy(pick("skyBot", m)); skyMat.uniforms.sunAmt.value = 1 - m;
    city.fog.color.copy(pick("fog", m));
    groundMat.color.copy(pick("ground", m)); blockMat.color.copy(pick("block", m)); waterMat.color.copy(pick("water", m));
    medianMat.color.copy(C("#CDB2A3").lerp(C("#2E2228"), m)); plazaMat.color.copy(C("#E4D2C4").lerp(C("#3A2C33"), m));
    hemi.color.copy(pick("hemiSky", m)); hemi.groundColor.copy(pick("hemiGround", m)); hemi.intensity = lerp(0.5, 0.4, m);
    sun.color.copy(pick("sun", m)); sun.intensity = lerp(2.7, 0.22, m);
    city.environmentIntensity = lerp(0.45, 0.2, m);
    starMat.opacity = m; lampMat.opacity = m * 0.85; poolMat.opacity = m * 0.22; carLightMat.opacity = m; lineMat.opacity = lerp(0.55, 0.12, m);
    moon.material.opacity = m;
    obeMat.emissiveIntensity = m * 0.45;
    crownMat.emissiveIntensity = m * 1.4;
    heroMat.color.copy(C("#C98B9C").lerp(C("#8A4256"), m));
    canopyMat.color.copy(C("#FFFFFF").lerp(C("#6E5A7E"), m));
    beams.forEach(b => b.material.opacity = lerp(0.25, 0.7, m));
    portalMat.color.copy(C("#F5D6B8").lerp(C("#FFC277"), m));
    renderer.toneMappingExposure = lerp(0.82, 1.05, m);
    if (bloom) { bloom.strength = lerp(0.04, 0.5, m); bloom.threshold = lerp(1.6, 0.85, m); bloom.radius = lerp(0.3, 0.42, m); }
    // Interior
    rHemi.color.copy(pick("roomHemi", m)); rHemi.intensity = lerp(0.45, 0.16, m);
    rSun.intensity = lerp(2.8, 0.0, m); shaftMat.opacity = lerp(0.32, 0, m);
    room.environmentIntensity = lerp(0.22, 0.1, m);
    pend.forEach(p => p.intensity = lerp(0.1, 1.7, m)); bedLamp.intensity = lerp(0, 0.9, m);
    shadeM.emissiveIntensity = lerp(0, 0.55, m); shadeNight.emissiveIntensity = lerp(0, 0.8, m); spotM.emissiveIntensity = lerp(0, 0.5, m);
    curtainMat.opacity = lerp(0.55, 0.85, m);
    room.background = pick("windowSky", m);
    if (full) { paintSkyline(m); refreshEnv(); }
  }
  applyTheme(state.night, true);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 64 : 50;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);
  if (!mobile) addEventListener("pointermove", e => { state.mx = e.clientX / innerWidth - 0.5; state.my = e.clientY / innerHeight - 0.5; });

  const v3 = new THREE.Vector3(), focus = new THREE.Vector3();
  let labelEls = [], lastPaint = state.night, running = false, visible = true, last = performance.now();
  const AUTO_LEN = 46; // segundos de la vuelta automática en mobile

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.time += dt;
    if (state.auto) {
      if (!reduce) state.autoT = (state.autoT + dt / AUTO_LEN) % 1;
      state.p = state.pShown = state.autoT;
    } else {
      state.pShown = reduce ? state.p : lerp(state.pShown, state.p, 1 - Math.pow(0.0015, dt));
    }
    if (Math.abs(state.night - state.nightTarget) > 0.001) {
      state.night = lerp(state.night, state.nightTarget, 1 - Math.pow(0.02, dt));
      const done = Math.abs(state.night - state.nightTarget) < 0.002;
      if (done) state.night = state.nightTarget;
      applyTheme(state.night, done || Math.abs(state.night - lastPaint) > 0.15);
      if (done || Math.abs(state.night - lastPaint) > 0.15) lastPaint = state.night;
    }
    const p = state.pShown, inRoom = p >= CUT;
    let pos, look;
    if (!inRoom) {
      [pos, look] = track(CITY_KEYS, p / CUT);
      if (!reduce) { const idle = 1 - clamp01(p / 0.08); pos = pos.clone().add(V(Math.sin(state.time * 0.15) * 6 * idle, 0, Math.cos(state.time * 0.15) * 4 * idle)); }
      moveCars(dt);
      beams.forEach((b, i) => b.material.opacity = lerp(0.25, 0.7, state.night) * (0.78 + 0.22 * Math.sin(state.time * 2 + i)));
      if (HQ) {
        focus.copy(look).setY(0).lerp(V(pos.x, 0, pos.z), 0.35);
        sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN_DIR, 220);
        const span = clamp01(pos.y / 90) * 55 + 22;
        Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span }); sun.shadow.camera.updateProjectionMatrix();
      }
    } else {
      [pos, look] = track(ROOM_KEYS, (p - CUT) / (1 - CUT));
    }
    const par = inRoom ? 0.12 : 1.2 * clamp01(1 - p / CUT * 1.2);
    camera.position.copy(pos).add(V(state.mx * par, -state.my * par * 0.6, 0));
    camera.lookAt(look);
    const scene = inRoom ? room : city;
    if (composer) { renderPass.scene = scene; composer.render(dt); } else renderer.render(scene, camera);

    // Etiquetas HTML ancladas a puntos 3D
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of labelEls) {
      const a = anchors[l.dataset.anchor];
      const from = +l.dataset.from, to = +l.dataset.to, isRoom = ROOM_ANCHORS.has(l.dataset.anchor);
      let on = !state.auto && p >= from && p <= to && isRoom === inRoom;
      if (on) {
        v3.copy(a).project(camera);
        if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) on = false;
        else { l.style.transform = `translate3d(${(v3.x * 0.5 + 0.5) * w}px, ${(-v3.y * 0.5 + 0.5) * h}px, 0)`; l.classList.toggle("flip", v3.x > 0.2); }
      }
      l.classList.toggle("on", on);
    }
  }

  return {
    CUT,
    setProgress(p) { state.p = clamp01(p); },
    getProgress() { return state.pShown; },
    setAuto(on) { state.auto = on; },
    setNight(on, instant) { state.nightTarget = on ? 1 : 0; if (instant) { state.night = state.nightTarget; applyTheme(state.night, true); lastPaint = state.night; } },
    setLabels(els) { labelEls = els; },
    setVisible(v) { visible = v; },
    start() { if (!running) { running = true; requestAnimationFrame(t => { last = t; frame(t); }); } },
    resize,
  };
}
