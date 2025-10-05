from __future__ import annotations

import datetime
import json
import os

import requests

# NASA proxy
NASA_API_KEY = os.getenv("NASA_API_KEY", "SokecvLDKo2aPz6lDM3GYIQxtlGAPbUwbiziTTdJ")


# Loads all objects that will come near the Earth within the next week.
def main():
    start_date = datetime.datetime.today().strftime("%Y-%m-%d")
    url = f"https://api.nasa.gov/neo/rest/v1/feed?api_key={NASA_API_KEY}&start_date={start_date}"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    data = r.json()

    ids = set()

    dates = data["near_earth_objects"]
    for date in dates:
        for meteor in dates[date]:
            ids.add(meteor["id"])

    meteor_data = []

    for id in ids:
        print(f"Fetching meteor {id}")
        url = f"https://api.nasa.gov/neo/rest/v1/neo/{id}?api_key={NASA_API_KEY}"
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        meteor_data.append(data)

    with open("output.json", "w+") as fp:
        json.dump(meteor_data, fp)


if __name__ == "__main__":
    main()
