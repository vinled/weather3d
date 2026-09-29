import * as THREE from 'three';
import { threeDToLatLon } from '../utils/geo.js';
import { isPointInBrazil } from '../data/brazilData.js';

export class TemperatureLayer {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.visible = false;
    this.group = new THREE.Group();
    this.group.name = 'weather-temperature';
    this.scene.add(this.group);

    this.mesh = null;
    this.stations = [];
    this.resolution = 90;

    this.init();
  }

  init() {
    const geo = new THREE.PlaneGeometry(140, 140, this.resolution, this.resolution);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const count = pos.count;
    const colors = new Float32Array(count * 3);

    // Initial neutral color
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.terrain.getElevationAt(x, z) + 0.035;
      pos.setY(i, y);

      colors[i * 3 + 0] = 0.2;
      colors[i * 3 + 1] = 0.6;
      colors[i * 3 + 2] = 0.8;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
    this.group.visible = this.visible;
  }

  /**
   * Color ramp for temperature in Celsius (Windy style)
   * <= 10°C: deep indigo/blue
   * 15°C: cyan
   * 20°C: light green / emerald
   * 25°C: yellow
   * 30°C: orange
   * >= 35°C: vivid red / coral
   */
  getTemperatureColor(tempC, col) {
    const t = Math.max(8, Math.min(38, tempC));

    if (t < 14) {
      // 8 to 14: Dark Blue to Cyan
      const factor = (t - 8) / 6;
      col.setRGB(0.1 + factor * 0.1, 0.3 + factor * 0.5, 0.7 + factor * 0.28);
    } else if (t < 20) {
      // 14 to 20: Cyan to Mint Green
      const factor = (t - 14) / 6;
      col.setRGB(0.2 - factor * 0.05, 0.8, 0.98 - factor * 0.45);
    } else if (t < 26) {
      // 20 to 26: Green to Amber Yellow
      const factor = (t - 20) / 6;
      col.setRGB(0.15 + factor * 0.8, 0.8 + factor * 0.1, 0.53 - factor * 0.4);
    } else if (t < 32) {
      // 26 to 32: Yellow to Vibrant Orange
      const factor = (t - 26) / 6;
      col.setRGB(0.95 + factor * 0.05, 0.9 - factor * 0.45, 0.13 - factor * 0.05);
    } else {
      // 32 to 38: Orange to Crimson Red
      const factor = (t - 32) / 6;
      col.setRGB(1.0, 0.45 - factor * 0.35, 0.08 + factor * 0.1);
    }

    return col;
  }

  setWeatherData(stations) {
    if (!this.visible) return;
    this.stations = stations;
    this.updateHeatmap();
  }

  updateHeatmap() {
    if (!this.mesh || !this.stations || this.stations.length === 0) return;

    const pos = this.mesh.geometry.attributes.position;
    const colors = this.mesh.geometry.attributes.color.array;
    const count = pos.count;
    
    const col = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const { lat, lon } = threeDToLatLon(x, z);

      // Inverse Distance Weighting (IDW) interpolation
      let totalWeight = 0;
      let weightedTemp = 0;

      for (const st of this.stations) {
        const dLat = lat - st.lat;
        const dLon = lon - st.lon;
        const distSq = dLat * dLat + dLon * dLon;
        const weight = 1.0 / (Math.pow(distSq, 1.1) + 0.05);

        const temp = st.weather.temperature_2m || 24;
        weightedTemp += temp * weight;
        totalWeight += weight;
      }

      let finalTemp = weightedTemp / totalWeight;

      // Elevation lapse rate: ~0.65°C colder per 100m elevation
      const elev = this.terrain.getElevation(lat, lon);
      if (elev > 0.10) {
        finalTemp -= (elev - 0.10) * 28.0;
      }

      this.getTemperatureColor(finalTemp, col);

      // Check if inside Brazil
      const inB = isPointInBrazil(lat, lon);
      if (!inB) {
        // Softly attenuate outside national border
        col.multiplyScalar(0.7);
      }

      colors[i * 3 + 0] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      // Re-align Y to terrain
      pos.setY(i, elev + 0.05);
    }

    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  show() {
    this.visible = true;
    this.group.visible = true;
    this.updateHeatmap();
  }

  hide() {
    this.visible = false;
    this.group.visible = false;
  }
}
