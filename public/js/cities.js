import * as THREE from 'three';
import { BRAZIL_CITIES } from './data/brazilData.js';
import { latLonTo3D } from './utils/geo.js';

export class CitiesSystem {
  constructor(scene, terrain, onCitySelect) {
    this.scene = scene;
    this.terrain = terrain;
    this.onCitySelect = onCitySelect;
    this.cityGroup = new THREE.Group();
    this.cityGroup.name = 'brazil-cities';
    this.scene.add(this.cityGroup);

    this.cityMarkers = [];
    this.buildingsMesh = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.init();
  }

  init() {
    this.createBuildingClusters();
    this.createCityLabels();
  }

  createBuildingClusters() {
    // Total buildings to instance
    let totalBuildings = 0;
    BRAZIL_CITIES.forEach(c => {
      totalBuildings += c.buildings;
    });

    // Minimalist Apple-style building geometry
    const buildingGeo = new THREE.BoxGeometry(0.35, 1.0, 0.35);
    // Move pivot to bottom so scaling heights scales upwards
    buildingGeo.translate(0, 0.5, 0);

    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0, // Apple architectural clean white/silver
      roughness: 0.25,
      metalness: 0.45,
      emissive: 0x1e293b,
      emissiveIntensity: 0.2
    });

    this.buildingsMesh = new THREE.InstancedMesh(buildingGeo, buildingMat, totalBuildings);
    this.buildingsMesh.castShadow = true;
    this.buildingsMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let instanceIdx = 0;

    BRAZIL_CITIES.forEach(city => {
      const { x, z } = latLonTo3D(city.lat, city.lon);
      const groundY = this.terrain.getElevationAt(x, z);

      // Distribute small clusters of buildings side by side
      const count = city.buildings;
      const isMetropolis = city.pop > 3000000;

      const cityGroundY = Math.max(0.08, this.terrain.getElevation(city.lat, city.lon));

      for (let i = 0; i < count; i++) {
        let offsetX = 0;
        let offsetZ = 0;

        if (i > 0) {
          // Tight compact miniature city cluster (so coastal cities stay firmly on land)
          const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.4;
          const radius = 0.18 + (i % 3) * 0.14;
          offsetX = Math.cos(angle) * radius;
          offsetZ = Math.sin(angle) * radius;
        }

        const bX = x + offsetX;
        const bZ = z + offsetZ;
        const bY = Math.max(cityGroundY, this.terrain.getElevationAt(bX, bZ));

        // Height varies by city importance and distance from center (miniature model style)
        let baseHeight = isMetropolis ? 0.95 : 0.55;
        if (i === 0) baseHeight *= 1.35; // Central iconic tower
        const heightVariation = 0.5 + Math.random() * 0.7;
        const height = baseHeight * heightVariation;

        dummy.position.set(bX, bY, bZ);
        dummy.scale.set(
          0.65 + Math.random() * 0.3,
          height,
          0.65 + Math.random() * 0.3
        );
        dummy.rotation.y = (Math.random() - 0.5) * 0.3;
        dummy.updateMatrix();

        this.buildingsMesh.setMatrixAt(instanceIdx, dummy.matrix);

        // Building subtle color variation (white, glass-tint, light warm gray)
        const tone = 0.88 + Math.random() * 0.12;
        const col = new THREE.Color(tone, tone * 0.98, tone * 1.02);
        this.buildingsMesh.setColorAt(instanceIdx, col);

        instanceIdx++;
      }
    });

    this.buildingsMesh.instanceMatrix.needsUpdate = true;
    if (this.buildingsMesh.instanceColor) {
      this.buildingsMesh.instanceColor.needsUpdate = true;
    }
    this.cityGroup.add(this.buildingsMesh);
  }

  createCityLabels() {
    // Interactive 3D pins/markers with glowing pulsing halo
    const pinGeo = new THREE.CylinderGeometry(0.09, 0.0, 0.3, 6);
    pinGeo.rotateX(Math.PI); // Point downward
    pinGeo.translate(0, 0.15, 0);

    const pinMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8 // Apple light blue accent
    });

    BRAZIL_CITIES.forEach(city => {
      const { x, z } = latLonTo3D(city.lat, city.lon);
      const y = Math.max(0.08, this.terrain.getElevation(city.lat, city.lon));

      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(x, y + 0.9, z);
      pin.userData = { city };

      // Invisible, large hitbox to make clicking on the pin much easier
      const hitboxGeo = new THREE.SphereGeometry(1.2, 8, 8);
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.userData = { city };
      pin.add(hitbox);

      // Ground pulsing ring under city
      const ringGeo = new THREE.RingGeometry(0.2, 0.35, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(x, y + 0.03, z);

      this.cityGroup.add(pin);
      this.cityGroup.add(ring);

      this.cityMarkers.push({
        city,
        pin,
        ring,
        worldPos: new THREE.Vector3(x, y + 1.05, z),
        temp: 24, // default, will update from real API
        domElement: null
      });
    });
  }

  /**
   * Updates real-time weather temperature on city badges
   */
  updateWeatherData(weatherStations) {
    if (!weatherStations || !Array.isArray(weatherStations)) return;

    const norm = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    weatherStations.forEach(station => {
      const stNorm = norm(station.name);
      const marker = this.cityMarkers.find(m => {
        const cNorm = norm(m.city.name);
        return cNorm === stNorm || cNorm.includes(stNorm) || stNorm.includes(cNorm);
      });

      if (marker && station.weather) {
        marker.temp = Math.round(station.weather.temperature_2m);
        marker.weatherCode = station.weather.weather_code;
        marker.windSpeed = Math.round(station.weather.wind_speed_10m);
        marker.rain = station.weather.rain || 0;
      }
    });
  }

  update(time, camera, controls) {
    const camDist = controls ? camera.position.distanceTo(controls.target) : camera.position.length();

    let maxTier = 1;
    if (camDist < 55) {
      maxTier = 3; // Close zoom: show all cities, towns and tourist destinations
    } else if (camDist < 88) {
      maxTier = 2; // Mid zoom: show state capitals & regional hubs
    } else {
      maxTier = 1; // Far zoom: show major metropolises
    }

    this.currentMaxTier = maxTier;

    // Subtle float animation and tier visibility for city pins
    this.cityMarkers.forEach((m, idx) => {
      const isVisible = (m.city.tier || 1) <= maxTier;
      m.pin.visible = isVisible;
      m.ring.visible = isVisible;
      m.isVisible = isVisible;

      if (isVisible) {
        m.pin.position.y = m.worldPos.y - 0.15 + Math.sin(time * 2.5 + idx) * 0.05;
        m.ring.scale.setScalar(1.0 + Math.sin(time * 2.0 + idx) * 0.12);
      }
    });
  }
}
