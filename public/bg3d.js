import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('bg-canvas');
if (canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.6, 6.5);

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

  new GLTFLoader().load(
    '/assets/character.glb',
    (gltf) => {
      const model = gltf.scene;

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = 2.6 / (size.y || 1);
      model.scale.setScalar(scale);

      const box2 = new THREE.Box3().setFromObject(model);
      const center2 = new THREE.Vector3();
      box2.getCenter(center2);
      model.position.x -= center2.x;
      model.position.z -= center2.z;
      model.position.y -= box2.min.y;

      characterGroup.add(model);

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(gltf.animations[0]).play();
      }
    },
    undefined,
    (err) => console.error('Failed to load character.glb', err)
  );

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

    characterGroup.position.y = CHAR_BASE_Y + Math.sin(t * 1.2) * 0.15;
    characterGroup.rotation.y = -0.4 + Math.sin(t * 0.5) * 0.25;

    if (mixer) mixer.update(delta);
    particles.rotation.y = t * 0.02;

    renderer.render(scene, camera);
  }
  animate();
}
