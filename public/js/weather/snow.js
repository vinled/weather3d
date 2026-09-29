import * as THREE from 'three';
import { latLonTo3D } from '../utils/geo.js';

export class SnowLayer {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.visible = false;
    this.group = new THREE.Group();
    this.group.name = 'weather-snow';
    this.scene.add(this.group);

    this.flakeCount = 7000;
    this.particles = null;
    this.flakeData = [];
    this.snowCenters = [];

    this.init();
  }

  init() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.flakeCount * 3);
    const colors = new Float32Array(this.flakeCount * 3);
    const sizes = new Float32Array(this.flakeCount);

    // Initial default fallback
    this.snowCenters = [
      { x: 0, z: 0, radius: 10 }
    ];

    for (let i = 0; i < this.flakeCount; i++) {
      const center = this.snowCenters[0];
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * center.radius;

      const x = center.x + Math.cos(angle) * dist;
      const z = center.z + Math.sin(angle) * dist;
      const ground = this.terrain.getElevationAt(x, z);
      const y = ground + Math.random() * 20;

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      colors[i * 3 + 0] = 0.94;
      colors[i * 3 + 1] = 0.97;
      colors[i * 3 + 2] = 1.0;

      sizes[i] = 2.5 + Math.random() * 2.5;

      this.flakeData.push({
        origCenter: center,
        speedY: 0.08 + Math.random() * 0.07,
        swaySpeed: 1.5 + Math.random() * 2.0,
        swayRadius: 0.15 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Crisp soft snowflake canvas texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.4, 'rgba(235, 245, 255, 0.85)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      size: 0.75,
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(geo, mat);
    this.group.add(this.particles);
    this.group.visible = this.visible;
  }

  setWeatherData(stations) {
    if (!stations || !Array.isArray(stations) || stations.length === 0) return;

    const coldStations = [];
    let minTemp = 999;

    stations.forEach(st => {
      const isSnowCode = [71, 73, 75, 77, 85, 86].includes(st.weather.weather_code);
      if (st.weather.temperature_2m < 5 || isSnowCode) {
        const { x, z } = latLonTo3D(st.lat, st.lon);
        coldStations.push({ x, z, radius: 12 + Math.random() * 4 });
        if (st.weather.temperature_2m < minTemp) {
          minTemp = st.weather.temperature_2m;
        }
      }
    });

    if (coldStations.length === 0) {
      if (this.particles) this.particles.visible = false;
      return;
    }

    if (this.particles) this.particles.visible = true;
    this.snowCenters = coldStations;

    // Modulate opacity based on temperature
    let intensity = Math.max(0.1, Math.min(1.0, (5 - minTemp) / 10 + 0.3));
    if (this.particles) {
      this.particles.material.opacity = 0.88 * intensity;
    }
    
    // Assign flakes to new centers
    for (let i = 0; i < this.flakeCount; i++) {
        this.flakeData[i].origCenter = this.snowCenters[i % this.snowCenters.length];
    }
  }

  update(delta, time) {
    if (!this.group.visible || !this.particles || !this.particles.visible) return;

    const pos = this.particles.geometry.attributes.position.array;

    for (let i = 0; i < this.flakeCount; i++) {
      const fd = this.flakeData[i];
      let x = pos[i * 3 + 0];
      let y = pos[i * 3 + 1];
      let z = pos[i * 3 + 2];

      // Gentle downward float + graceful sinusoidal sway
      y -= fd.speedY * (delta * 60);
      x += Math.sin(time * fd.swaySpeed + fd.phase) * fd.swayRadius * 0.05;
      z += Math.cos(time * fd.swaySpeed + fd.phase) * fd.swayRadius * 0.05;

      const ground = this.terrain.getElevationAt(x, z);

      if (y <= ground) {
        // Reset flake above high terrain
        const center = fd.origCenter;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * center.radius;

        x = center.x + Math.cos(angle) * dist;
        z = center.z + Math.sin(angle) * dist;
        y = this.terrain.getElevationAt(x, z) + 16 + Math.random() * 8;
      }

      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  show() {
    this.visible = true;
    this.group.visible = true;
  }

  hide() {
    this.visible = false;
    this.group.visible = false;
  }
}
