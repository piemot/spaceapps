import * as THREE from "three";
import { init } from "./init.js";

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

const three = init();

// load state.objects
await loadMeteorState();
// load state.earthPositions
loadEarthState();

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
      arr[3 * i + 1] = points[i][1];
      arr[3 * i + 2] = points[i][2];
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return new THREE.Line(geo, mat);
  }

  /**
   * @param {[number, number, number][]} points
   * @param {number} color
   */
  function makePts(points, color) {
    if (!pts) {
      const sprite = new THREE.TextureLoader().load("textures/disc.png");

      const geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array(points.length * 3);
      for (let i = 0; i < points.length; i++) {
        vertices[3 * i] = points[i][0];
        vertices[3 * i + 1] = points[i][1];
        vertices[3 * i + 2] = points[i][2];
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

      geometry.computeBoundingSphere();

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
    pts.geometry.position = new THREE.BufferAttribute(vertices, 3);
    pts.geometry.position.needsUpdate = true;
    return points;
  }
  g.add(makePts(positions, 0xbb66ff)); // meteor orbits (dotted purple)
  g.add(makeLine(state.earthPositions, 0x33ff66)); // Earth orbit (green)
}

function loadEarthState() {
  const AU = 149597870700.0; // meters

  // Simple Earth orbit for context (1 AU approx, small e)
  const aE = AU;
  const eE = 0.0167;

  for (let k = 0; k < 360; k += 3) {
    const th = (k * Math.PI) / 180;
    const rE = (aE * (1 - eE * eE)) / (1 + eE * Math.cos(th));
    state.earthPositions.push([rE * Math.cos(th), rE * Math.sin(th), 0]);
  }
}

async function loadMeteorState() {
  const { default: elements } = await import("/static/neo.json", {
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
