import * as THREE from "three";

// Basic helpers
const $ = (id) => document.getElementById(id);

// ---------- Three.js (local only) ----------
let three = null;
(function initThree() {
  if (typeof THREE === "undefined") {
    console.error("THREE not loaded; 3D disabled.");
    const b = document.getElementById("banner");
    if (b) b.style.display = "block";
    return;
  }
  const canvas = $("three");
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
      ctl.dist = Math.max(5e9, Math.min(1e13, ctl.dist));
      applyCam();
    },
    { passive: true },
  );

  // lights + context
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.2e10, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0xffd27f }),
  );
  scene.add(sun);

  // orbit group (earth ring + NEO path + shifted path)
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener("resize", () => {
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
  });

  three = { scene, camera, renderer, orbitGroup };
})();

// ---------- Kepler worker / orbit drawing ----------

let worker = null;
function propagateOrbits(objects) {
  if (!three) return;
  worker ??= new Worker("/kepler.js");
  worker.onmessage = (ev) => {
    const { positions, earth, error } = ev.data || {};
    console.debug(positions);
    if (error) {
      console.warn(error);
      return;
    }
    drawOrbits(positions, earth);
  };
  worker.postMessage({
    orbits: objects.map((obj) => ({
      spanDays: 540,
      stepDays: 3,
      startOffsetDays: 0,
      parameters: obj.parameters,
    })),
  });
}

/**
 * @param {[number, number, number][][]} positions
 * @param {[number, number, number][]} earth
 */
function drawOrbits(positions, earth) {
  const g = three.orbitGroup;
  while (g.children.length) g.remove(g.children[0]);

  function makeLine(points, color) {
    console.log("drawing line", points);
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
  function makePts(points, color) {
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
      size: 5e9,
      map: sprite,
      transparent: true,
    });
    const pts = new THREE.Points(geometry, material);
    return pts;
  }
  for (const pos of positions) {
    g.add(makePts(pos, 0xbb66ff)); // meteor orbits (dotted purple)
  }
  g.add(makeLine(earth, 0x33ff66)); // Earth orbit (green)
}

const { default: elements } = await import("/static/neo.json", {
  with: { type: "json" },
});

const neos = [];
for (const elem of elements) {
  function getFinite(a) {
    const x = Number(a);
    if (!Number.isFinite(x)) {
      throw new Error(`non-finite element ${x}, ${a}`);
    }
    return x;
  }

  neos.push({
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

propagateOrbits(neos);
