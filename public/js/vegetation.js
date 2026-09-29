import * as THREE from 'three';
import { VEGETATION_ZONES, isPointInBrazil } from './data/brazilData.js';
import { latLonTo3D } from './utils/geo.js';

export class VegetationSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.vegGroup = new THREE.Group();
    this.vegGroup.name = 'brazil-vegetation';
    this.scene.add(this.vegGroup);

    this.roundTreesMesh = null;
    this.pineTreesMesh = null;
    this.trunksMesh = null;

    this.init();
  }

  init() {
    this.generateVegetation();
  }

  generateVegetation() {
    // Generate tree positions across vegetation zones
    const roundTreePositions = [];
    const pineTreePositions = [];
    const trunkPositions = [];

    VEGETATION_ZONES.forEach(zone => {
      // Determine number of trees based on zone area and density
      const treeCount = Math.floor(zone.density * (zone.type === 'rainforest' ? 380 : 150));

      for (let i = 0; i < treeCount; i++) {
        // Random distribution within the zone ellipse
        const u = Math.random();
        const v = Math.random();
        const r = Math.sqrt(u);
        const theta = v * 2 * Math.PI;

        const lat = zone.centerLat + (r * Math.cos(theta)) * zone.radiusLat;
        const lon = zone.centerLon + (r * Math.sin(theta)) * zone.radiusLon;

        if (!isPointInBrazil(lat, lon)) continue;

        const { x, z } = latLonTo3D(lat, lon);
        const y = this.terrain.getElevationAt(x, z);

        // Don't place trees in water
        if (y < 0.04) continue;

        const scale = 0.45 + Math.random() * 0.45;
        const rotY = Math.random() * Math.PI * 2;

        if (zone.type === 'araucaria' || (lat < -26 && Math.random() > 0.4)) {
          // Pine / Araucaria tree (South)
          pineTreePositions.push({ x, y, z, scale, rotY, type: zone.type });
        } else {
          // Rounded tropical tree (Amazon, Atlantic Forest, Pantanal)
          roundTreePositions.push({ x, y, z, scale, rotY, type: zone.type });
        }

        trunkPositions.push({ x, y, z, scale, rotY });
      }
    });

    // 1. Trunks Instanced Mesh (Shared slim wooden cylinder)
    const trunkGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.45, 5);
    trunkGeo.translate(0, 0.225, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3b32,
      roughness: 0.9,
      metalness: 0.1
    });

    this.trunksMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkPositions.length);
    const dummy = new THREE.Object3D();

    trunkPositions.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.y, tp.z);
      dummy.scale.set(tp.scale, tp.scale, tp.scale);
      dummy.rotation.y = tp.rotY;
      dummy.updateMatrix();
      this.trunksMesh.setMatrixAt(idx, dummy.matrix);
    });
    this.trunksMesh.instanceMatrix.needsUpdate = true;
    this.vegGroup.add(this.trunksMesh);

    // 2. Round Canopy Foliage (Low-poly faceted icosahedron/dodecahedron)
    const roundGeo = new THREE.DodecahedronGeometry(0.38, 1);
    roundGeo.translate(0, 0.55, 0);

    const roundMat = new THREE.MeshStandardMaterial({
      roughness: 0.75,
      metalness: 0.08,
      flatShading: true // Apple-style low-poly facet look
    });

    this.roundTreesMesh = new THREE.InstancedMesh(roundGeo, roundMat, roundTreePositions.length);

    // Color palettes for biomes
    const amazonColor = new THREE.Color(0x1e6f42); // deep Amazon emerald
    const atlanticColor = new THREE.Color(0x2d8a4e); // vibrant Atlantic Forest green
    const cerradoColor = new THREE.Color(0x65823b); // golden olive savanna
    const pantanalColor = new THREE.Color(0x387d48);

    roundTreePositions.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.y, tp.z);
      dummy.scale.set(tp.scale, tp.scale, tp.scale);
      dummy.rotation.set(0, tp.rotY, (Math.random() - 0.5) * 0.15);
      dummy.updateMatrix();
      this.roundTreesMesh.setMatrixAt(idx, dummy.matrix);

      // Color variation
      let baseCol = amazonColor;
      if (tp.type === 'atlantic') baseCol = atlanticColor;
      else if (tp.type === 'cerrado') baseCol = cerradoColor;
      else if (tp.type === 'pantanal') baseCol = pantanalColor;

      const col = baseCol.clone();
      // subtle natural hue shift
      col.offsetHSL((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
      this.roundTreesMesh.setColorAt(idx, col);
    });

    this.roundTreesMesh.instanceMatrix.needsUpdate = true;
    if (this.roundTreesMesh.instanceColor) {
      this.roundTreesMesh.instanceColor.needsUpdate = true;
    }
    this.roundTreesMesh.castShadow = true;
    this.roundTreesMesh.receiveShadow = true;
    this.vegGroup.add(this.roundTreesMesh);

    // 3. Pine / Araucaria Foliage (Southern Brazil Araucaria umbrella / cone)
    const pineGeo = new THREE.ConeGeometry(0.38, 0.75, 5);
    pineGeo.translate(0, 0.65, 0);

    const pineMat = new THREE.MeshStandardMaterial({
      roughness: 0.75,
      metalness: 0.08,
      flatShading: true
    });

    this.pineTreesMesh = new THREE.InstancedMesh(pineGeo, pineMat, pineTreePositions.length);
    const pineColor = new THREE.Color(0x1b4d3e); // dark mountain pine

    pineTreePositions.forEach((tp, idx) => {
      dummy.position.set(tp.x, tp.y, tp.z);
      dummy.scale.set(tp.scale * 1.1, tp.scale * 1.2, tp.scale * 1.1);
      dummy.rotation.set(0, tp.rotY, (Math.random() - 0.5) * 0.1);
      dummy.updateMatrix();
      this.pineTreesMesh.setMatrixAt(idx, dummy.matrix);

      const col = pineColor.clone();
      col.offsetHSL(0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
      this.pineTreesMesh.setColorAt(idx, col);
    });

    this.pineTreesMesh.instanceMatrix.needsUpdate = true;
    if (this.pineTreesMesh.instanceColor) {
      this.pineTreesMesh.instanceColor.needsUpdate = true;
    }
    this.pineTreesMesh.castShadow = true;
    this.vegGroup.add(this.pineTreesMesh);
  }

  update(time) {
    // Gentle collective foliage breeze sway — subtle position oscillation
    // instead of rotating the entire mesh around the scene origin
    if (this.roundTreesMesh) {
      const swayX = Math.sin(time * 0.7) * 0.012;
      const swayZ = Math.cos(time * 0.5) * 0.008;
      this.roundTreesMesh.position.x = swayX;
      this.roundTreesMesh.position.z = swayZ;
    }
    if (this.pineTreesMesh) {
      const swayX = Math.sin(time * 0.6 + 1.0) * 0.008;
      const swayZ = Math.cos(time * 0.4 + 0.5) * 0.006;
      this.pineTreesMesh.position.x = swayX;
      this.pineTreesMesh.position.z = swayZ;
    }
  }
}
