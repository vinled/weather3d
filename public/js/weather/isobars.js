import * as THREE from 'three';
import { threeDToLatLon, latLonTo3D } from '../utils/geo.js';

export class IsobarsSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'synoptic-isobars';
    this.scene.add(this.group);

    this.visible = true;
    this.stations = [];
    this.gridRes = 32;
    this.pressureGrid = new Float32Array(this.gridRes * this.gridRes);

    // Isobar pressure levels in hPa (standard meteorological 4 hPa spacing)
    this.levels = [1004, 1008, 1012, 1016, 1020, 1024];
    this.isobarLinesMesh = null;
    this.labelSprites = [];

    this.init();
  }

  init() {
    this.group.visible = this.visible;
  }

  setWeatherData(stations) {
    if (!stations || !Array.isArray(stations) || stations.length === 0) return;
    this.stations = stations;
    this.generateIsobars();
  }

  generateIsobars() {
    // 1. Clear previous isobars and labels
    while (this.group.children.length > 0) {
      const obj = this.group.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material && obj.material.map) obj.material.map.dispose();
      this.group.remove(obj);
    }
    this.labelSprites = [];

    const res = this.gridRes;
    const stationsWithPressure = this.stations.filter(s => s.weather && s.weather.pressure_msl);
    if (stationsWithPressure.length < 3) return;

    // 2. Interpolate pressure across 2D spatial grid (x from -68 to 68, z from -68 to 68)
    for (let gz = 0; gz < res; gz++) {
      const normZ = gz / (res - 1);
      const z = (0.5 - normZ) * 136;

      for (let gx = 0; gx < res; gx++) {
        const normX = gx / (res - 1);
        const x = (normX - 0.5) * 136;

        const { lat, lon } = threeDToLatLon(x, z);

        let sumWeight = 0;
        let sumPressure = 0;

        for (const st of stationsWithPressure) {
          const dLat = lat - st.lat;
          const dLon = lon - st.lon;
          const distSq = dLat * dLat + dLon * dLon + 0.12;
          const weight = 1.0 / distSq;

          sumPressure += st.weather.pressure_msl * weight;
          sumWeight += weight;
        }

        this.pressureGrid[gz * res + gx] = sumPressure / sumWeight;
      }
    }

    // 3. Marching Squares contour extraction for each isobar level
    const lineSegments = [];

    for (const level of this.levels) {
      const segmentsForLevel = [];

      for (let gz = 0; gz < res - 1; gz++) {
        for (let gx = 0; gx < res - 1; gx++) {
          const x0 = ((gx / (res - 1)) - 0.5) * 136;
          const x1 = (((gx + 1) / (res - 1)) - 0.5) * 136;
          const z0 = (0.5 - (gz / (res - 1))) * 136;
          const z1 = (0.5 - ((gz + 1) / (res - 1))) * 136;

          const p00 = this.pressureGrid[gz * res + gx];
          const p10 = this.pressureGrid[gz * res + gx + 1];
          const p01 = this.pressureGrid[(gz + 1) * res + gx];
          const p11 = this.pressureGrid[(gz + 1) * res + gx + 1];

          // Compute square vertex states (above/below isobar level)
          let caseIndex = 0;
          if (p00 >= level) caseIndex |= 1;
          if (p10 >= level) caseIndex |= 2;
          if (p11 >= level) caseIndex |= 4;
          if (p01 >= level) caseIndex |= 8;

          if (caseIndex === 0 || caseIndex === 15) continue; // All above or all below

          // Edge interpolations
          const interp = (vA, vB, posA, posB) => {
            const t = Math.max(0, Math.min(1, (level - vA) / (vB - vA || 0.001)));
            return posA + (posB - posA) * t;
          };

          const top = { x: interp(p00, p10, x0, x1), z: z0 };
          const right = { x: x1, z: interp(p10, p11, z0, z1) };
          const bottom = { x: interp(p01, p11, x0, x1), z: z1 };
          const left = { x: x0, z: interp(p00, p01, z0, z1) };

          const addSeg = (pA, pB) => {
            const yA = Math.max(0.04, this.terrain.getElevationAt(pA.x, pA.z)) + 0.12;
            const yB = Math.max(0.04, this.terrain.getElevationAt(pB.x, pB.z)) + 0.12;
            lineSegments.push(pA.x, yA, pA.z, pB.x, yB, pB.z);
            segmentsForLevel.push({ x: (pA.x + pB.x) / 2, y: (yA + yB) / 2, z: (pA.z + pB.z) / 2 });
          };

          switch (caseIndex) {
            case 1: case 14: addSeg(left, top); break;
            case 2: case 13: addSeg(top, right); break;
            case 3: case 12: addSeg(left, right); break;
            case 4: case 11: addSeg(right, bottom); break;
            case 5: addSeg(left, top); addSeg(right, bottom); break;
            case 6: case 9:  addSeg(top, bottom); break;
            case 7: case 8:  addSeg(left, bottom); break;
            case 10: addSeg(left, bottom); addSeg(top, right); break;
          }
        }
      }

      // Add 1-2 floating labels per isobar level
      if (segmentsForLevel.length > 8) {
        const midIdx = Math.floor(segmentsForLevel.length * 0.4);
        const pt = segmentsForLevel[midIdx];
        this.createIsobarBadge(`${level} hPa`, pt.x, pt.y + 0.35, pt.z);
      }
    }

    if (lineSegments.length === 0) return;

    // 4. Render line segments
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lineSegments, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0x93c5fd, // Clean light blue-cyan
      transparent: true,
      opacity: 0.52,
      depthWrite: false
    });

    this.isobarLinesMesh = new THREE.LineSegments(geo, mat);
    this.group.add(this.isobarLinesMesh);
  }

  createIsobarBadge(text, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 36;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.roundRect(4, 4, 88, 28, 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#93c5fd';
    ctx.stroke();

    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#e0f2fe';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 48, 18);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.4, 0.9, 1);
    sprite.position.set(x, y, z);
    this.group.add(sprite);
    this.labelSprites.push(sprite);
  }

  update(time) {
    if (!this.group.visible) return;
    // Gentle breathing pulse
    const pulse = 0.50 + Math.sin(time * 1.2) * 0.06;
    if (this.isobarLinesMesh) {
      this.isobarLinesMesh.material.opacity = pulse;
    }
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }
}
