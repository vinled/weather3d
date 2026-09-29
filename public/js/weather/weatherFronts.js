import * as THREE from 'three';
import { latLonTo3D } from '../utils/geo.js';

export class WeatherFrontsSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'synoptic-weather-fronts';
    this.scene.add(this.group);

    this.visible = true;
    this.forecastHour = 0;
    this.frontMeshes = [];

    this.init();
  }

  init() {
    this.buildColdFront();
    this.buildWarmFront();
    this.buildZCAS();
  }

  /**
   * Frente Fria (Cold Front): Blue line with sharp forward-pointing triangles
   * Advancing from South towards Southeast Brazil
   */
  buildColdFront() {
    this.coldFrontGroup = new THREE.Group();
    this.coldFrontGroup.name = 'cold-front';
    this.group.add(this.coldFrontGroup);

    // Initial base points (RS / Uruguay up to Atlantic Ocean)
    this.coldFrontBasePoints = [
      { lat: -34.5, lon: -54.0 }, // Uruguai / Atlântico Sul
      { lat: -31.5, lon: -51.5 }, // Rio Grande do Sul / Litoral
      { lat: -28.0, lon: -49.0 }, // Santa Catarina
      { lat: -25.5, lon: -46.5 }, // Paraná / São Paulo litoral
      { lat: -23.0, lon: -41.0 }  // Atlântico Sudeste
    ];

    this.updateColdFrontGeometry(0);
  }

  updateColdFrontGeometry(hourOffset = 0) {
    // Clear previous mesh
    while (this.coldFrontGroup.children.length > 0) {
      const obj = this.coldFrontGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      this.coldFrontGroup.remove(obj);
    }

    // Front advances northeast as time progresses (+6h, +12h, +24h, +48h)
    const advanceKm = (hourOffset / 24) * 4.5; // ~4.5 degrees latitude northward progression over 24h
    const currentPoints = this.coldFrontBasePoints.map(p => {
      const lat = p.lat + advanceKm * 0.7;
      const lon = p.lon + advanceKm * 0.4;
      const { x, z } = latLonTo3D(lat, lon);
      const y = Math.max(0.04, this.terrain.getElevationAt(x, z)) + 0.18;
      return new THREE.Vector3(x, y, z);
    });

    const curve = new THREE.CatmullRomCurve3(currentPoints);
    const sampleCount = 60;
    const curvePoints = curve.getPoints(sampleCount);

    // 1. Sleek glowing blue front line
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.92
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this.coldFrontGroup.add(line);

    // 2. Classical Synoptic Blue Triangles along the front
    // Triangles point in the direction of front movement (Northeast)
    const triangleCount = 10;
    const triGeo = new THREE.BufferGeometry();
    const triPositions = [];

    for (let i = 1; i <= triangleCount; i++) {
      const u = (i - 0.5) / triangleCount;
      const pt = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u).normalize();
      
      // Normal vector pointing forward (left of tangent)
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const size = 0.75;
      const p1 = pt.clone().addScaledVector(tangent, -size * 0.5);
      const p2 = pt.clone().addScaledVector(tangent, size * 0.5);
      const tip = pt.clone().addScaledVector(normal, size * 0.85);

      // Triangle vertices (p1, p2, tip)
      triPositions.push(p1.x, p1.y, p1.z);
      triPositions.push(p2.x, p2.y, p2.z);
      triPositions.push(tip.x, tip.y, tip.z);
    }

    triGeo.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
    triGeo.computeVertexNormals();

    const triMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7, // Intense meteorological blue
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const triMesh = new THREE.Mesh(triGeo, triMat);
    this.coldFrontGroup.add(triMesh);

    // 3. Floating label badge
    const midPoint = curve.getPointAt(0.5);
    const badge = this.createFrontBadge('Frente Fria Ativa', '#38bdf8', midPoint.x, midPoint.y + 1.2, midPoint.z);
    this.coldFrontGroup.add(badge);
  }

  /**
   * Frente Quente (Warm Front): Red line with red semicircles
   */
  buildWarmFront() {
    this.warmFrontGroup = new THREE.Group();
    this.warmFrontGroup.name = 'warm-front';
    this.group.add(this.warmFrontGroup);

    const warmPoints = [
      { lat: -29.0, lon: -40.0 },
      { lat: -27.0, lon: -35.0 },
      { lat: -24.0, lon: -31.0 }
    ].map(p => {
      const { x, z } = latLonTo3D(p.lat, p.lon);
      const y = 0.08 + 0.16;
      return new THREE.Vector3(x, y, z);
    });

    const curve = new THREE.CatmullRomCurve3(warmPoints);
    const curvePoints = curve.getPoints(40);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xf43f5e,
      linewidth: 2.5,
      transparent: true,
      opacity: 0.85
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this.warmFrontGroup.add(line);

    // Warm front semicircles
    const circleCount = 4;
    for (let i = 1; i <= circleCount; i++) {
      const u = (i - 0.5) / circleCount;
      const pt = curve.getPointAt(u);
      const semiGeo = new THREE.CircleGeometry(0.55, 12, 0, Math.PI);
      semiGeo.rotateX(-Math.PI / 2);
      const semiMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      const semiMesh = new THREE.Mesh(semiGeo, semiMat);
      semiMesh.position.copy(pt);
      semiMesh.position.y += 0.02;
      this.warmFrontGroup.add(semiMesh);
    }
  }

  /**
   * ZCAS (Zona de Convergência do Atlântico Sul):
   * Golden dashed line channel from Amazon to Southeast Brazil
   */
  buildZCAS() {
    this.zcasGroup = new THREE.Group();
    this.zcasGroup.name = 'zcas-convergence';
    this.group.add(this.zcasGroup);

    const zcasPoints = [
      { lat: -4.0, lon: -62.0 },  // Amazônia Central
      { lat: -9.5, lon: -56.0 },  // Mato Grosso Norte
      { lat: -15.5, lon: -49.0 }, // Goiás
      { lat: -20.5, lon: -44.0 }, // Minas Gerais
      { lat: -23.0, lon: -40.0 }  // Atlântico RJ/ES
    ].map(p => {
      const { x, z } = latLonTo3D(p.lat, p.lon);
      const y = Math.max(0.04, this.terrain.getElevationAt(x, z)) + 0.16;
      return new THREE.Vector3(x, y, z);
    });

    const curve = new THREE.CatmullRomCurve3(zcasPoints);
    const curvePoints = curve.getPoints(50);

    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b, // Amber / warm gold
      dashSize: 1.4,
      gapSize: 0.8,
      linewidth: 2,
      transparent: true,
      opacity: 0.75
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.computeLineDistances();
    this.zcasGroup.add(line);
  }

  createFrontBadge(text, colorHex, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Rounded tag
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 48, 16);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colorHex;
    ctx.stroke();

    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.2, 1.05, 1);
    sprite.position.set(x, y, z);
    return sprite;
  }

  setForecastHour(hour) {
    this.forecastHour = hour;
    this.updateColdFrontGeometry(hour);
  }

  update(time) {
    if (!this.group.visible) return;
    // Gentle bobbing animation for the front badges
    if (this.coldFrontGroup) {
      this.coldFrontGroup.children.forEach(child => {
        if (child.isSprite) {
          child.position.y += Math.sin(time * 2.0) * 0.002;
        }
      });
    }
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }
}
