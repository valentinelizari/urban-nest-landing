// Recorrido 3D: Buenos Aires de día o de noche, el Obelisco, nuestros departamentos
// y el ingreso por una ventana al interior del Urban Nest Obelisco.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
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

// Paletas de día (0) y de noche (1). Sin verdes.
const PAL = {
  skyTop: [C("#7FA7D3"), C("#07040A")],
  skyBot: [C("#F6DCC8"), C("#3B1526")],
  fog: [C("#E9D3C6"), C("#1E0D16")],
  ground: [C("#6F6769"), C("#141013")],
  block: [C("#C9BDB4"), C("#262025")],
  water: [C("#8A9DAC"), C("#2A2133")],
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
  // Resolución fija según un presupuesto de píxeles: nunca cambia durante el scroll
  const PIXEL_BUDGET = mobile ? 1.1e6 : 2.1e6;
  const dprFor = (w, h) => Math.max(0.75, Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.25, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h))));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = HQ;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // las sombras se recalculan solo cuando cambia el encuadre o el tema

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

  // Luna
  const disc = radial([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,1)"], [0.42, "rgba(255,255,255,.3)"], [1, "rgba(255,255,255,0)"]]);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: 0xF6EAF0, transparent: true, fog: false, depthWrite: false }));
  moon.position.set(-380, 260, -600); moon.scale.set(60, 60, 1); city.add(moon);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0); city.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const SUN_DIR = V(0.62, 0.42, -0.66).normalize();
  const SHADOW_SPAN = 150;
  sun.castShadow = HQ;
  if (HQ) {
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -SHADOW_SPAN, right: SHADOW_SPAN, top: SHADOW_SPAN, bottom: -SHADOW_SPAN, near: 1, far: 700 });
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.14; sun.shadow.radius = 3;
  }
  sun.target.position.set(-15, 0, -15); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 300);
  city.add(sun, sun.target);

  // Suelo, río, manzanas y calles
  const groundMat = new THREE.MeshStandardMaterial({ color: pick("ground", 0), roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1108, 2400), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.x = -446; ground.receiveShadow = true; city.add(ground);
  // Río de la Plata: agua con oleaje animado que refleja el cielo, costanera y algunos barcos
  const waveN = (() => {
    const w = 256, c = document.createElement("canvas"); c.width = c.height = w;
    const g = c.getContext("2d"), img = g.createImageData(w, w), d = img.data;
    const H = (x, y) => Math.sin(x * 0.098 + Math.sin(y * 0.05) * 2) * 0.5 + Math.sin(y * 0.147 + x * 0.03) * 0.35 + Math.sin((x + y) * 0.21) * 0.15;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = H(x + 1, y) - H(x - 1, y), dy = H(x, y + 1) - H(x, y - 1), l = Math.hypot(dx, dy, 0.6), i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (0.6 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(90, 240); return t;
  })();
  const waterMat = new THREE.MeshStandardMaterial({ color: pick("water", 0), roughness: 0.22, metalness: 0.55, normalMap: waveN, normalScale: new THREE.Vector2(0.16, 0.16) });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 2400), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(108 + 450, -0.4, 0); city.add(water);
  const shoreMat = new THREE.MeshStandardMaterial({ color: C("#D8CBBE"), roughness: 0.9 });
  const shore = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 2400), shoreMat); shore.position.set(107.4, -0.1, 0); city.add(shore);
  const boats = [];
  const boatMat = new THREE.MeshStandardMaterial({ color: C("#F4EFEA"), roughness: 0.5 });
  [[150, -60], [190, 30], [240, -150], [175, 120]].forEach(([x, z], i) => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 4.4), boatMat); hull.position.y = -0.15; b.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.4), boatMat); cab.position.set(0, 0.3, -0.6); b.add(cab);
    b.position.set(x, 0, z); b.rotation.y = i * 0.7; city.add(b); boats.push(b);
  });

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

  function facadeMaterial(color, top = 0) {
    const mtl = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
    mtl.onBeforeCompile = sh => {
      sh.uniforms.uNight = uNight; sh.uniforms.uTop = { value: top };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          varying vec3 vWP; varying vec3 vWN; flat varying float vSeed; flat varying float vTop; uniform float uTop;
          #ifdef USE_INSTANCING
            attribute float aSeed; attribute float aTop;
          #endif`)
        .replace("#include <project_vertex>", `#include <project_vertex>
          mat4 unM = modelMatrix;
          #ifdef USE_INSTANCING
            unM = modelMatrix * instanceMatrix; vSeed = aSeed; vTop = aTop;
          #else
            vSeed = 0.37; vTop = uTop;
          #endif
          vWP = (unM * vec4(transformed, 1.0)).xyz;
          vWN = normalize(mat3(unM) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vWP; varying vec3 vWN; flat varying float vSeed; flat varying float vTop; uniform float uNight;
          float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
          // Banda suavizada según el tamaño del píxel: sin serrucho ni titileo al moverse
          float band(float x, float a, float b, float w){ return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float tower = step(1.5, vSeed);
          float sd = fract(vSeed);
          float wall = 1.0 - step(0.5, abs(vWN.y));
          vec2 fu = abs(vWN.x) > 0.5 ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y);
          float colW = mix(0.55, 0.8, sd);
          vec2 cell = vec2(fu.x / colW, (fu.y - 0.3) / ${FLOOR.toFixed(2)});
          vec2 f = fract(cell);
          float gw = mix(0.2, 0.32, fract(sd * 7.1));
          vec2 aa = max(fwidth(cell), vec2(0.002)) * 0.75;
          float dist = distance(vWP, cameraPosition);
          // Lejos o en ángulo rasante la grilla se promedia: evita ruido y moiré
          float px = max(aa.x, aa.y);
          float lod = max(smoothstep(55.0, 150.0, dist), smoothstep(0.1, 0.24, px));
          float detail = (1.0 - smoothstep(18.0, 45.0, dist)) * (1.0 - smoothstep(0.035, 0.07, px));
          float inX = band(f.x, gw, 1.0 - gw, aa.x), inY = band(f.y, 0.26, 0.86, aa.y);
          float win = inX * inY * step(0.0, cell.y) * wall;
          // Marco, parteluz, alféizar y cortinas: solo de cerca, donde se distinguen
          float frameIn = band(f.x, gw + 0.045, 1.0 - gw - 0.045, aa.x) * band(f.y, 0.3, 0.82, aa.y);
          float frame = win * (1.0 - frameIn) * detail * (1.0 - tower);
          float mull = win * (1.0 - smoothstep(0.012, 0.012 + aa.x * 2.0, abs(f.x - 0.5))) * detail * (1.0 - tower);
          float sill = band(f.x, gw - 0.03, 1.0 - gw + 0.03, aa.x) * band(f.y, 0.215, 0.26, aa.y) * step(0.0, cell.y) * wall * detail;
          float kc = h21(floor(cell) * 2.3 + sd * 5.0);
          float curtainH = kc < 0.55 ? mix(0.2, 0.5, kc / 0.55) : 0.0;
          float curtain = win * frameIn * smoothstep(0.82 - curtainH - aa.y, 0.82 - curtainH + aa.y, f.y) * detail * (1.0 - tower);
          // Torres: vidrio continuo con losas
          float slab = step(0.9, f.y);
          win = mix(win, (1.0 - slab) * wall * step(0.0, cell.y), tower);
          // Cornisa y balcones corridos en edificios residenciales
          float cornice = wall * step(vTop - 0.17, vWP.y);
          float resi = (1.0 - tower) * step(sd, 0.5) * step(0.0, cell.y) * wall;
          float balc = resi * step(f.y, 0.07);
          float balcShade = resi * step(0.07, f.y) * step(f.y, 0.15);
          win *= 1.0 - cornice;
          frame *= 1.0 - cornice; mull *= 1.0 - cornice; curtain *= 1.0 - cornice; sill *= 1.0 - cornice;
          // Planta baja: locales
          float shop = wall * (1.0 - step(0.3, vWP.y - 0.14)) * step(0.06, vWP.y - 0.14) * step(0.12, fract(fu.x / 1.6)) * step(fract(fu.x / 1.6), 0.88);
          float rnd = h21(floor(cell) + sd * 31.0 + floor(vWN.xz + 0.5) * 11.0);
          float lit = mix(step(mix(0.68, 0.58, tower), rnd), 0.36, lod);
          // A la distancia la grilla se reemplaza por su promedio: así no aparece efecto moiré
          float winAvg = mix(0.34, 0.75, tower) * wall * step(0.0, cell.y) * (1.0 - cornice);
          vec3 glassDay = mix(vec3(0.24, 0.29, 0.36), vec3(0.42, 0.5, 0.6), h21(floor(cell) * 0.7 + sd));
          vec3 glass = mix(glassDay, vec3(0.03, 0.025, 0.04), uNight);
          // Oclusión aproximada: más oscuro cerca del suelo
          float ao = mix(0.6, 1.0, smoothstep(0.0, 2.5, vWP.y));
          diffuseColor.rgb *= ao * mix(1.0, 0.5, uNight);
          float glassAmt = mix(win * (1.0 - frame) * (1.0 - mull) * (1.0 - curtain), winAvg, lod);
          vec3 wallC = diffuseColor.rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, clamp(glassAmt * 0.85 + shop * 0.8, 0.0, 1.0));
          vec3 frameC = mix(vec3(0.86, 0.83, 0.8), vec3(0.16, 0.13, 0.14), step(0.6, fract(sd * 13.7)));
          diffuseColor.rgb = mix(diffuseColor.rgb, frameC * mix(1.0, 0.45, uNight), clamp(frame + mull, 0.0, 1.0) * (1.0 - tower) * (1.0 - lod));
          vec3 curtainC = mix(vec3(0.86, 0.8, 0.72), vec3(0.74, 0.62, 0.6), step(0.5, fract(kc * 9.3)));
          diffuseColor.rgb = mix(diffuseColor.rgb, curtainC * mix(1.0, 0.35, uNight), curtain * (1.0 - tower) * (1.0 - lod));
          diffuseColor.rgb = mix(diffuseColor.rgb, wallC * 1.12, sill * (1.0 - tower) * (1.0 - lod));
          diffuseColor.rgb *= 1.0 + 0.16 * cornice + 0.14 * balc - 0.28 * balcShade;
          float roof = 1.0 - wall;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.78, 0.77), roof);`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          float glz = clamp(mix(win * (1.0 - frame) * (1.0 - curtain), winAvg, lod) + shop, 0.0, 1.0);
          roughnessFactor = mix(roughnessFactor, 0.12, glz);`)
        .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, 0.55, glz * (1.0 - uNight * 0.7));`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float k = h21(floor(cell) * 1.7 + sd);
          vec3 warm = k < 0.75 ? vec3(1.0, 0.72, 0.42) : (k < 0.93 ? vec3(1.0, 0.88, 0.7) : vec3(0.62, 0.72, 1.0));
          float dim = mix(0.55, 1.4, h21(floor(cell) * 3.1 + 2.0));
          warm = mix(warm, vec3(1.0, 0.76, 0.5), lod); dim = mix(dim, 0.9, lod);
          float glowA = mix(win * (1.0 - frame) * (1.0 - mull) * (1.0 - curtain * 0.45), winAvg, lod);
          totalEmissiveRadiance += glowA * lit * warm * dim * uNight * 0.75;
          float shopLit = step(0.45, h21(vec2(floor(fu.x / 1.6), sd * 9.0)));
          totalEmissiveRadiance += shop * shopLit * vec3(1.0, 0.8, 0.55) * uNight * 1.0;`);
    };
    mtl.customProgramCacheKey = () => "facade3";
    return mtl;
  }
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  // Volúmenes: cada lote más, en algunos, un retiro superior
  const vols = [];
  lots.forEach((l, k) => {
    const col = l.tower ? C("#9FA6AE") : facade[(k * 7 + Math.floor(l.h * 3)) % facade.length];
    vols.push({ x: l.x, z: l.z, w: l.w, d: l.d, y: 0.14, h: l.h, seed: l.seed + (l.tower ? 2 : 0), col });
    l.roof = l.h + 0.14;
    if (!l.tower && l.h > 3.6 && r() < 0.42) {
      const hh = FLOOR * (2 + Math.floor(r() * 3)) + 0.1;
      vols.push({ x: l.x + (r() - 0.5) * l.w * 0.15, z: l.z + (r() - 0.5) * l.d * 0.15, w: l.w * 0.68, d: l.d * 0.68, y: l.roof, h: hh, seed: l.seed, col: col.clone().multiplyScalar(1.04) });
      l.roof += hh;
    }
  });
  const bGeoI = bGeo.clone();
  const seeds = new Float32Array(vols.length), tops = new Float32Array(vols.length);
  vols.forEach((v, k) => { seeds[k] = v.seed; tops[k] = v.y + v.h; });
  bGeoI.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  bGeoI.setAttribute("aTop", new THREE.InstancedBufferAttribute(tops, 1));
  const bMat = facadeMaterial(0xffffff);
  const bInst = new THREE.InstancedMesh(bGeoI, bMat, vols.length);
  vols.forEach((v, k) => {
    m4.makeScale(v.w, v.h, v.d); m4.setPosition(v.x, v.y, v.z);
    bInst.setMatrixAt(k, m4); bInst.setColorAt(k, v.col);
  });
  bInst.castShadow = bInst.receiveShadow = HQ;
  city.add(bInst);

  // Detalles de azotea: tanques y equipos
  const roofBits = [];
  lots.forEach(l => { if (!l.tower && r() < 0.6) { const n = 1 + Math.floor(r() * 3); for (let i = 0; i < n; i++) roofBits.push([l.x + (r() - 0.5) * l.w * 0.4, l.roof, l.z + (r() - 0.5) * l.d * 0.4, 0.3 + r() * 0.45, 0.2 + r() * 0.35]); } });
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
  const lilac = ["#9E84B4", "#AC92C0", "#B9A2CA", "#9479A8"].map(C);
  trees.forEach(([x, z], k) => {
    const sc = 0.75 + r() * 0.5;
    m4.compose(V(x, 1.15 * sc + 0.3, z), q.setFromEuler(new THREE.Euler(0, r() * 6, 0)), V(sc * 1.05, sc * 0.72, sc * 1.05)); canopy.setMatrixAt(k, m4);
    canopy.setColorAt(k, lilac[k % lilac.length]);
    m4.makeScale(1, 1.2 * sc, 1); m4.setPosition(x, 0.1, z); trunk.setMatrixAt(k, m4);
  });
  canopy.castShadow = trunk.castShadow = HQ;
  city.add(canopy, trunk);

  // Edificio Urban Nest (Corrientes y Callao)
  const heroH = HERO.floors * FLOOR + 0.3;
  const heroMat = facadeMaterial(C("#C98B9C"), heroH + 0.14);
  const smallMat = facadeMaterial(C("#C98B9C"), 4.6 + 0.14);
  const heroB = new THREE.Mesh(bGeo, heroMat);
  heroB.scale.set(HERO.w, heroH, HERO.d); heroB.position.set(HERO.x, 0.14, HERO.z);
  heroB.castShadow = heroB.receiveShadow = HQ; city.add(heroB);
  const crownMat = new THREE.MeshStandardMaterial({ color: C("#8B1D3D"), emissive: C("#FF4F7E"), emissiveIntensity: 0, roughness: 0.6 });
  const crown = new THREE.Mesh(new THREE.BoxGeometry(HERO.w + 0.15, 0.24, HERO.d + 0.15), crownMat);
  crown.position.set(HERO.x, heroH + 0.14 + 0.12, HERO.z); city.add(crown);

  // Ventana por la que entramos, sobre la cara que mira a Corrientes
  const WIN = V(HERO.x, 10 * FLOOR + 0.3 + 0.24, HERO.z - HERO.d / 2 - 0.012);
  // El vidrio muestra el interior real: una captura del primer cuadro de la habitación,
  // proyectada en pantalla, para que el paso de la ciudad al interior no tenga cortes ni destellos.
  const snapRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: HQ ? 4 : 0 });
  const portalMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: snapRT.texture }, res: { value: new THREE.Vector2(1, 1) }, gain: { value: 1 } },
    vertexShader: "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform sampler2D map; uniform vec2 res; uniform float gain;
      void main(){ gl_FragColor = vec4(texture2D(map, gl_FragCoord.xy / res).rgb * gain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    toneMapped: true, fog: false,
  });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), portalMat);
  portal.position.copy(WIN); portal.rotation.y = Math.PI; city.add(portal);
  const frameMat = new THREE.MeshStandardMaterial({ color: C("#F5EEE8"), roughness: 0.6 });
  [[0.68, 0.03, 0, 0.165], [0.68, 0.03, 0, -0.165], [0.03, 0.36, 0.325, 0], [0.03, 0.36, -0.325, 0], [0.02, 0.3, 0, 0]].forEach(([w, h, dx, dy]) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), frameMat);
    f.position.set(WIN.x - dx, WIN.y + dy, WIN.z - 0.01); city.add(f);
  });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.03, 0.09), frameMat); sill.position.set(WIN.x, WIN.y - 0.19, WIN.z - 0.04); city.add(sill);

  const PLACES = [
    { key: "obe", pos: V(HERO.x, heroH, HERO.z) },
    { key: "acu", pos: V(-4 * PITCH, 0, -4.5 * PITCH) },
    { key: "oll", pos: V(-8 * PITCH, 0, -8.5 * PITCH) },
  ];
  PLACES.forEach(pl => {
    if (pl.key !== "obe") {
      const h = 4.6;
      const b = new THREE.Mesh(bGeo, smallMat); b.scale.set(4, h, 4); b.position.set(pl.pos.x, 0.14, pl.pos.z); b.castShadow = HQ; city.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.22, 4.15), crownMat); c.position.set(pl.pos.x, h + 0.25, pl.pos.z); city.add(c);
      pl.pos.y = h + 0.3;
    }
    pl.label = V(pl.pos.x, pl.pos.y + 3, pl.pos.z);
  });

  // Obelisco con reflectores
  const obeMat = new THREE.MeshStandardMaterial({ color: C("#F4EFEA"), roughness: 0.55, emissive: C("#FFF4E6"), emissiveIntensity: 0 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 12.6, 4, 1), obeMat);
  shaft.rotation.y = Math.PI / 4; shaft.position.set(0, 6.3 + 0.18, 0); shaft.castShadow = HQ; city.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), obeMat);
  tip.rotation.y = Math.PI / 4; tip.position.set(0, 12.6 + 0.45 + 0.18, 0); city.add(tip);
  const OBELISCO = V(0, 13.6, 0);
  const RIO = V(128, 0, -18);

  // Luces de calle, charcos de luz y autos
  // Faroles como geometría real: columna y luminaria, encendida solo de noche
  const lampPos = [];
  for (let z = -ext; z <= ext; z += 6.6) lampPos.push([-7.7, z], [7.7, z]);
  for (let x = -ext; x <= 98; x += 6.6) lampPos.push([x, -1.35], [x, 1.35]);
  for (let z = -ext * 1.5; z <= ext * 1.5; z += 6) lampPos.push([106.6, z]);
  const poleMat = new THREE.MeshStandardMaterial({ color: C("#3A3236"), roughness: 0.6, metalness: 0.4 });
  const headMat = new THREE.MeshBasicMaterial({ color: C("#5A4E52") });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 5).translate(0, 0.55, 0), poleMat, lampPos.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), headMat, lampPos.length);
  lampPos.forEach(([x, z], k) => { m4.makeTranslation(x, 0.12, z); poles.setMatrixAt(k, m4); m4.makeTranslation(x, 1.24, z); heads.setMatrixAt(k, m4); });
  city.add(poles, heads);

  const CARS = mobile ? 140 : 300;
  const cars = [], cr = rng(99);
  const carColors = ["#F2F0EE", "#1B1A1C", "#8A8C90", "#5E1028", "#2C2F36", "#C9C4BE"].map(C);
  const carGeo = new RoundedBoxGeometry(0.34, 0.2, 0.78, 2, 0.06);
  const carMesh = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 }), CARS);
  for (let i = 0; i < CARS; i++) {
    const onJulio = i < CARS * 0.62, dir = cr() < 0.5 ? 1 : -1;
    const lane = onJulio ? (dir > 0 ? lerp(-7.1, -5.4, cr()) : lerp(5.4, 7.1, cr())) : (dir > 0 ? -0.55 : 0.55);
    cars.push({ onJulio, dir, lane, s: lerp(-ext, onJulio ? ext : 100, cr()), v: lerp(3.5, 8, cr()) });
    const taxi = cr() < 0.28;
    carMesh.setColorAt(i, taxi ? C("#141214") : carColors[Math.floor(cr() * carColors.length)]);
  }
  city.add(carMesh);
  // Luces de los autos pegadas a cada auto (no flotan)
  const headLMat = new THREE.MeshBasicMaterial({ color: C("#FFF1D6"), transparent: true, opacity: 0, depthWrite: false });
  const tailLMat = new THREE.MeshBasicMaterial({ color: C("#FF3355"), transparent: true, opacity: 0, depthWrite: false });
  const lightBox = new THREE.BoxGeometry(0.3, 0.06, 0.03);
  const headL = new THREE.InstancedMesh(lightBox, headLMat, CARS), tailL = new THREE.InstancedMesh(lightBox, tailLMat, CARS);
  city.add(headL, tailL);
  const rotJ = new THREE.Quaternion(), rotC = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  function moveCars(dt) {
    for (let i = 0; i < CARS; i++) {
      const c = cars[i];
      if (!reduce) c.s += c.dir * c.v * dt;
      const max = c.onJulio ? ext : 100;
      if (c.s > max) c.s = -ext; if (c.s < -ext) c.s = max;
      const x = c.onJulio ? c.lane : c.s, z = c.onJulio ? c.s : c.lane;
      m4.compose(p3.set(x, 0.12, z), c.onJulio ? rotJ : rotC, s3); carMesh.setMatrixAt(i, m4);
      const fx = c.onJulio ? 0 : c.dir * 0.4, fz = c.onJulio ? c.dir * 0.4 : 0;
      m4.compose(p3.set(x + fx, 0.16, z + fz), c.onJulio ? rotJ : rotC, s3); headL.setMatrixAt(i, m4);
      m4.compose(p3.set(x - fx, 0.16, z - fz), c.onJulio ? rotJ : rotC, s3); tailL.setMatrixAt(i, m4);
    }
    carMesh.instanceMatrix.needsUpdate = true;
    if (state.night > 0.02) { headL.instanceMatrix.needsUpdate = true; tailL.instanceMatrix.needsUpdate = true; }
  }

  /* ───────────── INTERIOR ───────────── */
  const room = new THREE.Scene();
  room.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  room.environmentIntensity = 0.3;
  const rHemi = new THREE.HemisphereLight(0xffffff, 0x3a2a2a, 0.5); room.add(rHemi);
  const rSun = new THREE.DirectionalLight(0xFFE2C2, 3);
  rSun.position.set(-7, 4.2, 1.2); rSun.target.position.set(0, 0, -2); room.add(rSun, rSun.target);
  rSun.castShadow = true;
  rSun.shadow.mapSize.set(HQ ? 2048 : 1024, HQ ? 2048 : 1024);
  Object.assign(rSun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 });
  rSun.shadow.bias = -0.0004; rSun.shadow.normalBias = 0.02; rSun.shadow.radius = 6;

  // Texturas procedurales con relieve (mapa de normales a partir de una altura)
  function heightCanvas(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); return c; }
  function normalFrom(c, strength = 2, repeat = 1) {
    const w = c.width, h = c.height, src = c.getContext("2d").getImageData(0, 0, w, h).data;
    const out = document.createElement("canvas"); out.width = w; out.height = h;
    const g = out.getContext("2d"), img = g.createImageData(w, h), d = img.data;
    const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); return t;
  }
  const noiseFill = (g, w, h, seed, amt, base = 128, size = 1) => {
    const rr = rng(seed), id = g.getImageData(0, 0, w, h);
    for (let i = 0; i < id.data.length; i += 4) { const v = base + (rr() - 0.5) * amt; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);
    if (size > 1) { g.filter = `blur(${size}px)`; g.drawImage(g.canvas, 0, 0); g.filter = "none"; }
  };
  const tex = (c, rep = 1, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; return t; };

  // Roble natural: tablas anchas
  const oakDraw = (g, w, h, rr, height) => {
    for (let y = 0; y < h; y += 128) {
      const off = rr() * w;
      for (let x = -off; x < w; x += 1024) {
        const l = lerp(0.9, 1.06, rr());
        g.fillStyle = height ? `rgb(150,150,150)` : `rgb(${184 * l | 0},${150 * l | 0},${112 * l | 0})`; g.fillRect(x, y, 1024, 128);
        for (let k = 0; k < 26; k++) {
          const yy = y + 4 + k * 4.8, a = 0.04 + rr() * 0.08;
          g.strokeStyle = height ? `rgba(${rr() < 0.5 ? 90 : 200},${rr() < 0.5 ? 90 : 200},${rr() < 0.5 ? 90 : 200},${a})` : `rgba(${rr() < 0.6 ? "95,62,38" : "225,195,150"},${a})`;
          g.lineWidth = 1 + rr() * 1.6; g.beginPath(); g.moveTo(x, yy);
          g.bezierCurveTo(x + 340, yy + (rr() - 0.5) * 10, x + 680, yy + (rr() - 0.5) * 10, x + 1024, yy); g.stroke();
        }
        g.fillStyle = height ? "rgb(20,20,20)" : "rgba(70,45,28,.55)"; g.fillRect(x, y, 1024, 2); g.fillRect(x, y, 2, 128);
      }
    }
  };
  let rr1 = rng(5), rr2 = rng(5);
  const oakTex = tex(heightCanvas(1024, 1024, (g, w, h) => oakDraw(g, w, h, rr1, false)), 2.2);
  const oakN = normalFrom(heightCanvas(1024, 1024, (g, w, h) => oakDraw(g, w, h, rr2, true)), 3, 2.2);
  // Revoque fino de paredes
  const plasterN = normalFrom(heightCanvas(256, 256, (g, w, h) => noiseFill(g, w, h, 21, 90, 128, 1.2)), 1.2, 6);
  // Tejido de lino y pana
  const weaveH = heightCanvas(128, 128, (g, w, h) => {
    g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = ((x + y) / 4) % 2 ? "#a8a8a8" : "#585858"; g.fillRect(x, y, 4, 2); g.fillStyle = ((x + y) / 4) % 2 ? "#585858" : "#a8a8a8"; g.fillRect(x, y + 2, 4, 2); }
  });
  const weaveN = normalFrom(weaveH, 1.6, 10);
  // Lana de la alfombra
  const pileN = normalFrom(heightCanvas(256, 256, (g, w, h) => noiseFill(g, w, h, 33, 160, 128, 0.6)), 2.2, 3);
  const rugTex = tex(heightCanvas(512, 512, (g, w, h) => {
    g.fillStyle = "#EFE3D3"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#5E1028"; g.lineWidth = 10; g.strokeRect(22, 22, w - 44, h - 44);
    g.strokeStyle = "#C98B9C"; g.lineWidth = 3; g.strokeRect(42, 42, w - 84, h - 84);
    const s = 56;
    for (let y = 70; y < h - 70; y += s) for (let x = 70; x < w - 70; x += s) {
      g.strokeStyle = ((x + y) / s) % 2 ? "#8B1D3D" : "#D9A27E"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + s / 2, y + 10); g.lineTo(x + s - 10, y + s / 2); g.lineTo(x + s / 2, y + s - 10); g.lineTo(x + 10, y + s / 2); g.closePath(); g.stroke();
    }
    const id = g.getImageData(0, 0, w, h), rr = rng(3);
    for (let i = 0; i < id.data.length; i += 4) { const n = (rr() - 0.5) * 18; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; }
    g.putImageData(id, 0, 0);
  }));
  // Mármol claro con vetas
  const marbleTex = tex(heightCanvas(512, 512, (g, w, h) => {
    g.fillStyle = "#F4F0EC"; g.fillRect(0, 0, w, h);
    const rr = rng(77);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(${150 + rr() * 40 | 0},${130 + rr() * 30 | 0},${130 + rr() * 30 | 0},${0.15 + rr() * 0.3})`; g.lineWidth = 0.6 + rr() * 2.2;
      g.beginPath(); let x = rr() * w, y = 0; g.moveTo(x, y);
      while (y < h) { x += (rr() - 0.5) * 40; y += 12 + rr() * 30; g.lineTo(x, y); }
      g.stroke();
    }
  }));
  // Ratán para las lámparas
  const rattan = tex(heightCanvas(256, 256, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.strokeStyle = "#fff"; g.lineWidth = 7;
    for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
  }), 3, false);
  const artTex = (a, b, c) => tex(heightCanvas(256, 320, (g, w, h) => {
    g.fillStyle = "#F4ECE3"; g.fillRect(0, 0, w, h);
    g.fillStyle = a; g.beginPath(); g.arc(w * 0.38, h * 0.38, 64, 0, Math.PI * 2); g.fill();
    g.fillStyle = b; g.fillRect(w * 0.44, h * 0.46, 104, 124);
    g.strokeStyle = c; g.lineWidth = 6; g.beginPath(); g.arc(w * 0.62, h * 0.74, 46, Math.PI, Math.PI * 2); g.stroke();
  }));
  const chartTex = tex(heightCanvas(512, 320, (g, w, h) => {
    g.fillStyle = "#FBF6F2"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8B1D3D"; g.font = "bold 30px Inter, sans-serif"; g.fillText("USD 823", 28, 58);
    g.fillStyle = "#7A6C70"; g.font = "18px Inter, sans-serif"; g.fillText("Para vos en septiembre", 28, 86);
    [297, 312, 855, 710, 578, 487, 676, 676, 818, 1014, 1098, 507].forEach((x, i) => { const bh = x / 1100 * 180; g.fillStyle = x >= 495 ? "#8B1D3D" : "#E9A3B6"; g.fillRect(28 + i * 38, h - 24 - bh, 26, bh); });
  }));
  const phoneTex = tex(heightCanvas(160, 320, (g, w) => {
    g.fillStyle = "#1A1216"; g.fillRect(0, 0, w, 320);
    g.fillStyle = "#FBF6F2"; g.beginPath(); g.roundRect(12, 70, w - 24, 70, 10); g.fill();
    g.fillStyle = "#8B1D3D"; g.font = "bold 18px Inter, sans-serif"; g.fillText("Nueva reserva", 24, 100);
    g.fillStyle = "#6B5E62"; g.font = "15px Inter, sans-serif"; g.fillText("Respondida en 4 min", 24, 124);
  }));

  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color: C(color), roughness: 0.8, ...o });
  const fabric = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color: C(color), roughness: 0.92, sheen: 1, sheenRoughness: 0.55, sheenColor: C(color).lerp(C("#ffffff"), 0.35), normalMap: weaveN, normalScale: new THREE.Vector2(0.45, 0.45), ...o });
  const add = (geo, m, x, y, z, parent = room) => { const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };
  const box = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const rbox = (w, h, d, rad, m, x, y, z) => add(new RoundedBoxGeometry(w, h, d, 5, rad), m, x, y, z);
  const cyl = (rt, rb, h, m, x, y, z, seg = 32) => add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);

  const RW = 6, RD = 6.5, RH = 2.8, Z0 = -4, Z1 = 2.5;
  // Oclusión en rincones: paredes, piso y techo se oscurecen suavemente donde se encuentran
  const cornerAO = (bottom, top, side) => tex(heightCanvas(256, 256, (g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "multiply";
    const lin = (x0, y0, x1, y1, a, f) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgb(${a},${a},${a})`); gr.addColorStop(f, "#fff"); gr.addColorStop(1, "#fff"); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
    lin(0, h, 0, 0, bottom[0], bottom[1]); lin(0, 0, 0, h, top[0], top[1]);
    lin(0, 0, w, 0, side[0], side[1]); lin(w, 0, 0, 0, side[0], side[1]);
  }), 1, false);
  const wallAO = cornerAO([120, 0.16], [170, 0.09], [165, 0.08]);
  const floorAO = cornerAO([150, 0.07], [150, 0.07], [150, 0.06]);
  const wallMat = new THREE.MeshStandardMaterial({ color: C("#F1E9E0"), roughness: 0.95, normalMap: plasterN, normalScale: new THREE.Vector2(0.35, 0.35), aoMap: wallAO, aoMapIntensity: 1 });
  const wallMatPlain = new THREE.MeshStandardMaterial({ color: C("#F1E9E0"), roughness: 0.95, normalMap: plasterN, normalScale: new THREE.Vector2(0.35, 0.35) });
  const oak = new THREE.MeshStandardMaterial({ map: oakTex, normalMap: oakN, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.55 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshStandardMaterial({ map: oakTex, normalMap: oakN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.42, envMapIntensity: 1.1, aoMap: floorAO, aoMapIntensity: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true; room.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), std("#FAF6F1", { roughness: 1, aoMap: floorAO, aoMapIntensity: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, RH, (Z0 + Z1) / 2); room.add(ceil);
  const wall = (w, h, x, y, z, ry, mat = wallMat) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(x, y, z); p.rotation.y = ry; p.receiveShadow = true; room.add(p); return p; };
  wall(RW, RH, 0, RH / 2, Z0, 0);
  wall(RD, RH, RW / 2, RH / 2, (Z0 + Z1) / 2, -Math.PI / 2);
  wall(RW, RH, 0, RH / 2, Z1, Math.PI);
  // Zócalos separados de la pared para evitar parpadeos
  const trim = std("#FFFFFF", { roughness: 0.45 });
  box(RW, 0.09, 0.018, trim, 0, 0.045, Z0 + 0.02); box(0.018, 0.09, RD, trim, RW / 2 - 0.02, 0.045, (Z0 + Z1) / 2);
  // Moldura de techo
  box(RW, 0.05, 0.05, trim, 0, RH - 0.025, Z0 + 0.03); box(0.05, 0.05, RD, trim, RW / 2 - 0.03, RH - 0.025, (Z0 + Z1) / 2);

  // Pared izquierda con ventanal
  [[RD, 0.55, 0.275, (Z0 + Z1) / 2], [RD, 0.35, RH - 0.175, (Z0 + Z1) / 2], [1.2, RH, RH / 2, Z1 - 0.6], [1.0, RH, RH / 2, Z0 + 0.5]]
    .forEach(([w, h, y, z]) => wall(w, h, -RW / 2, y, z, Math.PI / 2, wallMatPlain));
  const skylineCanvas = document.createElement("canvas"); skylineCanvas.width = 1024; skylineCanvas.height = 512;
  const skylineTex = new THREE.CanvasTexture(skylineCanvas); skylineTex.colorSpace = THREE.SRGBColorSpace;
  const skyline = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: skylineTex, toneMapped: false }));
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
          if (m > 0.5 ? rr() < 0.3 : rr() < 0.05) { g.fillStyle = m > 0.5 ? "rgba(255,196,130,.85)" : "rgba(80,90,110,.45)"; g.fillRect(xx, yy, 7, 9); }
        }
        x += bw + lerp(2, 18, rr());
      }
    }
    g.fillStyle = m > 0.5 ? "#E6DADF" : "#F5EFEA";
    g.beginPath(); g.moveTo(600, h - 360); g.lineTo(612, h - 340); g.lineTo(620, h); g.lineTo(580, h); g.lineTo(588, h - 340); g.closePath(); g.fill();
    skylineTex.needsUpdate = true;
  }
  const metal = std("#2B2326", { roughness: 0.4, metalness: 0.6 });
  [0.55, RH - 0.35].forEach(y => box(0.07, 0.05, RD - 2.2, metal, -RW / 2 + 0.02, y, (Z0 + Z1) / 2 - 0.05));
  for (let k = 0; k <= 4; k++) box(0.07, RH - 0.9, 0.045, metal, -RW / 2 + 0.02, (RH - 0.9) / 2 + 0.55, Z0 + 1.0 + k * (RD - 2.2) / 4);
  const curtainGeo = new THREE.PlaneGeometry(0.95, RH - 0.15, 48, 1);
  const cp = curtainGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 24) * 0.04 + Math.sin(cp.getX(i) * 7) * 0.02);
  curtainGeo.computeVertexNormals();
  const curtainMat = new THREE.MeshPhysicalMaterial({ color: C("#FFFBF6"), roughness: 1, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, sheen: 0.6, sheenColor: C("#ffffff") });
  [Z0 + 0.95, Z1 - 1.05].forEach(z => { const c = new THREE.Mesh(curtainGeo, curtainMat); c.rotation.y = Math.PI / 2; c.position.set(-RW / 2 + 0.14, RH / 2 - 0.04, z); room.add(c); });
  box(0.04, 0.04, RD - 1.2, metal, -RW / 2 + 0.14, RH - 0.08, (Z0 + Z1) / 2 - 0.05);

  // Tarima, cama tapizada y mesa de luz
  box(2.4, 0.25, 2.1, oak, -1.8, 0.125, -2.95);
  rbox(1.72, 0.26, 2.0, 0.04, std("#E8E0D8"), -1.95, 0.38, -2.95);
  const linen = fabric("#FBF8F3", { sheen: 0.4 });
  rbox(1.7, 0.16, 1.62, 0.07, linen, -1.95, 0.6, -2.72);
  const throwB = rbox(1.76, 0.06, 0.62, 0.03, fabric("#C98B9C"), -1.95, 0.7, -2.2);
  rbox(0.62, 0.18, 0.38, 0.09, linen, -2.33, 0.73, -3.62); rbox(0.62, 0.18, 0.38, 0.09, linen, -1.57, 0.73, -3.62);
  rbox(0.46, 0.3, 0.12, 0.06, fabric("#D9A27E"), -1.95, 0.8, -3.5).rotation.x = -0.2;
  rbox(1.9, 0.95, 0.12, 0.05, fabric("#E7D7C5"), -1.95, 0.88, -3.93);
  for (let k = 0; k < 5; k++) box(0.006, 0.8, 0.01, std("#CDBBA8"), -2.7 + k * 0.38, 0.88, -3.865);
  rbox(0.4, 0.42, 0.38, 0.03, oak, -0.84, 0.46, -3.62);
  box(0.34, 0.006, 0.005, std("#6E5137"), -0.84, 0.5, -3.428);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 12), std("#C9A77E", { metalness: 0.9, roughness: 0.3 }), -0.84, 0.56, -3.42).rotation.z = Math.PI / 2;
  cyl(0.055, 0.09, 0.22, std("#EDE3D8", { roughness: 0.25 }), -0.84, 0.78, -3.64);
  [["#5E1028", 0.03], ["#EBD9C6", 0.025]].forEach(([c, h], i) => rbox(0.18, h, 0.13, 0.004, std(c), -0.78, 0.67 + h / 2 + i * 0.03, -3.5));
  const shadeNight = new THREE.MeshStandardMaterial({ color: C("#F6ECDD"), emissive: C("#FFC77E"), emissiveIntensity: 0, roughness: 1, side: THREE.DoubleSide });
  add(new THREE.CylinderGeometry(0.11, 0.15, 0.18, 32, 1, true), shadeNight, -0.84, 0.98, -3.64);
  const bedLamp = new THREE.PointLight(0xFFB870, 0, 4, 1.8); bedLamp.position.set(-0.84, 0.96, -3.55); room.add(bedLamp);
  // Listones divisores
  for (let k = 0; k < 12; k++) rbox(0.05, RH - 0.25, 0.08, 0.008, oak, -2.85 + k * 0.19, 0.25 + (RH - 0.25) / 2, -1.82);
  // Consola con cajones, notebook y libros
  rbox(1.52, 0.04, 0.42, 0.01, oak, -1.8, 0.78, -1.5);
  box(1.5, 0.7, 0.4, std("#E3D6C8", { roughness: 0.6 }), -1.8, 0.41, -1.5);
  [-2.17, -1.43].forEach(x => { box(0.7, 0.004, 0.005, std("#B9A48D"), x, 0.6, -1.297); add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 12), std("#C9A77E", { metalness: 0.9, roughness: 0.3 }), x, 0.66, -1.29).rotation.z = Math.PI / 2; });
  rbox(0.42, 0.015, 0.3, 0.005, std("#3A3236", { metalness: 0.6, roughness: 0.3 }), -1.65, 0.81, -1.5);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.27), new THREE.MeshBasicMaterial({ map: chartTex, toneMapped: false }));
  screen.position.set(-1.65, 0.96, -1.66); screen.rotation.x = -0.18; room.add(screen);
  [["#8B1D3D", 0.05], ["#EBD9C6", 0.04], ["#5E1028", 0.035]].forEach(([c, h], i) => rbox(0.25, h, 0.18, 0.006, std(c), -2.3, 0.82 + i * 0.045 + h / 2 - 0.02, -1.48));
  // Sillón de pana carmesí con almohadones separados y patas de roble
  const velvet = fabric("#8B1D3D");
  rbox(2.1, 0.22, 0.92, 0.05, velvet, 1.55, 0.2, -3.45);
  rbox(0.98, 0.18, 0.76, 0.08, velvet, 1.06, 0.39, -3.38); rbox(0.98, 0.18, 0.76, 0.08, velvet, 2.04, 0.39, -3.38);
  rbox(2.1, 0.5, 0.2, 0.08, velvet, 1.55, 0.6, -3.84);
  rbox(0.98, 0.42, 0.2, 0.1, velvet, 1.06, 0.66, -3.68).rotation.x = -0.12; rbox(0.98, 0.42, 0.2, 0.1, velvet, 2.04, 0.66, -3.68).rotation.x = -0.12;
  rbox(0.2, 0.42, 0.92, 0.09, velvet, 0.45, 0.42, -3.45); rbox(0.2, 0.42, 0.92, 0.09, velvet, 2.65, 0.42, -3.45);
  [[0.45, -3.05], [2.65, -3.05], [0.45, -3.85], [2.65, -3.85]].forEach(([x, z]) => cyl(0.025, 0.018, 0.1, oak, x, 0.05, z, 12));
  rbox(0.44, 0.4, 0.13, 0.07, fabric("#EFE3D3"), 0.85, 0.72, -3.55).rotation.z = 0.1;
  rbox(0.4, 0.36, 0.13, 0.07, fabric("#D9A27E"), 2.25, 0.7, -3.55).rotation.z = -0.12;
  // Alfombra, mesa ratona de mármol y florero
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.95), new THREE.MeshStandardMaterial({ map: rugTex, normalMap: pileN, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(1.45, 0.008, -2.25); rug.receiveShadow = true; room.add(rug);
  const marble = new THREE.MeshPhysicalMaterial({ map: marbleTex, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  cyl(0.5, 0.5, 0.04, marble, 1.45, 0.42, -2.15, 64);
  [0, 1, 2].forEach(i => { const a = i / 3 * Math.PI * 2; add(new THREE.CylinderGeometry(0.022, 0.016, 0.4, 12), oak, 1.45 + Math.cos(a) * 0.3, 0.2, -2.15 + Math.sin(a) * 0.3); });
  rbox(0.09, 0.012, 0.18, 0.005, std("#1A1216", { metalness: 0.5, roughness: 0.25 }), 1.3, 0.446, -2.05);
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.16), new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false }));
  phoneScreen.rotation.x = -Math.PI / 2; phoneScreen.position.set(1.3, 0.453, -2.05); room.add(phoneScreen);
  const ceramic = new THREE.MeshPhysicalMaterial({ color: C("#F3ECE4"), roughness: 0.25, clearcoat: 0.4 });
  add(new THREE.LatheGeometry([0, 0.05, 0.07, 0.065, 0.04, 0.035, 0.04].map((x, i) => new THREE.Vector2(x, i * 0.045)), 32), ceramic, 1.66, 0.44, -2.25);
  for (let k = 0; k < 7; k++) {
    const st = add(new THREE.CylinderGeometry(0.005, 0.005, 0.46, 4), std("#B89670"), 1.66 + Math.sin(k) * 0.025, 0.86, -2.25 + Math.cos(k) * 0.025); st.rotation.z = Math.sin(k * 1.7) * 0.22;
    const plume = add(new THREE.SphereGeometry(0.035, 12, 12), std("#EADBC4", { roughness: 1 }), st.position.x + Math.sin(k * 1.7) * -0.1, 1.08, st.position.z); plume.scale.set(1, 2.6, 1);
  }
  // Cuadros con marco fino de roble
  [[artTex("#C98B9C", "#8B1D3D", "#D9A27E"), 0.95], [artTex("#5E1028", "#E9C6CF", "#B89670"), 2.15]].forEach(([t, x]) => {
    rbox(0.82, 1.02, 0.03, 0.004, oak, x, 1.78, Z0 + 0.03);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.92), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); a.position.set(x, 1.78, Z0 + 0.047); room.add(a);
  });
  // Puerta de entrada
  rbox(0.05, 2.1, 0.95, 0.008, oak, RW / 2 - 0.035, 1.05, -0.5);
  [[-1.0], [0.0]].forEach(([z]) => box(0.04, 2.2, 0.06, trim, RW / 2 - 0.03, 1.1, z)); box(0.04, 0.06, 1.06, trim, RW / 2 - 0.03, 2.18, -0.5);
  const brass = std("#C9A77E", { metalness: 0.9, roughness: 0.28 });
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 16), brass, RW / 2 - 0.09, 1.02, -0.13).rotation.x = Math.PI / 2;
  // Sombras de contacto bajo los muebles
  const aoTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const aoMat = new THREE.MeshBasicMaterial({ color: 0x1a0f0c, alphaMap: aoTex, transparent: true, opacity: 0.38, depthWrite: false });
  [[1.55, 0.012, -3.42, 2.6, 1.3], [-1.8, 0.012, -2.95, 3.0, 2.6], [-1.95, 0.252, -2.95, 2.1, 2.3], [1.45, 0.012, -2.15, 1.3, 1.3], [-1.8, 0.012, -1.5, 1.9, 0.75], [-0.84, 0.252, -3.62, 0.62, 0.56]].forEach(([x, y, z, w, d]) => {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoMat); a.rotation.x = -Math.PI / 2; a.position.set(x, y, z); room.add(a);
  });
  // Manta sobre el brazo del sillón, libros en la mesa y espejo redondo junto a la puerta
  const drape = rbox(0.34, 0.5, 0.82, 0.05, fabric("#C98B9C"), 2.68, 0.52, -3.42); drape.rotation.z = -0.06;
  [["#8B1D3D", 0.035], ["#EBD9C6", 0.03], ["#3A3236", 0.028]].forEach(([c, h], i) => rbox(0.26 - i * 0.02, h, 0.19, 0.005, std(c), 1.62, 0.44 + h / 2 + i * 0.034, -1.98).rotation.y = i * 0.12);
  const mirrorFrame = add(new THREE.TorusGeometry(0.32, 0.018, 12, 64), std("#C9A77E", { metalness: 0.9, roughness: 0.3 }), RW / 2 - 0.03, 1.55, 0.95); mirrorFrame.rotation.y = Math.PI / 2;
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.31, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04, envMapIntensity: 1.4 }));
  mirror.position.set(RW / 2 - 0.035, 1.55, 0.95); mirror.rotation.y = -Math.PI / 2; room.add(mirror);
  // Lámparas colgantes de ratán
  // En el celular (sin antialias) el calado del ratán se vería como ruido: pantalla lisa
  const shadeM = new THREE.MeshStandardMaterial({ color: C(mobile ? "#B07C4B" : "#C08A55"), roughness: 0.7, alphaMap: mobile ? null : rattan, alphaTest: mobile ? 0 : 0.5, side: THREE.DoubleSide, emissive: C("#FFB466"), emissiveIntensity: 0 });
  const pend = [];
  [[1.2, -2.1], [1.8, -2.25]].forEach(([x, z], i) => {
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.75, 4), std("#222"), x, RH - 0.37, z);
    const g = add(new THREE.SphereGeometry(0.19, 40, 24), shadeM, x, RH - 0.92, z); g.scale.set(1, 0.85, 1); g.castShadow = false;
    const bulb = add(new THREE.SphereGeometry(0.03, 16, 16), new THREE.MeshBasicMaterial({ color: C("#FFE2B8") }), x, RH - 0.92, z); bulb.castShadow = false;
    const pl = new THREE.PointLight(0xFFB870, 0, 6, 1.7); pl.position.set(x, RH - 0.92, z);
    room.add(pl); pend.push(pl);
  });

  /* ───────────── CÁMARA ───────────── */
  // Vuelo continuo tipo drone: puntos de paso de posición y de mirada, recorridos a ritmo parejo.
  const curve = pts => new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
  const CITY_POS = curve([
    V(70, 64, 120), V(40, 30, 72), V(9, 9, 42), V(6, 8.6, 14), V(7, 10, -5),
    V(-6, 24, -14), V(-17, 11, -0.7), V(-29, 5.6, -0.5), V(WIN.x + 0.5, WIN.y + 0.18, WIN.z - 2.1), V(WIN.x, WIN.y, WIN.z - 0.2),
  ]);
  const CITY_LOOK = curve([
    V(40, 0, -30), V(0, 6, 0), V(0, 8, 0), V(-1, 9.5, -4), V(-22, 6, -24),
    V(-60, 0, -70), V(-36, 5, 1.5), V(HERO.x, 4.6, HERO.z), V(WIN.x, WIN.y, WIN.z), V(WIN.x, WIN.y, WIN.z + 2),
  ]);
  const ROOM_POS = curve([
    V(0, 1.6, 2.4), V(0.6, 1.5, 1.5), V(0.9, 1.45, 0.8), V(0.6, 1.45, 0.6), V(0.2, 1.4, 0.5),
    V(0.0, 1.25, 0.1), V(-0.2, 1.3, 0.0), V(0.8, 1.4, 0.3), V(0.3, 1.8, 2.3),
  ]);
  const ROOM_LOOK = curve([
    V(0, 1.2, -2.5), V(-1.9, 0.8, -2.9), V(-1.9, 0.75, -2.9), V(2.9, 1.05, -0.4), V(2.9, 1.05, -0.4),
    V(1.3, 0.5, -2.1), V(-1.6, 0.9, -1.55), V(1.55, 0.7, -3.45), V(0, 0.95, -2.6),
  ]);
  const tA = new THREE.Vector3(), tB = new THREE.Vector3();
  let roll = 0;
  function fly(posC, lookC, u) {
    u = clamp01(u);
    const pos = posC.getPoint(u), look = lookC.getPoint(u);
    // Inclinación en las curvas, como un drone
    posC.getTangent(Math.max(0, u - 0.01), tA); posC.getTangent(Math.min(1, u + 0.01), tB);
    const turn = Math.atan2(tA.x * tB.z - tA.z * tB.x, tA.x * tB.x + tA.z * tB.z);
    return [pos, look, Math.max(-0.2, Math.min(0.2, -turn * 2.2))];
  }
  const CUT = 0.6;
  const anchors = {
    obe: PLACES[0].label, acu: PLACES[1].label, oll: PLACES[2].label, obelisco: OBELISCO, rio: RIO,
    bed: V(-1.9, 0.85, -2.8), door: V(RW / 2 - 0.08, 1.15, -0.4), phone: V(1.3, 0.5, -2.05), laptop: V(-1.65, 1.02, -1.6), sofa: V(1.55, 0.95, -3.45),
  };
  const ROOM_ANCHORS = new Set(["bed", "door", "phone", "laptop", "sofa"]);

  function applyTheme(m, full) {
    uNight.value = m;
    skyMat.uniforms.top.value.copy(pick("skyTop", m)); skyMat.uniforms.bot.value.copy(pick("skyBot", m)); skyMat.uniforms.sunAmt.value = 1 - m;
    city.fog.color.copy(pick("fog", m));
    groundMat.color.copy(pick("ground", m)); blockMat.color.copy(pick("block", m)); waterMat.color.copy(pick("water", m)); shoreMat.color.copy(C("#D8CBBE").lerp(C("#3A2E33"), m)); boatMat.color.copy(C("#F4EFEA").lerp(C("#6E6268"), m));
    medianMat.color.copy(C("#CDB2A3").lerp(C("#2E2228"), m)); plazaMat.color.copy(C("#E4D2C4").lerp(C("#3A2C33"), m));
    hemi.color.copy(pick("hemiSky", m)); hemi.groundColor.copy(pick("hemiGround", m)); hemi.intensity = lerp(0.5, 0.4, m);
    sun.color.copy(pick("sun", m)); sun.intensity = lerp(2.7, 0.22, m); sun.shadow.intensity = clamp01(1 - m * 1.6);
    city.environmentIntensity = lerp(0.45, 0.2, m);
    headMat.color.copy(C("#5A4E52").lerp(C("#FFD08A"), m)); headLMat.opacity = m; tailLMat.opacity = m * 0.9; headL.visible = tailL.visible = m > 0.02; lineMat.opacity = lerp(0.55, 0.12, m);
    moon.material.opacity = m;
    obeMat.emissiveIntensity = m * 0.45;
    crownMat.emissiveIntensity = m * 1.4;
    heroMat.color.copy(C("#C98B9C").lerp(C("#8A4256"), m)); smallMat.color.copy(heroMat.color);
    canopyMat.color.copy(C("#FFFFFF").lerp(C("#6E5A7E"), m));
    renderer.toneMappingExposure = lerp(0.82, 1.05, m);
    // Interior: de día luz del ventanal; de noche, solo las lámparas
    rHemi.color.copy(pick("roomHemi", m)); rHemi.intensity = lerp(0.38, 0.12, m);
    rSun.intensity = lerp(2.3, 0.0, m);
    room.environmentIntensity = lerp(0.3, 0.08, m);
    pend.forEach(p => p.intensity = lerp(0, 1.5, m)); bedLamp.intensity = lerp(0, 0.8, m);
    shadeM.emissiveIntensity = lerp(0, 0.35, m); shadeNight.emissiveIntensity = lerp(0, 0.7, m);
    curtainMat.opacity = lerp(0.6, 0.85, m);
    room.background = pick("windowSky", m);
    if (full) { paintSkyline(m); refreshEnv(); }
  }
  applyTheme(state.night, true);

  // Exposición de cada escena
  const expo = (inRoom, m) => inRoom ? lerp(0.8, 1.0, m) : lerp(0.82, 1.05, m);
  // Primer cuadro de la habitación: lo que se ve a través de la ventana
  const snapCam = new THREE.PerspectiveCamera();
  function snapshot() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (snapRT.width !== size.x || snapRT.height !== size.y) snapRT.setSize(size.x, size.y);
    portalMat.uniforms.res.value.copy(size);
    portalMat.uniforms.gain.value = expo(true, state.night) / expo(false, state.night);
    snapCam.copy(camera); snapCam.near = 0.05; snapCam.updateProjectionMatrix();
    const [pos, look] = fly(ROOM_POS, ROOM_LOOK, 0);
    snapCam.position.copy(pos); snapCam.lookAt(look);
    renderer.setRenderTarget(snapRT); renderer.render(room, snapCam); renderer.setRenderTarget(null);
  }
  // Todo se compila y se sube a la GPU antes de empezar: nada se carga por primera vez en mitad del scroll
  function warmUp() {
    renderer.compile(city, camera); renderer.compile(room, camera);
    const seen = new Set();
    [city, room].forEach(sc => sc.traverse(o => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(mt => ["map", "normalMap", "alphaMap", "aoMap", "roughnessMap"].forEach(k => { const t = mt[k]; if (t && !seen.has(t) && !t.isRenderTargetTexture) { seen.add(t); renderer.initTexture(t); } }));
    }));
    const rt = new THREE.WebGLRenderTarget(64, 64);
    const cam = camera.clone(); cam.position.set(0, 1.5, 2); cam.lookAt(0, 1, -2);
    renderer.setRenderTarget(rt);
    renderer.shadowMap.needsUpdate = true; renderer.render(room, cam);
    renderer.shadowMap.needsUpdate = true; renderer.render(city, camera);
    renderer.setRenderTarget(null); rt.dispose();
    snapshot();
  }
  let snapTimer = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    // En el celular la barra del navegador cambia el alto: si solo cambia un poco, no se toca el lienzo
    if (mobile && w === lastW && Math.abs(h - lastH) < 140) return;
    lastW = w; lastH = h;
    renderer.setPixelRatio(dprFor(w, h));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 64 : 50;
    camera.updateProjectionMatrix();
    dirty = true;
    clearTimeout(snapTimer); snapTimer = setTimeout(() => { if (running) { snapshot(); dirty = true; } }, 200);
  }
  let lastW = 0, lastH = 0, dirty = true, running = false;
  resize();
  addEventListener("resize", resize);
  if (!mobile) addEventListener("pointermove", e => { state.mx = e.clientX / innerWidth - 0.5; state.my = e.clientY / innerHeight - 0.5; });

  const v3 = new THREE.Vector3(), lastCam = new THREE.Matrix4();
  let labelEls = [], lastPaint = state.night, visible = true, last = performance.now(), autoDone = false;
  const AUTO_LEN = 26; // segundos del recorrido automático en mobile: se reproduce una vez y queda en la habitación

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.time += dt;
    if (state.auto) {
      if (!reduce) state.autoT = Math.min(1, state.autoT + dt / AUTO_LEN);
      else state.autoT = 1;
      state.p = state.pShown = state.autoT;
      if (state.autoT >= 1 && !autoDone) { autoDone = true; onEnd && onEnd(); }
    } else {
      state.pShown = reduce ? state.p : lerp(state.pShown, state.p, 1 - Math.pow(0.0015, dt));
    }
    if (Math.abs(state.night - state.nightTarget) > 0.001) {
      state.night = lerp(state.night, state.nightTarget, 1 - Math.pow(0.02, dt));
      const done = Math.abs(state.night - state.nightTarget) < 0.002;
      if (done) state.night = state.nightTarget;
      const full = done || Math.abs(state.night - lastPaint) > 0.15;
      applyTheme(state.night, full);
      if (full) { lastPaint = state.night; snapshot(); }
      dirty = true;
    }
    const p = state.pShown, inRoom = p >= CUT;
    let pos, look;
    if (!inRoom) {
      let rl;
      [pos, look, rl] = fly(CITY_POS, CITY_LOOK, p / CUT);
      roll = lerp(roll, rl, 0.08);
      if (!reduce) { const idle = 1 - clamp01(p / 0.06); pos.add(V(Math.sin(state.time * 0.15) * 6 * idle, 0, Math.cos(state.time * 0.15) * 4 * idle)); }
      moveCars(dt);
      if (!reduce) { waveN.offset.x += dt * 0.012; waveN.offset.y += dt * 0.02; boats.forEach((b, i) => { b.position.z += dt * (0.8 + i * 0.2); if (b.position.z > 260) b.position.z = -260; }); }
    } else {
      let rl;
      [pos, look, rl] = fly(ROOM_POS, ROOM_LOOK, (p - CUT) / (1 - CUT));
      roll = lerp(roll, rl * 0.3, 0.08);
    }
    const par = inRoom ? 0.12 : 1.2 * clamp01(1 - p / CUT * 1.2);
    camera.position.copy(pos).add(V(state.mx * par, -state.my * par * 0.6, 0));
    camera.lookAt(look);
    if (!reduce) camera.rotateZ(roll);
    // Plano cercano según la escena: evita parpadeos a distancia sin cortar la ventana al acercarse
    const near = inRoom || p / CUT > 0.9 ? 0.05 : 0.5;
    if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
    const scene = inRoom ? room : city;
    renderer.toneMappingExposure = expo(inRoom, state.night);
    // Las sombras son estáticas (se calculan una vez por escena). La habitación no tiene nada en movimiento:
    // si la cámara no se movió, el cuadro anterior sigue siendo válido y no se vuelve a dibujar.
    camera.updateMatrixWorld();
    const still = inRoom && !dirty && lastCam.equals(camera.matrixWorld);
    if (!still) renderer.render(scene, camera);
    lastCam.copy(camera.matrixWorld); dirty = false;

    // Etiquetas HTML ancladas a puntos 3D
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of labelEls) {
      const a = anchors[l.dataset.anchor];
      const from = +l.dataset.from, to = +l.dataset.to, isRoom = ROOM_ANCHORS.has(l.dataset.anchor);
      let on = !state.auto && p >= from && p <= to && isRoom === inRoom;
      if (on) {
        v3.copy(a).project(camera);
        if (v3.z > 1 || Math.abs(v3.x) > 0.94 || v3.y > 0.78 || v3.y < -0.9) on = false;
        else {
          const tr = `translate3d(${((v3.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v3.y * 0.5 + 0.5) * h).toFixed(1)}px, 0)`;
          if (l._tr !== tr) { l.style.transform = tr; l._tr = tr; }
          const fl = v3.x > 0.2; if (l._fl !== fl) { l.classList.toggle("flip", fl); l._fl = fl; }
        }
      }
      if (l._on !== on) { l.classList.toggle("on", on); l._on = on; }
    }
  }

  let onEnd = null;
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); running = false; onLost && onLost(); });
  let onLost = null;
  return {
    CUT,
    onLost(fn) { onLost = fn; },
    setProgress(p) { state.p = clamp01(p); },
    getProgress() { return state.pShown; },
    setAuto(on) { state.auto = on; },
    replay() { state.autoT = 0; autoDone = false; },
    onEnd(fn) { onEnd = fn; },
    stop() { running = false; },
    setNight(on, instant) { state.nightTarget = on ? 1 : 0; if (instant) { state.night = state.nightTarget; applyTheme(state.night, true); lastPaint = state.night; } },
    setLabels(els) { labelEls = els; },
    setVisible(v) { visible = v; },
    start() {
      if (running) return;
      running = true;
      warmUp();
      requestAnimationFrame(t => { last = t; frame(t); });
    },
    resize,
  };
}
