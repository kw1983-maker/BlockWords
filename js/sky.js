// Day/night: sky colour, fog, sun and moon, stars, clouds, and the single
// uDaylight uniform that dims every block face at dusk. Nothing here touches
// chunk geometry, so nightfall never costs a remesh.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const DAY_LENGTH = 1200; // seconds for a full cycle (20 minutes)

const DAY_SKY = new THREE.Color(0x88ccf5);
const DUSK_SKY = new THREE.Color(0xe08a4a);
const NIGHT_SKY = new THREE.Color(0x080c1c);

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rnd = mulberry32(9182736);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rnd() * 120), y = Math.floor(rnd() * 120);
    const w = 8 + Math.floor(rnd() * 24), h = 6 + Math.floor(rnd() * 14);
    g.fillRect(x, y, w, h);          // blocky clouds, like the originals
    g.fillRect(x + 4, y - 4, w - 8, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.repeat.set(6, 6);
  return t;
}

function discTexture(colour, glow) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = colour;
  g.fillRect(8, 8, 48, 48);
  if (glow) {
    g.globalAlpha = 0.35;
    g.fillRect(2, 2, 60, 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export class Sky {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.time = 0.28 * DAY_LENGTH; // start mid-morning
    this.daylight = 1;

    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sun.position.set(60, 100, 30);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(this.ambient);

    // Sun and moon ride a group that spins once per day.
    this.celestial = new THREE.Group();
    scene.add(this.celestial);
    const sunMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ map: discTexture('#fff6c8', true), transparent: true, depthWrite: false, fog: false })
    );
    sunMesh.position.set(0, 0, -300);
    sunMesh.rotation.y = Math.PI;
    this.celestial.add(sunMesh);
    const moonMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ map: discTexture('#e6ecff', false), transparent: true, depthWrite: false, fog: false })
    );
    moonMesh.position.set(0, 0, 300);
    this.celestial.add(moonMesh);
    this.sunMesh = sunMesh;
    this.moonMesh = moonMesh;

    // Stars
    const rnd = mulberry32(4242);
    const pts = [];
    for (let i = 0; i < 700; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pts.push(Math.cos(th) * r * 340, u * 340, Math.sin(th) * r * 340);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
    }));
    scene.add(this.stars);

    // Clouds
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshBasicMaterial({
        map: cloudTexture(), transparent: true, opacity: 0.75,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      })
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 118;
    scene.add(this.clouds);

    this.skyColour = new THREE.Color();
  }

  // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  get phase() { return (this.time % DAY_LENGTH) / DAY_LENGTH; }

  setPhase(p) { this.time = p * DAY_LENGTH; }

  update(dt, camera, renderer) {
    this.time += dt;
    const p = this.phase;
    // Height of the sun above the horizon, -1..1
    const sunY = -Math.cos(p * Math.PI * 2);
    const day = THREE.MathUtils.clamp(sunY * 2.2 + 0.45, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(sunY) * 5, 0, 1);

    this.daylight = 0.22 + 0.78 * day;
    this.materials.sync('uDaylight', this.daylight);

    this.skyColour.copy(NIGHT_SKY).lerp(DAY_SKY, day);
    this.skyColour.lerp(DUSK_SKY, dusk * 0.55);
    this.scene.background = this.skyColour;
    this.materials.solid.uniforms.uFogColor.value.copy(this.skyColour);

    this.sun.intensity = 0.15 + 0.85 * day;
    this.ambient.intensity = 0.25 + 0.4 * day;
    this.sun.color.setHSL(0.12, dusk * 0.5, 0.5 + 0.5 * day);

    // Everything in the sky rides with the camera so it never gets closer.
    this.celestial.position.copy(camera.position);
    this.celestial.rotation.x = p * Math.PI * 2;
    this.stars.position.copy(camera.position);
    this.stars.rotation.x = p * Math.PI * 2;
    this.stars.material.opacity = THREE.MathUtils.clamp(1 - day * 2.4, 0, 1);
    this.sunMesh.lookAt(this.celestial.position);

    this.sun.position.copy(camera.position).add(
      new THREE.Vector3(Math.sin(p * Math.PI * 2) * 100, Math.max(12, sunY * 120), 40)
    );
    this.sun.target.position.copy(camera.position);

    this.clouds.position.x = camera.position.x;
    this.clouds.position.z = camera.position.z + this.time * 0.35;
    this.clouds.material.opacity = 0.15 + 0.6 * day;
  }

  setFogDistance(renderDistanceChunks) {
    const far = renderDistanceChunks * 16 - 8;
    this.materials.sync('uFogNear', far * 0.55);
    this.materials.sync('uFogFar', far);
  }

  // Human-readable clock for the debug overlay.
  clock() {
    const t = (this.phase * 24 + 6) % 24;
    const h = Math.floor(t), m = Math.floor((t - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
}
