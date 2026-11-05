import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { orbitPosition } from "./orbit";

declare global {
  interface Window {
    __keeper: { tick: number; step(n: number): void };
  }
}

const canvas = document.createElement("canvas");
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
document.body.append(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0806);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
const lookAt = new THREE.Vector3(0, 0, 0);

const GRID = 9;
const HALF = 4;
for (let z = 0; z < GRID; z += 1) {
  for (let x = 0; x < GRID; x += 1) {
    const lx = x - HALF;
    const lz = z - HALF;
    const gold = lx === 1 && lz === 0;
    const claimed = Math.abs(lx) <= 1 && Math.abs(lz) <= 1;
    const height = gold ? 1 : claimed ? 0.2 : 1;
    const geometry = new THREE.BoxGeometry(1, height, 1);
    const color = gold ? 0xc9a227 : claimed ? 0x6a5340 : 0x2a1d14;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
    mesh.position.set(lx, height / 2, lz);
    scene.add(mesh);
  }
}

scene.add(new THREE.AmbientLight(0x3a3228, 0.4));
const torch = new THREE.PointLight(0xffbb77, 60, 24);
torch.position.set(0, 5, 0);
scene.add(torch);

const proof = new URLSearchParams(window.location.search).has("proof");

function placeCamera(tick: number): void {
  const pos = orbitPosition(tick);
  camera.position.set(pos.x, pos.y, pos.z);
  camera.lookAt(lookAt);
}

function render(): void {
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (proof) {
    render();
  }
});

if (proof) {
  let tick = 0;
  placeCamera(tick);
  render();
  window.__keeper = {
    get tick() {
      return tick;
    },
    step(n: number) {
      tick += n;
      placeCamera(tick);
      render();
    },
  };
} else {
  placeCamera(0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(lookAt);
  controls.update();
  const loop = () => {
    requestAnimationFrame(loop);
    controls.update();
    render();
  };
  loop();
}
