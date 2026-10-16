/* Adapted from LiteReality-Agent's Apache-2.0 viewer at
 * 28ffe1fd4a1b03c93f1877a33a8bc9b806f72fe1. See indoor-NOTICE.txt.
 * Uses the existing render loop and camera. These are presentation animations,
 * not a physics replay and not samples on the city's simulation timeline. */
import * as THREE from 'three';

export function createArticulation(root, clips, ranges = {}) {
  const mixer = new THREE.AnimationMixer(root);
  const entries = [];
  const targets = new Map();
  for (const clip of clips) {
    const [start, end] = ranges[clip.name] ?? [0, clip.duration];
    if (!(start >= 0 && end > start && end <= clip.duration + 1e-6))
      throw new Error(`Invalid opening interval: ${clip.name}`);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    action.time = start;
    const entry = {
      action,
      start,
      duration: end - start,
      phase: 0,
      target: 0,
      label: clip.name.replace(/_(swing|slide|open|move)$/i, '').replaceAll('_', ' '),
    };
    entries.push(entry);
    for (const track of clip.tracks) {
      const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
      const node = name && THREE.PropertyBinding.findNode(root, name);
      if (node) targets.set(node, entry);
    }
  }
  mixer.update(0);
  return {
    entries,
    find(object) {
      for (let node = object; node; node = node.parent)
        if (targets.has(node)) return targets.get(node);
      return null;
    },
    toggle(entry) {
      entry.target = 1 - entry.target;
    },
    tick(dt) {
      let changed = false;
      for (const entry of entries) {
        if (entry.phase === entry.target) continue;
        const step = dt / Math.min(Math.max(entry.duration, 0.7), 1.6);
        entry.phase =
          entry.phase < entry.target
            ? Math.min(entry.target, entry.phase + step)
            : Math.max(entry.target, entry.phase - step);
        entry.action.time = entry.start + entry.phase ** 2 * (3 - 2 * entry.phase) * entry.duration;
        changed = true;
      }
      if (changed) mixer.update(0);
      return changed;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      targets.clear();
    },
  };
}
