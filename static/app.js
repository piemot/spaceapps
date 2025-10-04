// Basic helpers
const $ = (id) => document.getElementById(id);
const metricsEl = $("metrics");
const neoListEl = $("neoList");
const neoMeta = $("neoMeta");
const gameStatus = $("gameStatus");

const state = {
  neo: null,
  gameEnabled: false,
  mission: "std",
  interceptDays: 180,
  browseCache: [],
};

// ---------- NEO browse (NASA) ----------
$("browseBtn").addEventListener("click", async () => {
  neoListEl.innerHTML = "Loading NASA NEOs...";
  try {
    const r = await fetch("/api/nasa/browse?page=0&size=20");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items = (data.near_earth_objects || []).map((ne) => ({
      id: ne.id || ne.neo_reference_id,
      name: ne.name,
      h: ne.absolute_magnitude_h,
      diamM: ne.estimated_diameter?.meters
        ? [
            ne.estimated_diameter.meters.estimated_diameter_min,
            ne.estimated_diameter.meters.estimated_diameter_max,
          ]
        : null,
      orbital: ne.orbital_data || null,
    }));
    state.browseCache = items;
    renderBrowseList(items);
  } catch (e) {
    neoListEl.innerHTML = "Failed to fetch NASA browse. Check API key/network.";
    console.error(e);
  }
});

$("neoSearch").addEventListener("input", () => {
  const q = $("neoSearch").value.toLowerCase();
  const filtered = state.browseCache.filter((it) =>
    (it.name || "").toLowerCase().includes(q),
  );
  renderBrowseList(filtered);
});

function renderBrowseList(items) {
  neoListEl.innerHTML = "";
  if (!items.length) {
    neoListEl.textContent = "No matches.";
    return;
  }
  items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "list-item";
    const left = document.createElement("div");
    left.innerHTML =
      `<b>${it.name}</b> <span class="badge">H ${num(it.h, 1)}</span>` +
      (it.diamM
        ? ` <span class="badge">${num(it.diamM[0], 0)}–${num(it.diamM[1], 0)} m</span>`
        : "");
    const right = document.createElement("div");
    const btn = document.createElement("button");
    btn.textContent = "Load";
    btn.addEventListener("click", () => loadNEObyId(it.id));
    right.appendChild(btn);
    row.append(left, right);
    neoListEl.appendChild(row);
  });
}

async function loadNEObyId(id) {
  try {
    const r = await fetch(`/api/nasa/neo/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.json();

    const dEst =
      raw.estimated_diameter?.meters || raw.estimated_diameter?.kilometers;
    let minM = 120,
      maxM = 220;
    if (dEst) {
      const k = raw.estimated_diameter?.meters ? 1 : 1000;
      minM = Math.round((dEst.estimated_diameter_min || 0.12) * k);
      maxM = Math.round((dEst.estimated_diameter_max || 0.22) * k);
    }
    state.neo = {
      id: raw.id || raw.neo_reference_id,
      name: raw.name || "NEO",
      diameter_m: { min: minM, max: maxM },
      albedo: raw.albedo || 0.25,
      elements: {
        a_AU: getNum(raw.orbital_data?.semi_major_axis, 1.0),
        e: getNum(raw.orbital_data?.eccentricity, 0.1),
        i_deg: getNum(raw.orbital_data?.inclination, 5.0),
        Omega_deg: getNum(raw.orbital_data?.ascending_node_longitude, 40.0),
        omega_deg: getNum(raw.orbital_data?.perihelion_argument, 200.0),
        M_deg: getNum(raw.orbital_data?.mean_anomaly, 120.0),
        epoch_jd: getNum(raw.orbital_data?.epoch_jd, 2460600.5),
      },
      encounter: { days_until: 365 }, // TODO: parse close_approach_data for real timing
    };
    neoMeta.textContent = `${state.neo.name} — est. diameter ${minM}–${maxM} m; a=${state.neo.elements.a_AU} AU, e=${state.neo.elements.e}`;
    propagateOrbit();
  } catch (e) {
    neoMeta.textContent = "Failed to load NASA NEO details.";
    console.error(e);
  }
}

$("loadDemoBtn").addEventListener("click", async () => {
  try {
    const r = await fetch("/api/demo/impactor2025");
    const data = await r.json();
    state.neo = data;
    neoMeta.textContent = `${data.name} — est. diameter ${data.diameter_m.min}–${data.diameter_m.max} m; a=${data.elements.a_AU} AU, e=${data.elements.e}`;
    propagateOrbit();
  } catch (e) {
    neoMeta.textContent = "Failed to load demo object.";
  }
});

// ---------- Three.js (local only) ----------
let three = null;
(function initThree() {
  if (typeof THREE === "undefined") {
    console.warn("THREE not loaded; 3D disabled.");
    const b = document.getElementById("banner");
    if (b) b.style.display = "block";
    return;
  }
  const canvas = $("three");
  const wrap = document.querySelector(".three-wrap");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  const camera = new THREE.PerspectiveCamera(
    55,
    wrap.clientWidth / wrap.clientHeight,
    1e7,
    5e13,
  );
  camera.position.set(0, 0, 5e11);

  // simple orbit camera controls
  const target = new THREE.Vector3(0, 0, 0);
  let ctl = {
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
    const maxP = Math.PI - 0.001,
      minP = 0.001;
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
    const dx = e.clientX - ctl.lastX,
      dy = e.clientY - ctl.lastY;
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
    new THREE.SphereGeometry(1.2e10, 32, 32),
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
function propagateOrbit(dv = null) {
  if (!three || !state.neo) return;
  if (!worker) {
    worker = new Worker("/worker_kepler.js");
  }
  const el = state.neo.elements;
  worker.onmessage = (ev) => {
    const { positions, earth, shifted, error } = ev.data || {};
    if (error) {
      console.warn(error);
      return;
    }
    drawOrbit(positions, earth, shifted);
  };
  worker.postMessage({
    elements: el,
    spanDays: 540,
    stepDays: 3,
    startOffsetDays: 0,
    applyDv: dv,
  });
}

function drawOrbit(positions, earth, shifted) {
  const g = three.orbitGroup;
  while (g.children.length) g.remove(g.children[0]);

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
  g.add(makeLine(earth, 0x3355ff)); // Earth orbit (blue)
  g.add(makeLine(positions, 0xffcc66)); // NEO (gold)
  if (shifted) g.add(makeLine(shifted, 0xff66aa)); // shifted (pink)
}

// ---------- Leaflet map ----------
(function initMap() {
  if (typeof L === "undefined") {
    console.warn("Leaflet not loaded; skipping map.");
    return;
  }
  const map = L.map("map").setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 8,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  let impactMarker = null;
  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (impactMarker) impactMarker.remove();
    impactMarker = L.marker([lat, lng])
      .addTo(map)
      .bindPopup(
        `Impact point<br/>Lat ${lat.toFixed(2)}, Lng ${lng.toFixed(2)}`,
      )
      .openPopup();
  });
})();

// ---------- Metrics & Gamification ----------
$("gameEnabled").addEventListener("change", (e) => {
  state.gameEnabled = e.target.checked;
  renderGame();
});
$("missionSelect").addEventListener("change", (e) => {
  state.mission = e.target.value;
  renderGame();
});
$("interceptDays").addEventListener("input", (e) => {
  state.interceptDays = Math.max(10, Number(e.target.value) || 180);
  renderGame();
});

function line(label, value) {
  const row = document.createElement("div");
  row.className = "row";
  const a = document.createElement("div");
  a.textContent = label;
  const b = document.createElement("div");
  b.textContent = value;
  row.append(a, b);
  return row;
}
function num(n, d = 2) {
  return Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(n);
}
function getNum(v, def) {
  const x = Number(v);
  return isFinite(x) ? x : def;
}

$("estimateBtn").addEventListener("click", estimate);
estimate();

async function estimate() {
  const payload = {
    diameter_m: Number($("diameter").value),
    speed_kms: Number($("speed").value),
    density: Number($("density").value),
    angle_deg: Number($("angle").value),
    imp_mass_kg: Number($("impMass").value),
    imp_vel_kms: Number($("impVel").value),
    beta: Number($("beta").value),
    tractor_mass_kg: Number($("tractorMass").value),
    stand_off_m: Number($("standOff").value),
    tug_days: Number($("tugDays").value),
  };
  try {
    const r = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const d = data.derived;

    metricsEl.innerHTML = "";
    metricsEl.append(
      line("Mass (kg)", num(d.mass_kg, 0)),
      line("Velocity (m/s)", num(d.velocity_mps, 0)),
      line("Energy (J)", num(d.energy_j, 0)),
      line("TNT (tons)", num(d.tnt_tons, 0)),
      line("Crater diameter (m)", num(d.crater_diameter_m, 1)),
      line("Seismic Mw (proxy)", num(d.seismic_Mw, 1)),
      line("Tsunami height (m, toy)", num(d.tsunami_height_m, 2)),
      line("Δv kinetic (m/s)", num(d.delta_v_kinetic_mps, 3)),
      line("Δv tractor (m/s)", num(d.delta_v_tractor_mps, 3)),
    );

    if (state.gameEnabled) {
      const R_earth_m = 6_371_000;
      const days = Math.max(10, state.interceptDays);
      const t = days * 86400;
      const reqDv =
        (R_earth_m / t) *
        (state.mission === "easy" ? 0.8 : state.mission === "hard" ? 1.2 : 1.0);
      const haveDv = Math.max(d.delta_v_kinetic_mps, d.delta_v_tractor_mps);
      const ratio = haveDv / reqDv;
      const success = ratio >= 1;
      const score = Math.max(0, Math.min(100, Math.round(ratio * 100)));
      renderGame({
        requiredDv: reqDv,
        availableDv: haveDv,
        days,
        success,
        score,
      });

      // visualize with a shifted orbit (educational lateral offset)
      propagateOrbit({ dv_mps: haveDv, whenDays: 180 });
    } else {
      renderGame(null);
      propagateOrbit(null);
    }
  } catch (err) {
    console.error("Estimate failed:", err);
    metricsEl.innerHTML = `<div class="row"><div>Error</div><div>${String(err.message || err)}</div></div>`;
  }
}

function renderGame(extra) {
  if (!state.gameEnabled) {
    gameStatus.innerHTML = `<div class="row"><div>Mode</div><div>Off</div></div>`;
    return;
  }
  const neoName = state.neo ? state.neo.name : "None";
  const base = [
    line(
      "Mission",
      state.mission === "easy"
        ? "Easy — City Saver"
        : state.mission === "hard"
          ? "Hard — Planet Saver"
          : "Standard — Country Saver",
    ),
    line("NEO", neoName),
    line("Intercept (days)", String(state.interceptDays)),
  ];
  gameStatus.innerHTML = "";
  base.forEach((el) => gameStatus.append(el));
  if (!extra) {
    gameStatus.append(line("Status", "Adjust inputs & click Estimate"));
    return;
  }
  gameStatus.append(
    line("Required Δv (m/s)", num(extra.requiredDv, 3)),
    line("Available Δv (m/s)", num(extra.availableDv, 3)),
    line("Score", `${extra.score}/100`),
    line("Result", extra.success ? "✅ Deflected!" : "❌ Not enough Δv"),
  );
}
