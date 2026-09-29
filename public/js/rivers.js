import * as THREE from 'three';
import { latLonTo3D } from './utils/geo.js';

export class BrazilRiversSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'brazil-major-rivers';
    this.scene.add(this.group);

    this.visible = true;
    this.riverMeshes = [];

    this.init();
  }

  init() {
    // 1. Rio Amazonas / Solimões (O Gigante das Águas)
    const amazonasPath = [
      { lat: -4.3, lon: -70.0, width: 0.45 },
      { lat: -3.8, lon: -68.0, width: 0.55 },
      { lat: -3.4, lon: -65.0, width: 0.65 },
      { lat: -3.3, lon: -62.0, width: 0.75 },
      { lat: -3.1, lon: -60.0, width: 0.90 }, // Manaus (Encontro das Águas)
      { lat: -2.6, lon: -57.0, width: 1.05 },
      { lat: -2.4, lon: -54.7, width: 1.20 }, // Santarém
      { lat: -1.8, lon: -52.5, width: 1.45 },
      { lat: -1.4, lon: -51.0, width: 1.80 },
      { lat: -0.3, lon: -49.5, width: 2.30 }  // Foz / Ilha do Marajó
    ];
    this.createRiver('Rio Amazonas', amazonasPath, 0x38bdf8);

    // 2. Rio São Francisco ("Velho Chico" - Integração Nacional)
    const saoFranciscoPath = [
      { lat: -20.2, lon: -46.4, width: 0.25 }, // Serra da Canastra
      { lat: -18.2, lon: -45.2, width: 0.30 }, // Pirapora
      { lat: -15.4, lon: -44.4, width: 0.35 }, // Januária
      { lat: -13.2, lon: -43.4, width: 0.40 }, // Bom Jesus da Lapa
      { lat: -11.0, lon: -42.8, width: 0.42 }, // Barra
      { lat: -9.4, lon: -40.5, width: 0.45 },  // Sobradinho / Petrolina
      { lat: -9.4, lon: -38.2, width: 0.40 },  // Paulo Afonso
      { lat: -10.5, lon: -36.4, width: 0.50 }  // Foz AL/SE no Atlântico
    ];
    this.createRiver('Rio São Francisco', saoFranciscoPath, 0x06b6d4);

    // 3. Rio Paraná (Bacia do Prata & Itaipu)
    const paranaPath = [
      { lat: -20.0, lon: -51.0, width: 0.35 }, // Confluência Paranaíba/Grande
      { lat: -21.8, lon: -52.2, width: 0.40 },
      { lat: -23.5, lon: -53.6, width: 0.45 },
      { lat: -24.1, lon: -54.2, width: 0.50 }, // Guaíra
      { lat: -25.5, lon: -54.6, width: 0.55 }, // Foz do Iguaçu / Itaipu
      { lat: -27.5, lon: -56.0, width: 0.60 }, // Fronteira Argentina
      { lat: -32.0, lon: -60.5, width: 0.70 }  // Rumo ao Prata
    ];
    this.createRiver('Rio Paraná', paranaPath, 0x0ea5e9);

    // 4. Rio Paraguai & Pantanal
    const paraguaiPath = [
      { lat: -16.0, lon: -57.7, width: 0.30 }, // Cáceres
      { lat: -19.0, lon: -57.6, width: 0.38 }, // Corumbá / Pantanal
      { lat: -21.7, lon: -57.9, width: 0.42 }, // Porto Murtinho
      { lat: -24.5, lon: -57.2, width: 0.45 }
    ];
    this.createRiver('Rio Paraguai', paraguaiPath, 0x14b8a6);

    // 5. Rio Madeira (Maior afluente do Amazonas)
    const madeiraPath = [
      { lat: -8.8, lon: -63.9, width: 0.35 },  // Porto Velho
      { lat: -6.5, lon: -62.0, width: 0.42 },  // Humaitá
      { lat: -4.5, lon: -60.5, width: 0.50 },
      { lat: -3.4, lon: -58.8, width: 0.60 }   // Foz no Amazonas
    ];
    this.createRiver('Rio Madeira', madeiraPath, 0x38bdf8);

    // 6. Rio Tocantins / Araguaia
    const tocantinsPath = [
      { lat: -14.0, lon: -48.2, width: 0.25 },
      { lat: -10.2, lon: -48.3, width: 0.35 }, // Palmas
      { lat: -5.5, lon: -47.5, width: 0.45 },  // Imperatriz
      { lat: -3.8, lon: -49.7, width: 0.55 },  // Tucuruí
      { lat: -1.7, lon: -48.8, width: 0.75 }   // Foz perto de Belém
    ];
    this.createRiver('Rio Tocantins', tocantinsPath, 0x0ea5e9);
  }

  createRiver(name, pointsData, colorHex) {
    const points3D = [];
    const widths = [];

    for (const p of pointsData) {
      const { x, z } = latLonTo3D(p.lat, p.lon);
      const y = Math.max(0.04, this.terrain.getElevationAt(x, z)) + 0.025;
      points3D.push(new THREE.Vector3(x, y, z));
      widths.push(p.width);
    }

    const curve = new THREE.CatmullRomCurve3(points3D);
    const sampleCount = Math.max(30, pointsData.length * 8);
    const sampledPoints = curve.getPoints(sampleCount);

    // Generate ribbon mesh along curve with varying width
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= sampleCount; i++) {
      const u = i / sampleCount;
      const pt = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // Interpolate width along curve
      const widthIdx = Math.min(widths.length - 1, Math.floor(u * (widths.length - 1)));
      const nextIdx = Math.min(widths.length - 1, widthIdx + 1);
      const frac = (u * (widths.length - 1)) - widthIdx;
      const w = widths[widthIdx] + (widths[nextIdx] - widths[widthIdx]) * frac;

      // Project left and right vertices with ground elevation adjustment
      const leftX = pt.x + normal.x * (w * 0.5);
      const leftZ = pt.z + normal.z * (w * 0.5);
      const leftY = Math.max(0.04, this.terrain.getElevationAt(leftX, leftZ)) + 0.028;

      const rightX = pt.x - normal.x * (w * 0.5);
      const rightZ = pt.z - normal.z * (w * 0.5);
      const rightY = Math.max(0.04, this.terrain.getElevationAt(rightX, rightZ)) + 0.028;

      vertices.push(leftX, leftY, leftZ);
      vertices.push(rightX, rightY, rightZ);

      uvs.push(0, u * 8);
      uvs.push(1, u * 8);

      if (i < sampleCount) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.18,
      metalness: 0.75,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    this.group.add(mesh);
    this.riverMeshes.push(mesh);
  }

  update(time) {
    if (!this.group.visible) return;
    // Water shimmer pulsation
    const shimmer = 0.18 + Math.sin(time * 1.5) * 0.04;
    for (const mesh of this.riverMeshes) {
      if (mesh.material) {
        mesh.material.roughness = shimmer;
      }
    }
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }
}
