# RSM indoor preview

This opt-in addition links the Royal School of Mines building in the existing
South Kensington city model to the accepted Atrium 9845 visual reconstruction.
It uses the same Three.js scene, renderer, camera and controls. The original city
asset, default URL, simulation clocks, main branch and deployed Pages site are
not replaced.

## Open locally

Start `p4d serve` and open:

```text
/src/visualization/legacy/viewer/3d/?scene=south_kensington&indoor=atrium_9845&pose=campus&play=0
```

This route deliberately loads geometry only, without the environmental fields,
traffic, UAV or bird replays. The city's normal route retains those features.
The standard local city asset must be available at
`project/south_ken/runs/legacy_web/models/south_kensington_core008_web.glb`, with
its existing `scene.json` beside `models/`. For a Pages build, the existing
chunked resource model remains the source. The original city download is about
255 MB; the additional room is fetched only on entry and is about 20.3 MB.

Use **Locate RSM**, then **Enter Atrium** (or click the green building marker).
Inside, drag to orbit, scroll to zoom and click visible drawers, doors or windows
to open/close them. A drag must not activate a part. **Back to city** or Escape
restores the city view. Reset changes the camera, not the source asset.

## What is located, and what remains unknown

The building is identified in both the existing GLB metadata and the preserved
OpenStreetMap footprint as `way-110085215`, named
“Royal School of Mines / Aston Webb / Goldsmiths”. Imperial's
[department contact page](https://www.imperial.ac.uk/earth-science/about/contact-us/)
places the Royal School of Mines on Prince Consort Road, SW7 2BP.
The existing model groups those connected buildings together; this is a
building-complex identity, not proof of a particular wing or room.

The legacy GLB is in metres, x east, y up, z south. Its horizontal coordinates
are EPSG:32630 minus `(695238.304719173, 5709236.965026026)` for `(x, -z)`.
That projected origin converts to longitude `-0.187`, latitude `51.5005`.
Its RSM model bounds are `(717.92, 0.14, 33.84)` to
`(866.68, 24.01, 88.26)`, with an approximate geographic centre of
`51.499678 N, 0.175633 W`. The correspondence and source hashes are recorded in
`project/south_ken/previews/atrium_9845_v1/building_evidence.json`.

**The room is not spatially registered within this building.** The user's
fourth-floor description is tentative. The room number, wing, floor elevation,
horizontal offset and heading are unknown. `room_to_city` is explicitly null.
The user confirmed that a building-to-room viewing transition is the intended
scope; precise room registration is not a delivery requirement.
Entering switches to the indoor view and hides the city;
the room is not arbitrarily placed inside the exterior shell.

Also, `project/south_ken/project.json` currently declares a different geographic
origin from the legacy GLB. This addition does not silently equate those frames
or change the framework's existing spatial contract. A future surveyed placement
must explicitly resolve this difference and record the actual room transform.

## Asset and verification boundaries

The room GLB is byte-identical to the previously shared web derivative:
SHA-256 `909866d9caffcce6c262d2b9e4108307ad396799197732c4721e37f93197d9a7`,
20,281,308 bytes, ten animation clips. The loader checks this SHA-256 before
parsing. Its embedded geometry/materials/textures and animation tracks are
preserved. Ceiling visibility is a temporary dollhouse presentation choice.
The source clips contain full open-and-close cycles, and some have a different
pose at time zero. `animation_ranges_seconds` records each closed frame-1 pose
and its first maximum opening. The adapter scrubs that interval and reverses it
on the next click, so a drawer stays open. This changes playback only, not GLB
geometry, tracks, materials or textures.
Hidden geometry cannot intercept clicks. Only the nearest visible surface can
activate a part, so clicking through walls does not open hidden drawers.

The v1.1 manifest describes a completed **visual asset import**, with
`georeferenced: false` and no simulation time samples. It does not certify the
original reconstruction or physics. The appearance was accepted at 6.8/10;
the initial physics overlap check failed and the shake test was not completed.
The original reconstruction remains paused. Interactive clip playback is a
viewing affordance, independent of city simulation time.

`tools/package_indoor_preview.py` reproduces this packaging from the selected
GLB and refuses a different input hash or an existing destination. The importer
snapshot in the preview is provenance for packaging, not a claim that the
original reconstruction can be reproduced from that snapshot alone.

This branch selects only the already shared visual derivative for the preview.
No original scan TAR, photographs, credentials, raw failed simulation data or
private correspondence is included. `tools/build_public_site.py` copies the
explicit preview selection when deliberately invoked for a separate site
checkout; this does not itself publish or change Pages.

Three.js RoomEnvironment is the unmodified official r185 module, matching the
vendored runtime (MIT); SHA-256
`55f466192cc84298755a424c5e040345006b2ee1455589b3b54126c2ea4123f4`.
Articulation logic is adapted from LiteReality-Agent under Apache-2.0; see
`src/visualization/shared/indoor-NOTICE.txt` and `indoor-LICENSE.txt`.

## Checks

```sh
python tools/check_contract.py project/south_ken/previews/atrium_9845_v1/manifest.json
node --test tests/test_indoor_portal.mjs
make test-e2e
```

Real-data browser review must additionally exercise RSM location, room loading,
drag versus tap, actual moving parts, exit/return, errors/retry and resource
disposal. Synthetic E2E checks alone do not verify that geographic or visual
alignment is correct.

Verified locally on 2026-10-16: the actual city model locates the RSM complex;
the entry button and building marker both open the room; orbit dragging changes
the view without toggling a part; a drawer visibly opens, stays open and closes
on a second click; returning restores the city view and re-entry works. The
GLB hash and ten original clips are preserved. The protocol checker, 25 Node
tests, 72 existing Python tests (6 skipped), the additional preview-mount
regression, static-site packaging and `make test-e2e` passed. The final E2E
reported no errors. Full GPU-resource disposal, mobile devices and a published
Pages deployment were not exercised in the real-data browser review.
