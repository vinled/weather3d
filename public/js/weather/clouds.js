import * as THREE from 'three';
import { latLonTo3D } from '../utils/geo.js';

export class CloudsLayer {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.visible = false;
    this.group = new THREE.Group();
    this.group.name = 'weather-clouds';
    this.scene.add(this.group);

    this.cloudPuffs = [];
    this.cloudMesh = null;
    this.totalPuffs = 120;
    this.stations = [];

    this.init();
  }

  init() {
    // Stylized low-poly faceted sphere for Apple-style fluffy clouds
    // Significantly reduced base radius (from 2.2 to 0.7) for smaller, realistic clouds
    const puffGeo = new THREE.DodecahedronGeometry(0.7, 1);
    const puffMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.9,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82,
      flatShading: true
    });

    this.cloudMesh = new THREE.InstancedMesh(puffGeo, puffMat, this.totalPuffs);
    this.cloudMesh.castShadow = false;

    // High altitude cirrus layer
    const cirrusGeo = new THREE.PlaneGeometry(160, 160, 1, 1);
    cirrusGeo.rotateX(-Math.PI / 2);
    const cirrusMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this.cirrusMesh = new THREE.Mesh(cirrusGeo, cirrusMat);
    this.cirrusMesh.position.y = 15; // Lowered cirrus layer
    this.group.add(this.cirrusMesh);

    const dummy = new THREE.Object3D();
    
    let puffIndex = 0;
    // Increased cluster count since clouds are now smaller
    const numClusters = 30;

    for (let c = 0; c < numClusters; c++) {
      const cx = (Math.random() - 0.5) * 125;
      const cz = (Math.random() - 0.5) * 125;
      // Lowered cloud altitude significantly
      const cy = 3.5 + Math.random() * 2.5;
      
      const puffsInCluster = 4 + Math.floor(Math.random() * 3);
      // Significantly slowed down cloud movement
      const speedX = -0.005 - Math.random() * 0.015;
      const speedZ = -0.002 - Math.random() * 0.008;

      for (let p = 0; p < puffsInCluster; p++) {
        if (puffIndex >= this.totalPuffs) break;

        const x = cx + (Math.random() - 0.5) * 3;
        const z = cz + (Math.random() - 0.5) * 3;
        const y = cy + (Math.random() - 0.5) * 0.8;

        const scaleX = 1.0 + Math.random() * 1.5;
        const scaleY = 0.5 + Math.random() * 0.6;
        const scaleZ = 1.0 + Math.random() * 1.5;
        const rotY = Math.random() * Math.PI;

        dummy.position.set(x, y, z);
        dummy.scale.set(scaleX, scaleY, scaleZ);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        this.cloudMesh.setMatrixAt(puffIndex, dummy.matrix);

        this.cloudPuffs.push({
          x, y, z,
          scaleX, scaleY, scaleZ,
          rotY,
          speedX, speedZ,
          clusterId: c
        });

        puffIndex++;
      }
    }
    
    this.totalPuffs = puffIndex;

    this.cloudMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.cloudMesh);
    this.group.visible = this.visible;
  }

  setWeatherData(stations) {
    if (!stations) return;
    this.stations = stations.map(st => {
      const pos = latLonTo3D(st.lat, st.lon);
      return { ...st, x: pos.x, z: pos.z };
    });

    let totalCover = 0;
    for (const st of stations) {
      totalCover += st.weather.cloud_cover || 0;
    }
    const avgCover = stations.length > 0 ? totalCover / stations.length : 50;

    if (this.cirrusMesh) {
      this.cirrusMesh.material.opacity = (avgCover / 100) * 0.25;
    }
    
    if (this.cloudMesh) {
      const globalOpacity = 0.3 + (avgCover / 100) * 0.7;
      this.cloudMesh.material.opacity = globalOpacity * 0.82;
    }
  }

  update(delta) {
    if (!this.group.visible || !this.cloudMesh) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.totalPuffs; i++) {
      const p = this.cloudPuffs[i];
      p.x += p.speedX * (delta * 60);
      p.z += p.speedZ * (delta * 60);

      // Loop around map edges in both directions
      if (p.x < -70) p.x += 140;
      if (p.x > 70) p.x -= 140;
      if (p.z < -70) p.z += 140;
      if (p.z > 70) p.z -= 140;
      
      let localCover = 50;
      if (this.stations && this.stations.length > 0) {
        let weightSum = 0;
        let coverSum = 0;
        for (const st of this.stations) {
          const dx = p.x - st.x;
          const dz = p.z - st.z;
          const distSq = dx * dx + dz * dz;
          const w = 1 / (distSq + 10);
          coverSum += (st.weather.cloud_cover || 0) * w;
          weightSum += w;
        }
        if (weightSum > 0) {
            localCover = coverSum / weightSum;
        }
      }

      if (localCover < 15) {
        dummy.position.set(0, -1000, 0);
        dummy.scale.set(0, 0, 0);
      } else {
        const scaleMod = 0.5 + (localCover / 100) * 0.7;
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(p.scaleX * scaleMod, p.scaleY * scaleMod, p.scaleZ * scaleMod);
      }
      
      dummy.rotation.set(0, p.rotY, 0);
      dummy.updateMatrix();
      this.cloudMesh.setMatrixAt(i, dummy.matrix);
    }

    this.cloudMesh.instanceMatrix.needsUpdate = true;
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
