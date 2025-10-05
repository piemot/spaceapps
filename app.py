from __future__ import annotations

import math
import os

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="static", template_folder="static")
CORS(app)

# ---------- Physics helpers (educational) ----------
TNT_J = 4.184e9
RHO_DEFAULT = 3000.0
G = 6.67430e-11
g_earth = 9.81


def sphere_mass(d_m: float, rho: float = RHO_DEFAULT) -> float:
    r = d_m / 2.0
    return (4.0 / 3.0) * math.pi * r**3 * rho


def kinetic_energy_j(mass_kg: float, vel_mps: float) -> float:
    return 0.5 * mass_kg * vel_mps**2


def tnt_equivalent(energy_j: float) -> float:
    return energy_j / TNT_J


def seismic_mw_from_energy(energy_j: float) -> float:
    log10E = math.log10(max(energy_j, 1.0))
    return (log10E - 4.8) / 1.5


def crater_diameter_m(
    d_m: float, v_mps: float, rho_i: float = RHO_DEFAULT, rho_t: float = 2000.0
) -> float:
    # Gravity-dominated scaling (simplified, vertical impact)
    k = 1.3
    return (
        k
        * (g_earth**-0.22)
        * (v_mps**0.44)
        * ((rho_i / rho_t) ** (1.0 / 3.0))
        * (d_m**0.78)
    )


def tsunami_height_meters(energy_j: float, shelf_slope: float = 0.005) -> float:
    # Parametric toy proxy
    return (energy_j ** (1.0 / 3.0)) * 1e-6 * (1.0 + shelf_slope * 50.0)


def delta_v_kinetic(
    m_ast: float, m_imp: float, v_imp_mps: float, beta: float = 1.5
) -> float:
    if m_ast <= 0:
        return 0.0
    return (beta * m_imp * v_imp_mps) / m_ast


def delta_v_gravity_tractor(
    m_ast: float, m_trac: float, stand_off_m: float, tug_time_s: float
) -> float:
    if stand_off_m <= 0:
        return 0.0
    a = (G * m_trac) / (stand_off_m**2)
    return a * tug_time_s


# ---------- Routes ----------
@app.get("/")
def root():
    return send_from_directory(app.static_folder, "index.html")


@app.post("/api/estimate")
def estimate():
    data = request.get_json(force=True) or {}
    d_m = float(data.get("diameter_m", 120.0))
    speed_kms = float(data.get("speed_kms", 18.0))
    rho = float(data.get("density", RHO_DEFAULT))
    angle_deg = float(data.get("angle_deg", 45.0))  # placeholder for future use

    imp_mass = float(data.get("imp_mass_kg", 1000.0))
    imp_vel_kms = float(data.get("imp_vel_kms", 10.0))
    beta = float(data.get("beta", 1.5))

    tractor_mass = float(data.get("tractor_mass_kg", 2000.0))
    stand_off_m = float(data.get("stand_off_m", 500.0))
    tug_days = float(data.get("tug_days", 180.0))

    m_ast = sphere_mass(d_m, rho)
    v_mps = speed_kms * 1000.0
    ke = kinetic_energy_j(m_ast, v_mps)

    return jsonify(
        {
            "derived": {
                "mass_kg": m_ast,
                "velocity_mps": v_mps,
                "energy_j": ke,
                "tnt_tons": tnt_equivalent(ke),
                "crater_diameter_m": crater_diameter_m(d_m, v_mps, rho),
                "seismic_Mw": seismic_mw_from_energy(ke),
                "tsunami_height_m": tsunami_height_meters(ke),
                "delta_v_kinetic_mps": delta_v_kinetic(
                    m_ast, imp_mass, imp_vel_kms * 1000.0, beta
                ),
                "delta_v_tractor_mps": delta_v_gravity_tractor(
                    m_ast, tractor_mass, stand_off_m, tug_days * 86400.0
                ),
            },
            "disclaimer": "Educational first-order estimates only.",
        }
    )


# NASA proxy
NASA_API_KEY = os.getenv("NASA_API_KEY", "SokecvLDKo2aPz6lDM3GYIQxtlGAPbUwbiziTTdJ")


@app.get("/api/nasa/browse")
def nasa_browse():
    page = request.args.get("page", "0")
    size = request.args.get("size", "20")
    url = f"https://api.nasa.gov/neo/rest/v1/neo/browse?api_key={NASA_API_KEY}&page={page}&size={size}"
    r = requests.get(url, timeout=20)
    return (r.text, r.status_code, {"Content-Type": "application/json"})


@app.get("/api/nasa/neo/<neo_id>")
def nasa_neo(neo_id: str):
    url = f"https://api.nasa.gov/neo/rest/v1/neo/{neo_id}?api_key={NASA_API_KEY}"
    r = requests.get(url, timeout=20)
    return (r.text, r.status_code, {"Content-Type": "application/json"})


# Demo object
@app.get("/api/demo/impactor2025")
def demo_impactor():
    return {
        "id": "IMP-2025",
        "name": "Impactor-2025 (demo)",
        "diameter_m": {"min": 120, "max": 220},
        "albedo": 0.25,
        "elements": {  # heliocentric (toy) for visualization
            "a_AU": 1.15,
            "e": 0.21,
            "i_deg": 6.5,
            "Omega_deg": 44.0,
            "omega_deg": 210.0,
            "M_deg": 123.0,
            "epoch_jd": 2460600.5,
        },
        "encounter": {"days_until": 365},
    }


@app.get("/diag")
def diag():
    return send_from_directory(app.static_folder, "diag.html")


@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    app.run("127.0.0.1", 5000, debug=True)
