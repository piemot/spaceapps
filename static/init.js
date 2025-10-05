import * as THREE from "three";

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

  window.addEventListener("resize", () => {
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
  });

  return { scene, camera, renderer, orbitGroup };
}
