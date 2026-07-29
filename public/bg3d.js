(() => {
  if (typeof THREE === 'undefined') return;
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.6, 6.5);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene.add(new THREE.AmbientLight(0x6a7aff, 0.7));
  const keyLight = new THREE.DirectionalLight(0x8fb2ff, 1.1);
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x5865f2, 2, 15);
  rimLight.position.set(-4, 2, -1);
  scene.add(rimLight);

  // --- Procedural low-poly character (generic, no licensed assets) ---
  const character = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a56d6, flatShading: true, roughness: 0.55, metalness: 0.25 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x8fe3ff, flatShading: true, roughness: 0.4, metalness: 0.35, emissive: 0x1a3550, emissiveIntensity: 0.4 });

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), accentMat);
  head.position.y = 1.5;
  character.add(head);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.38, 1.25, 6), bodyMat);
  torso.position.y = 0.55;
  character.add(torso);

  const ArmGeo = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(0.12, 0.85, 4, 6)
    : new THREE.CylinderGeometry(0.12, 0.12, 0.85, 6);

  const armL = new THREE.Mesh(ArmGeo, accentMat);
  armL.position.set(-0.68, 0.65, 0);
  armL.rotation.z = 0.3;
  character.add(armL);

  const armR = new THREE.Mesh(ArmGeo, accentMat);
  armR.position.set(0.68, 0.65, 0);
  armR.rotation.z = -0.3;
  character.add(armR);

  const legGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.85, 6);
  const legL = new THREE.Mesh(legGeo, bodyMat);
  legL.position.set(-0.23, -0.5, 0);
  character.add(legL);

  const legR = new THREE.Mesh(legGeo, bodyMat);
  legR.position.set(0.23, -0.5, 0);
  character.add(legR);

  character.position.set(1.7, -0.4, 0);
  character.rotation.y = -0.4;
  scene.add(character);

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
    const t = clock.getElapsedTime();

    character.position.y = -0.4 + Math.sin(t * 1.2) * 0.15;
    character.rotation.y = -0.4 + Math.sin(t * 0.5) * 0.25;
    armL.rotation.z = 0.3 + Math.sin(t * 2) * 0.15;
    armR.rotation.z = -0.3 - Math.sin(t * 2) * 0.15;

    particles.rotation.y = t * 0.02;

    renderer.render(scene, camera);
  }
  animate();
})();
