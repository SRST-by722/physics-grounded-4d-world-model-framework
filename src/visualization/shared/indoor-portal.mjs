import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from '../vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { assetURL } from './time.mjs';
import { validateIndoorPortal, isTap } from './indoor-contract.mjs';
import { createArticulation } from './indoor-articulation.mjs';

// One shared scene/camera/renderer. The room has its own explicitly unregistered
// local frame: entering hides the city and exiting restores its exact view.
export async function createIndoorPortal(context, configURL, projectRoot) {
  const { scene, camera, controls, renderer, invalidate, pauseCity } = context;
  const abort = new AbortController();
  const response = await fetch(configURL, { signal: abort.signal });
  if (!response.ok) throw new Error(`Indoor configuration unavailable (${response.status})`);
  const config = validateIndoorPortal(await response.json());
  let disposed = false,
    active = false,
    loading = false,
    root = null,
    articulation = null;
  let saved = null,
    tap = null,
    roomBounds = null,
    environment = null,
    pmrem = null;
  const canvas = renderer.domElement,
    raycaster = new THREE.Raycaster();
  const marker = new THREE.Group();
  const box = new THREE.Box3(
    new THREE.Vector3(...config.building.bounds_gltf_m[0]),
    new THREE.Vector3(...config.building.bounds_gltf_m[1]),
  );
  const center = box.getCenter(new THREE.Vector3());
  const outline = new THREE.Box3Helper(box, 0x70e3cf);
  marker.add(outline);
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(4, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x70e3cf, depthTest: false }),
  );
  pin.position.copy(center);
  pin.position.y = box.max.y + 12;
  pin.renderOrder = 1000;
  marker.add(pin);
  scene.add(marker);

  const panel = document.createElement('section');
  panel.className = 'indoor-panel';
  panel.setAttribute('aria-label', 'RSM indoor scene');
  panel.innerHTML = `<strong>Royal School of Mines</strong><p class="indoor-status" role="status"></p>
    <div class="indoor-actions"><button type="button" data-action="locate">Locate RSM</button>
    <button type="button" data-action="enter">Enter Atrium</button>
    <button type="button" data-action="reset" hidden>Reset room view</button>
    <button type="button" data-action="exit" hidden>Back to city</button></div>
    <p class="indoor-help"></p>`;
  document.body.append(panel);
  const status = panel.querySelector('.indoor-status'),
    help = panel.querySelector('.indoor-help');
  const button = (name) => panel.querySelector(`[data-action="${name}"]`);
  status.textContent = 'Atrium 9845 · interactive indoor scene';
  help.textContent =
    'Explore the city, then enter Atrium to look around the room and try its moving parts.';
  const oldCursor = canvas.style.cursor;

  function locate() {
    if (active || disposed) return;
    pauseCity();
    controls.enabled = true;
    camera.position.copy(center).add(new THREE.Vector3(35, 105, -160));
    controls.target.copy(center);
    controls.update();
    invalidate();
  }
  function frameRoom() {
    if (!root || !active) return;
    const size = roomBounds.getSize(new THREE.Vector3()),
      target = roomBounds.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(0.9, 1.65, 1.1).normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const v = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
      h = v * camera.aspect;
    let distance = 0;
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          const p = new THREE.Vector3((x * size.x) / 2, (y * size.y) / 2, (z * size.z) / 2);
          distance = Math.max(
            distance,
            p.dot(direction) + Math.max(Math.abs(p.dot(right)) / h, Math.abs(p.dot(up)) / v),
          );
        }
    camera.position.copy(target).addScaledVector(direction, distance * 1.15);
    controls.target.copy(target);
    controls.update();
    invalidate();
  }
  const draco = new DRACOLoader().setDecoderPath(
    new URL('../vendor/three/examples/jsm/libs/draco/gltf/', import.meta.url).href,
  );
  const loader = new GLTFLoader().setDRACOLoader(draco);
  async function loadRoom() {
    const manifestURL = new URL(config.manifest, projectRoot);
    const r = await fetch(manifestURL, { signal: abort.signal });
    if (!r.ok) throw new Error(`Room manifest unavailable (${r.status})`);
    const manifest = await r.json(),
      layer = manifest.layers?.[0];
    if (
      manifest.spatial?.georeferenced !== false ||
      manifest.status !== 'complete' ||
      layer?.format !== 'glb' ||
      layer.encoding?.coordinate_frame !== 'glTF-y-up'
    )
      throw new Error('Expected an unregistered, self-contained GLB room');
    const asset = await fetch(assetURL(new URL('.', manifestURL).href, layer.asset), {
      signal: abort.signal,
    });
    if (!asset.ok) throw new Error(`Room model unavailable (${asset.status})`);
    const bytes = await asset.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hash !== config.asset_sha256) throw new Error('Room model checksum does not match');
    const gltf = await loader.parseAsync(bytes, '');
    root = gltf.scene;
    root.visible = false;
    scene.add(root);
    if (disposed) {
      disposeRoot();
      return;
    }
    root.updateMatrixWorld(true);
    roomBounds = new THREE.Box3();
    root.traverse((o) => {
      if (o.isMesh && /^(wall|floor|ceiling)/i.test(o.name)) roomBounds.expandByObject(o);
    });
    if (roomBounds.isEmpty()) roomBounds.setFromObject(root);
    // Dollhouse presentation only. No deletion, rebaking or re-authoring.
    root.traverse((o) => {
      if (/^ceiling/i.test(o.name) || /^(daylight|_)/i.test(o.name)) o.visible = false;
    });
    articulation = createArticulation(root, gltf.animations, config.animation_ranges_seconds);
    pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    environment = pmrem.fromScene(roomEnvironment, 0.04);
    roomEnvironment.dispose();
  }
  async function enter() {
    if (active || loading || disposed) return;
    loading = true;
    button('enter').disabled = true;
    status.textContent = 'Loading Atrium · 20 MB…';
    try {
      if (!root) await loadRoom();
      if (disposed) return;
      pauseCity();
      controls.update();
      saved = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        target: controls.target.clone(),
        near: camera.near,
        far: camera.far,
        minDistance: controls.minDistance,
        maxDistance: controls.maxDistance,
        maxPolarAngle: controls.maxPolarAngle,
        enabled: controls.enabled,
        background: scene.background,
        environment: scene.environment,
        exposure: renderer.toneMappingExposure,
        visibility: scene.children.filter((o) => o !== root).map((o) => [o, o.visible]),
      };
      saved.visibility.forEach(([o]) => {
        o.visible = false;
      });
      root.visible = true;
      active = true;
      scene.background = new THREE.Color('#bcd2d3');
      scene.environment = environment.texture;
      renderer.toneMappingExposure = 1;
      camera.near = 0.02;
      camera.far = 500;
      camera.updateProjectionMatrix();
      controls.minDistance = 0.3;
      controls.maxDistance = 50;
      controls.maxPolarAngle = Math.PI * 0.95;
      controls.enabled = true;
      document.body.classList.add('indoor-active');
      button('locate').hidden = button('enter').hidden = true;
      button('reset').hidden = button('exit').hidden = false;
      status.textContent = 'Atrium 9845 · indoors';
      help.textContent =
        'Drag to orbit · scroll to zoom · click drawers, doors and windows. Use Back to city to return outside.';
      frameRoom();
    } catch (error) {
      if (!disposed) {
        disposeRoot();
        status.textContent = `Could not load Atrium: ${error.message}. You can retry.`;
      }
    } finally {
      loading = false;
      button('enter').disabled = false;
      invalidate();
    }
  }
  function exit() {
    if (!active) return;
    active = false;
    root.visible = false;
    saved.visibility.forEach(([o, visible]) => {
      o.visible = visible;
    });
    scene.background = saved.background;
    scene.environment = saved.environment;
    renderer.toneMappingExposure = saved.exposure;
    camera.near = saved.near;
    camera.far = saved.far;
    camera.updateProjectionMatrix();
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    controls.target.copy(saved.target);
    for (const key of ['minDistance', 'maxDistance', 'maxPolarAngle', 'enabled'])
      controls[key] = saved[key];
    controls.update();
    document.body.classList.remove('indoor-active');
    button('locate').hidden = button('enter').hidden = false;
    button('reset').hidden = button('exit').hidden = true;
    status.textContent = 'Atrium 9845 · interactive indoor scene';
    help.textContent =
      'Explore the city, then enter Atrium to look around the room and try its moving parts.';
    canvas.style.cursor = oldCursor;
    invalidate();
  }
  function cast(event, objects) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    return raycaster.intersectObjects(objects, true);
  }
  function onDown(e) {
    if (e.button === 0) tap = { x: e.clientX, y: e.clientY, time: performance.now() };
  }
  function visible(object) {
    for (let p = object; p; p = p.parent) if (!p.visible) return false;
    return true;
  }
  function onUp(e) {
    const start = tap;
    tap = null;
    if (e.button !== 0 || !isTap(start, { x: e.clientX, y: e.clientY, time: performance.now() }))
      return;
    if (active) {
      const hit = cast(e, [root]).find((h) => visible(h.object));
      const entry = hit && articulation.find(hit.object);
      if (entry) {
        articulation.toggle(entry);
        status.textContent = `${entry.target ? 'Opening' : 'Closing'} ${entry.label}`;
        invalidate();
      }
    } else if (cast(e, [pin]).length) enter();
  }
  function onKey(e) {
    if (e.key === 'Escape' && active) exit();
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKey);
  button('locate').onclick = locate;
  button('enter').onclick = enter;
  button('reset').onclick = frameRoom;
  button('exit').onclick = exit;
  function disposeRoot() {
    articulation?.dispose();
    articulation = null;
    if (root) {
      root.removeFromParent();
      const resources = new Set();
      root.traverse((o) => {
        if (!o.isMesh) return;
        resources.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          resources.add(m);
          for (const value of Object.values(m)) if (value?.isTexture) resources.add(value);
        }
      });
      resources.forEach((r) => r.dispose());
      root = null;
    }
    environment?.dispose();
    environment = null;
    pmrem?.dispose();
    pmrem = null;
  }
  return {
    config,
    panel,
    locate,
    enter,
    exit,
    get active() {
      return active;
    },
    get root() {
      return root;
    },
    get articulation() {
      return articulation;
    },
    tick(dt) {
      const changed = active && articulation?.tick(dt);
      if (changed) invalidate();
      return changed;
    },
    dispose() {
      if (disposed) return;
      exit();
      disposed = true;
      abort.abort();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onKey);
      panel.remove();
      marker.removeFromParent();
      outline.geometry.dispose();
      outline.material.dispose();
      pin.geometry.dispose();
      pin.material.dispose();
      disposeRoot();
      draco.dispose();
    },
  };
}
