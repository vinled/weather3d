import * as THREE from 'three';
import { latLonTo3D } from '../utils/geo.js';

export class FlyingRiversSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'flying-rivers-amazon';
    this.scene.add(this.group);

    this.visible = true;
    this.particleCount = 1400;
    this.particles = null;
    this.positions = null;
    this.particleData = [];
    this.spline = null;

    this.init();
  }

  init() {
    // 1. Spline trajectory of the Amazon Flying Rivers (Jato de Baixos Níveis - JBN)
    const waypoints = [
      { lat: 1.5, lon: -45.0, name: 'Vapor do Atlântico' },
      { lat: -1.2, lon: -51.0, name: 'Foz do Amazonas' },
      { lat: -2.8, lon: -58.0, name: 'Evapotranspiração da Floresta' },
      { lat: -5.0, lon: -65.0, name: 'Amazônia Ocidental' },
      { lat: -9.5, lon: -70.0, name: 'Bloqueio dos Andes' }, // Curva na Cordilheira
      { lat: -13.5, lon: -66.0, name: 'Canalização JBN' },
      { lat: -17.5, lon: -58.0, name: 'Centro-Oeste / Pantanal' },
      { lat: -21.0, lon: -51.5, name: 'Interior Paulista' },
      { lat: -23.5, lon: -46.5, name: 'Sudeste / Represas SP' },
      { lat: -25.5, lon: -41.0, name: 'Convergência Atlântica' }
    ];

    const points3D = waypoints.map(p => {
      const { x, z } = latLonTo3D(p.lat, p.lon);
      const ground = Math.max(0.04, this.terrain.getElevationAt(x, z));
      // Flies in low-to-mid troposphere (1.2 to 2.2 above ground)
      const y = ground + 1.4;
      return new THREE.Vector3(x, y, z);
    });

    this.spline = new THREE.CatmullRomCurve3(points3D);

    // 2. Translucent Aerial Ribbon Channel (O "leito" do rio no céu)
    const sampleCount = 80;
    const sampledPoints = this.spline.getPoints(sampleCount);

    const ribbonGeo = new THREE.BufferGeometry();
    const ribbonVerts = [];
    const ribbonIndices = [];

    const ribbonWidth = 2.4;

    for (let i = 0; i <= sampleCount; i++) {
      const u = i / sampleCount;
      const pt = this.spline.getPointAt(u);
      const tangent = this.spline.getTangentAt(u).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // Ribbon expands over the Amazon as moisture accumulates
      const currentWidth = ribbonWidth * (0.8 + Math.sin(u * Math.PI) * 0.9);

      const left = pt.clone().addScaledVector(normal, currentWidth * 0.5);
      const right = pt.clone().addScaledVector(normal, -currentWidth * 0.5);

      ribbonVerts.push(left.x, left.y, left.z);
      ribbonVerts.push(right.x, right.y, right.z);

      if (i < sampleCount) {
        const base = i * 2;
        ribbonIndices.push(base, base + 1, base + 2);
        ribbonIndices.push(base + 1, base + 3, base + 2);
      }
    }

    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonVerts, 3));
    ribbonGeo.setIndex(ribbonIndices);
    ribbonGeo.computeVertexNormals();

    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    this.group.add(this.ribbonMesh);

    // 3. Flowing Vapor Particles
    const particleGeo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);

    const cVapor = new THREE.Color(0x38bdf8);    // Ocean vapor (blue)
    const cForest = new THREE.Color(0x34d399);   // Forest transpiration (green/emerald)
    const cRainfall = new THREE.Color(0xfacc15); // Precipitation rainmaker (gold)
    const tempCol = new THREE.Color();

    for (let i = 0; i < this.particleCount; i++) {
      const u = Math.random();
      const speed = 0.0006 + Math.random() * 0.0008;
      const offsetRadius = 0.2 + Math.random() * 1.5;
      const offsetAngle = Math.random() * Math.PI * 2;

      const pt = this.spline.getPointAt(u);
      const normal = new THREE.Vector3(Math.cos(offsetAngle), Math.sin(offsetAngle) * 0.4, 0);

      this.positions[i * 3 + 0] = pt.x + normal.x * offsetRadius;
      this.positions[i * 3 + 1] = pt.y + normal.y * offsetRadius;
      this.positions[i * 3 + 2] = pt.z + normal.z * offsetRadius;

      // Color shifts along journey: Atlantic Blue -> Amazon Emerald -> Rainmaker Gold
      if (u < 0.4) {
        tempCol.copy(cVapor).lerp(cForest, u / 0.4);
      } else {
        tempCol.copy(cForest).lerp(cRainfall, (u - 0.4) / 0.6);
      }

      colors[i * 3 + 0] = tempCol.r;
      colors[i * 3 + 1] = tempCol.g;
      colors[i * 3 + 2] = tempCol.b;

      this.particleData.push({
        u, speed, offsetRadius, offsetAngle
      });
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(particleGeo, particleMat);
    this.group.add(this.particles);

    // 4. Floating Didactic Badge over the Amazon
    const badgePt = this.spline.getPointAt(0.35);
    this.createBadge('Rios Voadores da Amazônia', '#34d399', badgePt.x, badgePt.y + 1.8, badgePt.z);

    this.group.visible = this.visible;
  }

  createBadge(text, colorHex, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.roundRect(8, 8, 304, 48, 16);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colorHex;
    ctx.stroke();

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 160, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(5.2, 1.05, 1);
    sprite.position.set(x, y, z);
    this.group.add(sprite);
    this.badgeSprite = sprite;
  }

  update(time, delta = 0.016) {
    if (!this.group.visible || !this.particles) return;

    const dt = Math.min(delta, 0.05) * 60;
    const pos = this.positions;

    for (let i = 0; i < this.particleCount; i++) {
      const p = this.particleData[i];
      p.u = (p.u + p.speed * dt) % 1.0;

      const pt = this.spline.getPointAt(p.u);
      const tangent = this.spline.getTangentAt(p.u).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const currentOffset = p.offsetRadius * (0.8 + Math.sin(p.u * Math.PI) * 0.8);
      const sway = Math.sin(time * 2.0 + i) * 0.15;

      pos[i * 3 + 0] = pt.x + normal.x * (currentOffset * Math.cos(p.offsetAngle + time * 0.5));
      pos[i * 3 + 1] = pt.y + Math.sin(p.offsetAngle + time) * 0.35 + sway;
      pos[i * 3 + 2] = pt.z + normal.z * (currentOffset * Math.cos(p.offsetAngle + time * 0.5));
    }

    this.particles.geometry.attributes.position.needsUpdate = true;

    // Gentle ribbon pulsing
    if (this.ribbonMesh) {
      this.ribbonMesh.material.opacity = 0.14 + Math.sin(time * 1.5) * 0.04;
    }

    // Badge hover
    if (this.badgeSprite) {
      this.badgeSprite.position.y += Math.sin(time * 2.5) * 0.002;
    }
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }
}
