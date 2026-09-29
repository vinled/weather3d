import * as THREE from 'three';
import { latLonTo3D } from '../utils/geo.js';

export class LightningLayer {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.visible = false;
    this.group = new THREE.Group();
    this.group.name = 'weather-lightning';
    this.scene.add(this.group);

    this.activeBolts = [];
    this.flashLight = null;
    this.stormCenters = [];
    this.strikeTimer = 0;

    this.init();
  }

  init() {
    // Ambient flash light when thunder strikes
    this.flashLight = new THREE.PointLight(0xa5f3fc, 0, 80, 1.2);
    this.flashLight.position.set(0, 20, 0);
    this.group.add(this.flashLight);

    // Object Pool for bolts
    this.boltPool = [];
    for(let i = 0; i < 6; i++) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(100 * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.LineBasicMaterial({
          color: 0xecfeff, // Electric white-cyan
          linewidth: 3,
          transparent: true,
          opacity: 1.0,
          blending: THREE.AdditiveBlending
        });
        const line = new THREE.Line(geo, mat);
        line.visible = false;
        this.group.add(line);
        this.boltPool.push({ mesh: line, active: false, life: 0, maxLife: 0.25 });
    }

    // Default storm zones
    const p1 = latLonTo3D(-3.1, -60.0);
    const p2 = latLonTo3D(-15.6, -56.1);
    const p3 = latLonTo3D(-23.5, -46.6);
    this.stormCenters = [
      { x: p1.x, z: p1.z, radius: 16 },
      { x: p2.x, z: p2.z, radius: 14 },
      { x: p3.x, z: p3.z, radius: 12 }
    ];

    this.sceneAmbientLight = null;
    this.baseAmbientIntensity = 0;
    this.scene.traverse((child) => {
      if (child.isAmbientLight && !this.sceneAmbientLight) {
        this.sceneAmbientLight = child;
        this.baseAmbientIntensity = child.intensity;
      }
    });
    this.ambientFlashTimer = 0;

    this.group.visible = this.visible;
  }

  setWeatherData(stations) {
    if (stations && Array.isArray(stations)) {
      const active = [];
      stations.forEach(st => {
        // Code 95, 96, 99 = Thunderstorms. Precip > 5.0
        if (st.weather.weather_code >= 95 || st.weather.precipitation > 5.0) {
          const { x, z } = latLonTo3D(st.lat, st.lon);
          active.push({ x, z, radius: 14 });
        }
      });
      if (active.length > 0) {
        this.stormCenters = active;
      }
    }
  }

  createBolt(startX, startY, startZ, endX, endY, endZ) {
    let bolt = this.boltPool.find(b => !b.active);
    if (!bolt) return; // Pool empty

    const points = [];
    points.push(new THREE.Vector3(startX, startY, startZ));

    const segments = 16;
    let curr = new THREE.Vector3(startX, startY, startZ);
    const target = new THREE.Vector3(endX, endY, endZ);

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const interp = new THREE.Vector3().lerpVectors(curr, target, t);
      // Add jagged randomness
      const jitter = (1.0 - Math.abs(t - 0.5) * 1.5) * 1.6;
      interp.x += (Math.random() - 0.5) * jitter;
      interp.z += (Math.random() - 0.5) * jitter;
      points.push(interp);
      
      // Dendritic branch forks at 40-70% height
      if (i >= 6 && i <= 11 && Math.random() > 0.6) {
         let branchTarget = interp.clone();
         branchTarget.x += (Math.random() - 0.5) * 10;
         branchTarget.y -= 4 + Math.random() * 6;
         branchTarget.z += (Math.random() - 0.5) * 10;
         points.push(interp);
         points.push(branchTarget);
         points.push(interp); // return
      }
    }
    points.push(target);

    // Limit points to buffer size
    const maxPoints = 100;
    const ptCount = Math.min(points.length, maxPoints);

    const pos = bolt.mesh.geometry.attributes.position.array;
    for(let i=0; i<ptCount; i++) {
        pos[i*3] = points[i].x;
        pos[i*3+1] = points[i].y;
        pos[i*3+2] = points[i].z;
    }
    bolt.mesh.geometry.setDrawRange(0, ptCount);
    bolt.mesh.geometry.attributes.position.needsUpdate = true;

    bolt.active = true;
    bolt.life = bolt.maxLife;
    bolt.mesh.visible = true;
    bolt.mesh.material.opacity = 1.0;

    // Flash light position & intensity
    this.flashLight.position.set(endX, endY + 5, endZ);
    this.flashLight.intensity = 8.5;
    
    // Scene ambient flash
    if (this.sceneAmbientLight) {
        this.sceneAmbientLight.intensity = this.baseAmbientIntensity * 1.3;
        this.ambientFlashTimer = 0.08;
    }
  }

  triggerRandomStrike() {
    if (this.stormCenters.length === 0) return;

    const center = this.stormCenters[Math.floor(Math.random() * this.stormCenters.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * center.radius;

    const hitX = center.x + Math.cos(angle) * dist;
    const hitZ = center.z + Math.sin(angle) * dist;
    const hitY = this.terrain.getElevationAt(hitX, hitZ);

    const cloudX = hitX + (Math.random() - 0.5) * 6;
    const cloudZ = hitZ + (Math.random() - 0.5) * 6;
    const cloudY = hitY + 18 + Math.random() * 5;

    this.createBolt(cloudX, cloudY, cloudZ, hitX, hitY, hitZ);
  }

  update(delta) {
    if (!this.group.visible) return;

    this.strikeTimer += delta;
    if (this.strikeTimer > 1.2 + Math.random() * 1.8) {
      this.strikeTimer = 0;
      this.triggerRandomStrike();
    }
    
    if (this.ambientFlashTimer > 0) {
      this.ambientFlashTimer -= delta;
      if (this.ambientFlashTimer <= 0 && this.sceneAmbientLight) {
         this.sceneAmbientLight.intensity = this.baseAmbientIntensity;
      }
    }

    // Decay active bolts & flashes
    for (let i = 0; i < this.boltPool.length; i++) {
      const bolt = this.boltPool[i];
      if (!bolt.active) continue;

      bolt.life -= delta;

      if (bolt.life <= 0) {
        bolt.active = false;
        bolt.mesh.visible = false;
      } else {
        const alpha = bolt.life / bolt.maxLife;
        bolt.mesh.material.opacity = alpha;
      }
    }

    if (this.flashLight.intensity > 0) {
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - delta * 25);
    }
  }

  show() {
    this.visible = true;
    this.group.visible = true;
  }

  hide() {
    this.visible = false;
    this.group.visible = false;
    this.flashLight.intensity = 0;
    this.boltPool.forEach(b => {
      b.active = false;
      b.mesh.visible = false;
    });
    if (this.sceneAmbientLight && this.ambientFlashTimer > 0) {
       this.sceneAmbientLight.intensity = this.baseAmbientIntensity;
       this.ambientFlashTimer = 0;
    }
  }
}
