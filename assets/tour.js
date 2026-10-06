// Recorrido 3D: Buenos Aires de día o de noche, el Obelisco, nuestros departamentos
// y el ingreso por una ventana al interior del Urban Nest Obelisco.
import * as THREE from "../vendor/three.module.min.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const ease = t => t * t * (3 - 2 * t);
const C = hex => new THREE.Color(hex);

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
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Paletas de día (0) y de noche (1). Sin verdes.
const PAL = {
  skyTop: [C("#8FB4DA"), C("#0B0610")],
  skyBot: [C("#F4DCCF"), C("#3A1424")],
  fog: [C("#EBD8CF"), C("#24101A")],
  ground: [C("#8E8588"), C("#1B1418")],
  block: [C("#CFC4BC"), C("#2C2227")],
  water: [C("#9DB0BE"), C("#140E18")],
  hemiSky: [C("#FFF3EA"), C("#5C3A55")],
  hemiGround: [C("#8B6E66"), C("#140A10")],
  sun: [C("#FFE2C4"), C("#9AA6D8")],
  roomHemi: [C("#FFF4EA"), C("#3B2A3C")],
  windowSky: [C("#BFD5EA"), C("#120A16")],
};
const pick = (k, m) => PAL[k][0].clone().lerp(PAL[k][1], m);

export function createTour({ canvas, mobile = false, reduce = false, night = false, onReady }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1400);
  const state = { night: night ? 1 : 0, nightTarget: night ? 1 : 0, p: 0, pShown: 0, mx: 0, my: 0, time: 0 };
  const uniforms = { uNight: { value: state.night }, uTime: { value: 0 } };

  /* ───────────── CIUDAD ───────────── */
  const city = new THREE.Scene();
  city.fog = new THREE.Fog(pick("fog", state.night), 110, 420);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: pick("skyTop", 0) }, bot: { value: pick("skyBot", 0) } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.08,0.0,1.0); gl_FragColor = vec4(mix(bot, top, pow(h,0.75)),1.0); }",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  city.add(sky);

  // Estrellas
  const starGeo = new THREE.BufferGeometry(), starPos = [];
  const sr = rng(7);
  for (let i = 0; i < 900; i++) {
    const th = sr() * Math.PI * 2, ph = Math.acos(lerp(0.12, 1, sr()));
    starPos.push(Math.cos(th) * Math.sin(ph) * 800, Math.cos(ph) * 800, Math.sin(th) * Math.sin(ph) * 800);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  city.add(new THREE.Points(starGeo, starMat));

  // Sol y luna
  const discTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.95)"); r.addColorStop(0.5, "rgba(255,255,255,.25)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xFFE7C2, transparent: true, fog: false, depthWrite: false }));
  sunSprite.position.set(380, 150, -520); sunSprite.scale.set(150, 150, 1); city.add(sunSprite);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xF3E6EE, transparent: true, fog: false, depthWrite: false }));
  moonSprite.position.set(-330, 230, -540); moonSprite.scale.set(70, 70, 1); city.add(moonSprite);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1); city.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(120, 160, -90); city.add(sun);

  // Suelo, río y manzanas
  const groundMat = new THREE.MeshStandardMaterial({ color: pick("ground", 0), roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMat);
  ground.rotation.x = -Math.PI / 2; city.add(ground);
  const waterMat = new THREE.MeshStandardMaterial({ color: pick("water", 0), roughness: 0.35, metalness: 0.1 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(800, 1600), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(108 + 400, 0.03, 0); city.add(water);

  const PITCH = 13.2, BLOCK = 10, N = mobile ? 8 : 10;
  const r = rng(2026);
  const blockMat = new THREE.MeshStandardMaterial({ color: pick("block", 0), roughness: 1 });
  const blockGeo = new THREE.BoxGeometry(BLOCK, 0.12, BLOCK);
  const blocks = [];
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    if (i === 0) continue; // Av. 9 de Julio
    const x = i * PITCH, z = (j + 0.5) * PITCH;
    if (x > 100) continue; // río
    blocks.push([x, z]);
  }
  const blockInst = new THREE.InstancedMesh(blockGeo, blockMat, blocks.length);
  const m4 = new THREE.Matrix4();
  blocks.forEach(([x, z], k) => { m4.makeTranslation(x, 0.06, z); blockInst.setMatrixAt(k, m4); });
  city.add(blockInst);

  // Cantero central de la 9 de Julio y Plaza de la República
  const medianMat = new THREE.MeshStandardMaterial({ color: C("#D8BBA9"), roughness: 1 });
  for (const off of [-4.2, 4.2]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 2 * N * PITCH + PITCH), medianMat);
    s.position.set(off, 0.05, 0); city.add(s);
  }
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.14, 48), new THREE.MeshStandardMaterial({ color: C("#E6D3C6"), roughness: 1 }));
  plaza.position.set(0, 0.07, 0); city.add(plaza);

  // Edificios: una sola malla instanciada con ventanas procedurales en el shader.
  const HERO = { x: -3 * PITCH, z: 3.9, w: 6.2, d: 4.6, floors: 16 };
  const FLOOR = 0.42;
  const lots = [];
  blocks.forEach(([bx, bz]) => {
    const dist = Math.hypot(bx, bz);
    const split = r() < 0.5 ? 2 : 3;
    const lw = BLOCK / split;
    for (let a = 0; a < split; a++) for (let b = 0; b < 2; b++) {
      const lx = bx - BLOCK / 2 + lw * (a + 0.5), lz = bz - BLOCK / 2 + (BLOCK / 2) * (b + 0.5);
      if (Math.abs(lx - HERO.x) < HERO.w / 2 + 1.2 && Math.abs(lz - HERO.z) < HERO.d / 2 + 1.2) continue;
      if (r() < 0.06) continue;
      let floors = Math.round(lerp(4, 14, Math.pow(r(), 1.4)) * (dist < 60 ? 1.15 : dist < 100 ? 0.85 : 0.65));
      if (bx > 60 && r() < 0.35) floors = Math.round(lerp(22, 42, r())); // torres hacia Puerto Madero
      if (dist < 30 && r() < 0.25) floors += 8;
      floors = Math.max(3, floors);
      lots.push({ x: lx, z: lz, w: lw - 0.5 - r() * 0.4, d: BLOCK / 2 - 0.5 - r() * 0.4, h: floors * FLOOR + 0.25 });
    }
  });
  const facade = ["#E9E1D8", "#D9CFC6", "#CDBFB6", "#E5D7D0", "#BFB2AE", "#D6C3BE", "#EFE6DE", "#C7B9B9"].map(C);
  const bMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.05 });
  bMat.onBeforeCompile = sh => {
    sh.uniforms.uNight = uniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWP; varying vec3 vWN;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        mat4 unM = modelMatrix;
        #ifdef USE_INSTANCING
          unM = modelMatrix * instanceMatrix;
        #endif
        vWP = (unM * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(unM) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vWP; varying vec3 vWN; uniform float uNight;
        float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float wall = 1.0 - step(0.5, abs(vWN.y));
        vec2 fu = abs(vWN.x) > 0.5 ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y);
        vec2 cell = vec2(fu.x / 0.62, (fu.y - 0.25) / ${FLOOR.toFixed(2)});
        vec2 f = fract(cell);
        float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.86) * step(0.0, cell.y) * wall;
        float rnd = h21(floor(cell) + floor(vWP.xz * 0.37) * 3.1 + vWN.xz * 11.0);
        float lit = step(0.62, rnd);
        vec3 glass = mix(vec3(0.33, 0.37, 0.44), vec3(0.05, 0.04, 0.06), uNight);
        diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, 0.55, uNight), glass, win * 0.82);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        vec3 warm = mix(vec3(1.0, 0.78, 0.5), vec3(1.0, 0.9, 0.75), step(0.85, rnd));
        totalEmissiveRadiance += win * lit * warm * uNight * 1.35;`);
  };
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const bInst = new THREE.InstancedMesh(bGeo, bMat, lots.length);
  lots.forEach((l, k) => {
    m4.makeScale(l.w, l.h, l.d); m4.setPosition(l.x, 0.12, l.z);
    bInst.setMatrixAt(k, m4);
    bInst.setColorAt(k, facade[(k * 7 + Math.floor(l.h * 3)) % facade.length]);
  });
  city.add(bInst);

  // Edificio Urban Nest (Corrientes y Callao)
  const heroMat = bMat.clone();
  heroMat.onBeforeCompile = bMat.onBeforeCompile;
  heroMat.color = C("#C98B9C");
  const heroH = HERO.floors * FLOOR + 0.25;
  const heroB = new THREE.Mesh(bGeo, heroMat);
  heroB.scale.set(HERO.w, heroH, HERO.d); heroB.position.set(HERO.x, 0.12, HERO.z); city.add(heroB);
  const crownMat = new THREE.MeshBasicMaterial({ color: C("#8B1D3D") });
  const crown = new THREE.Mesh(new THREE.BoxGeometry(HERO.w + 0.15, 0.22, HERO.d + 0.15), crownMat);
  crown.position.set(HERO.x, heroH + 0.12, HERO.z); city.add(crown);

  // Ventana por la que entramos: cara que mira a Corrientes (z = HERO.z - d/2)
  const WIN = V(HERO.x, 10 * FLOOR + 0.25 + 0.24, HERO.z - HERO.d / 2 - 0.012);
  const portalMat = new THREE.MeshBasicMaterial({ color: C("#FFD9A8") });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), portalMat);
  portal.position.copy(WIN); portal.rotation.y = Math.PI; city.add(portal);
  const frameMat = new THREE.MeshBasicMaterial({ color: C("#F5EEE8") });
  [[0.66, 0.025, 0, 0.16], [0.66, 0.025, 0, -0.16], [0.025, 0.34, 0.32, 0], [0.025, 0.34, -0.32, 0], [0.018, 0.3, 0, 0]].forEach(([w, h, dx, dy]) => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frameMat);
    f.position.set(WIN.x - dx, WIN.y + dy, WIN.z - 0.004); f.rotation.y = Math.PI; city.add(f);
  });

  // Haz de luz sobre cada departamento
  const beamTex = (() => {
    const c = document.createElement("canvas"); c.width = 4; c.height = 256;
    const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.7, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,.9)");
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(c);
  })();
  const PLACES = [
    { key: "obe", pos: V(HERO.x, heroH, HERO.z) },
    { key: "acu", pos: V(-4 * PITCH, 0, -4.5 * PITCH) },
    { key: "oll", pos: V(-8 * PITCH, 0, -8.5 * PITCH) },
  ];
  const beams = [];
  PLACES.forEach(pl => {
    if (pl.key !== "obe") {
      const h = 4.2;
      const b = new THREE.Mesh(bGeo, heroMat); b.scale.set(4, h, 4); b.position.set(pl.pos.x, 0.12, pl.pos.z); city.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.2, 4.15), crownMat); c.position.set(pl.pos.x, h + 0.2, pl.pos.z); city.add(c);
      pl.pos.y = h + 0.3;
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 46, 16, 1, true),
      new THREE.MeshBasicMaterial({ map: beamTex, color: C("#E25A82"), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(pl.pos.x, pl.pos.y + 23, pl.pos.z);
    city.add(beam); beams.push(beam);
    pl.label = V(pl.pos.x, pl.pos.y + 3, pl.pos.z);
  });

  // Obelisco
  const obeMat = new THREE.MeshStandardMaterial({ color: C("#F7F2EE"), roughness: 0.6, emissive: C("#FFF6EC"), emissiveIntensity: 0 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 12.6, 4, 1), obeMat);
  shaft.rotation.y = Math.PI / 4; shaft.position.set(0, 6.3 + 0.14, 0); city.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), obeMat);
  tip.rotation.y = Math.PI / 4; tip.position.set(0, 12.6 + 0.45 + 0.14, 0); city.add(tip);
  const OBELISCO = V(0, 13.6, 0);

  // Luces de calle y autos (puntos)
  const glowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const lampPos = [];
  const ext = N * PITCH;
  for (let z = -ext; z <= ext; z += 3.3) { lampPos.push(-7.6, 0.9, z, 7.6, 0.9, z, -0.8, 0.9, z, 0.8, 0.9, z); }
  for (let x = -ext; x <= 100; x += 3.3) { lampPos.push(x, 0.9, -1.2, x, 0.9, 1.2); }
  for (let i = -N; i <= N; i += 2) for (let x = -ext; x <= 100; x += 6.6) lampPos.push(x, 0.7, (i) * PITCH);
  const lampGeo = new THREE.BufferGeometry(); lampGeo.setAttribute("position", new THREE.Float32BufferAttribute(lampPos, 3));
  const lampMat = new THREE.PointsMaterial({ map: glowTex, color: C("#FFC98A"), size: 1.4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  city.add(new THREE.Points(lampGeo, lampMat));

  const CARS = mobile ? 160 : 320;
  const cars = [];
  const carPos = new Float32Array(CARS * 3), carCol = new Float32Array(CARS * 3);
  const cr = rng(99);
  for (let i = 0; i < CARS; i++) {
    const onJulio = i < CARS * 0.62, dir = cr() < 0.5 ? 1 : -1;
    const lane = onJulio ? (dir > 0 ? lerp(-7, -5.6, cr()) : lerp(5.6, 7, cr())) : (dir > 0 ? -0.6 : 0.6);
    cars.push({ onJulio, dir, lane, s: lerp(-ext, onJulio ? ext : 100, cr()), v: lerp(4, 9, cr()) });
    const col = dir > 0 ? C("#FFF1D6") : C("#FF3D5A");
    carCol.set([col.r, col.g, col.b], i * 3);
  }
  const carGeo = new THREE.BufferGeometry();
  carGeo.setAttribute("position", new THREE.BufferAttribute(carPos, 3));
  carGeo.setAttribute("color", new THREE.BufferAttribute(carCol, 3));
  const carMat = new THREE.PointsMaterial({ map: glowTex, size: 0.9, vertexColors: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  city.add(new THREE.Points(carGeo, carMat));
  function moveCars(dt) {
    for (let i = 0; i < CARS; i++) {
      const c = cars[i];
      if (!reduce) c.s += c.dir * c.v * dt;
      const max = c.onJulio ? ext : 100;
      if (c.s > max) c.s = -ext; if (c.s < -ext) c.s = max;
      if (c.onJulio) carPos.set([c.lane, 0.35, c.s], i * 3); else carPos.set([c.s, 0.35, c.lane], i * 3);
    }
    carGeo.attributes.position.needsUpdate = true;
  }

  /* ───────────── INTERIOR ───────────── */
  const room = new THREE.Scene();
  const rHemi = new THREE.HemisphereLight(0xffffff, 0x3a2a2a, 1.0); room.add(rHemi);
  const rSun = new THREE.DirectionalLight(0xFFE7CC, 2.4);
  rSun.position.set(-6, 5, 3); rSun.castShadow = !mobile;
  rSun.shadow.mapSize.set(1024, 1024); rSun.shadow.camera.left = -5; rSun.shadow.camera.right = 5; rSun.shadow.camera.top = 5; rSun.shadow.camera.bottom = -5; rSun.shadow.bias = -0.0006; rSun.shadow.radius = 4;
  room.add(rSun);

  const canvasTex = (w, h, draw) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const woodTex = canvasTex(512, 512, (g, w, h) => {
    const rr = rng(5);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -128 : 0; x < w; x += 256) {
      const l = lerp(0.9, 1.08, rr());
      g.fillStyle = `rgb(${176 * l | 0},${136 * l | 0},${98 * l | 0})`; g.fillRect(x, y, 256, 32);
      g.strokeStyle = "rgba(70,40,25,.35)"; g.lineWidth = 2; g.strokeRect(x, y, 256, 32);
      g.strokeStyle = "rgba(90,55,30,.12)"; g.lineWidth = 1;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x, y + 6 + k * 7); g.bezierCurveTo(x + 80, y + 4 + k * 7 + rr() * 6, x + 170, y + 8 + k * 7 - rr() * 6, x + 256, y + 6 + k * 7); g.stroke(); }
    }
  });
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(3, 3);
  const rugTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#EADBC8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8B1D3D"; g.fillRect(0, 0, w, 26); g.fillRect(0, h - 26, w, 26); g.fillRect(0, 0, 26, h); g.fillRect(w - 26, 0, 26, h);
    const s = 48;
    for (let y = 40; y < h - 40; y += s) for (let x = 40; x < w - 40; x += s) {
      g.fillStyle = ((x + y) / s) % 2 ? "#5E1028" : "#C98B9C";
      g.beginPath(); g.moveTo(x + s / 2, y + 6); g.lineTo(x + s - 6, y + s / 2); g.lineTo(x + s / 2, y + s - 6); g.lineTo(x + 6, y + s / 2); g.closePath(); g.fill();
      g.fillStyle = "#EADBC8"; g.beginPath(); g.moveTo(x + s / 2, y + 16); g.lineTo(x + s - 16, y + s / 2); g.lineTo(x + s / 2, y + s - 16); g.lineTo(x + 16, y + s / 2); g.closePath(); g.fill();
    }
  });
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
    const v = [297, 312, 855, 710, 578, 487, 676, 676, 818, 1014, 1098, 507];
    v.forEach((x, i) => { const bh = x / 1100 * 180; g.fillStyle = x >= 495 ? "#8B1D3D" : "#E9A3B6"; g.fillRect(28 + i * 38, h - 24 - bh, 26, bh); });
  });
  const phoneTex = canvasTex(160, 320, (g, w, h) => {
    g.fillStyle = "#1A1216"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#FBF6F2"; g.beginPath(); g.roundRect(12, 70, w - 24, 70, 14); g.fill();
    g.fillStyle = "#8B1D3D"; g.font = "bold 18px Inter, sans-serif"; g.fillText("Nueva reserva", 24, 100);
    g.fillStyle = "#6B5E62"; g.font = "15px Inter, sans-serif"; g.fillText("Respondida en 4 min", 24, 124);
  });

  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color: C(color), roughness: 0.85, ...o });
  const box = (w, h, d, m, x, y, z, parent = room) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.castShadow = b.receiveShadow = !mobile; parent.add(b); return b;
  };
  const RW = 6, RD = 6.5, RH = 2.8, Z0 = -4, Z1 = 2.5;
  const wallMat = mat("#F3ECE4", { roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true; room.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), mat("#FBF7F2")); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, RH, (Z0 + Z1) / 2); room.add(ceil);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(RW, RH), wallMat); back.position.set(0, RH / 2, Z0); back.receiveShadow = true; room.add(back);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(RD, RH), wallMat); right.rotation.y = -Math.PI / 2; right.position.set(RW / 2, RH / 2, (Z0 + Z1) / 2); right.receiveShadow = true; room.add(right);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(RW, RH), wallMat); front.rotation.y = Math.PI; front.position.set(0, RH / 2, Z1); room.add(front);

  // Pared izquierda con ventanal a la ciudad
  const leftParts = [[RD, 0.55, 0.275, (Z0 + Z1) / 2], [RD, 0.35, RH - 0.175, (Z0 + Z1) / 2], [1.2, RH, RH / 2, Z1 - 0.6], [1.0, RH, RH / 2, Z0 + 0.5]];
  leftParts.forEach(([w, h, y, z]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); p.rotation.y = Math.PI / 2; p.position.set(-RW / 2, y, z); room.add(p); });
  const skylineCanvas = document.createElement("canvas"); skylineCanvas.width = 1024; skylineCanvas.height = 512;
  const skylineTex = new THREE.CanvasTexture(skylineCanvas); skylineTex.colorSpace = THREE.SRGBColorSpace;
  const skyline = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: skylineTex }));
  skyline.rotation.y = Math.PI / 2; skyline.position.set(-RW / 2 - 1.6, 1.6, (Z0 + Z1) / 2 - 0.5); room.add(skyline);
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
        g.fillStyle = layer ? (m > 0.5 ? "#2A1A24" : "#C9B6B4") : (m > 0.5 ? "#1A1018" : "#AE9A9C");
        g.fillRect(x, h - bh, bw, bh);
        for (let yy = h - bh + 10; yy < h - 8; yy += 18) for (let xx = x + 6; xx < x + bw - 8; xx += 14) {
          if (m > 0.5 ? rr() < 0.4 : rr() < 0.05) { g.fillStyle = m > 0.5 ? "rgba(255,206,140,.9)" : "rgba(80,90,110,.5)"; g.fillRect(xx, yy, 7, 9); }
        }
        x += bw + lerp(2, 18, rr());
      }
    }
    // Obelisco a lo lejos
    g.fillStyle = m > 0.5 ? "#E8DDE2" : "#F5EFEA";
    g.beginPath(); g.moveTo(600, h - 360); g.lineTo(612, h - 340); g.lineTo(620, h); g.lineTo(580, h); g.lineTo(588, h - 340); g.closePath(); g.fill();
    skylineTex.needsUpdate = true;
  }
  // Marco del ventanal
  const frameM = mat("#2B2326", { roughness: 0.5 });
  [[(Z0 + Z1) / 2 - 0.05, 0.55], [(Z0 + Z1) / 2 - 0.05, RH - 0.35]].forEach(([z, y]) => box(0.06, 0.05, RD - 2.2, frameM, -RW / 2 + 0.02, y, z));
  for (let k = 0; k <= 4; k++) box(0.06, RH - 0.9, 0.04, frameM, -RW / 2 + 0.02, (RH - 0.9) / 2 + 0.55, Z0 + 1.0 + k * (RD - 2.2) / 4);

  // Tarima y cama
  const oak = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.65 });
  box(2.4, 0.25, 2.1, oak, -1.8, 0.125, -2.95);
  box(1.7, 0.28, 2.0, mat("#EDE6DF"), -1.95, 0.39, -2.95);
  box(1.66, 0.12, 1.5, mat("#FFFFFF", { roughness: 1 }), -1.95, 0.59, -2.7);
  box(1.72, 0.08, 1.05, mat("#E9C6CF", { roughness: 1 }), -1.95, 0.64, -2.45);
  box(0.6, 0.16, 0.35, mat("#FBF8F4"), -2.3, 0.68, -3.65); box(0.6, 0.16, 0.35, mat("#FBF8F4"), -1.6, 0.68, -3.65);
  box(1.9, 0.9, 0.08, mat("#8B6A50"), -1.95, 0.85, -3.92);
  // Listones divisores
  for (let k = 0; k < 12; k++) box(0.05, RH - 0.25, 0.08, oak, -2.85 + k * 0.19, 0.25 + (RH - 0.25) / 2, -1.82);
  // Consola con notebook
  box(1.5, 0.05, 0.42, mat("#E7DDD2"), -1.8, 0.78, -1.5); box(1.5, 0.72, 0.4, mat("#D9CBBE"), -1.8, 0.4, -1.5);
  box(0.42, 0.015, 0.3, mat("#3A3236"), -1.65, 0.81, -1.5);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.27), new THREE.MeshBasicMaterial({ map: chartTex, toneMapped: false }));
  screen.position.set(-1.65, 0.96, -1.66); screen.rotation.x = -0.18; room.add(screen);
  // Sillón en carmesí
  const sofaM = mat("#8B1D3D", { roughness: 0.95 });
  box(2.0, 0.42, 0.9, sofaM, 1.55, 0.31, -3.45); box(2.0, 0.5, 0.22, sofaM, 1.55, 0.72, -3.82);
  box(0.2, 0.3, 0.9, sofaM, 0.6, 0.6, -3.45); box(0.2, 0.3, 0.9, sofaM, 2.5, 0.6, -3.45);
  box(0.45, 0.4, 0.14, mat("#F1E4D6"), 1.0, 0.72, -3.6); box(0.4, 0.36, 0.14, mat("#D9A27E"), 2.05, 0.7, -3.6);
  // Alfombra, mesa ratona y teléfono
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(1.4, 0.006, -2.2); rug.receiveShadow = true; room.add(rug);
  box(1.0, 0.05, 0.6, mat("#FBF8F4", { roughness: 0.5 }), 1.45, 0.42, -2.15);
  box(0.9, 0.03, 0.5, mat("#FBF8F4"), 1.45, 0.16, -2.15);
  [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]].forEach(([dx, dz]) => box(0.05, 0.42, 0.05, oak, 1.45 + dx, 0.21, -2.15 + dz));
  box(0.09, 0.012, 0.18, mat("#1A1216"), 1.3, 0.452, -2.05);
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.16), new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false }));
  phoneScreen.rotation.x = -Math.PI / 2; phoneScreen.position.set(1.3, 0.46, -2.05); room.add(phoneScreen);
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 16), mat("#F6F1EC", { roughness: 0.3 })); vase.position.set(1.7, 0.555, -2.2); room.add(vase);
  for (let k = 0; k < 7; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 4), mat("#C9A77E")); s.position.set(1.7 + Math.sin(k) * 0.03, 0.85, -2.2 + Math.cos(k) * 0.03); s.rotation.z = Math.sin(k * 1.7) * 0.25; room.add(s);
    const plume = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mat("#E9D6BC")); plume.scale.set(1, 2.4, 1); plume.position.set(s.position.x + Math.sin(k * 1.7) * -0.1, 1.07, s.position.z); room.add(plume); }
  // Cuadros
  [[artTex("#C98B9C", "#8B1D3D", "#D9A27E"), 0.95], [artTex("#5E1028", "#E9C6CF", "#C9A77E"), 2.15]].forEach(([t, x]) => {
    box(0.82, 1.02, 0.03, mat("#C9A77E"), x, 1.75, Z0 + 0.02);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.94), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); a.position.set(x, 1.75, Z0 + 0.04); room.add(a);
  });
  // Puerta con cerradura inteligente
  box(0.05, 2.1, 0.95, mat("#A97C55", { roughness: 0.6 }), RW / 2 - 0.03, 1.05, -0.5);
  box(0.03, 0.2, 0.08, mat("#1F1A1C", { roughness: 0.3 }), RW / 2 - 0.07, 1.05, -0.15);
  const lockLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), new THREE.MeshBasicMaterial({ color: C("#FF6B8E"), toneMapped: false }));
  lockLed.position.set(RW / 2 - 0.09, 1.11, -0.15); room.add(lockLed);
  // Lámparas colgantes
  const lampShade = new THREE.LatheGeometry([0, 0.02, 0.1, 0.17, 0.2, 0.17, 0.08, 0.0].map((x, i) => new THREE.Vector2(x, -i * 0.05)), 24);
  const shadeM = new THREE.MeshStandardMaterial({ color: C("#C68B4E"), roughness: 0.6, emissive: C("#FFB466"), emissiveIntensity: 0, side: THREE.DoubleSide });
  const pend = [];
  [[1.15, -2.15], [1.8, -2.25]].forEach(([x, z]) => {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 4), mat("#222")); cord.position.set(x, RH - 0.35, z); room.add(cord);
    const s = new THREE.Mesh(lampShade, shadeM); s.position.set(x, RH - 0.7, z); room.add(s);
    const pl = new THREE.PointLight(0xFFB870, 0, 6, 1.6); pl.position.set(x, RH - 0.9, z); room.add(pl); pend.push(pl);
  });

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
    [0.44, V(0.2, 1.45, 0.9), V(2.9, 1.05, -0.3)],
    [0.66, V(-0.1, 1.3, 0.2), V(1.3, 0.55, -2.1)],
    [0.80, V(0.6, 1.35, 0.4), V(-1.6, 0.9, -1.55)],
    [1.00, V(0.2, 1.75, 2.3), V(0, 0.95, -2.6)],
  ];
  // Reparto del recorrido: ciudad hasta CUT, interior después.
  const CUT = 0.6;
  const anchors = {
    obe: PLACES[0].label, acu: PLACES[1].label, oll: PLACES[2].label, obelisco: OBELISCO,
    bed: V(-1.9, 0.85, -2.8), door: V(RW / 2 - 0.08, 1.12, -0.15), phone: V(1.3, 0.5, -2.05), laptop: V(-1.65, 1.02, -1.6), sofa: V(1.55, 0.95, -3.45),
  };
  const ROOM_ANCHORS = new Set(["bed", "door", "phone", "laptop", "sofa"]);

  function applyTheme(m) {
    uniforms.uNight.value = m;
    skyMat.uniforms.top.value.copy(pick("skyTop", m)); skyMat.uniforms.bot.value.copy(pick("skyBot", m));
    city.fog.color.copy(pick("fog", m));
    groundMat.color.copy(pick("ground", m)); blockMat.color.copy(pick("block", m)); waterMat.color.copy(pick("water", m));
    medianMat.color.copy(C("#D8BBA9").lerp(C("#3A2A30"), m));
    plaza.material.color.copy(C("#E6D3C6").lerp(C("#41323A"), m));
    hemi.color.copy(pick("hemiSky", m)); hemi.groundColor.copy(pick("hemiGround", m)); hemi.intensity = lerp(1.25, 0.55, m);
    sun.color.copy(pick("sun", m)); sun.intensity = lerp(2.4, 0.35, m);
    starMat.opacity = m; lampMat.opacity = m; carMat.opacity = lerp(0.25, 1, m); carMat.size = lerp(0.6, 1.0, m);
    sunSprite.material.opacity = 1 - m; moonSprite.material.opacity = m;
    obeMat.emissiveIntensity = m * 0.55;
    crownMat.color.copy(C("#8B1D3D").lerp(C("#FF4F7E"), m));
    heroMat.color.copy(C("#C98B9C").lerp(C("#7A3348"), m));
    beams.forEach(b => b.material.opacity = lerp(0.28, 0.75, m));
    portalMat.color.copy(C("#F5D6B8").lerp(C("#FFC277"), m));
    renderer.toneMappingExposure = lerp(1.05, 1.15, m);
    // Interior
    rHemi.color.copy(pick("roomHemi", m)); rHemi.intensity = lerp(1.15, 0.35, m);
    rSun.intensity = lerp(2.6, 0.0, m);
    pend.forEach(p => p.intensity = lerp(0.15, 3.2, m));
    shadeM.emissiveIntensity = lerp(0, 0.9, m);
    room.background = pick("windowSky", m);
    paintSkyline(m);
  }
  applyTheme(state.night);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 66 : 50;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);
  if (!mobile) addEventListener("pointermove", e => { state.mx = e.clientX / innerWidth - 0.5; state.my = e.clientY / innerHeight - 0.5; });

  const v3 = new THREE.Vector3();
  let labelEls = [], lastThemePaint = state.night, running = false, visible = true, last = performance.now();

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.time += dt;
    state.pShown = reduce ? state.p : lerp(state.pShown, state.p, 1 - Math.pow(0.0015, dt));
    if (Math.abs(state.night - state.nightTarget) > 0.001) {
      state.night = lerp(state.night, state.nightTarget, 1 - Math.pow(0.02, dt));
      if (Math.abs(state.night - state.nightTarget) < 0.002) state.night = state.nightTarget;
      uniforms.uNight.value = state.night;
      if (Math.abs(state.night - lastThemePaint) > 0.04 || state.night === state.nightTarget) { applyTheme(state.night); lastThemePaint = state.night; }
    }
    const p = state.pShown, inRoom = p >= CUT;
    let pos, look;
    if (!inRoom) {
      [pos, look] = track(CITY_KEYS, p / CUT);
      if (!reduce) { const idle = 1 - clamp01(p / 0.08); pos = pos.clone().add(V(Math.sin(state.time * 0.15) * 6 * idle, 0, Math.cos(state.time * 0.15) * 4 * idle)); }
      moveCars(dt);
      beams.forEach((b, i) => b.material.opacity = lerp(0.28, 0.75, state.night) * (0.75 + 0.25 * Math.sin(state.time * 2 + i)));
    } else {
      [pos, look] = track(ROOM_KEYS, (p - CUT) / (1 - CUT));
      lockLed.material.color.setHSL(0.95, 1, 0.55 + 0.15 * Math.sin(state.time * 4));
    }
    const par = inRoom ? 0.12 : 1.2 * clamp01(1 - p / CUT * 1.2);
    camera.position.copy(pos).add(V(state.mx * par, -state.my * par * 0.6, 0));
    camera.lookAt(look);
    renderer.render(inRoom ? room : city, camera);

    // Etiquetas HTML ancladas a puntos 3D
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of labelEls) {
      const a = anchors[l.dataset.anchor];
      const from = +l.dataset.from, to = +l.dataset.to;
      const isRoom = ROOM_ANCHORS.has(l.dataset.anchor);
      let on = p >= from && p <= to && isRoom === inRoom;
      if (on) {
        v3.copy(a).project(camera);
        if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) on = false;
        else { l.style.transform = `translate3d(${(v3.x * 0.5 + 0.5) * w}px, ${(-v3.y * 0.5 + 0.5) * h}px, 0)`; l.classList.toggle("flip", v3.x > 0.2); }
      }
      l.classList.toggle("on", on);
    }
  }

  return {
    camera, CUT,
    setProgress(p) { state.p = clamp01(p); },
    setNight(on, instant) { state.nightTarget = on ? 1 : 0; if (instant) { state.night = state.nightTarget; applyTheme(state.night); lastThemePaint = state.night; } },
    setLabels(els) { labelEls = els; },
    setVisible(v) { visible = v; },
    start() { if (!running) { running = true; requestAnimationFrame(t => { last = t; frame(t); }); onReady && onReady(); } },
    resize,
  };
}
