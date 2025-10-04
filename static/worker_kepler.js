// Kepler propagation worker (heliocentric two-body; educational)
const AU = 149597870700.0; // meters
const muSun = 1.32712440018e20; // m^3/s^2 GM_sun

self.onmessage = (evt) => {
  const {
    elements,
    spanDays = 365,
    stepDays = 3,
    startOffsetDays = 0,
    applyDv = null,
  } = evt.data || {};
  if (!elements) {
    self.postMessage({ error: "Missing elements" });
    return;
  }

  try {
    const a = Number(elements.a_AU) * AU;
    const e = Number(elements.e);
    const i = toRad(Number(elements.i_deg));
    const Omega = toRad(Number(elements.Omega_deg));
    const omega = toRad(Number(elements.omega_deg));
    const M0 = toRad(Number(elements.M_deg));
    const n = Math.sqrt(muSun / Math.pow(a, 3)); // mean motion
    const dtStart = startOffsetDays * 86400;

    const positions = [];
    for (let d = 0; d <= spanDays; d += stepDays) {
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

      const cosO = Math.cos(Omega),
        sinO = Math.sin(Omega);
      const cosi = Math.cos(i),
        sini = Math.sin(i);
      const cosw = Math.cos(omega),
        sinw = Math.sin(omega);

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

    // Simple Earth orbit for context (1 AU approx, small e)
    const earth = [];
    const aE = AU,
      eE = 0.0167;
    for (let k = 0; k < 360; k += 3) {
      const th = (k * Math.PI) / 180;
      const rE = (aE * (1 - eE * eE)) / (1 + eE * Math.cos(th));
      earth.push([rE * Math.cos(th), rE * Math.sin(th), 0]);
    }

    let shifted = null;
    if (applyDv && applyDv.dv_mps > 0) {
      const tRemain = Math.max(1, spanDays - (applyDv.whenDays || 0)) * 86400;
      const lateral = applyDv.dv_mps * tRemain;
      shifted = positions.map(([x, y, z], i) =>
        i === 0 ? [x, y, z] : [x + lateral * 1e-6, y, z],
      ); // toy lateral offset
    }

    self.postMessage({ positions, earth, shifted });
  } catch (e) {
    self.postMessage({ error: String(e) });
  }
};

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
