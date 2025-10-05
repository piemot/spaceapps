import * as THREE from "three";

// --- Layer refs for UI toggles ---
const Layers = {
  orbit: null, // your existing Earth orbit line (optional)
  neos: null, // your NEO points (optional)
  stars: null, // starfield (optional)
  planets: [], // NEW: planet meshes + labels (we’ll push both)
  planetOrbits: [], // NEW: orbit LineLoops
};

/**
 * @property {number} ticks - The number of animation frames since launch
 * @property {[number, number, number][]} earthPositions
 */
const state = {
  ticks: 0,
  objects: [],
  objectPositions: [],
  newObjectPositions: [],
  earthPositions: [],
};
let worker = null;
let inited = false;

export function init() {
  // initialize threejs renderer
  const canvas = document.getElementById("three");
  const wrap = document.querySelector(".three-wrap");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    55,
    wrap.clientWidth / wrap.clientHeight,
    1e7,
    5e13,
  );
  camera.position.set(0, 0, 5e11);

  // simple orbit camera controls
  const target = new THREE.Vector3(0, 0, 0);
  const ctl = {
    rotating: false,
    lastX: 0,
    lastY: 0,
    yaw: 0,
    pitch: Math.PI / 2,
    dist: camera.position.length(),
  };
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone());
  ctl.yaw = sph.theta;
  ctl.pitch = sph.phi;
  ctl.dist = sph.radius;

  function applyCam() {
    const maxP = Math.PI - 0.001;
    const minP = 0.001;
    ctl.pitch = Math.max(minP, Math.min(maxP, ctl.pitch));
    sph.set(ctl.dist, ctl.pitch, ctl.yaw);
    camera.position.copy(new THREE.Vector3().setFromSpherical(sph));
    camera.lookAt(target);
  }
  applyCam();

  const dom = renderer.domElement;

  dom.addEventListener("mousedown", (e) => {
    if (e.button === 0) ctl.rotating = true;
    ctl.lastX = e.clientX;
    ctl.lastY = e.clientY;
    e.preventDefault();
  });

  dom.addEventListener("mouseup", () => {
    ctl.rotating = false;
  });

  dom.addEventListener("mousemove", (e) => {
    if (!ctl.rotating) return;
    const dx = e.clientX - ctl.lastX;
    const dy = e.clientY - ctl.lastY;
    ctl.lastX = e.clientX;
    ctl.lastY = e.clientY;
    ctl.yaw -= dx * 0.005;
    ctl.pitch -= dy * 0.005;
    applyCam();
  });

  dom.addEventListener(
    "wheel",
    (e) => {
      ctl.dist *= 1 + Math.sign(e.deltaY) * 0.1;
      ctl.dist = Math.max(5e7, Math.min(1e11, ctl.dist));
      applyCam();
    },
    { passive: true },
  );

  // lights + context
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(6e7, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0x33ff66 }),
  );
  scene.add(earth);

  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);

  window.addEventListener("resize", () => {
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
  });

  return { scene, camera, renderer, orbitGroup };
}

const three = init();

// === Solar System (schematic) ===
// Keep units in meters (your Earth ring uses meters already)
const AU = 149597870700.0; // 1 AU in meters
const SECONDS_PER_YEAR = 40; // sim speed: 1 year = 40s

// Closed circular orbit in the XZ-plane (schematic)
function makeOrbitCircle(radiusMeters, color = 0x2aff7a) {
  const segments = 512;
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    positions[3 * i] = radiusMeters * Math.cos(th);
    positions[3 * i + 1] = 0;
    positions[3 * i + 2] = radiusMeters * Math.sin(th);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
  });
  return new THREE.LineLoop(geom, mat);
}

// Simple billboard label with adjustable size
function makeLabel(text, scale = 1) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 48;
  ctx.font = `${fontSize}px sans-serif`;
  const w = Math.max(256, ctx.measureText(text).width + 40);
  const h = 128;
  canvas.width = w;
  canvas.height = h;

  const g = canvas.getContext("2d");
  g.font = `${fontSize}px sans-serif`;
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);

  // ⬇️ control on-screen label size here (meters in your scene)
  // default (scale=1) was ~1.8e10 × 9e9; tweak multiplier to taste
  sprite.scale.set(1.8e10 * scale, 9e9 * scale, 1);

  return sprite;
}

/**
 * @typedef {object} PlanetObject
 * @property {THREE.Mesh} mesh - The planet body mesh
 * @property {?THREE.Sprite} label - The sprite of the label above the orbiting body
 */
const planetObjs = [];

/**
 * @typedef {object} OrbitingPlanetOptions
 * @property {number} planetRadius - Radius of the planet in meters
 * @property {number} circleRadius - Radius of the planet's orbit in AU
 * @property {number} color - The color of the planet and ring
 * @property {?string} label - The label to display
 */

/**
 * Generate Three.JS geometry for an orbiting sphere,
 * with rings and an optional label
 * @param {OrbitingPlanetOptions} opts
 */
function buildOrbitingPlanet(opts) {
  // planet body
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(opts.planetRadius, 24, 24),
    new THREE.MeshBasicMaterial({ color: opts.color }),
  );

  // ~~ closed orbit ring (use your existing orbitGroup to keep things tidy) ~~
  const orbit = makeOrbitCircle(opts.circleRadius * AU);
  three.orbitGroup.add(orbit);

  // label
  let label = null;
  if (opts.label) {
    label = makeLabel(opts.label);
    three.scene.add(body, label);
  }

  planetObjs.push({ ...p, mesh: body, label });
}

function updateSolarSystem(nowMs) {
  const tYears = nowMs / 1000 / SECONDS_PER_YEAR;
  for (const p of planetObjs) {
    const theta = (tYears / p.period) * Math.PI * 2; // constant angular speed (schematic)
    const x = p.a * AU * Math.cos(theta);
    const z = p.a * AU * Math.sin(theta);
    p.mesh.position.set(x, 0, z);
    p.label.position.set(x + p.r * 2.0, p.r * 1.5, z); // offset label near planet
  }
}

// load state.objects
await loadMeteorState();

// request state.newObjectPositions
fetchOrbits(state.objects, 0);

function animate() {
  requestAnimationFrame(animate);

  if (state.newObjectPositions.length < 1) {
    // missing initial data
    return;
  }
  if (state.objectPositions.length < 1) {
    // first tick
    state.objectPositions = state.newObjectPositions;
    state.newObjectPositions = [];
    fetchOrbits(state.objects, 100);
    return;
  }

  state.ticks += 1;
  if (state.ticks % 100 === 0) {
    state.objectPositions = state.newObjectPositions;
    state.newObjectPositions = [];
    fetchOrbits(state.objects, state.ticks + 100);
  }

  if (!inited) {
    drawOrbits(state.objectPositions[state.ticks % 100]);
    inited = true;
    setTimeout(() => {
      inited = false;
    }, 20);
  }

  updateSolarSystem(performance.now());
  three.renderer.render(three.scene, three.camera);
}
animate();

/**
 * Transposes a 2D array.
 * @template T
 * @param {T[][]} arr - The array to transpose
 * @returns {T[][]} The array, transposed
 */
function transpose(arr) {
  return arr[0].map((_, i) => arr.map((row) => row[i]));
}

function fetchOrbits(objects, offset) {
  if (!worker) {
    worker = new Worker("/kepler.js");
    worker.onmessage = (evt) => {
      const { positions, error } = evt.data || {};
      console.debug("[worker] recv", positions);
      if (error) {
        console.warn(error);
        return;
      }
      state.newObjectPositions = transpose(positions);
    };
  }

  worker.postMessage({
    orbits: objects.map((obj) => ({
      spanDays: 100,
      stepDays: 1,
      startOffsetDays: offset,
      parameters: obj.parameters,
    })),
  });
}

let pts;

// Simple starfield
function addStars(n = 1000, radius = 4e13) {
  // ~400 AU in meters
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = 2 * Math.PI * Math.random();
    positions[3 * i] = radius * Math.sin(phi) * Math.cos(theta);
    positions[3 * i + 1] = radius * Math.cos(phi);
    positions[3 * i + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: radius * 0.002,
    sizeAttenuation: true,
    color: 0xffffff,
    depthWrite: false,
  });
  const stars = new THREE.Points(geom, mat);
  three.scene.add(stars);
  Layers.stars = stars;
}
addStars();

/**
 * @param {[number, number, number][]} positions
 */
function drawOrbits(positions) {
  console.log(`Drawing ${positions.length} positions`);

  const g = three.orbitGroup;
  while (g.children.length) g.remove(g.children[0]);

  /**
   * @param {[number, number, number][]} points
   * @param {number} color
   */
  function makeLine(points, color) {
    const mat = new THREE.LineBasicMaterial({ color });
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      arr[3 * i] = points[i][0];
      arr[3 * i + 1] = points[i][2];
      arr[3 * i + 2] = points[i][1];
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return new THREE.LineLoop(geo, mat);
  }

  /**
   * @param {[number, number, number][]} points
   * @param {number} color
   */
  function makePts(points, color) {
    if (!pts) {
      const sprite = new THREE.TextureLoader().load(
        "/static/textures/disc.png",
      );

      const geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array(points.length * 3);
      for (let i = 0; i < points.length; i++) {
        vertices[3 * i] = points[i][0];
        vertices[3 * i + 1] = points[i][1];
        vertices[3 * i + 2] = points[i][2];
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

      const material = new THREE.PointsMaterial({
        color,
        size: 1e10,
        map: sprite,
        transparent: true,
      });
      points = new THREE.Points(geometry, material);
      return points;
    }
    const vertices = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      vertices[3 * i] = points[i][0];
      vertices[3 * i + 1] = points[i][1];
      vertices[3 * i + 2] = points[i][2];
    }
    // update existing geometry
    pts.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(vertices, 3),
    );
    pts.geometry.attributes.position.needsUpdate = true;
    return points;
  }
  //  g.add(makePts(positions, 0xbb66ff)); // meteor orbits (dotted purple)
  //  g.add(makeLine(state.earthPositions, 0x33ff66)); // Earth orbit (green)

  Layers.neos = makePts(positions, 0xbb66ff);
  g.add(Layers.neos); // NEO points (purple)

  Layers.orbit = makeLine(state.earthPositions, 0x33ff66);
  g.add(Layers.orbit); // Earth orbit (green)
}
// ---- UI wiring ----
function applyVis(obj, on) {
  if (!obj) return;
  if (Array.isArray(obj)) obj.forEach((o) => o && (o.visible = on));
  else obj.visible = on;
}

async function loadMeteorState() {
  const { default: elements } = await import("/static/meteors.json", {
    with: { type: "json" },
  });

  for (const elem of elements) {
    function getFinite(a) {
      const x = Number(a);
      if (!Number.isFinite(x)) {
        throw new Error(`non-finite element ${x}, ${a}`);
      }
      return x;
    }

    state.objects.push({
      id: elem.id,
      name: elem.name,
      parameters: {
        a_AU: getFinite(elem.orbital_data.semi_major_axis),
        e: getFinite(elem.orbital_data.eccentricity),
        i_deg: getFinite(elem.orbital_data.inclination),
        Omega_deg: getFinite(elem.orbital_data.ascending_node_longitude),
        omega_deg: getFinite(elem.orbital_data.perihelion_argument),
        M_deg: getFinite(elem.orbital_data.mean_anomaly),
      },
    });
  }
}
