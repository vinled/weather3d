import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BrazilTerrain } from './terrain.js';
import { CitiesSystem } from './cities.js';
import { VegetationSystem } from './vegetation.js';
import { WeatherManager } from './weather/weatherManager.js';
import { AtmosphereSystem } from './weather/atmosphere.js';
import { WeatherFrontsSystem } from './weather/weatherFronts.js';
import { BrazilRiversSystem } from './rivers.js';
import { IsobarsSystem } from './weather/isobars.js';
import { FlyingRiversSystem } from './weather/flyingRivers.js';
import { ShipTrafficSystem } from './ships.js';
import { latLonTo3D, threeDToLatLon } from './utils/geo.js';
import { BRAZIL_CITIES } from './data/brazilData.js';

class Windy3DApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.terrain = null;
    this.cities = null;
    this.vegetation = null;
    this.weather = null;
    this.atmosphere = null;
    this.fronts = null;
    this.rivers = null;
    this.isobars = null;
    this.flyingRivers = null;
    this.ships = null;

    this.clock = new THREE.Clock();
    this.cityTags = [];
    this.cameraTargetPos = null;
    this.controlsTargetPos = null;
    this.is2D = false;

    this.init();
  }

  init() {
    this.initThree();
    this.initLights();
    this.initWorld();
    this.initUI();
    this.updateLegend('wind');

    window.addEventListener('resize', () => this.onWindowResize());
    this.animate();
  }

  initThree() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070d14); // Sleek Apple dark space
    this.scene.fog = new THREE.FogExp2(0x070d14, 0.0055);

    // 2. Camera: Tilted 3D perspective of Brazil
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 800);
    this.camera.position.set(0, 85, 90);

    // 3. Renderer (balanced for 60fps on high-DPI displays)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.05; // Prevent camera going below ground
    this.controls.minDistance = 15;
    this.controls.maxDistance = 220;
    this.controls.target.set(0, 0, 0);
  }

  initLights() {
    // Soft Apple-style minimalist lighting
    const ambient = new THREE.AmbientLight(0xdbeafe, 0.95);
    this.scene.add(ambient);

    // Sunlight from northwest
    const sunLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
    sunLight.position.set(-60, 90, -40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 220;
    sunLight.shadow.camera.left = -75;
    sunLight.shadow.camera.right = 75;
    sunLight.shadow.camera.top = 75;
    sunLight.shadow.camera.bottom = -75;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    // Sky/ground fill
    const hemiLight = new THREE.HemisphereLight(0x60a5fa, 0x1e293b, 0.6);
    this.scene.add(hemiLight);
  }

  initWorld() {
    // 1. Terrain with Brazil relief
    this.terrain = new BrazilTerrain(this.scene);

    // 2. Low-poly minimalist 3D vegetation
    this.vegetation = new VegetationSystem(this.scene, this.terrain);

    // 3. Low-poly 3D cities & building clusters
    this.cities = new CitiesSystem(this.scene, this.terrain, (city) => {
      this.focusCity(city);
    });

    // 4. Weather layer coordinator
    const statusText = document.getElementById('status-text');
    this.weather = new WeatherManager(
      this.scene,
      this.terrain,
      this.cities,
      (msg) => {
        if (statusText) statusText.textContent = msg;
      },
      (hour) => {
        this.onForecastHourChanged(hour);
      },
      (stations) => {
        if (this.isobars) {
          this.isobars.setWeatherData(stations);
        }
      }
    );

    // 5. Atmosphere system (day/night cycle + storm darkening)
    this.atmosphere = new AtmosphereSystem(this.scene);

    // 6. Synoptic Weather Fronts System (Cold/Warm fronts + ZCAS)
    this.fronts = new WeatherFrontsSystem(this.scene, this.terrain);

    // 7. Major Brazilian River Basins 3D
    this.rivers = new BrazilRiversSystem(this.scene, this.terrain);

    // 8. Synoptic Pressure Isobars 3D
    this.isobars = new IsobarsSystem(this.scene, this.terrain);

    // 9. Amazon Flying Rivers Moisture Highway 3D
    this.flyingRivers = new FlyingRiversSystem(this.scene, this.terrain);

    // 10. Create 3D HTML City Tag overlays for all cities
    this.createCityHTMLTags();

    // 11. MarineTraffic & AIS Live Ship Traffic 3D System
    this.ships = new ShipTrafficSystem(
      this.scene,
      this.terrain,
      (vessel) => this.openVesselCard(vessel),
      (vessel, screenPos) => this.updateShipHoverTooltip(vessel, screenPos)
    );
  }

  createCityHTMLTags() {
    const uiContainer = document.getElementById('ui-container');
    this.cityTags = [];

    this.cities.cityMarkers.forEach(m => {
      const tag = document.createElement('div');
      tag.className = 'city-scene-tag';
      tag.innerHTML = `<span>${m.city.name}</span><span class="city-tag-temp">${m.temp}°</span>`;

      // Cache the temp badge reference to avoid per-frame querySelector calls
      const tempBadge = tag.querySelector('.city-tag-temp');

      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        this.focusCity(m.city);
      });

      uiContainer.appendChild(tag);
      this.cityTags.push({ marker: m, element: tag, tempBadge, lastTemp: m.temp, lastDisplay: '' });
    });
  }

  updateCityHTMLTags() {
    if (!this._tagProjectVec) this._tagProjectVec = new THREE.Vector3();
    const tempV = this._tagProjectVec;
    const widthHalf = window.innerWidth / 2;
    const heightHalf = window.innerHeight / 2;

    this.cityTags.forEach(ct => {
      const m = ct.marker;

      // Dynamic Level of Detail (LOD) check: only show cities belonging to active zoom tier
      if (!m.isVisible) {
        if (ct.lastDisplay !== 'none') {
          ct.element.style.display = 'none';
          ct.lastDisplay = 'none';
        }
        return;
      }

      // Only update temperature text when value actually changes
      if (ct.lastTemp !== m.temp && ct.tempBadge) {
        ct.tempBadge.textContent = `${m.temp}°`;
        ct.lastTemp = m.temp;
      }

      // Project 3D marker position to 2D screen coordinates
      tempV.copy(m.worldPos);
      tempV.project(this.camera);

      // Check if in front of camera
      if (tempV.z < 1) {
        const x = (tempV.x * widthHalf) + widthHalf;
        const y = -(tempV.y * heightHalf) + heightHalf;
        // Use transform for GPU-composited positioning (no layout reflow)
        ct.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        if (ct.lastDisplay !== 'flex') {
          ct.element.style.display = 'flex';
          ct.lastDisplay = 'flex';
        }
      } else {
        if (ct.lastDisplay !== 'none') {
          ct.element.style.display = 'none';
          ct.lastDisplay = 'none';
        }
      }
    });
  }

  initUI() {
    // 1. Weather Layer Buttons (Right Sidebar)
    const layerButtons = document.querySelectorAll('.layer-item');
    layerButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        layerButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const layer = btn.getAttribute('data-layer');
        this.weather.setLayer(layer);
        this.updateLegend(layer);

        // Set atmospheric storm intensity for immersive weather layers
        if (this.atmosphere) {
          const stormLayers = { rain: 0.5, lightning: 0.8, snow: 0.3 };
          this.atmosphere.setStormIntensity(stormLayers[layer] || 0);
        }
      });
    });

    // 2. City Search
    const searchInput = document.getElementById('city-search');
    const norm = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const term = norm(searchInput.value);
        if (!term) return;
        const found = BRAZIL_CITIES.find(c => {
          const cNorm = norm(c.name);
          return cNorm === term || cNorm.includes(term) || c.uf.toLowerCase() === term;
        });
        if (found) {
          this.focusCity(found);
        }
      }
    });

    // Raycast click on 3D canvas to select cities
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isPointerDragging = false;
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      isPointerDragging = false;
    });

    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (this.pointerDownPos) {
        const dx = Math.abs(e.clientX - this.pointerDownPos.x);
        const dy = Math.abs(e.clientY - this.pointerDownPos.y);
        this.pointerDownPos = null;
        if (dx > 5 || dy > 5) return; // User was dragging/orbiting
      }
      isPointerDragging = false;

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);

      // Check click on ships (MarineTraffic AIS)
      if (this.ships && this.ships.visible && this.ships.raycastHitboxes.length > 0) {
        const shipHits = raycaster.intersectObjects(this.ships.raycastHitboxes, false);
        if (shipHits.length > 0) {
          const hitShip = shipHits[0].object;
          const vessel = hitShip.userData.vessel;
          if (vessel) {
            this.ships.selectVesselByMmsi(vessel.mmsi);
            document.getElementById('map-picker').classList.add('map-picker-hidden');
            this.picker3DPos = null;
            return;
          }
        }
      }

      const pins = this.cities.cityMarkers.map(m => m.pin);
      const intersects = raycaster.intersectObjects(pins, true);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const cityData = hit.userData.city || (hit.parent && hit.parent.userData.city);
        if (cityData) {
          this.focusCity(cityData);
          document.getElementById('map-picker').classList.add('map-picker-hidden');
          this.picker3DPos = null;
        }
      } else {
        // Intersect with terrain to drop the weather picker
        const terrainHit = raycaster.intersectObject(this.terrain.mesh);
        if (terrainHit.length > 0) {
          this.picker3DPos = terrainHit[0].point;
          this.updatePickerWeather();
        } else {
          // Hide picker if clicked empty space
          document.getElementById('map-picker').classList.add('map-picker-hidden');
          this.picker3DPos = null;
        }
      }
    });

    // Pointer hover over ships for telemetry mini-tooltip
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (this.pointerDownPos) {
        const dx = Math.abs(e.clientX - this.pointerDownPos.x);
        const dy = Math.abs(e.clientY - this.pointerDownPos.y);
        if (dx > 4 || dy > 4) {
          isPointerDragging = true;
          this.updateShipHoverTooltip(null, null);
          if (this.ships) this.ships.setHoveredVessel(null, null);
          return;
        }
      }
      if (isPointerDragging) return;

      if (!this.ships || !this.ships.visible || this.ships.raycastHitboxes.length === 0) {
        this.updateShipHoverTooltip(null, null);
        return;
      }

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);

      const shipHits = raycaster.intersectObjects(this.ships.raycastHitboxes, false);
      if (shipHits.length > 0) {
        const hitShip = shipHits[0].object;
        const vessel = hitShip.userData.vessel;
        if (vessel) {
          this.renderer.domElement.style.cursor = 'pointer';
          this.ships.setHoveredVessel(vessel.mmsi, { x: e.clientX, y: e.clientY });
          return;
        }
      }

      this.renderer.domElement.style.cursor = 'default';
      this.ships.setHoveredVessel(null, null);
    });

    this.renderer.domElement.addEventListener('pointerleave', () => {
      isPointerDragging = false;
      this.pointerDownPos = null;
      if (this.ships) this.ships.setHoveredVessel(null, null);
    });

    // 3. Quick Toggles
    const toggleCities = document.getElementById('toggle-cities');
    if (toggleCities) {
      toggleCities.addEventListener('change', (e) => {
        this.cities.cityGroup.visible = e.target.checked;
        this.cityTags.forEach(ct => {
          ct.element.style.visibility = e.target.checked ? 'visible' : 'hidden';
        });
      });
    }

    const toggleWindHeatmap = document.getElementById('toggle-wind-heatmap');
    if (toggleWindHeatmap) {
      toggleWindHeatmap.addEventListener('change', (e) => {
        if (this.weather && this.weather.layers && this.weather.layers.wind) {
          this.weather.layers.wind.setHeatmapVisible(e.target.checked);
        }
      });
    }

    const toggleRainHeatmap = document.getElementById('toggle-rain-heatmap');
    if (toggleRainHeatmap) {
      toggleRainHeatmap.addEventListener('change', (e) => {
        if (this.weather && this.weather.layers && this.weather.layers.rain) {
          this.weather.layers.rain.setHeatmapVisible(e.target.checked);
        }
      });
    }

    const toggleTrees = document.getElementById('toggle-trees');
    if (toggleTrees) {
      toggleTrees.addEventListener('change', (e) => {
        this.vegetation.vegGroup.visible = e.target.checked;
      });
    }

    const toggleStates = document.getElementById('toggle-states');
    if (toggleStates) {
      toggleStates.checked = true;
      if (this.terrain && this.terrain.stateBordersGroup) {
        this.terrain.stateBordersGroup.visible = true;
      }
      toggleStates.addEventListener('change', (e) => {
        if (this.terrain && this.terrain.stateBordersGroup) {
          this.terrain.stateBordersGroup.visible = e.target.checked;
        }
      });
    }

    const toggleFronts = document.getElementById('toggle-fronts');
    if (toggleFronts) {
      toggleFronts.addEventListener('change', (e) => {
        if (this.fronts) {
          this.fronts.setVisible(e.target.checked);
        }
      });
    }

    const toggleFlyingRivers = document.getElementById('toggle-flying-rivers');
    if (toggleFlyingRivers) {
      toggleFlyingRivers.addEventListener('change', (e) => {
        if (this.flyingRivers) {
          this.flyingRivers.setVisible(e.target.checked);
        }
      });
    }

    const toggleIsobars = document.getElementById('toggle-isobars');
    if (toggleIsobars) {
      toggleIsobars.addEventListener('change', (e) => {
        if (this.isobars) {
          this.isobars.setVisible(e.target.checked);
        }
      });
    }

    const toggleRivers = document.getElementById('toggle-rivers');
    if (toggleRivers) {
      toggleRivers.addEventListener('change', (e) => {
        if (this.rivers) {
          this.rivers.setVisible(e.target.checked);
        }
      });
    }

    const toggleShips = document.getElementById('toggle-ships');
    if (toggleShips) {
      toggleShips.addEventListener('change', (e) => {
        if (this.ships) {
          this.ships.setVisible(e.target.checked);
          if (!e.target.checked) {
            const card = document.getElementById('vessel-card');
            if (card) card.classList.add('vessel-card-hidden');
            this.updateShipHoverTooltip(null, null);
          }
        }
        const topBadge = document.getElementById('vessels-top-badge');
        if (topBadge) {
          topBadge.classList.toggle('vessel-top-badge-disabled', !e.target.checked);
        }
      });
    }

    const vesselsTopBadge = document.getElementById('vessels-top-badge');
    if (vesselsTopBadge) {
      vesselsTopBadge.addEventListener('click', () => {
        if (toggleShips && !toggleShips.checked) {
          toggleShips.checked = true;
          toggleShips.dispatchEvent(new Event('change'));
        }
        // Fly over Santos & Rio dense maritime corridors
        this.smoothFlyTo(new THREE.Vector3(30, 42, 55), new THREE.Vector3(30, 0, 32));
      });
    }

    const btnCloseVessel = document.getElementById('btn-close-vessel-card');
    if (btnCloseVessel) {
      btnCloseVessel.addEventListener('click', () => {
        const card = document.getElementById('vessel-card');
        if (card) card.classList.add('vessel-card-hidden');
        if (this.ships) this.ships.selectVesselByMmsi(null);
        this.currentCardVessel = null;
      });
    }

    const btnFocusVessel = document.getElementById('btn-focus-vessel');
    if (btnFocusVessel) {
      btnFocusVessel.addEventListener('click', () => {
        if (!this.currentCardVessel) return;
        let x, z;
        const vState = this.ships ? this.ships.vessels.get(this.currentCardVessel.mmsi) : null;
        if (vState) {
          x = vState.currentX;
          z = vState.currentZ;
        } else {
          const coords = latLonTo3D(this.currentCardVessel.lat, this.currentCardVessel.lon);
          x = coords.x;
          z = coords.z;
        }
        const groundY = this.terrain ? this.terrain.getElevationAt(x, z) : 0;
        const waterY = (groundY <= 0.02) ? 0.025 : groundY + 0.035;
        this.smoothFlyTo(
          new THREE.Vector3(x, waterY + 12, z + 16),
          new THREE.Vector3(x, waterY + 0.5, z)
        );
      });
    }

    const toggleAutoRotate = document.getElementById('toggle-autorotate');
    if (toggleAutoRotate) {
      toggleAutoRotate.addEventListener('change', (e) => {
        this.controls.autoRotate = e.target.checked;
        this.controls.autoRotateSpeed = 0.6;
      });
    }

    // 4. Camera Controls
    document.getElementById('btn-reset-cam').addEventListener('click', () => {
      this.smoothFlyTo(new THREE.Vector3(0, 85, 90), new THREE.Vector3(0, 0, 0));
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.camera.position.multiplyScalar(0.85);
    });

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        this.camera.position.multiplyScalar(1.18);
      });
    }

    // Sidebar Collapse / Expand Toggle
    const btnCollapse = document.getElementById('btn-collapse-sidebar');
    const btnOpen = document.getElementById('btn-open-sidebar');
    const sidebar = document.getElementById('layers-sidebar');
    const bottomBar = document.getElementById('bottom-bar');

    if (btnCollapse && sidebar) {
      btnCollapse.addEventListener('click', () => {
        sidebar.classList.add('collapsed');
        if (btnOpen) btnOpen.classList.add('is-visible');
        if (bottomBar) bottomBar.classList.add('sidebar-is-collapsed');
      });
    }

    if (btnOpen && sidebar) {
      btnOpen.addEventListener('click', () => {
        sidebar.classList.remove('collapsed');
        btnOpen.classList.remove('is-visible');
        if (bottomBar) bottomBar.classList.remove('sidebar-is-collapsed');
      });
    }

    // 4. Model Switcher (ECMWF vs GFS)
    const modelButtons = document.querySelectorAll('.model-btn');
    modelButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const model = btn.getAttribute('data-model');
        modelButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.weather) {
          this.weather.setModel(model);
        }
      });
    });

    const btn3D = document.getElementById('btn-3d');
    btn3D.addEventListener('click', () => {
      this.is2D = !this.is2D;
      if (this.is2D) {
        btn3D.textContent = '2D';
        btn3D.classList.remove('is-active');
        this.controls.enableRotate = false;
        this.controls.maxPolarAngle = 0.01; // Lock to top-down
        this.smoothFlyTo(new THREE.Vector3(0, 140, 0.1), new THREE.Vector3(0, 0, 0));
      } else {
        btn3D.textContent = '3D';
        btn3D.classList.add('is-active');
        this.controls.enableRotate = true;
        this.controls.maxPolarAngle = Math.PI / 2.05;
        this.smoothFlyTo(new THREE.Vector3(0, 85, 90), new THREE.Vector3(0, 0, 0));
      }
    });

    // 5. Close City Card
    document.getElementById('btn-close-card').addEventListener('click', () => {
      document.getElementById('city-card').classList.add('city-card-hidden');
      this.currentCardCity = null;
    });

    // 6. Locate button
    document.getElementById('btn-locate').addEventListener('click', () => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const userLat = pos.coords.latitude;
            const userLon = pos.coords.longitude;
            // Find nearest city to user's location
            let nearest = BRAZIL_CITIES[0];
            let minDist = Infinity;
            for (const c of BRAZIL_CITIES) {
              const d = Math.pow(c.lat - userLat, 2) + Math.pow(c.lon - userLon, 2);
              if (d < minDist) { minDist = d; nearest = c; }
            }
            this.focusCity(nearest);
          },
          () => {
            // Fallback to São Paulo on error
            const sp = BRAZIL_CITIES.find(c => c.name === 'São Paulo');
            if (sp) this.focusCity(sp);
          },
          { timeout: 5000 }
        );
      } else {
        const sp = BRAZIL_CITIES.find(c => c.name === 'São Paulo');
        if (sp) this.focusCity(sp);
      }
    });

    // 7. Timeline Forecast Hour Buttons (+6H, +12H, +24H, +48H, +72H)
    const timelineDays = document.querySelectorAll('.timeline-days .day');
    timelineDays.forEach(btn => {
      btn.addEventListener('click', () => {
        const hour = parseInt(btn.getAttribute('data-hour') || '0', 10);
        this.weather.setForecastHour(hour);
      });
    });

    // 8. Timeline Play / Pause Button
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        const isPlaying = this.weather.togglePlay();
        btnPlay.textContent = isPlaying ? '⏸' : '▶';
        btnPlay.title = isPlaying ? 'Pausar Linha do Tempo' : 'Animar Linha do Tempo';
      });
    }
  }

  onForecastHourChanged(hour) {
    // 1. Highlight active timeline day pill
    const timelineDays = document.querySelectorAll('.timeline-days .day');
    timelineDays.forEach(btn => {
      const bHour = parseInt(btn.getAttribute('data-hour') || '0', 10);
      btn.classList.toggle('active', bHour === hour);
    });

    // 2. Update timeline badge text
    const badge = document.getElementById('timeline-time');
    if (badge) {
      if (hour === 0) badge.textContent = 'AGORA';
      else if (hour === 6) badge.textContent = '+6H (HOJE)';
      else if (hour === 12) badge.textContent = '+12H';
      else if (hour === 24) badge.textContent = '+24H (AMANHÃ)';
      else if (hour === 48) badge.textContent = '+48H (2 DIAS)';
      else if (hour === 72) badge.textContent = '+72H (3 DIAS)';
      else badge.textContent = `+${hour}H`;
    }

    // 3. Update atmosphere day/night cycle based on forecast hour
    if (this.atmosphere) {
      this.atmosphere.setForecastHour(hour);
    }

    // 4. If a city detail card is currently open, smoothly update its forecast values
    if (this.currentCardCity) {
      this.renderCityCardData(this.currentCardCity, hour);
    }
    
    // 5. If map picker is open, update its values
    if (this.picker3DPos) {
      this.updatePickerWeather();
    }

    // 6. Update synoptic front progression across Brazil
    if (this.fronts) {
      this.fronts.setForecastHour(hour);
    }
  }

  focusCity(city) {
    const { x, z } = latLonTo3D(city.lat, city.lon);
    const y = this.terrain.getElevationAt(x, z);

    // Smooth camera fly to city
    this.smoothFlyTo(
      new THREE.Vector3(x, y + 16, z + 20),
      new THREE.Vector3(x, y + 0.8, z)
    );

    // Open detail weather card
    this.openCityCard(city);
  }

  async openCityCard(city) {
    this.currentCardCity = city;

    // Hide vessel card if open
    const vesselCard = document.getElementById('vessel-card');
    if (vesselCard) vesselCard.classList.add('vessel-card-hidden');
    if (this.ships) this.ships.selectVesselByMmsi(null);
    this.currentCardVessel = null;

    const card = document.getElementById('city-card');
    card.classList.remove('city-card-hidden');

    document.getElementById('card-region').textContent = city.region || 'Brasil';
    document.getElementById('card-city-name').textContent = `${city.name}, ${city.uf}`;
    document.getElementById('card-elevation').textContent = `Altitude: ${city.elevation}m • População: ${(city.pop/1000000).toFixed(1)}M`;

    // Fetch individual city weather forecast from server proxy
    try {
      const res = await fetch(`/api/weather?lat=${city.lat}&lon=${city.lon}`);
      const data = await res.json();
      this.currentCityForecast = data;
      this.renderCityCardData(city, this.weather.currentForecastHour || 0);
    } catch (err) {
      console.warn('Erro ao carregar detalhes da cidade:', err);
    }
  }

  openVesselCard(vessel) {
    this.currentCardVessel = vessel;

    // Hide city card if open
    const cityCard = document.getElementById('city-card');
    if (cityCard) cityCard.classList.add('city-card-hidden');
    this.currentCardCity = null;

    const card = document.getElementById('vessel-card');
    if (!card) return;
    card.classList.remove('vessel-card-hidden');

    const flagEl = document.getElementById('vc-flag');
    if (flagEl) flagEl.textContent = vessel.flagEmoji || '🚢';

    const typeEl = document.getElementById('vc-type');
    if (typeEl) typeEl.textContent = vessel.typeDesc || vessel.type || 'Comercial';

    const statusEl = document.getElementById('vc-status');
    if (statusEl) {
      statusEl.textContent = vessel.speed > 0.5 ? '🟢 Em Navegação' : (vessel.status || '⚪ Atracado');
    }

    const nameEl = document.getElementById('vc-name');
    if (nameEl) nameEl.textContent = vessel.name;

    const identEl = document.getElementById('vc-ident');
    if (identEl) {
      identEl.textContent = `MMSI: ${vessel.mmsi} • IMO: ${vessel.imo || '---'} • CALL: ${vessel.callsign || '---'}`;
    }

    const speedEl = document.getElementById('vc-speed');
    if (speedEl) speedEl.textContent = vessel.speed.toFixed(1);

    const speedKmhEl = document.getElementById('vc-speed-kmh');
    if (speedKmhEl) speedKmhEl.textContent = `(${(vessel.speed * 1.852).toFixed(1)} km/h)`;

    const headingEl = document.getElementById('vc-heading');
    const needleEl = document.getElementById('vc-needle');
    if (headingEl) {
      const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const cardinal = dirs[Math.round(((vessel.heading % 360) / 22.5)) % 16];
      headingEl.textContent = `${vessel.heading}° ${cardinal}`;
    }
    if (needleEl) {
      needleEl.style.transform = `rotate(${vessel.heading}deg)`;
    }

    const originEl = document.getElementById('vc-origin');
    if (originEl) originEl.textContent = vessel.origin || 'Brasil';

    const destEl = document.getElementById('vc-dest');
    if (destEl) destEl.textContent = vessel.destination || 'Destino Marítimo';

    const etaEl = document.getElementById('vc-eta');
    if (etaEl) etaEl.textContent = vessel.eta || 'Em viagem';

    const lengthEl = document.getElementById('vc-length');
    if (lengthEl) lengthEl.textContent = `${vessel.length || 200} m`;

    const beamEl = document.getElementById('vc-beam');
    if (beamEl) beamEl.textContent = `${vessel.beam || 32} m`;

    const draughtEl = document.getElementById('vc-draught');
    if (draughtEl) draughtEl.textContent = `${(vessel.draught || 10.0).toFixed(1)} m`;

    const portEl = document.getElementById('vc-port');
    if (portEl) portEl.textContent = vessel.port || 'Águas Brasileiras';

    const mtLink = document.getElementById('btn-marinetraffic-link');
    if (mtLink) {
      mtLink.href = `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${vessel.mmsi}`;
    }
  }

  updateShipHoverTooltip(vessel, screenPos) {
    const tooltip = document.getElementById('ship-hover-tooltip');
    if (!tooltip) return;

    if (!vessel || !screenPos) {
      tooltip.classList.add('ship-tooltip-hidden');
      return;
    }

    const flagEl = document.getElementById('st-flag');
    if (flagEl) flagEl.textContent = vessel.flagEmoji || '🚢';

    const nameEl = document.getElementById('st-name');
    if (nameEl) nameEl.textContent = vessel.name;

    const typeEl = document.getElementById('st-type');
    if (typeEl) typeEl.textContent = vessel.type || 'Navio';

    const speedEl = document.getElementById('st-speed');
    if (speedEl) speedEl.textContent = `${vessel.speed.toFixed(1)} nós`;

    const headingEl = document.getElementById('st-heading');
    if (headingEl) headingEl.textContent = `${vessel.heading}°`;

    const destEl = document.getElementById('st-dest');
    if (destEl) destEl.textContent = (vessel.destination || 'Marítimo').split(' - ')[0];

    tooltip.style.left = `${screenPos.x}px`;
    tooltip.style.top = `${screenPos.y - 12}px`;
    tooltip.classList.remove('ship-tooltip-hidden');
  }

  renderCityCardData(city, hourOffset = 0) {
    if (!this.currentCityForecast) return;

    let temp = 24, windSpeed = 12, rain = 0, humidity = 65, clouds = 30, code = 0;
    const data = this.currentCityForecast;

    if (hourOffset === 0 && data.current) {
      temp = data.current.temperature_2m;
      windSpeed = data.current.wind_speed_10m;
      rain = data.current.rain || 0;
      humidity = data.current.relative_humidity_2m;
      clouds = data.current.cloud_cover;
      code = data.current.weather_code || 0;
    } else if (data.hourly && data.hourly.temperature_2m) {
      const hIdx = Math.min(hourOffset, data.hourly.temperature_2m.length - 1);
      temp = data.hourly.temperature_2m[hIdx] ?? 24;
      windSpeed = data.hourly.wind_speed_10m ? (data.hourly.wind_speed_10m[hIdx] ?? 12) : 12;
      rain = data.hourly.rain ? (data.hourly.rain[hIdx] ?? 0) : 0;
      humidity = 68;
      clouds = data.hourly.cloud_cover ? (data.hourly.cloud_cover[hIdx] ?? 40) : 40;
      code = data.hourly.weather_code ? (data.hourly.weather_code[hIdx] ?? 1) : 1;
    }

    document.getElementById('card-temp').textContent = Math.round(temp);
    document.getElementById('card-wind').textContent = `${Math.round(windSpeed)} km/h`;
    document.getElementById('card-rain').textContent = `${rain.toFixed(1)} mm`;
    document.getElementById('card-humidity').textContent = `${humidity}%`;
    document.getElementById('card-clouds').textContent = `${clouds}%`;

    let desc = 'Ensolarado';
    let icon = '☀️';

    if (code >= 1 && code <= 3) {
      desc = 'Parcialmente Nublado';
      icon = '⛅';
    } else if (code >= 51 && code <= 67) {
      desc = 'Chuva Leve / Moderada';
      icon = '🌧️';
    } else if (code >= 80 && code <= 82) {
      desc = 'Pancadas de Chuva';
      icon = '🌦️';
    } else if (code >= 95) {
      desc = 'Tempestades com Raios';
      icon = '⛈️';
    } else if (code >= 71) {
      desc = 'Queda de Neve / Geada';
      icon = '❄️';
    }

    const timeLabel = hourOffset > 0 ? ` (+${hourOffset}h)` : '';
    document.getElementById('card-condition').textContent = `${desc}${timeLabel}`;
    document.getElementById('card-weather-icon').textContent = icon;

    // Render 24-hour temperature trend sparkline
    if (data.hourly && data.hourly.temperature_2m && data.hourly.temperature_2m.length >= 24) {
      this.renderSparkline(data.hourly.temperature_2m.slice(0, 24), hourOffset);
    }
  }

  renderSparkline(temps, activeHour = 0) {
    const canvas = document.getElementById('card-sparkline');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const minT = Math.floor(Math.min(...temps));
    const maxT = Math.ceil(Math.max(...temps));
    const range = Math.max(1, maxT - minT);

    const rangeLabel = document.getElementById('sparkline-range');
    if (rangeLabel) rangeLabel.textContent = `Min ${minT}° / Max ${maxT}°`;

    const padTop = 10;
    const padBottom = 10;
    const drawH = h - padTop - padBottom;
    const stepX = w / (temps.length - 1);

    // Points calculation
    const points = temps.map((t, idx) => ({
      x: idx * stepX,
      y: padTop + (1.0 - (t - minT) / range) * drawH
    }));

    // Fill gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const midX = (prev.x + cur.x) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, (prev.y + cur.y) / 2);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Smooth stroke curve
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const midX = (prev.x + cur.x) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, (prev.y + cur.y) / 2);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Active hour dot
    const targetIdx = Math.min(activeHour, points.length - 1);
    const activePt = points[targetIdx];
    if (activePt) {
      ctx.beginPath();
      ctx.arc(activePt.x, activePt.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  smoothFlyTo(cameraPos, targetPos) {
    this.cameraTargetPos = cameraPos;
    this.controlsTargetPos = targetPos;
  }

  updateLegend(layer) {
    const bar = document.getElementById('legend-bar');
    const unit = document.getElementById('legend-unit');
    bar.innerHTML = '';

    const configs = {
      wind: {
        unit: 'km/h',
        items: [
          { val: '5', bg: '#2563eb' },
          { val: '15', bg: '#06b6d4' },
          { val: '25', bg: '#10b981' },
          { val: '38', bg: '#facc15' },
          { val: '52', bg: '#f97316' },
          { val: '70+', bg: '#db2777' }
        ]
      },
      rain: {
        unit: 'mm/h',
        items: [
          { val: '0.5', bg: '#06b6d4' },
          { val: '2', bg: '#2563eb' },
          { val: '5', bg: '#22c55e' },
          { val: '10', bg: '#facc15' },
          { val: '25', bg: '#f97316' },
          { val: '50+', bg: '#db2777' }
        ]
      },
      temperature: {
        unit: '°C',
        items: [
          { val: '10°', bg: '#3b82f6' },
          { val: '15°', bg: '#06b6d4' },
          { val: '20°', bg: '#10b981' },
          { val: '25°', bg: '#eab308' },
          { val: '30°', bg: '#f97316' },
          { val: '38°', bg: '#ef4444' }
        ]
      },
      lightning: {
        unit: 'CAPE J/kg',
        items: [
          { val: 'Baixo', bg: '#64748b' },
          { val: 'Médio', bg: '#eab308' },
          { val: 'Alto', bg: '#f97316' },
          { val: 'Severo', bg: '#ef4444' }
        ]
      },
      clouds: {
        unit: '% Nuvens',
        items: [
          { val: '10%', bg: '#e2e8f0' },
          { val: '30%', bg: '#cbd5e1' },
          { val: '60%', bg: '#94a3b8' },
          { val: '90%+', bg: '#64748b' }
        ]
      },
      snow: {
        unit: 'cm',
        items: [
          { val: '1', bg: '#e0f2fe' },
          { val: '5', bg: '#bae6fd' },
          { val: '15', bg: '#7dd3fc' },
          { val: '30+', bg: '#38bdf8' }
        ]
      }
    };

    const cfg = configs[layer] || configs.wind;
    unit.textContent = cfg.unit;

    cfg.items.forEach(it => {
      const seg = document.createElement('div');
      seg.className = 'legend-segment';
      seg.style.backgroundColor = it.bg;
      seg.textContent = it.val;
      bar.appendChild(seg);
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // Smooth camera flying animation
    if (this.cameraTargetPos) {
      this.camera.position.lerp(this.cameraTargetPos, 0.08);
      if (this.camera.position.distanceTo(this.cameraTargetPos) < 0.2) {
        this.cameraTargetPos = null;
      }
    }
    if (this.controlsTargetPos) {
      this.controls.target.lerp(this.controlsTargetPos, 0.08);
      if (this.controls.target.distanceTo(this.controlsTargetPos) < 0.2) {
        this.controlsTargetPos = null;
      }
    }

    this.controls.update();

    // Update 3D scene objects
    if (this.terrain) this.terrain.update(elapsedTime);
    if (this.vegetation) this.vegetation.update(elapsedTime);
    if (this.cities) this.cities.update(elapsedTime, this.camera, this.controls);
    if (this.weather) this.weather.update(delta, elapsedTime);
    if (this.atmosphere) this.atmosphere.update(delta);
    if (this.fronts) this.fronts.update(elapsedTime);
    if (this.rivers) this.rivers.update(elapsedTime);
    if (this.isobars) this.isobars.update(elapsedTime);
    if (this.flyingRivers) this.flyingRivers.update(elapsedTime, delta);
    if (this.ships) this.ships.update(delta, elapsedTime);

    // Update floating HTML tags
    this.updateCityHTMLTags();
    this.updatePickerHTMLTag();

    // Render WebGL
    this.renderer.render(this.scene, this.camera);
  }

  updatePickerWeather() {
    if (!this.picker3DPos || !this.weather || !this.weather.activeStationStates) return;
    
    // Inverse Distance Weighting to find exact weather at clicked point
    let sumWeight = 0;
    let sumTemp = 0;
    let sumWind = 0;
    let sumRain = 0;
    
    // Convert 3D pos to approximate lat/lon
    const { lat, lon } = threeDToLatLon(this.picker3DPos.x, this.picker3DPos.z);

    for (const st of this.weather.activeStationStates) {
      const dLat = lat - st.lat;
      const dLon = lon - st.lon;
      const distSq = dLat * dLat + dLon * dLon + 0.5; // smoothing
      const weight = 1.0 / distSq;

      sumTemp += st.weather.temperature_2m * weight;
      sumWind += st.weather.wind_speed_10m * weight;
      sumRain += (st.weather.rain || st.weather.precipitation || 0) * weight;
      sumWeight += weight;
    }

    if (sumWeight > 0) {
      const temp = (sumTemp / sumWeight).toFixed(1);
      const wind = (sumWind / sumWeight).toFixed(1);
      const rain = (sumRain / sumWeight).toFixed(1);

      document.getElementById('picker-val-1').textContent = `${temp}°C`;
      document.getElementById('picker-val-2').textContent = `${wind} km/h`;
      // Check if we need rain row
      let rainRow = document.getElementById('picker-row-rain');
      if (!rainRow) {
        rainRow = document.createElement('div');
        rainRow.className = 'picker-row';
        rainRow.id = 'picker-row-rain';
        rainRow.innerHTML = `<span class="picker-icon">🌧️</span> <span id="picker-val-3"></span>`;
        document.getElementById('picker-popup').appendChild(rainRow);
      }
      document.getElementById('picker-val-3').textContent = `${rain} mm`;
      rainRow.style.display = parseFloat(rain) > 0.1 ? 'flex' : 'none';

      document.getElementById('map-picker').classList.remove('map-picker-hidden');
    }
  }

  updatePickerHTMLTag() {
    if (!this.picker3DPos) return;
    const el = document.getElementById('map-picker');
    
    const pos = this.picker3DPos.clone();
    pos.project(this.camera);

    // Behind camera check
    if (pos.z > 1) {
      el.style.display = 'none';
      return;
    }

    const x = (pos.x *  0.5 + 0.5) * window.innerWidth;
    const y = (pos.y * -0.5 + 0.5) * window.innerHeight;

    el.style.display = 'flex';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}

// Bootstrap on window load
window.addEventListener('DOMContentLoaded', () => {
  new Windy3DApp();
});
