import * as THREE from 'three';
import { threeDToLatLon, latLonTo3D } from '../utils/geo.js';

export class RainLayer {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.visible = false;
    this.group = new THREE.Group();
    this.group.name = 'weather-rain';
    this.scene.add(this.group);

    // 4000 dynamic rain drops
    this.dropCount = 4000;
    this.rainLines = null;
    this.positions = null;
    this.colors = null;
    this.dropData = [];
    this.stations = [];
    this.activeRainCenters = [];

    // Subtle ground ripples
    this.rippleMesh = null;
    this.rippleData = [];

    // Precipitation Radar Heatmap (Windy.com Doppler style)
    this.heatmapMesh = null;
    this.heatmapResolution = 80; // 80x80 = 6,561 vertices
    this.heatmapVisible = true;

    this.init();
  }

  init() {
    // =========================================================================
    // 1. Precipitation Doppler Radar Heatmap (Windy.com style terrain overlay)
    // =========================================================================
    const heatGeo = new THREE.PlaneGeometry(140, 140, this.heatmapResolution, this.heatmapResolution);
    heatGeo.rotateX(-Math.PI / 2);

    const heatPos = heatGeo.attributes.position;
    const vertexCount = heatPos.count;
    const heatColors = new Float32Array(vertexCount * 3);
    const heatAlphas = new Float32Array(vertexCount);
    this.baseHeatmapY = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const x = heatPos.getX(i);
      const z = heatPos.getZ(i);
      const y = Math.max(0.015, this.terrain.getElevationAt(x, z)) + 0.035;
      heatPos.setY(i, y);
      this.baseHeatmapY[i] = y;

      heatColors[i * 3 + 0] = 0.02;
      heatColors[i * 3 + 1] = 0.71;
      heatColors[i * 3 + 2] = 0.83;
      heatAlphas[i] = 0.0;
    }

    heatGeo.setAttribute('color', new THREE.BufferAttribute(heatColors, 3));
    heatGeo.setAttribute('aAlpha', new THREE.BufferAttribute(heatAlphas, 1));
    heatGeo.computeVertexNormals();

    const heatMat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0.72 }
      },
      vertexShader: `
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, vAlpha * uOpacity);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.heatmapMesh = new THREE.Mesh(heatGeo, heatMat);
    this.heatmapMesh.renderOrder = 2;
    this.heatmapMesh.visible = this.heatmapVisible;
    this.group.add(this.heatmapMesh);

    // =========================================================================
    // 2. 3D Rain Streaks & Particles
    // =========================================================================
    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.dropCount * 6); // 2 vertices (head, tail) per streak
    this.colors = new Float32Array(this.dropCount * 6);

    this.dropData = [];

    // Default rain distribution across convective regions of Brazil:
    // 1. Amazônia: Temporal / Chuva Forte (14.0 mm/h)
    // 2. Sudeste: Chuva Moderada (4.5 mm/h)
    // 3. Sul: Garoa Fina / Chuva Fraca (0.8 mm/h)
    this.activeRainCenters = [
      { x: -16, z: -10, precip: 14.0, radius: 32, windSpeed: 12, windDir: 120, name: 'Amazônia (Chuva Forte)' },
      { x: 14,  z: 18,  precip: 4.5,  radius: 26, windSpeed: 10, windDir: 140, name: 'Sudeste (Chuva Moderada)' },
      { x: -5,  z: 38,  precip: 0.8,  radius: 22, windSpeed: 14, windDir: 200, name: 'Sul (Garoa Fraca)' }
    ];

    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.rainLines = new THREE.LineSegments(geometry, material);
    this.rainLines.renderOrder = 4;
    this.group.add(this.rainLines);

    // =========================================================================
    // 3. Subtle Ground Ripples (Instanced Rings)
    // =========================================================================
    const ringCount = 100;
    const ringGeo = new THREE.RingGeometry(0.04, 0.16, 8);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.rippleMesh = new THREE.InstancedMesh(ringGeo, ringMat, ringCount);
    this.rippleMesh.renderOrder = 3;
    this.rippleData = [];

    const dummy = new THREE.Object3D();
    for (let i = 0; i < ringCount; i++) {
      dummy.position.set(0, -100, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      this.rippleMesh.setMatrixAt(i, dummy.matrix);
      this.rippleData.push({
        x: 0, y: -100, z: 0, life: Math.random(), speed: 0.008, scaleMax: 1.0, centerIdx: 0
      });
    }
    this.group.add(this.rippleMesh);

    // Initial configuration of drops, ripples and radar heatmap
    this._configureDropsAndRipples();
    this.updateHeatmap();

    this.group.visible = this.visible;
  }

  setHeatmapVisible(visible) {
    this.heatmapVisible = visible;
    if (this.heatmapMesh) {
      this.heatmapMesh.visible = visible;
    }
  }

  setElevationScale(reliefFactor) {
    if (!this.heatmapMesh || !this.baseHeatmapY) return;
    const pos = this.heatmapMesh.geometry.attributes.position;
    const count = pos.count;
    for (let i = 0; i < count; i++) {
      const origElev = this.baseHeatmapY[i] - 0.035;
      pos.setY(i, origElev * reliefFactor + (reliefFactor > 0.5 ? 0.035 : 0.046));
    }
    pos.needsUpdate = true;
  }

  // Module-level reusable colors for zero GC allocations
  static _tempCol  = new THREE.Color();
  static _cSkyCyan = new THREE.Color(0x06b6d4); // 0.2 - 1.5 mm/h: Drizzle / Garoa
  static _cRoyal   = new THREE.Color(0x2563eb); // 1.5 - 4.0 mm/h: Light to Moderate rain
  static _cGreen   = new THREE.Color(0x22c55e); // 4.0 - 8.0 mm/h: Moderate to Heavy rain
  static _cYellow  = new THREE.Color(0xfacc15); // 8.0 - 16.0 mm/h: Heavy rain
  static _cOrange  = new THREE.Color(0xf97316); // 16.0 - 28.0 mm/h: Downpour / Temporal
  static _cCrimson = new THREE.Color(0xef4444); // 28.0 - 45.0 mm/h: Severe storm
  static _cPurple  = new THREE.Color(0xdb2777); // 45.0+ mm/h: Extreme storm core / Hail

  /**
   * Continuous Doppler Weather Radar Color Palette (Windy.com style)
   */
  getRadarColorAndAlpha(p) {
    const col = RainLayer._tempCol;
    if (p < 0.15) {
      col.setRGB(0, 0, 0);
      return { col, alpha: 0.0 };
    }

    let alpha = 0.0;
    if (p < 1.5) {
      // 0.15 to 1.5: Soft Cyan to Royal Blue
      const t = (p - 0.15) / 1.35;
      col.copy(RainLayer._cSkyCyan).lerp(RainLayer._cRoyal, t);
      alpha = 0.35 + t * 0.25;
    } else if (p < 4.0) {
      // 1.5 to 4.0: Royal Blue to Vibrant Green
      const t = (p - 1.5) / 2.5;
      col.copy(RainLayer._cRoyal).lerp(RainLayer._cGreen, t);
      alpha = 0.60 + t * 0.18;
    } else if (p < 8.0) {
      // 4.0 to 8.0: Green to Golden Yellow
      const t = (p - 4.0) / 4.0;
      col.copy(RainLayer._cGreen).lerp(RainLayer._cYellow, t);
      alpha = 0.78 + t * 0.10;
    } else if (p < 16.0) {
      // 8.0 to 16.0: Yellow to Vivid Orange
      const t = (p - 8.0) / 8.0;
      col.copy(RainLayer._cYellow).lerp(RainLayer._cOrange, t);
      alpha = 0.88 + t * 0.06;
    } else if (p < 32.0) {
      // 16.0 to 32.0: Orange to Crimson Red
      const t = (p - 16.0) / 16.0;
      col.copy(RainLayer._cOrange).lerp(RainLayer._cCrimson, t);
      alpha = 0.94 + t * 0.04;
    } else {
      // 32.0+: Crimson to Magenta / White-Purple
      const t = Math.min(1.0, (p - 32.0) / 20.0);
      col.copy(RainLayer._cCrimson).lerp(RainLayer._cPurple, t);
      alpha = 0.98;
    }

    return { col, alpha };
  }

  /**
   * Smoothly paints Doppler radar precipitation cells across the map
   */
  updateHeatmap() {
    if (!this.heatmapMesh) return;

    const pos = this.heatmapMesh.geometry.attributes.position;
    const colors = this.heatmapMesh.geometry.attributes.color.array;
    const alphas = this.heatmapMesh.geometry.attributes.aAlpha.array;
    const count = pos.count;
    const numCenters = this.activeRainCenters.length;

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Calculate composite precipitation from active rain centers with smooth bell curve
      let totalPrecip = 0;
      for (let c = 0; c < numCenters; c++) {
        const center = this.activeRainCenters[c];
        const dx = x - center.x;
        const dz = z - center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < center.radius) {
          const t = 1.0 - (dist / center.radius);
          // Smooth cubic bell curve: 1 at center, 0 at edge
          const falloff = t * t * (3.0 - 2.0 * t);
          const cellPrecip = center.precip * falloff;
          totalPrecip = Math.max(totalPrecip, cellPrecip);
        }
      }

      const { col, alpha } = this.getRadarColorAndAlpha(totalPrecip);
      colors[i * 3 + 0] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      alphas[i] = alpha;
    }

    this.heatmapMesh.geometry.attributes.color.needsUpdate = true;
    this.heatmapMesh.geometry.attributes.aAlpha.needsUpdate = true;
  }

  /**
   * Configures drop allocation, speeds, streak lengths, and colors
   * based on the precipitation intensity of each active rain center.
   */
  _configureDropsAndRipples() {
    if (!this.activeRainCenters || this.activeRainCenters.length === 0) return;

    const numCenters = this.activeRainCenters.length;

    // 1. Calculate drop allocation weights based on precipitation
    let totalWeight = 0;
    const weights = this.activeRainCenters.map(c => {
      const w = Math.pow(Math.max(0.4, c.precip), 0.72);
      totalWeight += w;
      return w;
    });

    const cumThresholds = [];
    let acc = 0;
    for (let i = 0; i < numCenters; i++) {
      acc += weights[i] / totalWeight;
      cumThresholds.push(acc);
    }
    cumThresholds[numCenters - 1] = 1.0;

    const pickCenterIndex = () => {
      const r = Math.random();
      for (let i = 0; i < numCenters; i++) {
        if (r <= cumThresholds[i]) return i;
      }
      return numCenters - 1;
    };

    // 2. Configure all 4000 drops
    this.dropData = [];
    const pos = this.positions;
    const col = this.colors;

    for (let i = 0; i < this.dropCount; i++) {
      const centerIdx = pickCenterIndex();
      const center = this.activeRainCenters[centerIdx];

      const norm = Math.min(1.0, Math.max(0.0, (center.precip - 0.4) / 14.0));

      // SPEED:
      // - Chuva fraca/garoa: 0.016 a 0.024 (caindo devagar, fino e suave)
      // - Chuva forte/temporal: 0.075 a 0.115 (caindo rápido, forte e volumoso)
      const baseSpeed = THREE.MathUtils.lerp(0.020, 0.095, norm);
      const speed = baseSpeed * (0.85 + Math.random() * 0.30);

      // STREAK LENGTH:
      // - Chuva fraca: gotas curtas (~0.16 a 0.22)
      // - Chuva forte: traços longos (~0.55 a 0.85)
      const baseStreak = THREE.MathUtils.lerp(0.18, 0.65, norm);
      const streakLen = baseStreak * (0.85 + Math.random() * 0.30);

      // Random position around center
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.pow(Math.random(), 0.7) * center.radius;
      const x = center.x + Math.cos(angle) * dist;
      const z = center.z + Math.sin(angle) * dist;
      const ground = Math.max(0.04, this.terrain.getElevationAt(x, z));
      const y = ground + 0.1 + Math.random() * 6.5;

      this.dropData.push({
        x, y, z, ground, speed, streakLen, centerIdx
      });

      // Position buffer: head & tail
      pos[i * 6 + 0] = x;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x;
      pos[i * 6 + 4] = y + streakLen;
      pos[i * 6 + 5] = z;

      // Color buffer:
      // Luminous drops contrasting cleanly over the Doppler radar heatmap
      const headR = THREE.MathUtils.lerp(0.75, 1.0, norm);
      const headG = THREE.MathUtils.lerp(0.90, 1.0, norm);
      const headB = 1.0;

      const tailR = THREE.MathUtils.lerp(0.35, 0.75, norm);
      const tailG = THREE.MathUtils.lerp(0.60, 0.90, norm);
      const tailB = THREE.MathUtils.lerp(0.85, 1.0, norm);

      col[i * 6 + 0] = headR;
      col[i * 6 + 1] = headG;
      col[i * 6 + 2] = headB;
      col[i * 6 + 3] = tailR;
      col[i * 6 + 4] = tailG;
      col[i * 6 + 5] = tailB;
    }

    if (this.rainLines) {
      this.rainLines.geometry.attributes.position.needsUpdate = true;
      this.rainLines.geometry.attributes.color.needsUpdate = true;
    }

    // 3. Configure ripples
    if (this.rippleMesh) {
      const ringCount = this.rippleData.length;
      for (let i = 0; i < ringCount; i++) {
        const centerIdx = pickCenterIndex();
        const center = this.activeRainCenters[centerIdx];
        const norm = Math.min(1.0, Math.max(0.0, (center.precip - 0.4) / 14.0));

        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * center.radius;
        const x = center.x + Math.cos(angle) * dist;
        const z = center.z + Math.sin(angle) * dist;
        const y = Math.max(0.04, this.terrain.getElevationAt(x, z)) + 0.025;

        const speed = THREE.MathUtils.lerp(0.005, 0.018, norm) * (0.9 + Math.random() * 0.2);
        const scaleMax = THREE.MathUtils.lerp(0.6, 2.0, norm);

        this.rippleData[i] = {
          x, y, z, life: Math.random(), speed, scaleMax, centerIdx
        };
      }
    }
  }

  setWeatherData(stations) {
    this.stations = stations;
    const newCenters = [];

    if (stations && Array.isArray(stations)) {
      stations.forEach(st => {
        const precip = Math.max(st.weather.precipitation || 0, st.weather.rain || 0);
        const code = st.weather.weather_code || 0;
        const hasRain = precip > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code);

        if (hasRain) {
          const { x, z } = latLonTo3D(st.lat, st.lon);

          let effectivePrecip = precip;
          if (effectivePrecip <= 0) {
            if ([95, 96, 99].includes(code)) effectivePrecip = 16.0;      // Tempestade com raios
            else if ([65, 82].includes(code)) effectivePrecip = 10.0;     // Chuva forte / pancada
            else if ([63, 81].includes(code)) effectivePrecip = 5.0;      // Chuva moderada
            else if ([61, 80].includes(code)) effectivePrecip = 2.0;      // Chuva fraca
            else if ([51, 53, 55].includes(code)) effectivePrecip = 0.8;  // Garoa fina
            else effectivePrecip = 1.5;
          }

          newCenters.push({
            x, z,
            precip: effectivePrecip,
            radius: 18 + Math.min(22, effectivePrecip * 1.6),
            windSpeed: Math.min(25, st.weather.wind_speed_10m || 8),
            windDir: st.weather.wind_direction_10m || 90,
            name: st.name
          });
        }
      });
    }

    if (newCenters.length > 0) {
      this.activeRainCenters = newCenters;
    } else {
      // Realistic tropical & subtropical rain distribution
      const r1 = latLonTo3D(-3.1, -60.0);   // Amazônia Central: Temporal tropical (14.0 mm/h)
      const r2 = latLonTo3D(-22.9, -43.2);  // Rio/SP: Chuva moderada (4.5 mm/h)
      const r3 = latLonTo3D(-27.5, -48.5);  // Sul / Florianópolis: Garoa fina (0.8 mm/h)
      this.activeRainCenters = [
        { x: r1.x, z: r1.z, precip: 14.0, radius: 30, windSpeed: 12, windDir: 110, name: 'Amazônia' },
        { x: r2.x, z: r2.z, precip: 4.5,  radius: 24, windSpeed: 10, windDir: 150, name: 'Sudeste' },
        { x: r3.x, z: r3.z, precip: 0.8,  radius: 20, windSpeed: 14, windDir: 210, name: 'Sul' }
      ];
    }

    this._configureDropsAndRipples();
    this.updateHeatmap();
  }

  update(delta) {
    if (!this.group.visible || !this.rainLines) return;

    const dt = Math.min(delta, 0.05) * 60;
    const pos = this.positions;
    const numCenters = this.activeRainCenters.length;
    if (numCenters === 0) return;

    for (let i = 0; i < this.dropCount; i++) {
      const d = this.dropData[i];
      const center = this.activeRainCenters[d.centerIdx % numCenters];

      // Wind tilt
      const windSpd = center.windSpeed || 8;
      const windDirRad = ((center.windDir || 90) + 180) * (Math.PI / 180);
      
      const slantRatio = Math.min(0.24, (windSpd * 0.007) / Math.max(0.4, d.speed * 20));
      const slantX = Math.sin(windDirRad) * slantRatio * d.streakLen;
      const slantZ = -Math.cos(windDirRad) * slantRatio * d.streakLen;

      // Move drop down with its individualized terminal velocity
      d.x += Math.sin(windDirRad) * (windSpd * 0.0008) * dt;
      d.z += -Math.cos(windDirRad) * (windSpd * 0.0008) * dt;
      d.y -= d.speed * dt;

      // Respawn when hitting the ground
      if (d.y <= d.ground) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.pow(Math.random(), 0.7) * center.radius;
        d.x = center.x + Math.cos(angle) * dist;
        d.z = center.z + Math.sin(angle) * dist;
        d.ground = Math.max(0.04, this.terrain.getElevationAt(d.x, d.z));
        d.y = d.ground + 4.5 + Math.random() * 2.5; // Cloud base
      }

      // Head vertex
      pos[i * 6 + 0] = d.x;
      pos[i * 6 + 1] = d.y;
      pos[i * 6 + 2] = d.z;

      // Tail vertex (pointing UP along motion trajectory with wind slant)
      pos[i * 6 + 3] = d.x - slantX;
      pos[i * 6 + 4] = d.y + d.streakLen;
      pos[i * 6 + 5] = d.z - slantZ;
    }

    this.rainLines.geometry.attributes.position.needsUpdate = true;

    // Ground ripple animation
    if (this.rippleMesh) {
      const dummy = new THREE.Object3D();
      const count = this.rippleData.length;
      for (let i = 0; i < count; i++) {
        const rp = this.rippleData[i];
        const center = this.activeRainCenters[rp.centerIdx % numCenters];
        rp.life += rp.speed * dt;

        if (rp.life > 1.0) {
          rp.life = 0;
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.pow(Math.random(), 0.7) * center.radius;
          rp.x = center.x + Math.cos(angle) * dist;
          rp.z = center.z + Math.sin(angle) * dist;
          rp.y = Math.max(0.04, this.terrain.getElevationAt(rp.x, rp.z)) + 0.025;
        }

        dummy.position.set(rp.x, rp.y, rp.z);
        dummy.scale.setScalar(rp.life * rp.scaleMax);
        dummy.updateMatrix();
        this.rippleMesh.setMatrixAt(i, dummy.matrix);
      }
      this.rippleMesh.instanceMatrix.needsUpdate = true;
    }
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
