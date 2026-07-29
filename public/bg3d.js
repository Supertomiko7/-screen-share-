import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('bg-canvas');
if (canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  const CAMERA_BASE = new THREE.Vector3(0, 0.6, 6.5);
  camera.position.copy(CAMERA_BASE);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene.add(new THREE.AmbientLight(0x6a7aff, 0.8));
  const keyLight = new THREE.DirectionalLight(0x8fb2ff, 1.2);
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x5865f2, 2, 15);
  rimLight.position.set(-4, 2, -1);
  scene.add(rimLight);

  // --- Character (your model), base position it bobs/turns around ---
  const CHAR_BASE_X = 1.7;
  const CHAR_BASE_Y = -0.6;
  const characterGroup = new THREE.Group();
  characterGroup.position.set(CHAR_BASE_X, CHAR_BASE_Y, 0);
  characterGroup.rotation.y = -0.4;
  scene.add(characterGroup);

  let mixer = null;
  let actions = [];
  let activeActionIndex = 0;
  let clipTimer = 0;
  const CLIP_HOLD = 4; // seconds to play each baked animation before crossfading to the next
  let burst = 0; // 0..1 decaying flash triggered whenever the clip switches
  let modelRef = null;
  let restDiagonal = 3;
  const badClipIndices = new Set();
  let pendingClipCheck = null; // { checkAt: seconds, index }

  new GLTFLoader().load(
    '/assets/character.glb',
    (gltf) => {
      const model = gltf.scene;
      modelRef = model;

      // The source file has scene dressing that isn't part of the character —
      // a giant 200x200 reference "Plane" (this was the blue wedge filling the
      // page) and an "Empty" holding a watermark "Text" mesh. Strip them so
      // sizing/centering below is based on the actual character (Armature) only.
      ['Plane', 'Empty'].forEach((name) => {
        const junk = model.getObjectByName(name);
        if (junk && junk.parent) junk.parent.remove(junk);
      });

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      let scale = 2.6 / (size.y || 1);
      // A malformed export (bad bone parenting, degenerate rest pose) can make
      // this bounding box tiny or huge, which used to blow the model up to fill
      // (and hide) the whole page. Clamp it so a bad file fails safe instead.
      if (!Number.isFinite(scale) || scale <= 0 || scale > 50) {
        console.warn(`character.glb bounding box looks broken (height=${size.y}) — using fallback scale. Re-export the model to fix this properly.`);
        scale = 1;
      }
      model.scale.setScalar(scale);

      const box2 = new THREE.Box3().setFromObject(model);
      const center2 = new THREE.Vector3();
      box2.getCenter(center2);
      if (Number.isFinite(center2.x) && Number.isFinite(center2.z) && Number.isFinite(box2.min.y)) {
        model.position.x -= center2.x;
        model.position.z -= center2.z;
        model.position.y -= box2.min.y;
      }

      characterGroup.add(model);

      const finalSize = new THREE.Vector3();
      new THREE.Box3().setFromObject(model).getSize(finalSize);
      if (Number.isFinite(finalSize.length()) && finalSize.length() > 0) restDiagonal = finalSize.length();

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        actions = gltf.animations.map((clip) => {
          const action = mixer.clipAction(clip);
          action.loop = THREE.LoopRepeat;
          return action;
        });
        actions[0].play();
      }
    },
    undefined,
    (err) => console.error('Failed to load character.glb', err)
  );

  // --- Audio-reactive "energy" — taps the actual stream so the background
  // visibly responds to how loud/active the share is, not just a fixed loop ---
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let energyRaw = 0;
  let energySmoothed = 0;

  function setupAudioReactivity(stream) {
    try {
      if (!stream || !stream.getAudioTracks().length) return;
      if (audioCtx) return; // already wired up
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      audioCtx.resume().catch(() => {});
      // Exposed so a later user gesture (e.g. the viewer's unmute tap) can
      // resume the context if autoplay policy started it suspended.
      window.__bgAudioCtx = audioCtx;
    } catch (err) {
      console.warn('Background audio reactivity unavailable:', err);
    }
  }
  window.addEventListener('stream-ready', (e) => setupAudioReactivity(e.detail));

  // --- Ambient floating particles ---
  const particleCount = 200;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 3;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0x8fe3ff, size: 0.035, transparent: true, opacity: 0.55 });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const t = clock.elapsedTime;

    // Cycle through every baked animation clip instead of looping just the
    // first one, crossfading so the character stays visibly active.
    if (actions.length > 1 && badClipIndices.size < actions.length) {
      clipTimer += delta;
      if (clipTimer > CLIP_HOLD) {
        clipTimer = 0;
        let nextIndex = (activeActionIndex + 1) % actions.length;
        let attempts = 0;
        while (badClipIndices.has(nextIndex) && attempts < actions.length) {
          nextIndex = (nextIndex + 1) % actions.length;
          attempts++;
        }
        if (nextIndex !== activeActionIndex) {
          actions[nextIndex].reset().play();
          actions[activeActionIndex].crossFadeTo(actions[nextIndex], 0.6, false);
          activeActionIndex = nextIndex;
          burst = 1;
          pendingClipCheck = { checkAt: t + 0.4, index: nextIndex };
        }
      }
    }
    burst = Math.max(0, burst - delta * 1.6);

    if (analyser && freqData) {
      analyser.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) sum += freqData[i];
      energyRaw = sum / freqData.length / 255;
    }
    energySmoothed += (energyRaw - energySmoothed) * 0.15;

    const ambientPulse = 0.5 + 0.5 * Math.sin(t * 0.8);
    const pulse = Math.min(1, energySmoothed * 0.85 + ambientPulse * 0.15 + burst * 0.6);

    characterGroup.position.y = CHAR_BASE_Y + Math.sin(t * 1.2) * 0.15 * (1 + pulse * 0.8);
    characterGroup.rotation.y = -0.4 + Math.sin(t * 0.5) * 0.25;

    if (mixer) mixer.update(delta);

    // If the clip we just switched to blows the model's on-screen size up
    // (a corrupted bone from a bad export), bail out of it immediately
    // instead of leaving a giant broken mesh covering the page.
    if (pendingClipCheck && t >= pendingClipCheck.checkAt && modelRef) {
      const liveSize = new THREE.Vector3();
      new THREE.Box3().setFromObject(modelRef).getSize(liveSize);
      const diagonal = liveSize.length();
      if (!Number.isFinite(diagonal) || diagonal > restDiagonal * 6) {
        console.warn(`character.glb animation clip ${pendingClipCheck.index} looks broken (blew up to ${diagonal.toFixed ? diagonal.toFixed(1) : diagonal} units) — skipping it from now on.`);
        badClipIndices.add(pendingClipCheck.index);
        const fallback = actions.findIndex((_, i) => !badClipIndices.has(i));
        if (fallback !== -1 && fallback !== activeActionIndex) {
          actions[fallback].reset().play();
          actions[activeActionIndex].crossFadeTo(actions[fallback], 0.3, false);
          activeActionIndex = fallback;
        }
      }
      pendingClipCheck = null;
    }

    particleMat.size = 0.035 + pulse * 0.05;
    particleMat.opacity = Math.min(1, 0.5 + pulse * 0.4);
    particles.rotation.y = t * (0.02 + pulse * 0.08);

    rimLight.intensity = 2 + pulse * 7;
    keyLight.intensity = 1.2 + pulse * 1.2;
    const hue = (0.62 + t * 0.015 + pulse * 0.08) % 1;
    rimLight.color.setHSL(hue, 0.75, 0.6);

    camera.position.x = CAMERA_BASE.x + (Math.random() - 0.5) * pulse * 0.06;
    camera.position.y = CAMERA_BASE.y + (Math.random() - 0.5) * pulse * 0.04;

    renderer.render(scene, camera);
  }
  animate();
}
