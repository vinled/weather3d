import * as THREE from 'three';
import { latLonTo3D, threeDToLatLon } from './utils/geo.js';

/**
 * OpenStreetMap Dynamic Slippy Tile System for Three.js
 * Loads high-resolution street and city map tiles on zoom, transitioning smoothly
 * between continental 3D relief and detailed urban street grids (OSM / CartoDB).
 */
export class OpenStreetMapSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'openstreetmap-layer';
    this.scene.add(this.group);

    this.loader = new THREE.TextureLoader();
    this.textureCache = new Map(); // key -> THREE.Texture
    this.tileMeshes = new Map(); // key -> { mesh, zoom, tileX, tileY }

    this.enabled = true;
    this.opacity = 0.0;
    this.targetOpacity = 0.0;
    this.currentZoom = 7;
    this.tileElevation = 0.038; // Sits just above flat base, blends with terrain
    this.provider = 'carto-dark'; // 'carto-dark' | 'carto-voyager' | 'osm-standard'

    this.providers = {
      'carto-dark': {
        name: 'OpenStreetMap (Dark Matter)',
        url: (z, x, y) => `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
        attribution: '© OpenStreetMap contributors, © CARTO'
      },
      'carto-voyager': {
        name: 'OpenStreetMap (Voyager)',
        url: (z, x, y) => `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
        attribution: '© OpenStreetMap contributors, © CARTO'
      },
      'osm-standard': {
        name: 'OpenStreetMap (Padrão)',
        url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        attribution: '© OpenStreetMap contributors'
      }
    };

    this.initAttributionBadge();
  }

  initAttributionBadge() {
    let badge = document.getElementById('osm-attribution-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'osm-attribution-badge';
      badge.className = 'osm-attribution-badge osm-badge-hidden';
      badge.innerHTML = `<span>🗺️ Dados do mapa: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></span>`;
      document.body.appendChild(badge);
    }
    this.badgeEl = badge;
  }

  setProvider(providerKey) {
    if (!this.providers[providerKey] || this.provider === providerKey) return;
    this.provider = providerKey;
    this.clearAllTiles();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.group.visible = false;
      this.opacity = 0;
      this.targetOpacity = 0;
      if (this.badgeEl) this.badgeEl.classList.add('osm-badge-hidden');
    }
  }

  // --- SLIPPY MAP TILE MATH (EPSG:3857) ---

  lon2tile(lon, zoom) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  }

  lat2tile(lat, zoom) {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom)
    );
  }

  tile2lon(x, zoom) {
    return (x / Math.pow(2, zoom)) * 360 - 180;
  }

  tile2lat(y, zoom) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  /**
   * Updates tile streaming and opacity based on camera altitude and target position
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} controlsTarget
   * @returns {number} current opacity factor (0.0 to 1.0)
   */
  update(camera, controlsTarget) {
    if (!this.enabled || !camera || !controlsTarget) {
      if (this.group.visible) this.group.visible = false;
      return 0.0;
    }

    const camDist = camera.position.distanceTo(controlsTarget);

    // Zoom transition thresholds:
    // camDist > 110: 3D Macro relief (OSM 0% opacity)
    // camDist 110 -> 40: Progressive crossfade from 3D mountains to OSM street grid
    // camDist < 40: Full OSM street-level detail (100% opacity)
    if (camDist > 110) {
      this.targetOpacity = 0.0;
    } else if (camDist < 40) {
      this.targetOpacity = 1.0;
    } else {
      this.targetOpacity = (110 - camDist) / 70;
    }

    // Smooth opacity interpolation
    this.opacity += (this.targetOpacity - this.opacity) * 0.12;

    if (this.opacity < 0.02) {
      this.group.visible = false;
      if (this.badgeEl) this.badgeEl.classList.add('osm-badge-hidden');
      return 0.0;
    }

    this.group.visible = true;
    if (this.badgeEl) this.badgeEl.classList.remove('osm-badge-hidden');

    // Determine target zoom level based on camera proximity
    let targetZoom = 6;
    if (camDist < 12) targetZoom = 14;
    else if (camDist < 20) targetZoom = 12;
    else if (camDist < 35) targetZoom = 10;
    else if (camDist < 55) targetZoom = 8;
    else if (camDist < 75) targetZoom = 7;

    // Convert focus center point to Lat/Lon
    const centerLatLon = threeDToLatLon(controlsTarget.x, controlsTarget.z);
    // Clamp to valid Brazil / South America range
    const lat = Math.max(-35, Math.min(6, centerLatLon.lat));
    const lon = Math.max(-75, Math.min(-33, centerLatLon.lon));

    this.currentZoom = targetZoom;
    this.syncVisibleTiles(lat, lon, targetZoom, camDist);

    // Apply updated opacity to all active tile materials
    for (const tileObj of this.tileMeshes.values()) {
      if (tileObj.mesh && tileObj.mesh.material) {
        tileObj.mesh.material.opacity = this.opacity * 0.94;
      }
    }

    return this.opacity;
  }

  syncVisibleTiles(centerLat, centerLon, zoom, camDist) {
    const centerTileX = this.lon2tile(centerLon, zoom);
    const centerTileY = this.lat2tile(centerLat, zoom);

    // Grid radius: 2 for close view (5x5 tiles), 3 for mid view (7x7 tiles)
    const radius = camDist < 25 ? 2 : (camDist < 50 ? 3 : 2);
    const activeKeys = new Set();

    const minX = centerTileX - radius;
    const maxX = centerTileX + radius;
    const minY = centerTileY - radius;
    const maxY = centerTileY + radius;

    const maxTiles = Math.pow(2, zoom);

    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || x >= maxTiles) continue;
      for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= maxTiles) continue;

        const tileKey = `${this.provider}_${zoom}_${x}_${y}`;
        activeKeys.add(tileKey);

        if (!this.tileMeshes.has(tileKey)) {
          this.createTileMesh(zoom, x, y, tileKey);
        }
      }
    }

    // Cleanup offscreen or outdated zoom tiles
    for (const [key, tileObj] of this.tileMeshes.entries()) {
      if (!activeKeys.has(key)) {
        this.group.remove(tileObj.mesh);
        if (tileObj.mesh.geometry) tileObj.mesh.geometry.dispose();
        if (tileObj.mesh.material) tileObj.mesh.material.dispose();
        this.tileMeshes.delete(key);
      }
    }
  }

  createTileMesh(zoom, tileX, tileY, tileKey) {
    // Calculate tile geographic bounding box
    const nwLat = this.tile2lat(tileY, zoom);
    const nwLon = this.tile2lon(tileX, zoom);
    const seLat = this.tile2lat(tileY + 1, zoom);
    const seLon = this.tile2lon(tileX + 1, zoom);

    // Project NW and SE corners to 3D scene space
    const p1 = latLonTo3D(nwLat, nwLon);
    const p2 = latLonTo3D(seLat, seLon);

    const width = Math.abs(p2.x - p1.x);
    const depth = Math.abs(p2.z - p1.z);
    const centerX = (p1.x + p2.x) / 2;
    const centerZ = (p1.z + p2.z) / 2;

    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: this.opacity * 0.94,
      depthTest: true,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, this.tileElevation, centerZ);
    mesh.renderOrder = 4; // Renders above base plate (y=0.038), below heatmap (y=0.050)
    this.group.add(mesh);

    const tileObj = { mesh, zoom, tileX, tileY };
    this.tileMeshes.set(tileKey, tileObj);

    // Fetch and apply texture asynchronously
    this.loadTileTexture(zoom, tileX, tileY, tileKey, material);
  }

  loadTileTexture(zoom, tileX, tileY, tileKey, material) {
    const url = this.providers[this.provider].url(zoom, tileX, tileY);

    if (this.textureCache.has(tileKey)) {
      material.map = this.textureCache.get(tileKey);
      material.needsUpdate = true;
      return;
    }

    this.loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        this.textureCache.set(tileKey, texture);

        if (material) {
          material.map = texture;
          material.needsUpdate = true;
        }
      },
      undefined,
      (err) => {
        // Fallback gracefully on network timeout
        // console.warn(`Falha ao carregar tile OSM ${zoom}/${tileX}/${tileY}:`, err);
      }
    );
  }

  clearAllTiles() {
    for (const tileObj of this.tileMeshes.values()) {
      this.group.remove(tileObj.mesh);
      if (tileObj.mesh.geometry) tileObj.mesh.geometry.dispose();
      if (tileObj.mesh.material) tileObj.mesh.material.dispose();
    }
    this.tileMeshes.clear();
  }
}
