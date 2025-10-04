// Kepler propagation worker (heliocentric two-body; educational)
const AU = 149597870700.0; // meters
const muSun = 1.32712440018e20; // m^3/s^2 GM_sun

/**
 * @typedef {object} OrbitParameters
 * @property {number} a_AU
 * @property {number} e
 * @property {number} i_deg
 * @property {number} Omega_deg
 * @property {number} omega_deg
 * @property {number} M_deg
 */

/**
 * @typedef {object} Orbit
 * @property {OrbitParameters} parameters
 * @property {number} startOffsetDays
 * @property {number} spanDays
 * @property {number} stepDays
 */

/**
 * @typedef {object} EventData
 * @property {Orbit[]} orbits
 */

/**
 * @typedef {object} EventParam
 * @property {EventData} data
 */

/**
 * @param {EventParam} event
 */
function processEvent(event) {
  try {
    console.debug("orbits", event.data.orbits);
    const positions = event.data.orbits.map(producePositions);
    // Simple Earth orbit for context (1 AU approx, small e)
    const earth = [];
    const aE = AU;
    const eE = 0.0167;
    for (let k = 0; k < 360; k += 3) {
      const th = (k * Math.PI) / 180;
      const rE = (aE * (1 - eE * eE)) / (1 + eE * Math.cos(th));
      earth.push([rE * Math.cos(th), rE * Math.sin(th), 0]);
    }

    self.postMessage({ positions, earth });
  } catch (e) {
    self.postMessage({ error: String(e) });
  }
}

/**
 * @param {Orbit} orbit
 */
function producePositions(orbit) {
  console.debug("positions for orbit", orbit);
  const elements = orbit.parameters;

  const a = elements.a_AU * AU;
  const e = elements.e;
  const i = toRad(elements.i_deg);
  const Omega = toRad(elements.Omega_deg);
  const omega = toRad(elements.omega_deg);
  const M0 = toRad(elements.M_deg);
  const n = Math.sqrt(muSun / a ** 3); // mean motion
  const dtStart = orbit.startOffsetDays * 86400;

  const positions = [];
  for (let d = 0; d <= orbit.spanDays; d += orbit.stepDays) {
    const t = d * 86400 + dtStart;
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

    positions.push([x, y, z]);
  }
  console.debug("position 1", positions[0]);
  return positions;
}

self.onmessage = processEvent;

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
