import * as THREE from "three";
import { init } from "./init.js";

const three = init();

// Slider input
const speedSlider = document.getElementById('speed');

// === Solar System (schematic) ===
// Keep units in meters (your Earth ring uses meters already)
const AU = 149597870700.0; // 1 AU in meters
const muSun = 1.32712440018e20; // m^3/s^2 GM_sun

let SECONDS_PER_YEAR = 50; // sim speed: 1 year = 40s
let OFFSET = 0; // offset for SECONDS_PER_YEAR -- this will NOT work, I'm calling it

let tDaysPrev = 0;
let tYearsPrev = 0;
let nowMsPrev1 = 0;
let nowMsPrev2 = 0;

// Semi-major axis in AU, orbital period in Earth years, display radius in meters (not to scale)
const PLANETS = [
  { name: "Mercury", a: 0.39, period: 0.241, color: 0xb1b1b1, r: 2.0e9 },
  { name: "Venus", a: 0.72, period: 0.615, color: 0xeed9a3, r: 3.0e9 },
  { name: "Earth", a: 1, period: 1, color: 0xaaffaa, r: 3.0e9 },
  { name: "Mars", a: 1.52, period: 1.881, color: 0xff7b55, r: 2.6e9 },
  { name: "Jupiter", a: 5.2, period: 11.86, color: 0xd8b48a, r: 6.0e9 },
  {
    name: "Saturn",
    a: 9.58,
    period: 29.46,
    color: 0xf2df9b,
    r: 5.0e9,
    ring: true,
  },
  // { name: "Uranus", a: 19.2, period: 84.01, color: 0x9bd4e4, r: 4.2e9 },
  { name: "Uranus", a: 19.2, period: 84.01, color: 0x9bd4e4, r: 1.0e10 },
  // { name: "Neptune", a: 30.05, period: 164.8, color: 0x6ea7ff, r: 4.0e9 },
  { name: "Neptune", a: 30.05, period: 164.8, color: 0x6ea7ff, r: 1.0e10 },
];

const METEORS = await loadMeteors();

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

const planetObjs = [];
let meteorPoints = null;

// Create planets, orbit rings, and labels
function buildPlanets() {
  for (const p of PLANETS) {
    // planet body
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(p.r, 24, 24),
      new THREE.MeshBasicMaterial({ color: p.color }),
    );

    // closed orbit ring
    const orbit = makeOrbitCircle(p.a * AU, p.color);
    three.orbitGroup.add(orbit);

    // label
    const label = makeLabel(p.name);
    three.scene.add(body, label);

    // --- Saturn's ring (schematic) ---
    if (p.ring) {
      const R_outer = p.r * 2.2; // outer radius
      const R_inner = p.r * 1.2; // inner radius
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R_inner, R_outer, 64),
        new THREE.MeshBasicMaterial({
          color: 0xf6eec2,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
        }),
      );
      ring.rotation.x = Math.PI / 2; // lay flat in XZ-plane
      body.add(ring); // parent to the planet mesh
    }

    planetObjs.push({ ...p, mesh: body, label });
  }
}
buildPlanets();

function buildMeteors() {
  const sprite = new THREE.TextureLoader().load("/static/textures/disc.png");

  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array(METEORS.length * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

  const material = new THREE.PointsMaterial({
    color: 0xc4a484,
    size: 1e10,
    map: sprite,
    transparent: true,
  });

  meteorPoints = new THREE.Points(geometry, material);
  three.scene.add(meteorPoints);
}
buildMeteors();

function updateSolarSystem(nowMs) {
  const tYears = tYearsPrev + (nowMs - nowMsPrev2) / 1000 / SECONDS_PER_YEAR;
  for (const p of planetObjs) {
    const theta = (tYears / p.period) * Math.PI * 2; // constant angular speed (schematic)
    const x = p.a * AU * Math.cos(theta);
    const z = p.a * AU * Math.sin(theta);
    p.mesh.position.set(x, 0, z);
    p.label.position.set(x + p.r * 2.0, p.r * 1.5, z); // offset label near planet
  }
  nowMsPrev2 = nowMs;
  tYearsPrev = tYears;
}

/**
 *
 * @param {*} parameters
 * @param {number} nowDay - The current day in sim time
 * @returns {[number, number, number]} The position of the meteor
 */
function getMeteorPosition(parameters, nowDay) {
  const elements = parameters;

  const a = elements.a_AU * AU;
  const e = elements.e;
  const i = toRad(elements.i_deg);
  const Omega = toRad(elements.Omega_deg);
  const omega = toRad(elements.omega_deg);
  const M0 = toRad(elements.M_deg);
  const n = Math.sqrt(muSun / a ** 3); // mean motion

  const t = nowDay * 86400;
  const M = M0 + n * t;
  const E = solveKeplerE(M, e);
  const nu =
    2.0 *
    Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2),
    );
  const r = a * (1 - e * Math.cos(E));
  const x_p = r * Math.cos(nu);
  const y_p = r * Math.sin(nu);

  const cosO = Math.cos(Omega);
  const sinO = Math.sin(Omega);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);

  const R11 = cosO * cosw - sinO * sinw * cosi;
  const R12 = -cosO * sinw - sinO * cosw * cosi;
  const R13 = sinO * sini;
  const R21 = sinO * cosw + cosO * sinw * cosi;
  const R22 = -sinO * sinw + cosO * cosw * cosi;
  const R23 = -cosO * sini;
  const R31 = sinw * sini;
  const R32 = cosw * sini;
  const R33 = cosi;

  const x = R11 * x_p + R12 * y_p + R13 * 0;
  const y = R21 * x_p + R22 * y_p + R23 * 0;
  const z = R31 * x_p + R32 * y_p + R33 * 0;

  return [x, y, z];
}

function updateMeteorSystem(nowMs) {
  // const tDays = nowMs / 1000 / SECONDS_PER_YEAR / 365;
  const tDays = tDaysPrev + (nowMs - nowMsPrev1) / SECONDS_PER_YEAR;

  const vertices = new Float32Array(METEORS.length * 3);
  for (const [ind, m] of METEORS.entries()) {
    const pos = getMeteorPosition(m.parameters, tDays);
    vertices[3 * ind] = pos[0];
    // hotfix to put meteors in-plane
    vertices[3 * ind + 1] = pos[2];
    vertices[3 * ind + 2] = pos[1];
  }
  // update existing geometry
  meteorPoints.geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(vertices, 3),
  );
  meteorPoints.geometry.attributes.position.needsUpdate = true;
  tDaysPrev = tDays;
  nowMsPrev1 = nowMs;
}

function animate() {
  requestAnimationFrame(animate);
  SECONDS_PER_YEAR = 85 - parseInt(speedSlider.value);
  console.log(SECONDS_PER_YEAR);
  updateMeteorSystem(performance.now());
  updateSolarSystem(performance.now());
  three.renderer.render(three.scene, three.camera);
}
animate();

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
}
addStars();

async function loadMeteors() {
  const meteors = [];
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

    if (!elem.orbital_data) {
      console.warn("Invalid element", elem);
      continue;
    }

    meteors.push({
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
  return meteors;
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

function solveKeplerE(M, e) {
  const TWO_PI = Math.PI * 2;
  let m = M % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  if (m < -Math.PI) m += TWO_PI;

  let E = e < 0.8 ? m : Math.PI;
  for (let j = 0; j < 30; j++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const dE = -f / fp;
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}
