import * as THREE from 'three';
import { threeDToLatLon, latLonTo3D } from '../utils/geo.js';
import { isPointInBrazil } from '../data/brazilData.js';

export class WindLayer {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.visible = false;
    this.group = new THREE.Group();
    this.group.name = 'weather-wind';
    this.scene.add(this.group);

    // Optimized particle count for 60 FPS performance
    this.particleCount = 8000;
    this.particles = null;
    this.particleData = [];

    // High-resolution 64x64 Wind Vector Field Grid (4,096 points)
    this.gridResolution = 64;
    this.windGrid = new Float32Array(this.gridResolution * this.gridResolution * 3); // [vx, vz, speed]
    this.initDefaultWindGrid();

    // High-definition Heatmap mesh (100x100 = 10,000 vertices for razor-sharp contours)
    this.heatmapMesh = null;
    this.heatmapResolution = 100;
    this.heatmapVisible = true;

    this.pressureBadges = [];

    this.init();
  }

  initDefaultWindGrid() {
    for (let gz = 0; gz < this.gridResolution; gz++) {
      for (let gx = 0; gx < this.gridResolution; gx++) {
        const idx = (gz * this.gridResolution + gx) * 3;
        this.windGrid[idx + 0] = -0.16; // vx
        this.windGrid[idx + 1] = -0.06; // vz
        this.windGrid[idx + 2] = 16.0;  // speedKm/h
      }
    }
  }

  init() {
    // =========================================================================
    // 1. Wind Speed Surface Heatmap (Windy.com style terrain/ocean overlay)
    // =========================================================================
    const heatGeo = new THREE.PlaneGeometry(140, 140, this.heatmapResolution, this.heatmapResolution);
    heatGeo.rotateX(-Math.PI / 2);

    const heatPos = heatGeo.attributes.position;
    const vertexCount = heatPos.count;
    const heatColors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const x = heatPos.getX(i);
      const z = heatPos.getZ(i);
      const y = Math.max(0.015, this.terrain.getElevationAt(x, z)) + 0.035;
      heatPos.setY(i, y);

      // Default calm navy-blue
      heatColors[i * 3 + 0] = 0.18;
      heatColors[i * 3 + 1] = 0.16;
      heatColors[i * 3 + 2] = 0.45;
    }

    heatGeo.setAttribute('color', new THREE.BufferAttribute(heatColors, 3));
    heatGeo.computeVertexNormals();

    const heatMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.52, // Balanced opacity so Brazil's lush landmass and borders shine through clearly
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });

    this.heatmapMesh = new THREE.Mesh(heatGeo, heatMat);
    this.heatmapMesh.renderOrder = 2;
    this.heatmapMesh.visible = this.heatmapVisible;
    this.group.add(this.heatmapMesh);

    // Initial heatmap evaluation from default wind grid
    this.updateHeatmap();

    // =========================================================================
    // 2. Animated Flowing Streamlines ("Tracinhos do Vento")
    // =========================================================================
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 6);
    const colors = new Float32Array(this.particleCount * 6);

    this.particleData = [];

    for (let i = 0; i < this.particleCount; i++) {
      const x = (Math.random() - 0.5) * 130;
      const z = (Math.random() - 0.5) * 130;
      const elevOffset = 0.35 + Math.random() * 0.9;
      const y = 0.35 + elevOffset;

      positions[i * 6 + 0] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z;

      for (let j = 0; j < 6; j++) {
        colors[i * 6 + j] = 1.0;
      }

      this.particleData.push({
        life: Math.random() * 80,
        maxLife: 40 + Math.random() * 40,
        speedMultiplier: 0.85 + Math.random() * 0.3,
        elevOffset: elevOffset
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.LineSegments(geometry, material);
    this.particles.renderOrder = 3;
    this.group.add(this.particles);

    this.group.visible = this.visible;
  }

  setHeatmapVisible(visible) {
    this.heatmapVisible = visible;
    if (this.heatmapMesh) {
      this.heatmapMesh.visible = visible;
    }
  }

  // Module-level reusable colors for zero GC allocations
  static _tempCol  = new THREE.Color();
  static _cIndigo  = new THREE.Color(0x27245c); // 0-8 km/h: Inland calm / Deep Indigo
  static _cBlue    = new THREE.Color(0x2563eb); // 14 km/h: Royal Blue
  static _cCyan    = new THREE.Color(0x06b6d4); // 20 km/h: Vibrant Coastal Cyan
  static _cGreen   = new THREE.Color(0x10b981); // 28 km/h: Emerald Green
  static _cYellow  = new THREE.Color(0xfacc15); // 38 km/h: Golden Yellow
  static _cOrange  = new THREE.Color(0xf97316); // 50 km/h: Vivid Orange
  static _cRed     = new THREE.Color(0xef4444); // 65 km/h: Crimson Red
  static _cPink    = new THREE.Color(0xdb2777); // 80+ km/h: Magenta / Violet

  /**
   * Continuous Windy.com Wind Speed Color Palette
   * Matches the exact color bands seen in Windy.com screenshots
   */
  getHeatmapColor(speedKm) {
    const col = WindLayer._tempCol;
    const s = Math.max(0, speedKm);

    if (s <= 10) {
      // 0 - 10 km/h: Deep Indigo / Slate Blue to Royal Blue
      col.copy(WindLayer._cIndigo).lerp(WindLayer._cBlue, s / 10);
    } else if (s <= 18) {
      // 10 - 18 km/h: Royal Blue to Vibrant Cyan
      col.copy(WindLayer._cBlue).lerp(WindLayer._cCyan, (s - 10) / 8);
    } else if (s <= 28) {
      // 18 - 28 km/h: Cyan to Emerald Green
      col.copy(WindLayer._cCyan).lerp(WindLayer._cGreen, (s - 18) / 10);
    } else if (s <= 40) {
      // 28 - 40 km/h: Emerald Green to Golden Yellow
      col.copy(WindLayer._cGreen).lerp(WindLayer._cYellow, (s - 28) / 12);
    } else if (s <= 54) {
      // 40 - 54 km/h: Golden Yellow to Intense Orange
      col.copy(WindLayer._cYellow).lerp(WindLayer._cOrange, (s - 40) / 14);
    } else if (s <= 70) {
      // 54 - 70 km/h: Orange to Crimson Red
      col.copy(WindLayer._cOrange).lerp(WindLayer._cRed, (s - 54) / 16);
    } else {
      // 70+ km/h: Crimson to Magenta
      col.copy(WindLayer._cRed).lerp(WindLayer._cPink, Math.min(1.0, (s - 70) / 25));
    }

    return col;
  }

  /**
   * Smoothly paints the wind speed heatmap mesh across land and ocean
   */
  updateHeatmap() {
    if (!this.heatmapMesh) return;

    const pos = this.heatmapMesh.geometry.attributes.position;
    const colors = this.heatmapMesh.geometry.attributes.color.array;
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const wind = this.sampleWind(x, z);
      const col = this.getHeatmapColor(wind.speedKm);

      colors[i * 3 + 0] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    this.heatmapMesh.geometry.attributes.color.needsUpdate = true;
  }

  updateDynamicPressureMarkers(stations) {
    if (this.pressureBadges) {
      for (const b of this.pressureBadges) {
        this.group.remove(b.sprite);
        this.group.remove(b.ring);
        if (b.sprite.material.map) b.sprite.material.map.dispose();
        if (b.sprite.geometry) b.sprite.geometry.dispose();
        if (b.ring.geometry) b.ring.geometry.dispose();
      }
    }
    this.pressureBadges = [];

    let minP = Infinity, maxP = -Infinity;
    let minSt = null, maxSt = null;

    stations.forEach(st => {
      const p = st.weather.pressure_msl;
      if (typeof p === 'number' && !isNaN(p) && p > 900 && p < 1050) {
        if (p < minP) { minP = p; minSt = st; }
        if (p > maxP) { maxP = p; maxSt = st; }
      }
    });

    const makeBadge = (type, valText, color, x, z) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      ctx.beginPath();
      ctx.arc(64, 46, 32, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 12;
      ctx.fill();

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type, 64, 46);

      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(valText, 64, 102);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);

      const groundY = Math.max(0.04, this.terrain.getElevationAt(x, z));
      sprite.position.set(x, groundY + 5.5, z);
      sprite.scale.set(6.5, 6.5, 1);
      this.group.add(sprite);

      const ringGeo = new THREE.RingGeometry(2.5, 3.2, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(x, groundY + 0.15, z);
      this.group.add(ring);

      this.pressureBadges.push({ sprite, ring, color });
    };

    if (minP < 1008 && minSt) {
      const pos = latLonTo3D(minSt.lat, minSt.lon);
      makeBadge('B', `${Math.round(minP)} hPa`, '#f43f5e', pos.x, pos.z);
    }

    if (maxP >= 1016 && maxSt) {
      const pos = latLonTo3D(maxSt.lat, maxSt.lon);
      makeBadge('A', `${Math.round(maxP)} hPa`, '#38bdf8', pos.x, pos.z);
    }
  }

  setWeatherData(stations) {
    if (!stations || !Array.isArray(stations) || stations.length === 0) return;

    this.updateDynamicPressureMarkers(stations);

    const res = this.gridResolution;

    for (let gz = 0; gz < res; gz++) {
      const normZ = gz / (res - 1);
      const z = (0.5 - normZ) * 140;

      for (let gx = 0; gx < res; gx++) {
        const normX = gx / (res - 1);
        const x = (normX - 0.5) * 140;

        const { lat, lon } = threeDToLatLon(x, z);
        const onLand = isPointInBrazil(lat, lon);

        let totalWeight = 0;
        let sumVx = 0;
        let sumVz = 0;
        let sumSpeed = 0;

        for (let s = 0; s < stations.length; s++) {
          const st = stations[s];
          const dLat = lat - st.lat;
          const dLon = lon - st.lon;
          const dist = Math.sqrt(dLat * dLat + dLon * dLon);

          // Steep modified Shepard weighting (power 2.4) preserves authentic micro-scale gradients
          let weight = 1.0 / Math.pow(dist + 0.32, 2.4);

          // Land-Sea friction boundary condition:
          // Attenuate cross-boundary contamination to replicate real coastal wind shear
          if (onLand && st.isOcean) {
            weight *= 0.28;
          } else if (!onLand && !st.isOcean) {
            weight *= 0.35;
          }

          const dirRad = (st.weather.wind_direction_10m || 90) * (Math.PI / 180);
          let rawSpeed = st.weather.wind_speed_10m || 12;

          // Atmospheric boundary layer friction drag over terrestrial terrain
          if (onLand && !st.isOcean) {
            rawSpeed *= 0.78;
          } else if (!onLand && st.isOcean) {
            rawSpeed *= 1.15; // Smooth oceanic surface accelerates airflow
          }

          const flowDir = dirRad + Math.PI;
          const vx = Math.sin(flowDir) * rawSpeed * 0.013;
          const vz = -Math.cos(flowDir) * rawSpeed * 0.013;

          sumVx += vx * weight;
          sumVz += vz * weight;
          sumSpeed += rawSpeed * weight;
          totalWeight += weight;
        }

        const idx = (gz * res + gx) * 3;
        this.windGrid[idx + 0] = sumVx / totalWeight;
        this.windGrid[idx + 1] = sumVz / totalWeight;
        this.windGrid[idx + 2] = sumSpeed / totalWeight;
      }
    }

    // Refresh the surface heatmap mesh
    this.updateHeatmap();
  }

  /**
   * Bilinear interpolation for smooth wind vector fields
   */
  sampleWind(x, z) {
    const res = this.gridResolution;
    const px = ((x + 70) / 140) * (res - 1);
    const pz = ((70 - z) / 140) * (res - 1);

    const gx = Math.min(res - 2, Math.max(0, Math.floor(px)));
    const gz = Math.min(res - 2, Math.max(0, Math.floor(pz)));

    const tx = px - gx;
    const tz = pz - gz;

    const idx00 = (gz * res + gx) * 3;
    const idx10 = (gz * res + gx + 1) * 3;
    const idx01 = ((gz + 1) * res + gx) * 3;
    const idx11 = ((gz + 1) * res + gx + 1) * 3;

    // Bilinear blend
    const lerp = (a, b, t) => a + (b - a) * t;

    const vx0 = lerp(this.windGrid[idx00 + 0], this.windGrid[idx10 + 0], tx);
    const vx1 = lerp(this.windGrid[idx01 + 0], this.windGrid[idx11 + 0], tx);
    const vx = lerp(vx0, vx1, tz);

    const vz0 = lerp(this.windGrid[idx00 + 1], this.windGrid[idx10 + 1], tx);
    const vz1 = lerp(this.windGrid[idx01 + 1], this.windGrid[idx11 + 1], tx);
    const vz = lerp(vz0, vz1, tz);

    const spd0 = lerp(this.windGrid[idx00 + 2], this.windGrid[idx10 + 2], tx);
    const spd1 = lerp(this.windGrid[idx01 + 2], this.windGrid[idx11 + 2], tx);
    const speedKm = lerp(spd0, spd1, tz);

    return { vx, vz, speedKm };
  }

  update(delta) {
    if (!this.group.visible || !this.particles) return;

    const dt = Math.min(delta, 0.05) * 60;
    const pos = this.particles.geometry.attributes.position.array;
    const col = this.particles.geometry.attributes.color.array;

    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particleData[i];
      let x = pos[i * 6 + 3]; // Head X
      let y = pos[i * 6 + 4]; // Head Y
      let z = pos[i * 6 + 5]; // Head Z

      const wind = this.sampleWind(x, z);

      const spd = Math.max(0.001, Math.sqrt(wind.vx * wind.vx + wind.vz * wind.vz));
      const dirX = wind.vx / spd;
      const dirZ = wind.vz / spd;

      // Realistic streamline trail length (1.2 to 2.8 units) matching Windy.com:
      const streakLen = Math.max(1.1, Math.min(2.8, wind.speedKm * 0.068));

      // Advance head along flow
      x += wind.vx * dt * p.speedMultiplier * 0.85;
      z += wind.vz * dt * p.speedMultiplier * 0.85;
      p.life += 1;

      if (p.life > p.maxLife || x < -68 || x > 68 || z < -68 || z > 68) {
        p.life = 0;
        x = (Math.random() - 0.5) * 130;
        z = (Math.random() - 0.5) * 130;
        y = 0.35 + p.elevOffset;
      }

      // Tail follows backwards along the wind streamline:
      pos[i * 6 + 0] = x - dirX * streakLen;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z - dirZ * streakLen;

      // Head
      pos[i * 6 + 3] = x;
      pos[i * 6 + 4] = y;
      pos[i * 6 + 5] = z;

      // Update color based on life (fade in/out) and wind speed
      const lifePct = p.life / p.maxLife;
      const alpha = Math.sin(lifePct * Math.PI); // Smooth fade

      if (this.heatmapVisible) {
        // Windy.com Style: Glowing white/ice-blue tracer ribbons floating over the colorful heatmap
        const speedBrightness = Math.min(1.0, 0.55 + (wind.speedKm / 50.0) * 0.45);
        const headA = alpha * speedBrightness;

        // Tail color (feathered translucent)
        col[i * 6 + 0] = 0.85 * alpha * 0.18;
        col[i * 6 + 1] = 0.95 * alpha * 0.18;
        col[i * 6 + 2] = 1.00 * alpha * 0.18;

        // Head color (bright glowing white)
        col[i * 6 + 3] = 0.98 * headA;
        col[i * 6 + 4] = 0.99 * headA;
        col[i * 6 + 5] = 1.00 * headA;
      } else {
        const baseCol = this.getHeatmapColor(wind.speedKm);
        col[i * 6 + 0] = baseCol.r * alpha * 0.2;
        col[i * 6 + 1] = baseCol.g * alpha * 0.2;
        col[i * 6 + 2] = baseCol.b * alpha * 0.2;

        col[i * 6 + 3] = baseCol.r * alpha;
        col[i * 6 + 4] = baseCol.g * alpha;
        col[i * 6 + 5] = baseCol.b * alpha;
      }
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;

    // Subtle breathing pulse for synoptic pressure badges
    if (this.pressureBadges && this.pressureBadges.length > 0) {
      this._badgeTime = (this._badgeTime || 0) + delta * 2.0;
      for (const b of this.pressureBadges) {
        const pulse = 1.0 + Math.sin(this._badgeTime) * 0.12;
        b.ring.scale.set(pulse, pulse, 1);
        b.ring.material.opacity = 0.35 + Math.sin(this._badgeTime) * 0.15;
      }
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
