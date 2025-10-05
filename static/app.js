import * as THREE from "three";
import { init } from "./init.js";

const three = init();

// === Solar System (schematic) ===
// Keep units in meters (your Earth ring uses meters already)
const AU = 149597870700.0; // 1 AU in meters
const muSun = 1.32712440018e20; // m^3/s^2 GM_sun

const SECONDS_PER_YEAR = 40; // sim speed: 1 year = 40s

// orbital period in Earth days, display radius in meters (not to scale)
const PLANET_DATA_MATRIX = [
  {
    name: "Mercury",
    color: 0xb1b1b1,
    displayRadius: 2.0e9,
    orbitalPeriod: 88,
    base: [
      0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593,
    ],
    modifier: [
      0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689,
      -0.12534081,
    ],
  },
  {
    name: "Venus",
    color: 0xeed9a3,
    displayRadius: 3.0e9,
    orbitalPeriod: 225,
    base: [
      0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718,
      76.67984255,
    ],
    modifier: [
      0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329,
      -0.27769418,
    ],
  },
  {
    name: "EM Bary",
    color: 0x46be46,
    displayRadius: 3.0e9,
    orbitalPeriod: 365,
    base: [
      1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
    ],
    modifier: [
      0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0,
    ],
  },
  {
    name: "Mars",
    color: 0xff7b55,
    displayRadius: 2.6e9,
    orbitalPeriod: 687,
    base: [
      1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    ],
    modifier: [
      0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088,
      -0.29257343,
    ],
  },
  {
    name: "Jupiter",
    color: 0xd8b48a,
    displayRadius: 6.0e9,
    orbitalPeriod: 4333,
    base: [
      5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    ],
    modifier: [
      -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668,
      0.20469106,
    ],
  },
  {
    name: "Saturn",
    color: 0xf2df9b,
    displayRadius: 5.0e9,
    orbitalPeriod: 10759,
    base: [
      9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831,
      113.66242448,
    ],
    modifier: [
      -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216,
      -0.28867794,
    ],
  },
  {
    name: "Uranus",
    color: 0x9bd4e4,
    displayRadius: 1.0e10,
    orbitalPeriod: 30687,
    base: [
      19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763,
      74.01692503,
    ],
    modifier: [
      -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281,
      0.04240589,
    ],
  },
  {
    name: "Neptune",
    color: 0x6ea7ff,
    displayRadius: 1.0e10,
    orbitalPeriod: 60190,
    base: [
      30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227,
      131.78422574,
    ],
    modifier: [
      0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464,
      -0.00508664,
    ],
  },
];

const PLANETS = [];
for (const planet of PLANET_DATA_MATRIX) {
  /* The number of centuries past J2000 */
  const j2000centuries = (new Date().getFullYear() % 100) / 100;
  const value = (base, modifier) => base + j2000centuries * modifier;

  const a_AU = value(planet.base[0], planet.modifier[0]); // semi-major axis
  const e = value(planet.base[1], planet.modifier[1]); // eccentricity (already provided in rad)
  const i_deg = value(planet.base[2], planet.modifier[2]); // inclination
  const L_deg = value(planet.base[3], planet.modifier[3]); // mean longitude
  const pi_deg = value(planet.base[4], planet.modifier[4]); // longitude of perihelion
  const Omega_deg = value(planet.base[5], planet.modifier[5]); // longitude of the ascending node

  const omega_deg = pi_deg - Omega_deg; // argument of perihelion
  const M_deg = L_deg - pi_deg; // mean anomaly

  PLANETS.push({ ...planet, a_AU, e, i_deg, Omega_deg, omega_deg, M_deg });
}

const METEORS = await loadMeteors();

// Simple billboard label with adjustable size
function makeLabel(text, scale = 1) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 48;
  ctx.font = `${fontSize}px 'Exo 2', sans-serif`;
  const w = Math.max(256, ctx.measureText(text).width + 40);
  const h = 128;
  canvas.width = w;
  canvas.height = h;

  const g = canvas.getContext("2d");
  g.font = `${fontSize}px 'Exo 2', sans-serif`;
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

/**
 * Closed eliptical orbit in the XZ-plane
 *
 * @param {CelestialObjectParams} params
 * @param {number} color
 * @returns
 */
function makeOrbitPath(params, color = 0x2aff7a) {
  console.log(params.name, params.orbitalPeriod);

  const positions = new Float32Array(params.orbitalPeriod * 3);
  for (let i = 0; i < params.orbitalPeriod; i++) {
    const px = getCelestialObjectPosition(params, i);
    positions[3 * i] = px[0];
    // hotfix to put orbits in-plane
    positions[3 * i + 1] = px[2];
    positions[3 * i + 2] = px[1];
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

// Create planets, orbit rings, and labels
function buildPlanets() {
  for (const p of PLANETS) {
    // planet body
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(p.displayRadius, 24, 24),
      new THREE.MeshBasicMaterial({ color: p.color }),
    );

    // closed orbit ring
    const orbit = makeOrbitPath(p, p.color);
    three.orbitGroup.add(orbit);

    // label
    const label = makeLabel(p.name);
    three.scene.add(body, label);

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
  const tYears = nowMs / 1000 / SECONDS_PER_YEAR;
  for (const p of planetObjs) {
    const theta = (tYears / p.period) * Math.PI * 2; // constant angular speed (schematic)
    const x = p.a * AU * Math.cos(theta);
    const z = p.a * AU * Math.sin(theta);
    p.mesh.position.set(x, 0, z);
    p.label.position.set(x + p.r * 2.0, p.r * 1.5, z); // offset label near planet
  }
}
/**
 * @typedef {object} CelestialObjectParams
 * @property {number} a_AU - The length of the semi-major axis in AU
 * @property {number} e - The eccentricity of the orbit in radians
 * @property {number} i_deg - The inclination of the orbit in degrees
 * @property {number} Omega_deg - The ascending node longitude of the orbit in degrees
 * @property {number} omega_deg - The perihelion argument of the orbit in degrees
 * @property {number} M_deg - The mean anomaly of the orbit in degrees
 */

/**
 *
 * @param {CelestialObjectParams} parameters
 * @param {number} nowDay
 * @returns {[number, number, number]} The coordinates of the object
 */
function getCelestialObjectPosition(parameters, nowDay) {
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

  // z_p = 0
  const x = R11 * x_p + R12 * y_p + R13 * 0;
  const y = R21 * x_p + R22 * y_p + R23 * 0;
  const z = R31 * x_p + R32 * y_p + R33 * 0;

  return [x, y, z];
}

function updateMeteorSystem(nowMs) {
  // const tDays = nowMs / 1000 / SECONDS_PER_YEAR / 365;
  const tDays = nowMs / SECONDS_PER_YEAR;

  const vertices = new Float32Array(METEORS.length * 3);
  for (const [ind, m] of METEORS.entries()) {
    const pos = getCelestialObjectPosition(m.parameters, tDays);
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
}

function animate() {
  requestAnimationFrame(animate);

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
  const { default: elements } = await import("/static/output.json", {
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
