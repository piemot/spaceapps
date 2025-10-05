from __future__ import annotations

import json
import os
import sys

import requests

# NASA proxy
NASA_API_KEY = os.getenv("NASA_API_KEY", "SokecvLDKo2aPz6lDM3GYIQxtlGAPbUwbiziTTdJ")


def progress_bar(iteration, total):
    bar_length = 50
    fill_char = "="
    empty_char = "-"

    progress = iteration / total
    filled_length = int(bar_length * progress)
    bar = fill_char * filled_length + empty_char * (bar_length - filled_length)
    percentage = f"{progress * 100:.1f}"
    print(f"\r[{bar}] {percentage}%", end="")
    if iteration == total:
        print()


# Loads a selection of objects (approximately, but not exactly object_count many) from the NASA dataset.
def main(object_count: int):
    objects = []

    def get_objects(page: int, size: int):
        url = f"https://api.nasa.gov/neo/rest/v1/neo/browse?api_key={NASA_API_KEY}&page={page}&size={size}"
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        return resp.json()

    initial = get_objects(0, 20)
    max_page = initial["page"]["total_pages"]
    objects.extend(initial["near_earth_objects"])

    request_count = (object_count - 20) // 20
    for i in range(request_count):
        progress_bar(i + 1, request_count)
        page = get_objects(int(1 + (max_page - 1) * (i / request_count)), 20)
        objects.extend(page["near_earth_objects"])

    with open("output.json", "w+") as fp:
        json.dump(objects, fp)


if __name__ == "__main__":
    try:
        object_count = int(sys.argv[1])
    except ValueError:
        print("Please provide the approximate number of objects to load.")
        raise

    main(object_count)
