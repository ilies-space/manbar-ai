// three.js stage: renderer, camera, lights, character loading

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export async function createStage(canvas, { modelUrl = "assets/character/translator.glb", controls = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();

  // brand-navy backdrop with a soft violet halo behind the signer
  const bg = new THREE.Color("#0A0722");
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 6, 14);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.45, 3.1);

  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(1.6, 2.6, 2.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8b7cf6, 1.1);
  fill.position.set(-2.2, 1.4, 1.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xb7abfa, 1.6);
  rim.position.set(0, 2.2, -2.6);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x6a5f9e, 0.75));

  // halo disc + floor
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 48),
    new THREE.MeshBasicMaterial({ color: 0x2b2160, transparent: true, opacity: 0.55 })
  );
  halo.position.set(0, 1.25, -1.4);
  scene.add(halo);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 48),
    new THREE.MeshBasicMaterial({ color: 0x161036, transparent: true, opacity: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  let orbit = null;
  if (controls) {
    orbit = new OrbitControls(camera, canvas);
    orbit.target.set(0, 1.25, 0);
    orbit.update();
  }

  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const character = gltf.scene;
  scene.add(character);

  // Skinned vertices follow the SKELETON's world scale, not the mesh node's —
  // so measure in bind space (geometry bbox lives in the same space as the
  // bones) and scale the whole root to ~1.7m.
  const gBox = new THREE.Box3();
  character.traverse(o => {
    if (o.isSkinnedMesh) {
      o.geometry.computeBoundingBox();
      gBox.union(o.geometry.boundingBox);
      o.frustumCulled = false;
    }
  });
  const rawSize = gBox.getSize(new THREE.Vector3());
  const s = 1.7 / (rawSize.y || 1.7);
  character.scale.setScalar(s);
  const center = gBox.getCenter(new THREE.Vector3()).multiplyScalar(s);
  character.position.x -= center.x;
  character.position.z -= center.z;
  character.position.y -= gBox.min.y * s;
  character.rotation.y = -Math.PI / 2;   // model's forward axis is +X
  const h = 1.7;

  // responsive framing: fit head + signing space; on narrow screens trade
  // outer arm reach for a bigger avatar so finger detail stays readable
  function fitCamera() {
    const aspect = camera.aspect || 1;
    const narrow = aspect < 0.95;
    const top = h * 1.08;
    const bottom = h * (narrow ? 0.42 : 0.36);
    const halfW = THREE.MathUtils.clamp(0.62 * aspect, 0.44, 0.62);
    const lookY = (top + bottom) / 2;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const dH = (top - bottom) / 2 / Math.tan(vFov / 2);
    const dW = halfW / (Math.tan(vFov / 2) * aspect);
    const dist = Math.max(dH, dW) * 1.04;
    camera.position.set(0, lookY + 0.02, dist);
    camera.lookAt(0, lookY, 0);
    halo.position.y = lookY;
  }
  camera.fov = 30;
  camera.updateProjectionMatrix();
  fitCamera();
  if (orbit) { orbit.target.set(0, h * 0.72, 0); orbit.update(); }
  halo.scale.setScalar(h / 1.7);

  function resize() {
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    if (!w || !hh) return;
    if (canvas.width !== w * renderer.getPixelRatio() || canvas.height !== hh * renderer.getPixelRatio()) {
      renderer.setSize(w, hh, false);
      camera.aspect = w / hh;
      camera.updateProjectionMatrix();
      fitCamera();
    }
  }

  const clock = new THREE.Clock();
  const tickers = [];
  let fps = 0, frames = 0, fpsAt = performance.now();

  function loop() {
    requestAnimationFrame(loop);
    resize();
    const dt = Math.min(clock.getDelta(), 0.1);
    for (const fn of tickers) fn(dt);
    if (orbit) orbit.update();
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - fpsAt > 1000) { fps = frames; frames = 0; fpsAt = now; }
  }
  loop();

  return {
    THREE, renderer, scene, camera, character, gltf,
    onTick: fn => tickers.push(fn),
    getFps: () => fps
  };
}
