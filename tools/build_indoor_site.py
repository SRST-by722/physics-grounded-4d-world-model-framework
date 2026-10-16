"""Package only the RSM-to-Atrium preview into a separate static directory.

The city remains on its existing public geometry host. No main branch, Pages
checkout, original scan, credentials or unrelated run data is modified/copied.
"""

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = "src/visualization/legacy/viewer/3d/?scene=south_kensington&indoor=atrium_9845&pose=campus&play=0&lite=0"
CITY_MANIFEST = "https://acse-yl222.github.io/urban-world-model-models/project/south_ken/geometry/models_v1/manifest.json"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument(
        "--scene", required=True, type=Path, help="Existing South Kensington scene.json"
    )
    args = parser.parse_args()
    target = args.destination.resolve()
    if target == ROOT or ROOT.is_relative_to(target):
        parser.error("Use a separate static output directory")
    target.mkdir(parents=True, exist_ok=True)
    if any(target.iterdir()) and not (target / "indoor-build.json").is_file():
        parser.error("Nonempty destination is not an indoor preview build")
    scene = json.loads(args.scene.read_text())
    if scene.get("id") != "south_kensington":
        parser.error("Expected the existing South Kensington scene")
    tracked = (
        subprocess.check_output(
            [
                "git",
                "ls-files",
                "-z",
                "src/visualization/legacy",
                "src/visualization/shared",
                "src/visualization/vendor",
            ],
            cwd=ROOT,
        )
        .decode()
        .split("\0")
    )
    for name in filter(None, tracked):
        source = ROOT / name
        if (
            source.suffix not in {".js", ".mjs", ".css", ".html", ".wasm"}
            and "LICENSE" not in source.name
            and "NOTICE" not in source.name
        ):
            continue
        output = target / name
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, output)
    for name in [
        "project/south_ken/configs/atrium_indoor.json",
        "project/south_ken/previews/atrium_9845_v1",
    ]:
        source, output = ROOT / name, target / name
        output.parent.mkdir(parents=True, exist_ok=True)
        if source.is_dir():
            shutil.copytree(source, output, dirs_exist_ok=True)
        else:
            shutil.copy2(source, output)
    scene.update(
        title="RSM · South Kensington",
        description="Explore RSM outside, then enter Atrium 9845.",
        layers={},
        masks={},
        phase_order=[],
        replay=None,
        traffic=None,
        transport=None,
    )
    scene["model"].update(
        prefer_parts=True, parts_manifest=CITY_MANIFEST, expansion=False, supplement=None, tile=None
    )
    base = target / "src/visualization/legacy/scenes"
    write_json(
        base / "index.json",
        {
            "default": "south_kensington",
            "scenes": [
                {"id": "south_kensington", "title": "RSM · South Kensington", "short": "RSM"}
            ],
        },
    )
    write_json(base / "south_kensington/scene.json", scene)
    write_json(base / "south_kensington/physics/manifest.json", {"arrays": {}})
    # Retain the existing lightweight geometry fallback when its two masks are available.
    for key in ["footprint", "roof"]:
        relative = scene.get("lite", {}).get(key)
        if relative:
            source = args.scene.parent / "physics" / relative
            if source.is_file():
                output = base / "south_kensington/physics" / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, output)
    write_json(
        target / "src/visualization/public-scenes.json",
        {"scenes": [{"scene_id": "south_ken", "title": "RSM · Atrium", "viewer_url": ROUTE}]},
    )
    (target / "index.html").write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>RSM · City to Atrium</title><meta name="description" content="Explore Royal School of Mines in South Kensington and enter an interactive indoor reconstruction.">'
        f'<meta http-equiv="refresh" content="0;url=/{ROUTE}"><a href="/{ROUTE}">Enter RSM preview</a></html>\n'
    )
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    asset = target / "project/south_ken/previews/atrium_9845_v1/atrium.glb"
    write_json(
        target / "indoor-build.json",
        {
            "source_repository": "https://github.com/SRST-by722/physics-grounded-4d-world-model-framework",
            "source_branch": "codex/rsm-atrium-indoor",
            "source_commit": sha,
            "source_dirty": bool(
                subprocess.check_output(
                    ["git", "diff", "HEAD", "--", "src", "tools/build_indoor_site.py"], cwd=ROOT
                )
            ),
            "city_manifest": CITY_MANIFEST,
            "room_sha256": hashlib.sha256(asset.read_bytes()).hexdigest(),
            "entrypoint": ROUTE,
            "scope": "Building-to-room presentation; no surveyed room placement or physics acceptance claimed",
        },
    )
    print(f"Independent indoor preview: {target}")


if __name__ == "__main__":
    main()
