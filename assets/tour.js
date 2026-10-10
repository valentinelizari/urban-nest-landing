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

// Qué placa de video está dibujando de verdad. En muchas notebooks el navegador usa la integrada
// (Intel) aunque haya una dedicada: en ese caso conviene arrancar con una calidad más liviana.
// -1: el navegador dibuja sin placa de video (aceleración por hardware desactivada).
function gpuTier() {
  try {
    // Si el navegador avisa que el 3D sería lento (dibujo por software), devuelve null con esta opción
    const probe = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!probe) return -1;
    const lp = probe.getExtension("WEBGL_lose_context"); if (lp) lp.loseContext();
    const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return 0;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    if (/RTX|GTX|Quadro|Radeon (RX|Pro)|Apple M\d (Pro|Max|Ultra)|Arc\(TM\) A|Arc A\d/i.test(name)) return 2;
    if (/SwiftShader|llvmpipe|Basic Render|Software/i.test(name)) return -1;
    if (/Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|Radeon\(TM\) Graphics|Vega \d/i.test(name)) return 0;
    return 1;
  } catch (e) { return 1; }
}

export function createTour({ canvas, mobile = false, reduce = false, night = false }) {
  const tier = mobile ? 0 : gpuTier();
  // Calidad según la placa: antialias, píxeles a dibujar, alcance de la ciudad y cantidad de autos
  // Sin aceleración (soft): menos píxeles que se agrandan en pantalla, ciudad más corta, sin sombras y materiales simples
  const SOFT = { aa: false, budget: 0.15e6, maxDpr: 1, far: 340, lots: 1, cars: 50, shadow: 0, near: 6, soft: true, minDpr: 0.3, minFps: 28 };
  const Q = tier < 0 ? SOFT : mobile ? { aa: false, budget: 1.1e6, maxDpr: 1.5, far: 760, lots: 1, cars: 140, shadow: 0 }
    : [{ aa: false, budget: 1.15e6, maxDpr: 1, far: 900, lots: 1, cars: 160, shadow: 1024 },
       { aa: true, budget: 1.6e6, maxDpr: 1.25, far: 900, lots: 1, cars: 220, shadow: 2048 },
       { aa: true, budget: 2.2e6, maxDpr: 1.5, far: 900, lots: 2, cars: 300, shadow: 2048 }][tier];
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: "high-performance" });
  } catch (e) {
    return null;
  }
  const HQ = !mobile && !Q.soft;
  // La resolución sale de un presupuesto de píxeles. Si aun así los cuadros por segundo no alcanzan,
  // se reduce de a un paso (como máximo tres veces) y siempre en el mismo cuadro en que se dibuja.
  let dprScale = 1;
  const dprFor = (w, h) => Math.max(Q.minDpr || 0.7, Math.min(devicePixelRatio || 1, Q.maxDpr, Math.sqrt(Q.budget / Math.max(1, w * h))) * dprScale);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = HQ;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // las sombras se recalculan solo cuando cambia el encuadre o el tema

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1600);
  const state = { night: night ? 1 : 0, nightTarget: night ? 1 : 0, p: 0, pShown: 0, mx: 0, my: 0, time: 0, auto: false, autoT: 0 };
  const uNight = { value: state.night }, uAmb = { value: new THREE.Color() };
  const pmrem = new THREE.PMREMGenerator(renderer);

  /* ───────────── CIUDAD ───────────── */
  const city = new THREE.Scene();
  // La ciudad llega hasta el horizonte y la bruma la funde con el cielo: nunca se ve un borde vacío
  const FAR = Q.far;
  city.fog = new THREE.Fog(pick("fog", state.night), mobile ? 280 : 230, FAR);

  const skyMat = new THREE.ShaderMaterial({
    defines: { OCT: Q.soft ? 2 : mobile ? 4 : 5 },
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: pick("skyTop", 0) }, bot: { value: pick("skyBot", 0) }, sunDir: { value: V(0.55, 0.32, -0.77).normalize() }, sunAmt: { value: 1 }, uTime: { value: 0 }, uN: { value: 0 } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    // Cielo con nubes: ruido fractal proyectado sobre un plano alto, que se mueve muy despacio
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform float sunAmt; uniform float uTime; uniform float uN; varying vec3 vP;
      float hs(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { v += a * vn(p); p = p * 2.07 + vec2(3.1, 7.7); a *= 0.5; } return v; }
      void main(){ vec3 d = normalize(vP); float h = clamp(d.y*1.5+0.06,0.0,1.0); vec3 c = mix(bot, top, pow(h,0.7));
        float s = max(dot(d, sunDir), 0.0); c += vec3(1.0,0.78,0.55) * (pow(s, 24.0)*0.2 + pow(s, 900.0)*1.6) * sunAmt;
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.08) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(uv), n2 = fbm(uv + sunDir.xz * 0.12);
          float cov = smoothstep(0.5, 0.78, n) * smoothstep(0.02, 0.22, d.y);
          float lit = clamp(0.6 + (n - n2) * 3.0, 0.0, 1.0);
          vec3 day = mix(vec3(0.78, 0.76, 0.8), vec3(1.0, 0.96, 0.93), lit) + vec3(1.0, 0.8, 0.6) * pow(s, 6.0) * 0.25;
          vec3 night = mix(vec3(0.07, 0.04, 0.06), vec3(0.22, 0.11, 0.14), lit * 0.6 + (1.0 - smoothstep(0.0, 0.3, d.y)) * 0.5);
          c = mix(c, mix(day, night, uN), cov * 0.88);
        }
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
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
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

  const PITCH = 13.2, BLOCK = 10, N = Q.near || (mobile ? 8 : 10), ext = N * PITCH;
  const r = rng(2026), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = V(1, 1, 1), p3 = V(0, 0, 0);
  const blockMat = new THREE.MeshStandardMaterial({ color: pick("block", 0), roughness: 1 });
  const blocks = [];
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    if (i === 0) continue; // Av. 9 de Julio
    const x = i * PITCH, z = (j + 0.5) * PITCH;
    if (x > 100) continue;
    blocks.push([x, z]);
  }
  // Prisma a partir de un polígono en planta (alto 0 a 1), con normales planas: ochavas de veredas y edificios
  function prismGeo(pts) {
    const pos = [], nor = [];
    const tri = (a, b, c, n) => { if (b.clone().sub(a).cross(c.clone().sub(a)).dot(n) < 0) { const t = b; b = c; c = t; } for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); } };
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
      const n = V(z2 - z1, 0, x1 - x2).normalize(); if (n.dot(V((x1 + x2) / 2, 0, (z1 + z2) / 2)) < 0) n.negate();
      tri(V(x1, 0, z1), V(x2, 0, z2), V(x2, 1, z2), n); tri(V(x1, 0, z1), V(x2, 1, z2), V(x1, 1, z1), n);
    }
    for (let i = 1; i < pts.length - 1; i++) tri(V(pts[0][0], 1, pts[0][1]), V(pts[i][0], 1, pts[i][1]), V(pts[i + 1][0], 1, pts[i + 1][1]), V(0, 1, 0));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }
  const oc = 0.085;
  const plateGeo = Q.soft ? new THREE.PlaneGeometry(BLOCK + 0.6, BLOCK + 0.6).rotateX(-Math.PI / 2).translate(0, 0.14, 0) : prismGeo([[-.5 + oc, -.5], [.5 - oc, -.5], [.5, -.5 + oc], [.5, .5 - oc], [.5 - oc, .5], [-.5 + oc, .5], [-.5, .5 - oc], [-.5, -.5 + oc]]).scale(BLOCK + 0.6, 0.14, BLOCK + 0.6);
  const blockInst = new THREE.InstancedMesh(plateGeo, blockMat, blocks.length);
  blocks.forEach(([x, z], k) => { m4.makeTranslation(x, 0, z); blockInst.setMatrixAt(k, m4); });
  blockInst.receiveShadow = true; city.add(blockInst);

  // Demarcación de carriles en la 9 de Julio
  const lineMat = new THREE.MeshBasicMaterial({ color: C("#E9E1D8"), transparent: true, opacity: 0.55 });
  const dashes = [];
  for (let z = -ext; z <= ext; z += 2.4) for (const x of [-6.6, -5.9, 5.9, 6.6, -2.2, 2.2]) if (Math.abs(x) > 3 || Math.abs(z) > 6) dashes.push([x, z]);
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
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 0.18, 64), plazaMat);
  plaza.position.set(0, 0.09, 0); plaza.receiveShadow = true; city.add(plaza);

  // Edificios: una malla instanciada con fachadas procedurales en el shader.
  const HERO = { x: -3 * PITCH, z: 3.9, w: 6.2, d: 4.6, floors: 16 };
  const FLOOR = 0.42, E = BLOCK / 2, D = 3.0;
  // Nuestros departamentos de Palermo y Las Cañitas, sobre la línea de frente de su manzana
  const SPOTS = { acu: V(-4 * PITCH, 0, -4.5 * PITCH - E + 2), oll: V(-8 * PITCH, 0, -8.5 * PITCH - E + 2) };
  const reserved = [[HERO.x, HERO.z, HERO.w / 2 + 0.2, HERO.d / 2 + 0.2], [SPOTS.acu.x, SPOTS.acu.z, 2.2, 2.2], [SPOTS.oll.x, SPOTS.oll.z, 2.2, 2.2]];
  // Diagonal Norte: sale del Obelisco y corta las manzanas en dirección a Plaza de Mayo
  const DIAG = { x0: 6, z0: 3.5, dx: 0.8, dz: 0.6, len: 84, w: 2.6 };
  const onDiag = (x, z, rad) => { const px = x - DIAG.x0, pz = z - DIAG.z0, t = px * DIAG.dx + pz * DIAG.dz; return t > -rad && t < DIAG.len + rad && Math.abs(px * DIAG.dz - pz * DIAG.dx) < DIAG.w / 2 + rad; };
  const PLAZA_MAYO = [6 * PITCH, 4.5 * PITCH], ROSADA = [7 * PITCH, 4.5 * PITCH];
  const near = (a, x, z) => Math.abs(a[0] - x) < 0.1 && Math.abs(a[1] - z) < 0.1;
  const free = (x, z, w, d) => !reserved.some(([rx, rz, hw, hd]) => Math.abs(x - rx) < hw + w / 2 && Math.abs(z - rz) < hd + d / 2) && !onDiag(x, z, Math.min(w, d) * 0.45);
  const split = (len, n) => { const ws = Array.from({ length: n }, () => 0.7 + r() * 0.6), t = ws.reduce((a, b) => a + b, 0); return ws.map(v => v / t * len); };
  // Caras con ventanas (máscara): 1 = +x, 2 = -x, 4 = +z, 8 = -z. Las medianeras quedan ciegas.
  // Ochava: 0 = esquina +x+z, 1 = +x-z, 2 = -x-z, 3 = -x+z
  const lots = [];
  const addLot = (x, z, w, d, mask, cham, dist) => {
    if (!free(x, z, w, d) || r() < 0.025) return;
    let floors = Math.round(lerp(3, 13, Math.pow(r(), 1.25)) * (dist < 60 ? 1.1 : dist < 100 ? 0.9 : 0.75));
    if (dist < 30 && r() < 0.3) floors += 6;
    if (r() < 0.07) floors = 2 + Math.floor(r() * 2); // casas bajas entre edificios
    lots.push({ x, z, w, d, h: Math.max(2, floors) * FLOOR + 0.3, mask, cham, tower: false, seed: r() });
  };
  blocks.forEach(([bx, bz]) => {
    const dist = Math.hypot(bx, bz);
    if (near(PLAZA_MAYO, bx, bz)) return;
    if (near(ROSADA, bx, bz)) { lots.push({ x: bx, z: bz, w: 8.6, d: 7.4, h: 3 * FLOOR + 0.5, mask: 15, cham: -1, tower: false, seed: 0.31, col: C("#D9A39C") }); return; }
    // Catalinas y la costa: torres exentas en su manzana
    if (bx > 60 && r() < 0.32) { const tw = 4 + r() * 2.4, td = 4 + r() * 2.4; if (free(bx, bz, tw, td)) lots.push({ x: bx, z: bz, w: tw, d: td, h: Math.round(lerp(24, 46, r())) * FLOOR + 0.3, mask: 15, cham: -1, tower: true, seed: r() }); return; }
    for (const sd of [-1, 1]) {
      const ws = split(BLOCK, 3 + (r() < 0.55 ? 1 : 0));
      let x0 = bx - E;
      ws.forEach((w, i) => {
        const first = i === 0, last = i === ws.length - 1;
        const mask = 12 | (first ? 2 : 0) | (last ? 1 : 0);
        const cham = first ? (sd < 0 ? 2 : 3) : last ? (sd < 0 ? 1 : 0) : -1;
        addLot(x0 + w / 2, bz + sd * (E - D / 2), w - 0.03, D, mask, cham, dist);
        x0 += w;
      });
      const zs = split(BLOCK - 2 * D, r() < 0.5 ? 1 : 2);
      let z0 = bz - E + D;
      zs.forEach(d => { addLot(bx + sd * (E - D / 2), z0 + d / 2, D, d - 0.03, 3, -1, dist); z0 += d; });
    }
  });
  const facade = ["#E9E1D8", "#D9CFC6", "#CDBFB6", "#E5D7D0", "#BFB2AE", "#D6C3BE", "#EFE6DE", "#C7B9B9", "#B9A9A2", "#DCCCC0"].map(C);

  function facadeMaterial(color, top = 0, light = false) {
    // La ciudad lejana usa un material más simple (sin reflejos): se ve igual entre la bruma y cuesta mucho menos
    const mtl = light ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
    if (light) mtl.defines = { FACADE_LIGHT: "" };
    mtl.onBeforeCompile = sh => {
      sh.uniforms.uNight = uNight; sh.uniforms.uTop = { value: top }; sh.uniforms.uAmb = uAmb;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          varying vec3 vWP; varying vec3 vWN; flat varying float vSeed; flat varying float vTop; flat varying float vWin; uniform float uTop;
          #ifdef USE_INSTANCING
            attribute float aSeed; attribute float aTop; attribute float aWin;
          #endif`)
        .replace("#include <project_vertex>", `#include <project_vertex>
          mat4 unM = modelMatrix;
          #ifdef USE_INSTANCING
            unM = modelMatrix * instanceMatrix; vSeed = aSeed; vTop = aTop; vWin = aWin;
          #else
            vSeed = 0.37; vTop = uTop; vWin = 15.0;
          #endif
          vWP = (unM * vec4(transformed, 1.0)).xyz;
          vWN = normalize(mat3(unM) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vWP; varying vec3 vWN; flat varying float vSeed; flat varying float vTop; flat varying float vWin; uniform float uNight; uniform vec3 uAmb;
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
          float lod = max(smoothstep(320.0, 640.0, dist), smoothstep(mix(0.13, 0.09, tower), mix(0.3, 0.22, tower), px));
          float detail = (1.0 - smoothstep(18.0, 45.0, dist)) * (1.0 - smoothstep(0.035, 0.07, px));
          float inX = band(f.x, gw, 1.0 - gw, aa.x), inY = band(f.y, 0.26, 0.86, aa.y);
          // Medianeras: las caras que dan a un vecino no tienen ventanas
          float faceBit = abs(vWN.x) > abs(vWN.z) ? (vWN.x > 0.0 ? 1.0 : 2.0) : (vWN.z > 0.0 ? 4.0 : 8.0);
          float hasWin = mod(floor(vWin / faceBit + 0.001), 2.0);
          float win = inX * inY * step(0.0, cell.y) * wall * hasWin;
          // Marco, parteluz, alféizar y cortinas: solo de cerca, donde se distinguen
          float frameIn = band(f.x, gw + 0.045, 1.0 - gw - 0.045, aa.x) * band(f.y, 0.3, 0.82, aa.y);
          float frame = win * (1.0 - frameIn) * detail * (1.0 - tower);
          float mull = win * (1.0 - smoothstep(0.012, 0.012 + aa.x * 2.0, abs(f.x - 0.5))) * detail * (1.0 - tower);
          float sill = band(f.x, gw - 0.03, 1.0 - gw + 0.03, aa.x) * band(f.y, 0.215, 0.26, aa.y) * step(0.0, cell.y) * wall * detail * hasWin;
          float kc = h21(floor(cell) * 2.3 + sd * 5.0);
          float curtainH = kc < 0.55 ? mix(0.2, 0.5, kc / 0.55) : 0.0;
          float curtain = win * frameIn * smoothstep(0.82 - curtainH - aa.y, 0.82 - curtainH + aa.y, f.y) * detail * (1.0 - tower);
          // Torres: vidrio continuo con losas
          float slab = smoothstep(0.9 - aa.y, 0.9 + aa.y, f.y);
          win = mix(win, (1.0 - slab) * wall * step(0.0, cell.y), tower);
          // Cornisa y balcones corridos en edificios residenciales
          float cornice = wall * step(vTop - 0.17, vWP.y);
          float resi = (1.0 - tower) * step(sd, 0.5) * step(0.0, cell.y) * wall;
          float balc = resi * step(f.y, 0.07);
          float balcShade = resi * step(0.07, f.y) * step(f.y, 0.15);
          win *= 1.0 - cornice;
          frame *= 1.0 - cornice; mull *= 1.0 - cornice; curtain *= 1.0 - cornice; sill *= 1.0 - cornice;
          // Planta baja: locales
          float shop = wall * hasWin * (1.0 - step(0.3, vWP.y - 0.14)) * step(0.06, vWP.y - 0.14) * step(0.12, fract(fu.x / 1.6)) * step(fract(fu.x / 1.6), 0.88);
          float rnd = h21(floor(cell) + sd * 31.0 + floor(vWN.xz + 0.5) * 11.0);
          float lit = mix(step(mix(0.68, 0.72, tower), rnd), mix(0.09, 0.06, tower), lod);
          // A la distancia la grilla se reemplaza por su promedio: así no aparece efecto moiré
          float winAvg = mix(0.34, 0.75, tower) * wall * step(0.0, cell.y) * (1.0 - cornice) * hasWin;
          float gvar = mix(h21(floor(cell) * 0.7 + sd), 0.5, max(lod, smoothstep(0.03, 0.09, px)));
          vec3 glassDay = mix(vec3(0.24, 0.29, 0.36), vec3(0.42, 0.5, 0.6), gvar);
          // Torres: vidrio con tono propio (azulado, bronce, plata o grafito) que se aclara hacia arriba
          float tk = fract(sd * 3.7);
          vec3 tTint = tk < 0.3 ? vec3(0.27, 0.33, 0.44) : (tk < 0.55 ? vec3(0.42, 0.37, 0.33) : (tk < 0.8 ? vec3(0.47, 0.5, 0.55) : vec3(0.2, 0.22, 0.28)));
          tTint *= mix(0.8, 1.22, clamp(vWP.y / max(vTop, 1.0), 0.0, 1.0)) * mix(0.94, 1.06, gvar);
          glassDay = mix(glassDay, tTint, tower);
          #ifdef FACADE_LIGHT
            glassDay = mix(glassDay, vec3(0.62, 0.66, 0.74), 0.35); // reflejo del cielo aproximado
          #endif
          vec3 glass = mix(glassDay, vec3(0.03, 0.025, 0.04), uNight);
          // Oclusión aproximada: más oscuro cerca del suelo
          float ao = mix(0.6, 1.0, smoothstep(0.0, 2.5, vWP.y));
          diffuseColor.rgb *= ao * mix(1.0, 0.5, uNight) * mix(0.9, 1.0, max(hasWin, 1.0 - wall));
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
          #ifdef FACADE_LIGHT
            totalEmissiveRadiance += diffuseColor.rgb * uAmb; // luz del cielo que el material simple no calcula
          #endif
          float shopLit = step(0.45, h21(vec2(floor(fu.x / 1.6), sd * 9.0)));
          totalEmissiveRadiance += shop * shopLit * vec3(1.0, 0.8, 0.55) * uNight * 1.0;`);
    };
    mtl.customProgramCacheKey = () => "facade4" + (light ? "L" : "");
    return mtl;
  }
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const CH = 0.27, chamGeo = prismGeo([[-.5, -.5], [.5, -.5], [.5, .5 - CH], [.5 - CH, .5], [-.5, .5]]);
  const towerCols = ["#9FA6AE", "#B4B8BD", "#8D97A2", "#C4BDB6", "#A8A19F"].map(C);
  // Volúmenes: cada lote y, en algunos, los últimos pisos retirados de la línea de frente
  const vols = [], chams = [];
  lots.forEach((l, k) => {
    const col = l.col || (l.tower ? towerCols[k % towerCols.length] : facade[(k * 7 + Math.floor(l.h * 3)) % facade.length]);
    (l.cham >= 0 ? chams : vols).push({ x: l.x, z: l.z, w: l.w, d: l.d, y: 0.14, h: l.h, seed: l.seed + (l.tower ? 2 : 0), col, mask: l.mask, cham: l.cham });
    l.roof = l.h + 0.14;
    if (!l.tower && !l.col && l.h > 2.6 && r() < 0.45) {
      const hh = FLOOR * (1 + Math.floor(r() * 2)) + 0.1;
      vols.push({ x: l.x, z: l.z, w: l.w * 0.84, d: l.d * 0.68, y: l.roof, h: hh, seed: l.seed, col: col.clone().multiplyScalar(1.05), mask: l.mask, cham: -1 });
      l.roof += hh;
    }
  });
  const UPV = V(0, 1, 0), sc3 = V(1, 1, 1);
  function buildInst(geo, list, mat) {
    const g = geo.clone(), n = list.length;
    const sA = new Float32Array(n), tA = new Float32Array(n), wA = new Float32Array(n);
    list.forEach((v, k) => { sA[k] = v.seed; tA[k] = (v.y ?? 0.14) + v.h; wA[k] = v.mask ?? 15; });
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(sA, 1));
    g.setAttribute("aTop", new THREE.InstancedBufferAttribute(tA, 1));
    g.setAttribute("aWin", new THREE.InstancedBufferAttribute(wA, 1));
    const inst = new THREE.InstancedMesh(g, mat, n);
    list.forEach((v, k) => {
      const c = v.cham ?? -1, swap = c === 1 || c === 3;
      q.setFromAxisAngle(UPV, c >= 0 ? [0, Math.PI / 2, Math.PI, -Math.PI / 2][c] : 0);
      m4.compose(p3.set(v.x, v.y ?? 0.14, v.z), q, sc3.set(swap ? v.d : v.w, v.h, swap ? v.w : v.d));
      inst.setMatrixAt(k, m4); inst.setColorAt(k, v.col);
    });
    return inst;
  }
  const bMat = facadeMaterial(0xffffff, 0, !!Q.soft);
  const bInst = buildInst(bGeo, vols, bMat), chamInst = buildInst(chamGeo, chams, bMat);
  bInst.castShadow = bInst.receiveShadow = chamInst.castShadow = chamInst.receiveShadow = HQ;
  city.add(bInst, chamInst);
  // Pase previo de profundidad: cada píxel de fachada se calcula una sola vez aunque haya edificios superpuestos
  const prepassMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  const prepass = inst => { if (Q.soft) return null; const pp = new THREE.InstancedMesh(inst.geometry, prepassMat, inst.count); pp.instanceMatrix = inst.instanceMatrix; pp.renderOrder = -1; city.add(pp); return pp; };
  prepass(bInst); prepass(chamInst);

  // Ciudad lejana: manzanas más simples hasta el horizonte, con la 9 de Julio y el aeropuerto como referencias
  const AIR = { x: 80, z0: -570, z1: -300, w: 6 }; // pista 13/31: 2.690 m por 60 m
  const farVols = [], farPlates = [], fr = rng(77);
  const FI = Math.ceil(FAR / PITCH);
  for (let i = -FI; i <= 7; i++) for (let j = -FI; j <= FI; j++) {
    if (i === 0) continue;
    if (Math.abs(i) <= N && j >= -N && j <= N) continue;
    const x = i * PITCH, z = (j + 0.5) * PITCH;
    if (Math.hypot(x, z) > FAR * 0.98) continue;
    if (x > 28 && z > AIR.z0 - 40 && z < AIR.z1 + 85) continue;
    if (fr() < 0.035) { farPlates.push([x, z]); continue; } // plazas
    farPlates.push([x, z]);
    const madero = x > 40 && z > 40 && z < 330;
    const lotsN = Q.lots;
    for (let a = 0; a < lotsN; a++) {
      const tower = fr() < (madero ? 0.24 : 0.04);
      const floors = tower ? Math.round(lerp(22, 48, fr())) : Math.round(lerp(3, 13, Math.pow(fr(), 1.3)));
      const w = BLOCK / lotsN - 0.5 - fr() * 0.4;
      farVols.push({ x: x - BLOCK / 2 + (BLOCK / lotsN) * (a + 0.5), z: z + (fr() - 0.5) * 0.6, w, d: BLOCK - 0.8 - fr() * 0.8, h: floors * FLOOR + 0.3, seed: fr() + (tower ? 2 : 0), col: tower ? towerCols[Math.floor(fr() * towerCols.length)] : facade[Math.floor(fr() * facade.length)] });
    }
  }
  const farPlate = new THREE.InstancedMesh(blockInst.geometry, blockMat, farPlates.length);
  farPlates.forEach(([x, z], k) => { m4.makeTranslation(x, 0, z); farPlate.setMatrixAt(k, m4); });
  city.add(farPlate);
  const farInst = buildInst(bGeo, farVols, facadeMaterial(0xffffff, 0, true));
  city.add(farInst); prepass(farInst);

  const poolTex = radial([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,.5)"], [0.7, "rgba(255,255,255,.12)"], [1, "rgba(255,255,255,0)"]]);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: C("#FFB868"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const floorQ0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const numMats = [], nightOnly = [];
  const planeGrey0 = new THREE.MeshStandardMaterial({ color: C("#9A979A"), roughness: 0.35, metalness: 0.6 });
  // Aeroparque sobre la costanera, al norte: pista, rodajes, plataforma, terminal con mangas y torre de control
  const airport = new THREE.Group(); city.add(airport);
  const airFieldMat = new THREE.MeshStandardMaterial({ color: C("#A39791"), roughness: 1 });
  const asphaltMat = new THREE.MeshStandardMaterial({ color: C("#3B3538"), roughness: 0.9 });
  const apronMat = new THREE.MeshStandardMaterial({ color: C("#8E8784"), roughness: 0.85 });
  const markMat = new THREE.MeshBasicMaterial({ color: C("#EFE9E4"), transparent: true, opacity: 0.85 });
  const leadMat = new THREE.MeshBasicMaterial({ color: C("#E3C877"), transparent: true, opacity: 0.8 });
  const airLen = AIR.z1 - AIR.z0, airMid = (AIR.z0 + AIR.z1) / 2, TWY = AIR.x - 11, APX = 55;
  const slab = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.receiveShadow = HQ; airport.add(o); return o; };
  slab(80, 0.06, airLen + 140, airFieldMat, 66, 0.03, airMid + 30);
  slab(AIR.w, 0.05, airLen, asphaltMat, AIR.x, 0.07, airMid);
  slab(2.4, 0.05, airLen - 24, asphaltMat, TWY, 0.07, airMid);
  for (let k = 0; k < 5; k++) slab(AIR.x - TWY, 0.05, 2, asphaltMat, (AIR.x + TWY) / 2, 0.075, AIR.z0 + 14 + k * (airLen - 28) / 4);
  slab(18, 0.05, 104, apronMat, APX, 0.07, airMid);
  slab(4, 0.05, 2.4, apronMat, TWY - 2.6, 0.075, airMid - 6);
  // Costanera: avenida entre el aeropuerto y el río
  slab(3.2, 0.05, airLen + 140, asphaltMat, 104.6, 0.08, airMid + 30);
  // Marcas de pista: eje, bordes, umbrales, zona de contacto y numeración
  const marks = [];
  for (let z = AIR.z0 + 16; z < AIR.z1 - 16; z += 7) marks.push([AIR.x, z, 0.16, 3.4]);
  for (const sg of [-1, 1]) marks.push([AIR.x + sg * (AIR.w / 2 - 0.25), airMid, 0.12, airLen - 2]);
  for (const zz of [AIR.z0 + 4, AIR.z1 - 4]) for (let k = -4; k <= 4; k++) if (k) marks.push([AIR.x + k * 0.62, zz, 0.26, 4.2]);
  for (const [z0, dir] of [[AIR.z1, -1], [AIR.z0, 1]]) for (const d of [22, 34, 46]) for (const sg of [-1, 1]) marks.push([AIR.x + sg * 1.5, z0 + dir * d, 0.4, 2.6]);
  const markInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), markMat, marks.length);
  marks.forEach(([x, z, w, d], k) => { m4.compose(V(x, 0.1, z), floorQ0, V(w, d, 1)); markInst.setMatrixAt(k, m4); });
  airport.add(markInst);
  const numTex = txt => canvasTex(128, 192, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "bold 110px Inter, Arial, sans-serif"; g.textAlign = "center"; g.fillText(txt, w / 2, 150); }, false);
  [["13", AIR.z1 - 13, 0], ["31", AIR.z0 + 13, Math.PI]].forEach(([t, z, ry]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.5), new THREE.MeshBasicMaterial({ map: numTex(t), transparent: true, opacity: 0.85, depthWrite: false }));
    m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(AIR.x, 0.11, z); airport.add(m); numMats.push(m.material);
  });
  // Líneas guía de cada puesto de estacionamiento
  const GATES = [-27, -9, 9, 27];
  const leads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), leadMat, GATES.length);
  GATES.forEach((gz, k) => { m4.compose(V(APX + 2, 0.1, airMid + gz), floorQ0, V(16, 0.12, 1)); leads.setMatrixAt(k, m4); });
  airport.add(leads);
  // Terminal de vidrio con techo volado, mangas telescópicas y hangares
  const termMat = new THREE.MeshStandardMaterial({ color: C("#E7E0DA"), roughness: 0.6 });
  const termGlass = new THREE.MeshStandardMaterial({ color: C("#3E4A58"), roughness: 0.1, metalness: 0.6, emissive: C("#FFD9A8"), emissiveIntensity: 0 });
  slab(7, 2.8, 84, termMat, 39.5, 1.4, airMid).castShadow = HQ;
  slab(7.1, 1.6, 84.1, termGlass, 39.5, 1.5, airMid);
  slab(10, 0.22, 88, termMat, 40.2, 2.92, airMid).castShadow = HQ;
  GATES.forEach(gz => {
    const b = slab(5, 0.5, 0.65, termMat, 45.6, 1.15, airMid + gz); b.castShadow = HQ;
    slab(0.5, 1.0, 0.5, planeGrey0, 47.6, 0.5, airMid + gz);
  });
  [-1, 1].forEach(sg => { const hg = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 14, 24, 1, false, 0, Math.PI), termMat); hg.rotation.z = Math.PI / 2; hg.position.set(40, 0.06, airMid + sg * 64); hg.castShadow = HQ; airport.add(hg); });
  // Torre de control con balcón y antena
  const towerG = new THREE.Group(); towerG.position.set(50, 0, airMid + 58); airport.add(towerG);
  const tShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 13, 16), termMat); tShaft.position.y = 6.5; tShaft.castShadow = HQ; towerG.add(tShaft);
  const tRing = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.18, 24), termMat); tRing.position.y = 13.1; towerG.add(tRing);
  const tCab = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.25, 1.5, 16), termGlass); tCab.position.y = 13.95; towerG.add(tCab);
  const tCap = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.25, 16), termMat); tCap.position.y = 14.8; towerG.add(tCap);
  const tAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), planeGrey0); tAnt.position.y = 16; towerG.add(tAnt);
  // Vehículos de plataforma junto a los aviones
  const gse = [];
  GATES.forEach((gz, i) => { if (i !== 1) gse.push([APX - 1, airMid + gz + 3.5, 0.9, 0.6, 1.6], [APX + 3, airMid + gz - 3.2, 0.7, 0.5, 1.1]); });
  const gseInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), gse.length);
  gse.forEach(([x, z, w, h, d], k) => { m4.makeScale(w, h, d); m4.setPosition(x, 0.07, z); gseInst.setMatrixAt(k, m4); gseInst.setColorAt(k, k % 2 ? C("#F1ECE6") : C("#8B1D3D")); });
  airport.add(gseInst);
  // Balizas de pista y de aproximación: piezas al ras del suelo, encendidas de noche
  const edgeLights = [];
  for (let z = AIR.z0 + 2; z <= AIR.z1 - 2; z += 6) edgeLights.push([AIR.x - AIR.w / 2 - 0.15, z], [AIR.x + AIR.w / 2 + 0.15, z]);
  for (let k = 1; k <= 10; k++) for (const dx of [-1.6, -0.8, 0, 0.8, 1.6]) if (k > 5 || Math.abs(dx) < 1) edgeLights.push([AIR.x + dx, AIR.z1 + k * 4]);
  for (let z = AIR.z0 + 16; z <= AIR.z1 - 16; z += 8) edgeLights.push([TWY - 1.4, z], [TWY + 1.4, z]);
  const beaconMat = new THREE.MeshBasicMaterial({ color: C("#7A7072"), toneMapped: false });
  const edgeInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), beaconMat, edgeLights.length);
  edgeLights.forEach(([x, z], k) => { m4.makeTranslation(x, 0.14, z); edgeInst.setMatrixAt(k, m4); });
  airport.add(edgeInst);
  // Torres de iluminación de la plataforma: de noche iluminan el piso
  const masts = [[APX + 8, airMid - 46], [APX + 8, airMid - 16], [APX + 8, airMid + 16], [APX + 8, airMid + 46]];
  masts.forEach(([x, z]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), planeGrey0); m.position.set(x, 3, z); airport.add(m); });
  const apronPools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), poolMat, masts.length);
  masts.forEach(([x, z], k) => { m4.compose(V(x - 5, 0.11, z), floorQ0, V(20, 20, 1)); apronPools.setMatrixAt(k, m4); });
  apronPools.renderOrder = 2; airport.add(apronPools); nightOnly.push(apronPools);

  // Aviones: llegan por el río, aterrizan y despegan hacia el norte
  const planeWhite = new THREE.MeshStandardMaterial({ color: C("#F3F1EF"), roughness: 0.32, metalness: 0.25 });
  // Fuselaje con la fila de ventanillas a cada lado y una franja carmesí
  const bodyTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = "#F3F1EF"; g.fillRect(0, 0, w, h);
    for (const cx of [w * 0.25, w * 0.75]) {
      g.fillStyle = "#8B1D3D"; g.fillRect(cx - 7, 0, 3, h);
      g.fillStyle = "#2A2427"; for (let y = 24; y < h - 12; y += 5) g.fillRect(cx - 2, y, 4, 2.6);
      g.fillRect(cx - 3, 6, 6, 9); // cabina, hacia la nariz
    }
  });
  const planeBody = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.32, metalness: 0.25 });
  const planeTail = new THREE.MeshStandardMaterial({ color: C("#8B1D3D"), roughness: 0.4, metalness: 0.2 });
  const planeGrey = planeGrey0;
  const navWhite = new THREE.MeshBasicMaterial({ color: C("#FFFFFF"), toneMapped: false, transparent: true, opacity: 0 });
  const navRed = new THREE.MeshBasicMaterial({ color: C("#FF2244"), toneMapped: false, transparent: true, opacity: 0 });
  const wingShape = (span, root, tip, sweep) => { const sh = new THREE.Shape(); sh.moveTo(0, root / 2); sh.lineTo(span, root / 2 - sweep); sh.lineTo(span, root / 2 - sweep - tip); sh.lineTo(0, -root / 2); sh.closePath(); return sh; };
  function makePlane() {
    const g = new THREE.Group(), S = 2.4;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * S, 0.2 * S, 2.6 * S, 20), planeBody); body.rotation.x = Math.PI / 2; g.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2 * S, 16, 12), planeWhite); nose.scale.set(1, 1, 1.9); nose.position.z = 1.3 * S; g.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2 * S, 0.9 * S, 16), planeWhite); tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.04 * S, -1.75 * S); tail.scale.set(1, 1, 0.75); g.add(tail);
    const wGeo = new THREE.ExtrudeGeometry(wingShape(1.75 * S, 0.75 * S, 0.22 * S, 0.62 * S), { depth: 0.035 * S, bevelEnabled: false });
    [-1, 1].forEach(sg => {
      const w = new THREE.Mesh(wGeo, planeWhite); w.rotation.x = Math.PI / 2; w.scale.x = sg; w.position.set(0, -0.08 * S, 0.12 * S); g.add(w);
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * S, 0.075 * S, 0.42 * S, 12), planeGrey); eng.rotation.x = Math.PI / 2; eng.position.set(sg * 0.62 * S, -0.2 * S, 0.12 * S); g.add(eng);
      const hs = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape(0.62 * S, 0.34 * S, 0.14 * S, 0.24 * S), { depth: 0.025 * S, bevelEnabled: false }), planeWhite); hs.rotation.x = Math.PI / 2; hs.scale.x = sg; hs.position.set(0, 0.06 * S, -1.72 * S); g.add(hs);
      const nav = new THREE.Mesh(new THREE.BoxGeometry(0.05 * S, 0.05 * S, 0.05 * S), sg < 0 ? navRed : navWhite); nav.position.set(sg * 1.75 * S, -0.06 * S, -0.5 * S); g.add(nav);
    });
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape(0.78 * S, 0.62 * S, 0.24 * S, 0.5 * S), { depth: 0.03 * S, bevelEnabled: false }), planeTail);
    fin.rotation.set(0, Math.PI / 2, Math.PI / 2); fin.position.set(0.015 * S, 0.12 * S, -1.62 * S); g.add(fin);
    const land = new THREE.Mesh(new THREE.BoxGeometry(0.08 * S, 0.04 * S, 0.02 * S), navWhite); land.position.set(0, -0.12 * S, 1.55 * S); g.add(land);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.06 * S, 0.04 * S, 0.06 * S), navRed); beacon.position.set(0, 0.22 * S, -0.2 * S); g.add(beacon);
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    city.add(g);
    return g;
  }
  // Llegada: aproximación sobre el río, toma de contacto, carreteo y entrada al hangar
  const ARRIVE = new THREE.CatmullRomCurve3([V(240, 120, 1020), V(185, 74, 460), V(150, 42, 80), V(130, 22, AIR.z1 + 125), V(101, 7, AIR.z1 + 42), V(AIR.x, 0.75, AIR.z1 - 4),
    V(AIR.x, 0.75, AIR.z1 - 110), V(AIR.x, 0.75, airMid - 48), V(AIR.x - 4, 0.75, airMid - 59), V(TWY, 0.75, airMid - 61), V(56, 0.75, airMid - 63), V(46, 0.75, airMid - 64)], false, "centripetal");
  // Salida: deja su puesto, carretea por el rodaje paralelo, entra a la cabecera sur y despega hacia el norte
  const DEPART = new THREE.CatmullRomCurve3([V(53, 0.75, airMid - 9), V(60, 0.75, airMid - 9), V(TWY - 2.6, 0.75, airMid - 6), V(TWY, 0.75, airMid + 6), V(TWY, 0.75, AIR.z1 - 20), V(TWY + 4, 0.75, AIR.z1 - 10),
    V(AIR.x, 0.75, AIR.z1 - 16), V(AIR.x, 0.75, AIR.z1 - 40), V(AIR.x, 0.75, AIR.z1 - 170), V(AIR.x + 2, 7, AIR.z0 - 30), V(AIR.x + 30, 48, AIR.z0 - 320), V(AIR.x + 90, 120, AIR.z0 - 700)], false, "centripetal");
  const uAt = (curve, test) => { const pt = new THREE.Vector3(); for (let u = 0; u <= 1; u += 0.001) { curve.getPointAt(u, pt); if (test(pt)) return u; } return 1; };
  const U_IN = uAt(ARRIVE, pt => pt.z < 170), U_TOUCH = uAt(ARRIVE, pt => pt.y < 1), U_LINE = uAt(DEPART, pt => pt.x > AIR.x - 0.5 && pt.z < AIR.z1 - 30);
  // Dos llegadas alternadas (siempre hay un avión aproximando sobre el río) y una salida
  const flights = [
    { g: makePlane(), path: ARRIVE, period: 50, offset: 4, arrive: true },
    { g: makePlane(), path: ARRIVE, period: 50, offset: 29, arrive: true },
    { g: makePlane(), path: DEPART, period: 50, offset: 16, arrive: false },
  ];
  // Aviones estacionados en las mangas
  if (!mobile) [-27, 9, 27].forEach(gz => { const g = makePlane(); g.position.set(52, 0.75, airMid + gz); g.rotation.y = -Math.PI / 2; });
  const fwd = new THREE.Vector3();
  function moveFlights(t) {
    for (const f of flights) {
      const k = ((t + f.offset) % f.period) / f.period;
      let u;
      if (f.arrive) u = k < 0.5 ? lerp(U_IN, U_TOUCH, k / 0.5) : U_TOUCH + (1 - U_TOUCH) * (1 - Math.pow(1 - (k - 0.5) / 0.5, 2.2));
      else u = k < 0.6 ? U_LINE * k / 0.6 : U_LINE + (1 - U_LINE) * Math.pow((k - 0.6) / 0.4, 1.8);
      f.path.getPointAt(u, f.g.position);
      f.path.getTangentAt(Math.min(0.999, u + 0.001), fwd);
      fwd.y *= 0.6; // cabeceo suave
      f.g.lookAt(fwd.add(f.g.position));
      f.g.visible = k > 0.004 && k < 0.996;
    }
    const blink = (Math.sin(t * 6) > 0.6 ? 1 : 0.15) * state.night;
    navRed.opacity = blink; navWhite.opacity = state.night;
  }

  // Detalles de azotea: tanques y equipos
  const roofBits = [];
  lots.forEach(l => { if (!l.tower && r() < 0.6) { const n = 1 + Math.floor(r() * 3); for (let i = 0; i < n; i++) roofBits.push([l.x + (r() - 0.5) * l.w * 0.4, l.roof, l.z + (r() - 0.5) * l.d * 0.4, 0.3 + r() * 0.45, 0.2 + r() * 0.35]); } });
  const roofInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: C("#B7ACA6"), roughness: 0.9 }), roofBits.length);
  roofBits.forEach(([x, y, z, w, h], k) => { m4.makeScale(w, h, w); m4.setPosition(x, y, z); roofInst.setMatrixAt(k, m4); });
  roofInst.castShadow = HQ; city.add(roofInst);

  // Jacarandás en flor sobre la 9 de Julio y en algunas veredas
  const trees = [];
  for (let z = -ext; z <= ext; z += 3.1) for (const x of [-4.2, 4.2]) if (Math.hypot(x, z) > 6.5 && r() < 0.85) trees.push([x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 1.2]);
  blocks.forEach(([bx, bz]) => { if (r() < (Q.soft ? 0.1 : 0.35)) for (let i = 0; i < 4; i++) trees.push([bx - BLOCK / 2 - 0.6, bz - BLOCK / 2 + 1.2 + i * 2.5]); });
  const canopyGeo = new THREE.IcosahedronGeometry(1, Q.soft ? 0 : 1);
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
    { key: "acu", pos: SPOTS.acu.clone() },
    { key: "oll", pos: SPOTS.oll.clone() },
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
  // Diagonal Norte y Plaza de Mayo con la Pirámide; la Casa Rosada es el edificio rosado frente al río
  const diagStreet = new THREE.Mesh(new THREE.BoxGeometry(DIAG.len, 0.03, DIAG.w), groundMat);
  diagStreet.position.set(DIAG.x0 + DIAG.dx * DIAG.len / 2, 0.15, DIAG.z0 + DIAG.dz * DIAG.len / 2);
  diagStreet.rotation.y = -Math.atan2(DIAG.dz, DIAG.dx); diagStreet.receiveShadow = HQ; city.add(diagStreet);
  const piramide = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.2, 4), obeMat); piramide.rotation.y = Math.PI / 4; piramide.position.set(PLAZA_MAYO[0], 1.25, PLAZA_MAYO[1]); piramide.castShadow = HQ; city.add(piramide);
  const pmPave = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 0.6, 0.04, BLOCK - 0.6), plazaMat); pmPave.position.set(PLAZA_MAYO[0], 0.16, PLAZA_MAYO[1]); pmPave.receiveShadow = HQ; city.add(pmPave);
  const RIO = V(124, 0, 40);

  // Luces de calle, charcos de luz y autos
  // Faroles como geometría real: columna y luminaria, encendida solo de noche
  const lampPos = [];
  for (let z = -ext; z <= ext; z += 6.6) lampPos.push([-7.7, z], [7.7, z]);
  for (let x = -ext; x <= 98; x += 6.6) if (Math.abs(x) > 8) lampPos.push([x, -1.35], [x, 1.35]);
  for (let z = -ext * 1.5; z <= ext * 1.5; z += 6) lampPos.push([106.6, z]);
  const poleMat = new THREE.MeshStandardMaterial({ color: C("#3A3236"), roughness: 0.6, metalness: 0.4 });
  const headMat = new THREE.MeshBasicMaterial({ color: C("#5A4E52") });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 5).translate(0, 0.55, 0), poleMat, lampPos.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), headMat, lampPos.length);
  lampPos.forEach(([x, z], k) => { m4.makeTranslation(x, 0.12, z); poles.setMatrixAt(k, m4); m4.makeTranslation(x, 1.24, z); heads.setMatrixAt(k, m4); });
  city.add(poles, heads);
  // De noche cada farol ilumina la vereda: la luz queda apoyada en el piso, nada flota
  const floorQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), poolMat, lampPos.length);
  lampPos.forEach(([x, z], k) => { m4.compose(V(x, 0.15, z), floorQ, V(3.4, 3.4, 1)); pools.setMatrixAt(k, m4); });
  pools.renderOrder = 2; city.add(pools);

  const CARS = Q.cars;
  const cars = [], cr = rng(99);
  const carColors = ["#F2F0EE", "#1B1A1C", "#8A8C90", "#5E1028", "#2C2F36", "#C9C4BE"].map(C);
  const carGeo = Q.soft ? new THREE.BoxGeometry(0.34, 0.2, 0.78) : new RoundedBoxGeometry(0.34, 0.2, 0.78, 2, 0.06);
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
  const beamMat = new THREE.MeshBasicMaterial({ map: poolTex, color: C("#FFE6C2"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const beamsG = new THREE.PlaneGeometry(1, 1); beamsG.rotateX(-Math.PI / 2);
  const carBeams = new THREE.InstancedMesh(beamsG, beamMat, CARS); carBeams.renderOrder = 2; city.add(carBeams);
  const beamScale = V(0.9, 1, 2.6);
  const RX = 9, RZ = 6.2;
  function moveCars(dt) {
    for (let i = 0; i < CARS; i++) {
      const c = cars[i];
      if (!reduce) c.s += c.dir * c.v * dt;
      const max = c.onJulio ? ext : 100;
      if (c.s > max) c.s = -ext; if (c.s < -ext) c.s = max;
      let x = c.onJulio ? c.lane : c.s, z = c.onJulio ? c.s : c.lane, vx = c.onJulio ? 0 : c.dir, vz = c.onJulio ? c.dir : 0;
      // Por Corrientes los autos rodean la Plaza de la República en lugar de atravesar el Obelisco
      if (!c.onJulio && Math.abs(x) < RX) {
        const sg = Math.sign(c.lane), k = Math.PI * x / RX;
        z += sg * RZ * 0.5 * (1 + Math.cos(k));
        vz = c.dir * -sg * RZ * 0.5 * Math.sin(k) * Math.PI / RX;
      }
      q.setFromAxisAngle(UPV, Math.atan2(vx, vz));
      const fl = 0.4 / Math.hypot(vx, vz), fx = vx * fl, fz = vz * fl;
      m4.compose(p3.set(x, 0.12, z), q, s3); carMesh.setMatrixAt(i, m4);
      m4.compose(p3.set(x + fx, 0.16, z + fz), q, s3); headL.setMatrixAt(i, m4);
      m4.compose(p3.set(x - fx, 0.16, z - fz), q, s3); tailL.setMatrixAt(i, m4);
      if (state.night > 0.02) { m4.compose(p3.set(x + fx * 4.2, 0.02, z + fz * 4.2), q, beamScale); carBeams.setMatrixAt(i, m4); }
    }
    carMesh.instanceMatrix.needsUpdate = true;
    if (state.night > 0.02) { headL.instanceMatrix.needsUpdate = true; tailL.instanceMatrix.needsUpdate = true; carBeams.instanceMatrix.needsUpdate = true; }
  }

  /* ───────────── INTERIOR ───────────── */
  const room = new THREE.Scene();
  room.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  room.environmentIntensity = 0.3;
  const rHemi = new THREE.HemisphereLight(0xffffff, 0x3a2a2a, 0.5); room.add(rHemi);
  const rSun = new THREE.DirectionalLight(0xFFE2C2, 3);
  rSun.position.set(-7, 4.2, 1.2); rSun.target.position.set(0, 0, -2); room.add(rSun, rSun.target);
  rSun.castShadow = !Q.soft;
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
  // Notebook: base de aluminio con teclado y touchpad, bisagra, tapa con marco negro y pantalla
  const alu = std("#BDB7B4", { metalness: 0.75, roughness: 0.32 });
  const keysTex = tex(heightCanvas(320, 112, (g, w, h) => {
    g.fillStyle = "#151114"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#2E282B";
    for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) { g.beginPath(); g.roundRect(4 + c * 22.5, 4 + r * 18.5, 19, 15, 2.5); g.fill(); }
    g.beginPath(); g.roundRect(4 + 4 * 22.5, 4 + 5 * 18.5, 22.5 * 6 - 3.5, 15, 2.5); g.fill();
  }));
  const lx = -1.65, ly = 0.8, lz = -1.5;
  add(new RoundedBoxGeometry(0.36, 0.014, 0.25, 3, 0.005), alu, lx, ly + 0.007, lz);
  const kb = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.11), new THREE.MeshStandardMaterial({ map: keysTex, roughness: 0.55 }));
  kb.rotation.x = -Math.PI / 2; kb.position.set(lx, ly + 0.0145, lz - 0.04); room.add(kb);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.068), std("#A8A29F", { metalness: 0.6, roughness: 0.22 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(lx, ly + 0.0145, lz + 0.07); room.add(pad);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 12), std("#2A2427", { metalness: 0.5, roughness: 0.4 }), lx, ly + 0.014, lz - 0.123).rotation.z = Math.PI / 2;
  const lid = new THREE.Group(); lid.position.set(lx, ly + 0.014, lz - 0.123); lid.rotation.x = -0.24; room.add(lid);
  add(new RoundedBoxGeometry(0.36, 0.238, 0.007, 3, 0.003), alu, 0, 0.119, -0.0035, lid);
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(0.352, 0.231), std("#0D0A0C", { roughness: 0.12, metalness: 0.2 })); bezel.position.set(0, 0.119, 0.0004); lid.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.206), new THREE.MeshBasicMaterial({ map: chartTex, toneMapped: false })); screen.position.set(0, 0.124, 0.0008); lid.add(screen);
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
  // Puerta laqueada en tono cálido, con paneles en relieve
  const lacquer = std("#E6DCD0", { roughness: 0.42 }), lacquerP = std("#DDD1C4", { roughness: 0.48 });
  rbox(0.05, 2.1, 0.95, 0.008, lacquer, RW / 2 - 0.035, 1.05, -0.5);
  [[-1.0], [0.0]].forEach(([z]) => box(0.04, 2.2, 0.06, trim, RW / 2 - 0.03, 1.1, z)); box(0.04, 0.06, 1.06, trim, RW / 2 - 0.03, 2.18, -0.5);
  const brass = std("#C9A77E", { metalness: 0.9, roughness: 0.28 });
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 16), brass, RW / 2 - 0.09, 1.02, -0.13).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), brass, RW / 2 - 0.066, 1.02, -0.13).rotation.z = Math.PI / 2;
  // Paneles de la puerta, bisagras y llave de luz
  [[1.52, 0.86], [0.6, 0.62]].forEach(([y, h]) => rbox(0.012, h, 0.7, 0.004, lacquerP, RW / 2 - 0.066, y, -0.5));
  [0.25, 1.05, 1.85].forEach(y => cyl(0.009, 0.009, 0.09, brass, RW / 2 - 0.06, y, -0.965, 12));
  rbox(0.012, 0.11, 0.075, 0.006, trim, RW / 2 - 0.006, 1.1, 0.22);
  rbox(0.008, 0.03, 0.022, 0.004, std("#E9E4DF", { roughness: 0.4 }), RW / 2 - 0.014, 1.1, 0.22);
  // Alféizar interior y zócalo del ventanal
  box(0.16, 0.035, RD - 2.2, std("#EEE8E1", { roughness: 0.35 }), -RW / 2 + 0.06, 0.567, (Z0 + Z1) / 2 - 0.05);
  box(0.018, 0.09, RD, trim, -RW / 2 + 0.02, 0.045, (Z0 + Z1) / 2);
  // Spots embutidos en el techo, encendidos de noche
  const downMat = new THREE.MeshStandardMaterial({ color: C("#FFFFFF"), emissive: C("#FFE0B5"), emissiveIntensity: 0, roughness: 0.4 });
  [[-1.9, -2.9], [-1.8, -1.5], [1.0, 0.6], [2.2, 0.6], [0.4, -0.9]].forEach(([x, z]) => {
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 24), trim, x, RH - 0.003, z).castShadow = false;
    add(new THREE.CylinderGeometry(0.042, 0.042, 0.008, 24), downMat, x, RH - 0.004, z).castShadow = false;
  });
  // Lámpara de pie de bronce junto al sillón
  cyl(0.14, 0.15, 0.02, brass, 0.12, 0.01, -3.76, 32);
  cyl(0.011, 0.011, 1.42, brass, 0.12, 0.73, -3.76, 12);
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.26, 40, 1, true), shadeNight, 0.12, 1.5, -3.76).castShadow = false;
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
  // Espejo: refleja la pared de enfrente con un brillo diagonal suave
  const mirrorTex = tex(heightCanvas(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#F3ECE5"); gr.addColorStop(0.55, "#DCD2C8"); gr.addColorStop(1, "#C9BDB2"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const hl = g.createLinearGradient(0, 0, w, h); hl.addColorStop(0.28, "rgba(255,255,255,0)"); hl.addColorStop(0.36, "rgba(255,255,255,.55)"); hl.addColorStop(0.44, "rgba(255,255,255,0)"); g.fillStyle = hl; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(139,29,61,.55)"; g.fillRect(w * 0.58, h * 0.62, w * 0.5, h * 0.5);
  }));
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.31, 48), new THREE.MeshStandardMaterial({ map: mirrorTex, roughness: 0.08, metalness: 0.1, envMapIntensity: 0.6 }));
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
    V(36, 44, 150), V(40, 30, 72), V(9, 9, 42), V(6, 8.6, 14), V(7, 10, -5),
    V(-6, 24, -14), V(-17, 11, -0.7), V(-29, 5.6, -0.5), V(WIN.x + 0.5, WIN.y + 0.18, WIN.z - 2.1), V(WIN.x, WIN.y, WIN.z - 0.2),
  ]);
  const CITY_LOOK = curve([
    V(72, 2, -330), V(0, 6, 0), V(0, 8, 0), V(-1, 9.5, -4), V(-22, 6, -24),
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
    bed: V(-1.9, 0.85, -2.8), door: V(RW / 2 - 0.08, 1.15, -0.4), phone: V(1.3, 0.5, -2.05), laptop: V(-1.65, 0.95, -1.64), sofa: V(1.55, 0.95, -3.45),
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
    city.environmentIntensity = lerp(0.45, 0.2, m); skyMat.uniforms.uN.value = m;
    uAmb.value.copy(pick("hemiSky", m)).multiplyScalar(lerp(0.55, 0.06, m));
    headMat.color.copy(C("#5A4E52").lerp(C("#FFD08A"), m)); headLMat.opacity = m; tailLMat.opacity = m * 0.9; headL.visible = tailL.visible = carBeams.visible = pools.visible = m > 0.02; poolMat.opacity = m * 0.55; beamMat.opacity = m * 0.32; nightOnly.forEach(o => o.visible = m > 0.02); numMats.forEach(mt => mt.opacity = lerp(0.85, 0.25, m)); lineMat.opacity = lerp(0.55, 0.12, m);
    moon.material.opacity = m;
    airFieldMat.color.copy(C("#A39791").lerp(C("#2A2226"), m)); asphaltMat.color.copy(C("#3B3538").lerp(C("#141013"), m));
    markMat.opacity = lerp(0.85, 0.25, m); leadMat.opacity = lerp(0.8, 0.2, m); apronMat.color.copy(C("#8E8784").lerp(C("#1E181B"), m)); termMat.color.copy(C("#E7E0DA").lerp(C("#4A3E44"), m)); termGlass.emissiveIntensity = m * 0.9;
    beaconMat.color.copy(C("#7A7072").lerp(C("#FFE2B0"), m));
    obeMat.emissiveIntensity = m * 0.45;
    crownMat.emissiveIntensity = m * 1.4;
    heroMat.color.copy(C("#C98B9C").lerp(C("#8A4256"), m)); smallMat.color.copy(heroMat.color);
    canopyMat.color.copy(C("#FFFFFF").lerp(C("#6E5A7E"), m));
    renderer.toneMappingExposure = lerp(0.82, 1.05, m);
    // Interior: de día luz del ventanal; de noche, solo las lámparas
    rHemi.color.copy(pick("roomHemi", m)); rHemi.intensity = lerp(0.38, 0.12, m);
    rSun.intensity = lerp(2.3, 0.0, m);
    room.environmentIntensity = lerp(0.3, 0.08, m);
    pend.forEach(p => p.intensity = lerp(0, 1.5, m)); bedLamp.intensity = lerp(0, 0.8, m); downMat.emissiveIntensity = m * 1.4;
    shadeM.emissiveIntensity = lerp(0, 0.35, m); shadeNight.emissiveIntensity = lerp(0, 0.7, m);
    curtainMat.opacity = lerp(0.6, 0.85, m);
    room.background = pick("windowSky", m);
    if (full) { paintSkyline(m); refreshEnv(); }
  }
  // Sin aceleración: los materiales con reflejos pasan a un sombreado simple (mismo color, mucho más liviano)
  if (Q.soft) {
    const swap = new Map();
    city.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial || o.material.onBeforeCompile.toString().includes("uNight")) return;
      const m = o.material;
      if (!swap.has(m)) { const l = new THREE.MeshLambertMaterial({ map: m.map, transparent: m.transparent, opacity: m.opacity, side: m.side, vertexColors: m.vertexColors, flatShading: m.flatShading }); l.color = m.color; l.emissive = m.emissive; Object.defineProperty(l, "emissiveIntensity", { get: () => m.emissiveIntensity, set: v => { m.emissiveIntensity = v; } }); swap.set(m, l); }
      o.material = swap.get(m);
    });
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
  function setDpr(d) { renderer.setPixelRatio(d); renderer.setSize(lastW, lastH, false); }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    // En el celular la barra del navegador cambia el alto: si solo cambia un poco, no se toca el lienzo
    if (mobile && w === lastW && Math.abs(h - lastH) < 140) return;
    lastW = w; lastH = h;
    if (soft) soft.hi = false;
    setDpr(dprFor(w, h));
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 64 : 50;
    camera.updateProjectionMatrix();
    dirty = true;
    clearTimeout(snapTimer); snapTimer = setTimeout(() => { if (running) { snapshot(); dirty = true; } }, 200);
  }
  let lastW = 0, lastH = 0, dirty = true, running = false;
  const soft = Q.soft ? { hi: false, idle: 0 } : null;
  resize();
  addEventListener("resize", resize);
  if (!mobile) addEventListener("pointermove", e => { state.mx = e.clientX / innerWidth - 0.5; state.my = e.clientY / innerHeight - 0.5; });

  const v3 = new THREE.Vector3(), lastCam = new THREE.Matrix4();
  let labelEls = [], lastPaint = state.night, visible = true, last = performance.now();
  const gov = { t: 0, n: 0, steps: 0, start: 0 };
  const AUTO_LEN = 28; // segundos de cada vuelta del recorrido automático en mobile

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw), sdt = Math.min(0.25, raw); last = now; // sdt: suavizado según el tiempo real
    state.time += dt;
    // Control de rendimiento: mide los cuadros dibujados en la ciudad y baja la resolución si no alcanzan
    if (!gov.start) gov.start = now;
    if (gov.drew && !state.auto && now - gov.start > 2500 && state.pShown < CUT && raw < 1.5) {
      gov.t += raw; gov.n++;
      if (gov.t > 1.5) {
        const fps = gov.n / gov.t; gov.t = gov.n = 0;
        if (fps < (Q.minFps || 45) && gov.steps < (Q.soft ? 4 : 3)) { gov.steps++; dprScale *= 0.8; lastW = 0; resize(); }
      }
    }
    gov.drew = false;
    if (state.auto) {
      if (!reduce) state.autoT = (state.autoT + dt / AUTO_LEN) % 1;
      state.p = state.pShown = state.autoT;
    } else {
      state.pShown = reduce ? state.p : lerp(state.pShown, state.p, 1 - Math.pow(0.0015, sdt));
      if (Math.abs(state.pShown - state.p) < 2e-5) state.pShown = state.p; // se asienta: permite dejar de dibujar
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
      roll = lerp(roll, rl, 1 - Math.pow(0.006, sdt)); if (Math.abs(roll - rl) < 2e-4) roll = rl;
      if (!reduce && !Q.soft) { const idle = 1 - clamp01(p / 0.06); pos.add(V(Math.sin(state.time * 0.15) * 6 * idle, 0, Math.cos(state.time * 0.15) * 4 * idle)); }
      if (!Q.soft) moveCars(dt);
      moveFlights(reduce ? 12 : Q.soft ? 20 : state.time); skyMat.uniforms.uTime.value = Q.soft ? 0 : state.time;
      if (!reduce && !Q.soft) { waveN.offset.x += dt * 0.012; waveN.offset.y += dt * 0.02; boats.forEach((b, i) => { b.position.z += dt * (0.8 + i * 0.2); if (b.position.z > 260) b.position.z = -260; }); }
    } else {
      let rl;
      [pos, look, rl] = fly(ROOM_POS, ROOM_LOOK, (p - CUT) / (1 - CUT));
      roll = lerp(roll, rl * 0.3, 1 - Math.pow(0.006, sdt)); if (Math.abs(roll - rl * 0.3) < 2e-4) roll = rl * 0.3;
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
    const moved = dirty || !lastCam.equals(camera.matrixWorld);
    if (Q.soft) {
      // Sin aceleración: mientras hay movimiento se dibuja liviano; al quedarse quieto, un único cuadro nítido
      if (moved) {
        soft.idle = 0;
        if (soft.hi) { soft.hi = false; setDpr(dprFor(lastW, lastH)); }
        renderer.render(scene, camera); gov.drew = true;
      } else if (!soft.hi && (soft.idle += raw) > 0.22) {
        soft.hi = true; setDpr(Math.min(1, devicePixelRatio || 1, Math.sqrt(0.9e6 / Math.max(1, lastW * lastH))));
        renderer.render(scene, camera);
      }
    } else if (moved || !inRoom) { renderer.render(scene, camera); gov.drew = true; }
    lastCam.copy(camera.matrixWorld); dirty = false;

    // Etiquetas HTML ancladas a puntos 3D
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of labelEls) {
      const a = anchors[l.dataset.anchor];
      const from = +l.dataset.from, to = +l.dataset.to, isRoom = ROOM_ANCHORS.has(l.dataset.anchor);
      let on = !state.auto && p >= from && p <= to && isRoom === inRoom;
      if (on) {
        v3.copy(a).project(camera);
        if (v3.z > 1 || Math.abs(v3.x) > 0.94 || (0.5 - v3.y * 0.5) * h < 160 || v3.y < -0.9) on = false;
        else {
          const tr = `translate3d(${((v3.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v3.y * 0.5 + 0.5) * h).toFixed(1)}px, 0)`;
          if (l._tr !== tr) { l.style.transform = tr; l._tr = tr; }
          const fl = v3.x > 0.2; if (l._fl !== fl) { l.classList.toggle("flip", fl); l._fl = fl; }
        }
      }
      if (l._on !== on) { l.classList.toggle("on", on); l._on = on; }
    }
  }

  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); running = false; onLost && onLost(); });
  let onLost = null;
  return {
    CUT,
    onLost(fn) { onLost = fn; },
    setProgress(p) { state.p = clamp01(p); },
    getProgress() { return state.pShown; },
    setAuto(on) { state.auto = on; },
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
