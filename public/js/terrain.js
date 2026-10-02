import * as THREE from 'three';
import { SimplexNoise } from './utils/noise.js';
import { GEO_CONFIG, threeDToLatLon, latLonTo3D } from './utils/geo.js';
import { isPointInBrazil, HIGHLAND_FEATURES, BRAZIL_BOUNDARY } from './data/brazilData.js';
import { STATE_BORDERS } from './data/stateBorders.js';

export class BrazilTerrain {
  constructor(scene) {
    this.scene = scene;
    this.noise = new SimplexNoise(42);
    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'brazil-terrain';
    this.scene.add(this.terrainGroup);

    this.gridWidth = 140;
    this.gridDepth = 140;
    this.segments = 140; // High resolution for smooth relief

    this.mesh = null;
    this.oceanMesh = null;
    this.coastlineMesh = null;
    this.stateBordersGroup = null;
    this.baseElevations = null;
    this.currentReliefScale = 1.0;

    this.init();
  }

  init() {
    this.createOcean();
    this.createLandTerrain();
    this.createStateBorders();
    this.createCoastlineOutline();
    this.createBorderBasePlate();
  }

  /**
   * Calculates procedural elevation Y at any lat/lon coordinate.
   * Apple-style relief: gentle rolling hills with visible but soft mountain ranges.
   */
  getElevation(lat, lon) {
    const scale = this.currentReliefScale !== undefined ? this.currentReliefScale : 1.0;
    const inside = isPointInBrazil(lat, lon);
    if (!inside) {
      return 0.02 * scale; // Very gentle shallow coastal water
    }

    // Base elevation for land
    let h = 0.08;

    // Highland features with smooth cubic Hermite falloff
    for (const feat of HIGHLAND_FEATURES) {
      const dLat = lat - feat.lat;
      const dLon = lon - feat.lon;
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);
      if (dist < feat.radius) {
        const t = dist / feat.radius;
        // Smoothstep (3t^2 - 2t^3)
        const smooth = 1.0 - (t * t * (3.0 - 2.0 * t));
        h += smooth * feat.peak;
      }
    }

    // Gentle micro-relief noise
    const nx = lon * 0.12;
    const ny = lat * 0.12;
    const microRelief = this.noise.fbm(nx, ny, 2, 0.4, 2.0);
    h += microRelief * 0.025;

    // Amazon basin flattening
    if (lat > -8 && lat < 3 && lon > -68 && lon < -50) {
      const amazonDist = Math.sqrt(Math.pow((lat + 3) / 5, 2) + Math.pow((lon + 59) / 9, 2));
      if (amazonDist < 1.0) {
        h *= (0.75 + 0.25 * amazonDist);
      }
    }

    // Coastal smoothing — reduce elevation near the coast for gentle shoreline
    const coastLat = Math.abs(lat + 23); // rough distance from major coast
    const coastProximity = Math.min(1.0, Math.max(0, (lon + 40.0) / 6.0)); // east coast fade
    if (coastProximity > 0.5 && h > 0.12) {
      h = 0.12 + (h - 0.12) * (1.0 - (coastProximity - 0.5) * 0.6);
    }

    return Math.max(0.04 * scale, Math.min(0.55 * scale, h * scale));
  }

  /**
   * Get 3D elevation Y at world position X, Z
   */
  getElevationAt(x, z) {
    const scale = this.currentReliefScale !== undefined ? this.currentReliefScale : 1.0;
    const { lat, lon } = threeDToLatLon(x, z);
    if (!isPointInBrazil(lat, lon)) {
      const isContinent = (lon > -82 && lon < -34 && lat > -56 && lat < 12);
      return (isContinent && lon < -37.5) ? (0.04 * scale) : 0.0;
    }
    return this.getElevation(lat, lon);
  }

  /**
   * Dynamically scales 3D terrain elevation (1.0 = full 3D relief, 0.0 = flat for OSM street map)
   * @param {number} scale
   */
  setReliefScale(scale) {
    const clampedScale = Math.max(0.0, Math.min(1.0, scale));
    if (Math.abs(this.currentReliefScale - clampedScale) < 0.005) return;
    this.currentReliefScale = clampedScale;

    if (this.mesh && this.baseElevations) {
      const pos = this.mesh.geometry.attributes.position;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        pos.setY(i, this.baseElevations[i] * clampedScale);
      }
      pos.needsUpdate = true;
      this.mesh.geometry.computeVertexNormals();
    }
  }

  createLandTerrain() {
    const geometry = new THREE.PlaneGeometry(
      this.gridWidth,
      this.gridDepth,
      this.segments,
      this.segments
    );
    geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

    const pos = geometry.attributes.position;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    this.baseElevations = new Float32Array(count);

    // Apple-style minimalist color palette (rich lush greens with gentle moss highlights)
    const oceanColor = new THREE.Color(0x0a1420); // deep sleek dark navy
    const coastalColor = new THREE.Color(0x246a44); // crisp shore emerald
    const lowlandColor = new THREE.Color(0x2f7c4c); // rich Brazilian green (Amazon, Cerrado)
    const highlandColor = new THREE.Color(0x438d5b); // clear plateau moss
    const mountainPeak = new THREE.Color(0x5ca674); // soft luminous ridge tone
    const outsideLandColor = new THREE.Color(0x131f2d); // neighbouring South America subtle tone

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const { lat, lon } = threeDToLatLon(x, z);

      const inside = isPointInBrazil(lat, lon);
      let elev = 0;
      let vertexColor = new THREE.Color();

      if (inside) {
        elev = this.getElevation(lat, lon);
        this.baseElevations[i] = elev;
        pos.setY(i, elev);

        // Smooth color blending across relief
        if (elev < 0.12) {
          const t = (elev - 0.04) / 0.08;
          vertexColor.copy(coastalColor).lerp(lowlandColor, Math.max(0, Math.min(1, t)));
        } else if (elev < 0.22) {
          const t = (elev - 0.12) / 0.10;
          vertexColor.copy(lowlandColor).lerp(highlandColor, Math.max(0, Math.min(1, t)));
        } else {
          const t = Math.min(1.0, (elev - 0.22) / 0.30);
          vertexColor.copy(highlandColor).lerp(mountainPeak, t);
        }
      } else {
        // Outside Brazil - neighbouring South America or Atlantic Ocean
        const isContinent = (lon > -82 && lon < -34 && lat > -56 && lat < 12);
        if (isContinent && lon < -37.5) {
          elev = 0.04;
          this.baseElevations[i] = elev;
          pos.setY(i, elev);
          vertexColor.copy(outsideLandColor);
        } else {
          // Atlantic Ocean
          elev = 0.0;
          this.baseElevations[i] = 0.0;
          pos.setY(i, elev);
          vertexColor.copy(oceanColor);
        }
      }

      colors[i * 3 + 0] = vertexColor.r;
      colors[i * 3 + 1] = vertexColor.g;
      colors[i * 3 + 2] = vertexColor.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.10,
      flatShading: false
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.terrainGroup.add(this.mesh);
  }

  /**
   * 3D State Borders for all 27 Brazilian States from real OpenStreetMap / IBGE data
   * Consolidated into a SINGLE LineSegments draw call for performance
   */
  createStateBorders() {
    this.stateBordersGroup = new THREE.Group();
    this.stateBordersGroup.name = 'brazil-state-borders';

    // Collect ALL line segments into one merged buffer
    const allPositions = [];
    const borderElevationOffset = 0.072; // Raised securely above weather heatmaps (+0.035)

    STATE_BORDERS.forEach(state => {
      state.lines.forEach(ring => {
        if (!ring || ring.length < 2) return;

        for (let i = 0; i < ring.length - 1; i++) {
          const [lon1, lat1] = ring[i];
          const [lon2, lat2] = ring[i + 1];
          const p1 = latLonTo3D(lat1, lon1);
          const p2 = latLonTo3D(lat2, lon2);
          const y1 = this.getElevation(lat1, lon1) + borderElevationOffset;
          const y2 = this.getElevation(lat2, lon2) + borderElevationOffset;
          allPositions.push(p1.x, y1, p1.z, p2.x, y2, p2.z);
        }
      });
    });

    if (allPositions.length > 0) {
      // 1. Contrast Drop-Shadow / Halo Line (Dark Navy Under-Border)
      // Ensures crisp readability even when crossing bright white/yellow/cyan zones
      const shadowPositions = new Float32Array(allPositions.length);
      for (let i = 0; i < allPositions.length; i += 3) {
        shadowPositions[i] = allPositions[i];
        shadowPositions[i + 1] = allPositions[i + 1] - 0.007;
        shadowPositions[i + 2] = allPositions[i + 2];
      }
      const shadowGeo = new THREE.BufferGeometry();
      shadowGeo.setAttribute('position', new THREE.BufferAttribute(shadowPositions, 3));
      const shadowMat = new THREE.LineBasicMaterial({
        color: 0x050c18,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        depthTest: true
      });
      const shadowSegments = new THREE.LineSegments(shadowGeo, shadowMat);
      shadowSegments.renderOrder = 9;
      this.stateBordersGroup.add(shadowSegments);

      // 2. High-Contrast Luminous Border (Crisp Pure White / Ice-Blue)
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));

      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        depthTest: true
      });

      const lineSegments = new THREE.LineSegments(geo, mat);
      lineSegments.renderOrder = 10;
      this.stateBordersGroup.add(lineSegments);
    }

    this.terrainGroup.add(this.stateBordersGroup);
  }

  createOcean() {
    // Vast ocean surface with slight specular gleam
    const oceanGeo = new THREE.PlaneGeometry(260, 260, 32, 32);
    oceanGeo.rotateX(-Math.PI / 2);

    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0d1620, // Apple Maps deep ocean
      roughness: 0.35,
      metalness: 0.65,
      transparent: true,
      opacity: 0.98
    });

    this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    this.oceanMesh.position.y = -0.01;
    this.terrainGroup.add(this.oceanMesh);

    // Subtle bathymetric grid
    const gridHelper = new THREE.GridHelper(240, 24, 0x192b3f, 0x121e2c);
    gridHelper.position.y = -0.005;
    this.terrainGroup.add(gridHelper);
  }

  createCoastlineOutline() {
    // Outer national boundary glow line tracing coastline and international borders
    const points = [];
    for (const [lat, lon] of BRAZIL_BOUNDARY) {
      const { x, z } = latLonTo3D(lat, lon);
      points.push(new THREE.Vector3(x, 0, z));
    }
    const first = points[0];
    points.push(new THREE.Vector3(first.x, 0, first.z));

    const curve = new THREE.CatmullRomCurve3(points);
    const smoothPoints = curve.getPoints(500);

    // Update Y for every point on the curve to follow terrain elevation precisely
    smoothPoints.forEach(p => {
      p.y = this.getElevationAt(p.x, p.z) + 0.078;
    });

    // 1. National Boundary Glowing Outer Ribbon (Bright Cyan)
    const lineGeo = new THREE.BufferGeometry().setFromPoints(smoothPoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8, // Electric Cyan Coastline Ribbon
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: true
    });

    this.coastlineMesh = new THREE.Line(lineGeo, lineMat);
    this.coastlineMesh.renderOrder = 12;
    this.terrainGroup.add(this.coastlineMesh);

    // 2. National Boundary Accent Halo (Deep Sky Blue)
    const haloPoints = smoothPoints.map(p => new THREE.Vector3(p.x, p.y - 0.006, p.z));
    const haloGeo = new THREE.BufferGeometry().setFromPoints(haloPoints);
    const haloMat = new THREE.LineBasicMaterial({
      color: 0x0369a1,
      transparent: true,
      opacity: 0.70,
      depthWrite: false,
      depthTest: true
    });
    const haloLine = new THREE.Line(haloGeo, haloMat);
    haloLine.renderOrder = 11;
    this.terrainGroup.add(haloLine);
  }

  createBorderBasePlate() {
    const baseGeo = new THREE.BoxGeometry(148, 1.2, 148);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x090e15,
      roughness: 0.6,
      metalness: 0.8
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.65;
    this.terrainGroup.add(baseMesh);
  }

  setElevationScale(reliefFactor) {
    if (this.currentReliefScale === reliefFactor) return;
    if (Math.abs(this.currentReliefScale - reliefFactor) < 0.005) return;
    this.currentReliefScale = reliefFactor;

    if (this.mesh && this.mesh.geometry && this.baseElevations) {
      const pos = this.mesh.geometry.attributes.position;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        pos.setY(i, this.baseElevations[i] * reliefFactor);
      }
      pos.needsUpdate = true;
      this.mesh.geometry.computeVertexNormals();
    }

    const borderYOffset = (reliefFactor - 1.0) * 0.065;
    if (this.stateBordersGroup) {
      this.stateBordersGroup.position.y = borderYOffset;
    }
    if (this.coastlineMesh) {
      this.coastlineMesh.position.y = borderYOffset;
    }
  }

  setReliefScale(reliefFactor) {
    this.setElevationScale(reliefFactor);
  }

  update(time) {
    if (this.oceanMesh) {
      this.oceanMesh.material.roughness = 0.35 + Math.sin(time * 0.8) * 0.04;
    }
  }
}
