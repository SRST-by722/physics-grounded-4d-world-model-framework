"""Package the selected Atrium visual export without changing its GLB bytes.

This is an import of an accepted visual asset, not a completed physics run.
The room remains unregistered; its building link has separate evidence.
"""

import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path

import numpy as np

ASSET_SHA = "909866d9caffcce6c262d2b9e4108307ad396799197732c4721e37f93197d9a7"
BASE_REVISION = "d05964403f9f107c337ee01047bde649c0209948"


def glb_document(path):
    with path.open("rb") as handle:
        magic, version, size = struct.unpack("<4sII", handle.read(12))
        length, kind = struct.unpack("<II", handle.read(8))
        if (magic, version, size, kind) != (b"glTF", 2, path.stat().st_size, 0x4E4F534A):
            raise ValueError("Invalid GLB container")
        doc = json.loads(handle.read(length))
    if any("uri" in item for key in ("images", "buffers") for item in doc.get(key, [])):
        raise ValueError("External GLB dependencies are not supported")
    return doc


def node_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"]).reshape(4, 4).T
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    matrix = np.eye(4)
    matrix[:3, :3] = np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    ) @ np.diag(node.get("scale", [1, 1, 1]))
    matrix[:3, 3] = node.get("translation", [0, 0, 0])
    return matrix


def bounds(doc):
    points = []

    def visit(index, parent):
        node = doc["nodes"][index]
        world = parent @ node_matrix(node)
        if "mesh" in node:
            for primitive in doc["meshes"][node["mesh"]]["primitives"]:
                accessor = doc["accessors"][primitive["attributes"]["POSITION"]]
                for x in (accessor["min"][0], accessor["max"][0]):
                    for y in (accessor["min"][1], accessor["max"][1]):
                        for z in (accessor["min"][2], accessor["max"][2]):
                            p = (world @ [x, y, z, 1])[:3]
                            points.append([p[0], -p[2], p[1]])
        for child in node.get("children", []):
            visit(child, world)

    for index in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        visit(index, np.eye(4))
    return {"min": np.min(points, axis=0).tolist(), "max": np.max(points, axis=0).tolist()}


def package(source, destination):
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    if sha != ASSET_SHA:
        raise ValueError("Input differs from the user-accepted, previously shared derivative")
    doc = glb_document(source)
    destination.mkdir(parents=True, exist_ok=False)
    shutil.copy2(source, destination / "atrium.glb")
    snapshot = Path(__file__)
    shutil.copy2(snapshot, destination / "source_snapshot.py")
    manifest = {
        "schema_version": "1.1.0",
        "scene_id": "atrium_9845",
        "simulation": "indoor_visualization",
        "run_id": "atrium_9845_visual_v1",
        "status": "complete",
        "created_at": "2026-10-16T13:11:38Z",
        "provenance": {
            "code_revision": BASE_REVISION,
            "dirty": True,
            "parameters": {
                "operation": "byte-preserving import of the previously shared visual derivative",
                "litereality_revision": "28ffe1fd4a1b03c93f1877a33a8bc9b806f72fe1",
                "source_glb_sha256": "19b41a8adf1625f23f90271305daa111611a85f2cf49c14a69fbc9335d34d4dc",
                "appearance": "User accepted the 6.8/10 visual result on 2026-10-16",
                "physics": "Not accepted: initial overlap check failed; shake test incomplete",
                "registration": "Room-local only; building link does not establish a room-to-city transform",
                "animation_semantics": "Interactive open/close presentation; independent of city simulation time",
                "reproducibility": "Importer snapshot reproduces packaging, not the original reconstruction",
            },
            "inputs": [{"id": "accepted_compressed_atrium_glb", "sha256": sha}],
        },
        "spatial": {
            "frame": "ENU",
            "units": "m",
            "georeferenced": False,
            "origin": {
                "longitude": 0,
                "latitude": 0,
                "height_m": 0,
                "vertical_datum": "Unregistered scan-local frame, not surveyed elevation",
            },
            "bounds_m": bounds(doc),
        },
        "time": {"unit": "s", "samples": []},
        "layers": [
            {
                "id": "room",
                "kind": "mesh",
                "format": "glb",
                "asset": "atrium.glb",
                "sampling": "static",
                "encoding": {"coordinate_frame": "glTF-y-up"},
                "display": {"widget": "mesh", "capabilities": ["pick", "opacity"]},
            }
        ],
        "artifacts": [
            {
                "id": "source_snapshot",
                "asset": "source_snapshot.py",
                "sha256": hashlib.sha256(snapshot.read_bytes()).hexdigest(),
                "media_type": "text/x-python",
            }
        ],
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        json.dumps(
            {
                "asset_sha256": sha,
                "animations": len(doc.get("animations", [])),
                "bytes": source.stat().st_size,
                "manifest": str(destination / "manifest.json"),
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    package(args.source, args.destination)
