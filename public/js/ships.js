import * as THREE from 'three';
import { latLonTo3D, threeDToLatLon } from './utils/geo.js';

/**
 * 3D MarineTraffic & AIS Ship Traffic Visualization System
 * Renders real-time ships with distinct 3D models (Container, Tanker, Bulk, Tug, Cruise, River Cargo),
 * dynamic wakes, Colregs navigation lights, dead reckoning kinematics, and hover/click interactivity.
 */
export class ShipTrafficSystem {
  constructor(scene, terrain, onSelectVessel, onHoverVessel) {
    this.scene = scene;
    this.terrain = terrain;
    this.onSelectVessel = onSelectVessel || (() => {});
    this.onHoverVessel = onHoverVessel || (() => {});

    this.group = new THREE.Group();
    this.group.name = 'marinetraffic-ships-layer';
    this.scene.add(this.group);

    this.vessels = new Map(); // mmsi -> vesselState
    this.vesselTags = new Map(); // mmsi -> { element, speedEl, lastDisplay }
    this.uiContainer = document.getElementById('ui-container');
    this._tagProjectVec = new THREE.Vector3();
    this.raycastHitboxes = [];
    this.hoveredVessel = null;
    this.selectedVessel = null;
    this.visible = true;

    // 3D Voyage Nautical Route visualization group
    this.routeGroup = new THREE.Group();
    this.routeGroup.name = 'marinetraffic-voyage-route';
    this.scene.add(this.routeGroup);

    this.routeOriginTag = null;
    this.routeDestTag = null;
    this.activeRoute = null;
    this.futureRouteLine = null;

    // Shared materials & geometries for high performance
    this.initSharedResources();

    // Initial fetch and periodic polling
    this.fetchLiveVessels();
    this.pollInterval = setInterval(() => {
      if (this.visible) this.fetchLiveVessels();
    }, 20000); // 20s live sync
  }

  getVesselTypeColor(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('container') || t.includes('cargo') || t.includes('carga')) return 0x10b981; // Emerald Green
    if (t.includes('tanker') || t.includes('petroleiro') || t.includes('gas')) return 0xf43f5e; // Crimson Red
    if (t.includes('bulk') || t.includes('graneleiro')) return 0xfbbf24; // Amber Yellow
    if (t.includes('tug') || t.includes('rebocador') || t.includes('apoio')) return 0xf97316; // Vivid Orange
    if (t.includes('passenger') || t.includes('cruzeiro')) return 0x06b6d4; // Cyan
    return 0x38bdf8; // Sky Blue
  }

  initSharedResources() {
    // 1. Invisible Raycast Hitbox (Generous sphere for easy clicking)
    this.hitboxGeo = new THREE.SphereGeometry(1.6, 8, 8);
    this.hitboxMat = new THREE.MeshBasicMaterial({ visible: false });

    // 2. Selection / Hover Ring Material & Geo
    this.selectionRingGeo = new THREE.RingGeometry(0.85, 1.25, 24);
    this.selectionRingGeo.rotateX(-Math.PI / 2);
    this.selectionRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false
    });

    // 3. Navigation Lights (Port Red, Starboard Green, Stern White)
    this.navLightGeo = new THREE.SphereGeometry(0.06, 6, 6);
    this.redLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false });
    this.greenLightMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false });
    this.whiteLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });

    // 4. Wake Material (Translucent foaming V-wave on water surface)
    this.wakeMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    // 5. 3D Directional AIS Chevron (Beacon visible from distance / overview)
    this.chevronGeo = new THREE.ConeGeometry(0.42, 0.85, 4);
    this.chevronGeo.rotateX(Math.PI / 2); // Point forward (-Z)
    this.chevronGeo.rotateY(Math.PI / 4);

    this.beaconRingGeo = new THREE.RingGeometry(0.42, 0.65, 16);
    this.beaconRingGeo.rotateX(-Math.PI / 2);

    // 6. Water Pinpoint Footprint & Directional Hull Polygon (Exact location on ocean)
    const hullShape = new THREE.Shape();
    hullShape.moveTo(0, -0.9);
    hullShape.lineTo(0.35, -0.4);
    hullShape.lineTo(0.35, 0.7);
    hullShape.lineTo(-0.35, 0.7);
    hullShape.lineTo(-0.35, -0.4);
    hullShape.closePath();
    this.waterHullGeo = new THREE.ShapeGeometry(hullShape);
    this.waterHullGeo.rotateX(-Math.PI / 2);

    this.waterRingGeo = new THREE.RingGeometry(0.75, 0.95, 24);
    this.waterRingGeo.rotateX(-Math.PI / 2);

    // 7. On-Map Nautical Ship Icon (prominent boat silhouette on ocean surface)
    this.shipIconPlaneGeo = new THREE.PlaneGeometry(1.9, 1.9);
    this.shipIconPlaneGeo.rotateX(-Math.PI / 2);
    this.shipIconTextures = new Map();
  }

  getShipIconTexture(colorHex) {
    if (this.shipIconTextures.has(colorHex)) {
      return this.shipIconTextures.get(colorHex);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const cx = 64, cy = 64;

    const colorStr = '#' + colorHex.toString(16).padStart(6, '0');

    // Outer glow / shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // Stylized nautical vessel hull facing UP (-Z direction in Three.js)
    ctx.beginPath();
    ctx.moveTo(cx, cy - 48); // Sharp pointed bow
    ctx.bezierCurveTo(cx + 18, cy - 24, cx + 24, cy + 12, cx + 22, cy + 42); // Starboard curve
    ctx.lineTo(cx - 22, cy + 42); // Transom / stern
    ctx.bezierCurveTo(cx - 24, cy + 12, cx - 18, cy - 24, cx, cy - 48); // Port curve
    ctx.closePath();

    ctx.fillStyle = colorStr;
    ctx.fill();

    // White high-contrast naval outline
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Deck superstructure cabin block
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(cx - 10, cy + 10, 20, 18);

    // Forward directional heading triangle
    ctx.beginPath();
    ctx.moveTo(cx, cy - 32);
    ctx.lineTo(cx + 9, cy - 14);
    ctx.lineTo(cx - 9, cy - 14);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.shipIconTextures.set(colorHex, texture);
    return texture;
  }

  async fetchLiveVessels() {
    try {
      const res = await fetch('/api/ships');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && Array.isArray(data.vessels)) {
        this.syncVessels(data.vessels);
      }
    } catch (err) {
      console.warn('Erro ao atualizar tráfego marítimo:', err);
    }
  }

  syncVessels(vesselList) {
    if (!this.uiContainer) {
      this.uiContainer = document.getElementById('ui-container');
    }
    const activeMmsis = new Set();

    vesselList.forEach(rawVessel => {
      activeMmsis.add(rawVessel.mmsi);
      const existing = this.vessels.get(rawVessel.mmsi);

      if (existing) {
        // Smoothly update telemetry & target coordinates
        existing.data = rawVessel;
        existing.hitbox.userData.vessel = rawVessel;
        const { x, z } = latLonTo3D(rawVessel.lat, rawVessel.lon);
        existing.targetX = x;
        existing.targetZ = z;
        existing.heading = rawVessel.heading;
        existing.speed = rawVessel.speed;
        existing.status = rawVessel.status;

        // Update tag speed
        const tagObj = this.vesselTags.get(rawVessel.mmsi);
        if (tagObj && tagObj.speedEl) {
          tagObj.speedEl.textContent = `${rawVessel.speed.toFixed(1)} kn`;
        }
      } else {
        // Create new 3D vessel object
        this.createVesselMesh(rawVessel);
      }

      // Create floating 3D/2D vessel tag on UI container if not present
      if (!this.vesselTags.has(rawVessel.mmsi) && this.uiContainer) {
        const tag = document.createElement('div');
        tag.className = 'vessel-scene-tag';
        tag.innerHTML = `
          <span class="vessel-tag-name">${rawVessel.name}</span>
          <span class="vessel-tag-speed">${rawVessel.speed.toFixed(1)} kn</span>
        `;
        tag.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectVesselByMmsi(rawVessel.mmsi);
        });
        tag.addEventListener('mouseenter', (e) => {
          this.setHoveredVessel(rawVessel.mmsi, { x: e.clientX, y: e.clientY });
        });
        tag.addEventListener('mouseleave', () => {
          this.setHoveredVessel(null, null);
        });

        this.uiContainer.appendChild(tag);
        this.vesselTags.set(rawVessel.mmsi, {
          element: tag,
          speedEl: tag.querySelector('.vessel-tag-speed'),
          lastDisplay: 'flex'
        });
      }
    });

    // Remove obsolete vessels and their tags
    for (const [mmsi, vessel] of this.vessels.entries()) {
      if (!activeMmsis.has(mmsi)) {
        this.group.remove(vessel.root);
        const idx = this.raycastHitboxes.indexOf(vessel.hitbox);
        if (idx !== -1) this.raycastHitboxes.splice(idx, 1);
        if (this.vesselTags.has(mmsi)) {
          this.vesselTags.get(mmsi).element.remove();
          this.vesselTags.delete(mmsi);
        }
        this.vessels.delete(mmsi);
      }
    }

    // Update top UI counter badge
    const countBadge = document.getElementById('vessels-count-top');
    if (countBadge) {
      countBadge.textContent = `${this.vessels.size} Navios`;
    }
  }

  createVesselMesh(vessel) {
    const root = new THREE.Group();
    root.name = `vessel-${vessel.mmsi}-${vessel.name}`;

    const { x, z } = latLonTo3D(vessel.lat, vessel.lon);
    const groundY = this.terrain ? this.terrain.getElevationAt(x, z) : 0;
    // Elevate safely above the 0.050 weather heatmap surface
    const waterY = (groundY <= 0.02) ? 0.080 : groundY + 0.075;

    root.position.set(x, waterY, z);

    // Create 3D Model according to Vessel Type
    const modelGroup = new THREE.Group();
    this.buildShipGeometry(modelGroup, vessel);
    root.add(modelGroup);

    // 1. Water Surface Radar Pinpoint Ring (Exact grounding footprint on the sea)
    const typeColor = this.getVesselTypeColor(vessel.type);
    const waterRingMat = new THREE.MeshBasicMaterial({
      color: typeColor,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const waterRing = new THREE.Mesh(this.waterRingGeo, waterRingMat);
    waterRing.position.y = 0.005;
    waterRing.renderOrder = 8;
    root.add(waterRing);

    // 2. Exact Directional Hull Footprint on Water (Pointing forward along -Z)
    const waterHullMat = new THREE.MeshBasicMaterial({
      color: typeColor,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const waterHull = new THREE.Mesh(this.waterHullGeo, waterHullMat);
    waterHull.position.y = 0.007;
    waterHull.renderOrder = 9;
    root.add(waterHull);

    // 3. Vertical Leader Pin (connects water footprint to 3D hull & floating tag)
    const pinGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.005, 0),
      new THREE.Vector3(0, 1.35, 0)
    ]);
    const pinMat = new THREE.LineBasicMaterial({
      color: typeColor,
      transparent: true,
      opacity: 0.65,
      depthTest: false
    });
    const pinLine = new THREE.Line(pinGeo, pinMat);
    pinLine.renderOrder = 8;
    root.add(pinLine);

    // 4. 3D Directional AIS Chevron (Forward-pointing arrow in vessel's heading)
    const chevronMat = new THREE.MeshBasicMaterial({
      color: typeColor,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    });
    const chevron = new THREE.Mesh(this.chevronGeo, chevronMat);
    chevron.position.set(0, 0.65, 0);
    chevron.renderOrder = 9;
    root.add(chevron);

    // 5. Glowing AIS Beacon Ring around the chevron
    const beaconRingMat = new THREE.MeshBasicMaterial({
      color: typeColor,
      transparent: true,
      opacity: 0.70,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const beaconRing = new THREE.Mesh(this.beaconRingGeo, beaconRingMat);
    beaconRing.position.set(0, 0.15, 0);
    beaconRing.renderOrder = 8;
    root.add(beaconRing);

    // 6. On-Map Nautical Ship Icon (direct on-water boat silhouette with heading indicator)
    const iconTexture = this.getShipIconTexture(typeColor);
    const iconMat = new THREE.MeshBasicMaterial({
      map: iconTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const onMapIcon = new THREE.Mesh(this.shipIconPlaneGeo, iconMat);
    onMapIcon.position.y = 0.012;
    onMapIcon.renderOrder = 10;
    root.add(onMapIcon);

    // Create Wake Ribbon trailing behind
    const wakeMesh = this.createWakeMesh(vessel);
    root.add(wakeMesh);

    // Create Selection / Focus Ring (initially hidden)
    const ring = new THREE.Mesh(this.selectionRingGeo, this.selectionRingMat.clone());
    ring.position.y = 0.01;
    ring.renderOrder = 8;
    ring.visible = false;
    root.add(ring);

    // Hitbox for raycasting
    const hitbox = new THREE.Mesh(this.hitboxGeo, this.hitboxMat);
    hitbox.position.y = 0.45;
    hitbox.userData = { vessel, mmsi: vessel.mmsi };
    root.add(hitbox);
    this.raycastHitboxes.push(hitbox);

    // Initial heading rotation: Heading 0° is North (-Z)
    const rad = -(vessel.heading * Math.PI) / 180;
    root.rotation.y = rad;

    const vesselState = {
      mmsi: vessel.mmsi,
      data: vessel,
      root,
      modelGroup,
      chevron,
      beaconRing,
      waterRing,
      waterHull,
      onMapIcon,
      pinLine,
      typeColor,
      wakeMesh,
      ring,
      hitbox,
      currentX: x,
      currentZ: z,
      targetX: x,
      targetZ: z,
      waterY,
      heading: vessel.heading,
      targetHeadingRad: rad,
      speed: vessel.speed,
      status: vessel.status
    };

    this.vessels.set(vessel.mmsi, vesselState);
  }

  buildShipGeometry(container, vessel) {
    const type = (vessel.type || '').toLowerCase();
    const length = Math.max(0.65, Math.min(1.6, (vessel.length || 200) / 240));
    const beam = Math.max(0.20, Math.min(0.48, (vessel.beam || 32) / 110));
    const height = 0.18;

    // --- 1. HULL GEOMETRY (Forward is -Z, Aft is +Z) ---
    let hullColor = 0x0f2b48; // Neopanamax Navy
    let superstructureColor = 0xf8fafc; // Clean White

    if (type.includes('tanker') || type.includes('petroleiro') || type.includes('gas')) {
      hullColor = 0x881337; // Deep Dark Burgundy / Crimson
      superstructureColor = 0xf1f5f9;
    } else if (type.includes('bulk') || type.includes('graneleiro')) {
      hullColor = 0x1e293b; // Slate / Gunmetal Iron
      superstructureColor = 0xe2e8f0;
    } else if (type.includes('tug') || type.includes('rebocador') || type.includes('apoio')) {
      hullColor = 0xf97316; // Vivid High-Vis Orange
      superstructureColor = 0xffedd5;
    } else if (type.includes('passenger') || type.includes('cruzeiro')) {
      hullColor = 0xf8fafc; // Radiant Luxury White
      superstructureColor = 0xffffff;
    } else if (type.includes('cargo') || type.includes('fluvial')) {
      hullColor = 0x334155; // Industrial River Grey
      superstructureColor = 0xf1f5f9;
    }

    const hullMat = new THREE.MeshStandardMaterial({
      color: hullColor,
      roughness: 0.35,
      metalness: 0.30
    });

    const superMat = new THREE.MeshStandardMaterial({
      color: superstructureColor,
      roughness: 0.25,
      metalness: 0.20
    });

    // Main hull box
    const mainHullGeo = new THREE.BoxGeometry(beam, height, length * 0.75);
    mainHullGeo.translate(0, height * 0.5, (length * 0.75) * 0.12);
    const mainHull = new THREE.Mesh(mainHullGeo, hullMat);
    container.add(mainHull);

    // Tapered bow wedge (pointing towards -Z)
    const bowGeo = new THREE.ConeGeometry(beam * 0.55, length * 0.28, 4);
    bowGeo.rotateX(Math.PI / 2);
    bowGeo.rotateY(Math.PI / 4);
    bowGeo.translate(0, height * 0.5, -(length * 0.75) * 0.45);
    const bowMesh = new THREE.Mesh(bowGeo, hullMat);
    container.add(bowMesh);

    // Red antifouling waterline trim on larger commercial hulls
    if (length > 0.8) {
      const keelGeo = new THREE.BoxGeometry(beam * 1.02, height * 0.28, length * 0.95);
      keelGeo.translate(0, height * 0.14, 0);
      const keelMat = new THREE.MeshBasicMaterial({ color: 0x991b1b });
      const keel = new THREE.Mesh(keelGeo, keelMat);
      container.add(keel);
    }

    // --- 2. SUPERSTRUCTURE / BRIDGE & DETAILS BY SHIP TYPE ---
    if (type.includes('container')) {
      // Aft Bridge Tower
      const bridgeGeo = new THREE.BoxGeometry(beam * 0.85, height * 1.6, length * 0.14);
      bridgeGeo.translate(0, height * 1.3, length * 0.24);
      const bridge = new THREE.Mesh(bridgeGeo, superMat);
      container.add(bridge);

      // Funnel behind bridge
      const funnelGeo = new THREE.CylinderGeometry(beam * 0.12, beam * 0.14, height * 1.1, 6);
      funnelGeo.translate(0, height * 1.5, length * 0.34);
      const funnelMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
      const funnel = new THREE.Mesh(funnelGeo, funnelMat);
      container.add(funnel);

      // Colorful Container Stacks on Mid & Fore Deck
      const containerColors = [0x0284c7, 0xf97316, 0x10b981, 0xef4444, 0x6366f1, 0xfacc15];
      const stackRows = 3;
      const stackCols = 2;
      const cW = (beam * 0.8) / stackCols;
      const cL = (length * 0.45) / stackRows;
      const cH = height * 0.75;

      for (let r = 0; r < stackRows; r++) {
        for (let c = 0; c < stackCols; c++) {
          const colHex = containerColors[(r * stackCols + c) % containerColors.length];
          const cGeo = new THREE.BoxGeometry(cW * 0.9, cH, cL * 0.85);
          const cMat = new THREE.MeshStandardMaterial({ color: colHex, roughness: 0.5 });
          const cMesh = new THREE.Mesh(cGeo, cMat);
          const cX = (c - (stackCols - 1) / 2) * cW;
          const cZ = -(length * 0.05) - (r * cL);
          cMesh.position.set(cX, height + cH * 0.5, cZ);
          container.add(cMesh);
        }
      }
    } else if (type.includes('tanker') || type.includes('petroleiro') || type.includes('gas')) {
      // Aft Superstructure
      const bridgeGeo = new THREE.BoxGeometry(beam * 0.85, height * 1.4, length * 0.16);
      bridgeGeo.translate(0, height * 1.2, length * 0.25);
      const bridge = new THREE.Mesh(bridgeGeo, superMat);
      container.add(bridge);

      // Tanker Deck Piping Manifold
      const pipeGeo = new THREE.CylinderGeometry(beam * 0.05, beam * 0.05, length * 0.55, 6);
      pipeGeo.rotateX(Math.PI / 2);
      pipeGeo.translate(0, height * 1.15, -(length * 0.08));
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6 });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      container.add(pipe);

      // Center Hose Manifold Crane
      const craneGeo = new THREE.BoxGeometry(beam * 0.15, height * 1.0, beam * 0.15);
      craneGeo.translate(0, height * 1.0, -(length * 0.08));
      const craneMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });
      const crane = new THREE.Mesh(craneGeo, craneMat);
      container.add(crane);
    } else if (type.includes('bulk') || type.includes('graneleiro')) {
      // Aft Superstructure Tower
      const bridgeGeo = new THREE.BoxGeometry(beam * 0.82, height * 1.5, length * 0.15);
      bridgeGeo.translate(0, height * 1.25, length * 0.26);
      const bridge = new THREE.Mesh(bridgeGeo, superMat);
      container.add(bridge);

      // 4 Large Cargo Hatches along Main Deck
      const hatchMat = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.6 });
      for (let h = 0; h < 4; h++) {
        const hatchGeo = new THREE.BoxGeometry(beam * 0.72, height * 0.22, length * 0.10);
        const hatchZ = -(length * 0.24) + (h * (length * 0.13));
        hatchGeo.translate(0, height + 0.02, hatchZ);
        const hatch = new THREE.Mesh(hatchGeo, hatchMat);
        container.add(hatch);
      }
    } else if (type.includes('passenger') || type.includes('cruzeiro')) {
      // Tiered Multi-Deck Luxury Superstructure
      const deck1Geo = new THREE.BoxGeometry(beam * 0.9, height * 1.1, length * 0.70);
      deck1Geo.translate(0, height * 1.05, 0);
      const deck1 = new THREE.Mesh(deck1Geo, superMat);
      container.add(deck1);

      // Upper Sun Deck & Observation Lounge with Cyan Glazing
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.8 });
      const deck2Geo = new THREE.BoxGeometry(beam * 0.75, height * 0.7, length * 0.50);
      deck2Geo.translate(0, height * 1.7, -(length * 0.05));
      const deck2 = new THREE.Mesh(deck2Geo, glassMat);
      container.add(deck2);

      // Twin Iconic Red/Blue Funnels
      const fMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
      const f1Geo = new THREE.CylinderGeometry(beam * 0.10, beam * 0.12, height * 0.9, 6);
      f1Geo.translate(0, height * 2.1, length * 0.12);
      const f1 = new THREE.Mesh(f1Geo, fMat);
      container.add(f1);
    } else if (type.includes('tug') || type.includes('rebocador') || type.includes('apoio')) {
      // Forward Wheelhouse with panoramic windows
      const wheelhouseGeo = new THREE.BoxGeometry(beam * 0.85, height * 1.8, length * 0.32);
      wheelhouseGeo.translate(0, height * 1.4, -(length * 0.10));
      const wheelhouse = new THREE.Mesh(wheelhouseGeo, superMat);
      container.add(wheelhouse);

      // Towing winch on open aft deck
      const winchGeo = new THREE.CylinderGeometry(beam * 0.22, beam * 0.22, beam * 0.5, 8);
      winchGeo.rotateZ(Math.PI / 2);
      winchGeo.translate(0, height * 0.8, length * 0.22);
      const winchMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
      const winch = new THREE.Mesh(winchGeo, winchMat);
      container.add(winch);
    } else {
      // General Cargo / River Barge
      const deckhouseGeo = new THREE.BoxGeometry(beam * 0.8, height * 1.3, length * 0.20);
      deckhouseGeo.translate(0, height * 1.15, length * 0.22);
      const deckhouse = new THREE.Mesh(deckhouseGeo, superMat);
      container.add(deckhouse);

      // Cargo Tarpaulin on Forward Deck
      const tarpGeo = new THREE.BoxGeometry(beam * 0.75, height * 0.6, length * 0.45);
      tarpGeo.translate(0, height + 0.05, -(length * 0.12));
      const tarpMat = new THREE.MeshStandardMaterial({ color: 0x047857 });
      const tarp = new THREE.Mesh(tarpGeo, tarpMat);
      container.add(tarp);
    }

    // --- 3. COLREGS NAVIGATION LIGHTS ---
    // Port Red Light (Left Bow)
    const portLight = new THREE.Mesh(this.navLightGeo, this.redLightMat);
    portLight.position.set(-(beam * 0.52), height * 1.1, -(length * 0.32));
    container.add(portLight);

    // Starboard Green Light (Right Bow)
    const stbdLight = new THREE.Mesh(this.navLightGeo, this.greenLightMat);
    stbdLight.position.set(beam * 0.52, height * 1.1, -(length * 0.32));
    container.add(stbdLight);

    // Stern White Light (Aft Mast)
    const sternLight = new THREE.Mesh(this.navLightGeo, this.whiteLightMat);
    sternLight.position.set(0, height * 1.8, length * 0.38);
    container.add(sternLight);

    // Ensure all 3D ship components render above water & weather layers
    container.traverse(c => {
      if (c.isMesh) {
        c.renderOrder = 8;
        if (c.material) c.material.depthWrite = true;
      }
    });
  }

  createWakeMesh(vessel) {
    const length = Math.max(0.65, Math.min(1.6, (vessel.length || 200) / 240));
    const wakeLength = length * 2.8;
    const wakeSpread = (vessel.beam || 32) / 60;

    // Triangular V-Wake trailing behind the stern (+Z direction)
    const geom = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      // Point 1: At Stern
      0, 0, length * 0.35,
      // Point 2: Left Wing
      -wakeSpread, 0, length * 0.35 + wakeLength,
      // Point 3: Right Wing
      wakeSpread, 0, length * 0.35 + wakeLength
    ]);

    const uvs = new Float32Array([
      0.5, 0.0,
      0.0, 1.0,
      1.0, 1.0
    ]);

    geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const mesh = new THREE.Mesh(geom, this.wakeMat);
    mesh.position.y = -0.004;
    mesh.renderOrder = 7;
    mesh.visible = vessel.speed > 1.0;
    return mesh;
  }

  update(delta, time, camera = null) {
    if (!this.visible) return;

    // 1 Nautical Mile in 3D scene units:
    // Latitude span = 40 degrees mapped to 140 units -> 3.5 units per degree.
    // 1 NM = 1/60th of a degree = 3.5 / 60 units.
    const UNITS_PER_NM = 3.5 / 60;

    if (!this._tagProjectVec) this._tagProjectVec = new THREE.Vector3();
    const tempV = this._tagProjectVec;
    const widthHalf = window.innerWidth / 2;
    const heightHalf = window.innerHeight / 2;

    for (const [mmsi, v] of this.vessels.entries()) {
      // 1. Advance along heading smoothly based on speed (knots = NM / hour)
      if (v.speed > 0.5) {
        const speedNMPerSec = v.speed / 3600;
        const forwardSpeed = speedNMPerSec * UNITS_PER_NM * delta;

        const rad = -(v.heading * Math.PI) / 180;
        const dirX = Math.sin(-rad);
        const dirZ = -Math.cos(-rad);

        // Advance both current and target coordinates in sync
        v.currentX += dirX * forwardSpeed;
        v.currentZ += dirZ * forwardSpeed;
        v.targetX += dirX * forwardSpeed;
        v.targetZ += dirZ * forwardSpeed;
      }

      // Smooth error correction towards target from server updates
      v.currentX += (v.targetX - v.currentX) * 0.1;
      v.currentZ += (v.targetZ - v.currentZ) * 0.1;

      // 2. Height adjustment: firmly above ocean and weather heatmaps (which sit at 0.050)
      const groundY = this.terrain ? this.terrain.getElevationAt(v.currentX, v.currentZ) : 0;
      const baseWaterY = (groundY <= 0.02) ? 0.080 : groundY + 0.075;

      // Realistic hydrodynamic ocean roll and pitch
      const bobY = Math.sin(time * 2.2 + mmsi) * 0.008;
      const roll = Math.sin(time * 1.8 + mmsi) * 0.015;
      const pitch = Math.cos(time * 1.4 + mmsi) * 0.010;

      v.root.position.set(v.currentX, baseWaterY + bobY, v.currentZ);
      v.modelGroup.rotation.z = roll;
      v.modelGroup.rotation.x = pitch;

      // Heading rotation interpolation
      const targetRad = -(v.heading * Math.PI) / 180;
      v.root.rotation.y += (targetRad - v.root.rotation.y) * 0.08;

      // 3. Camera distance & Adaptive Scaling (Zoom Visibility)
      const camDist = camera ? camera.position.distanceTo(v.root.position) : 80;
      // Close zoom (camDist < 30): scale = 1.3 - 1.8x
      // Mid zoom (camDist 30 - 70): scale = 2.0 - 3.8x
      // Far zoom (camDist > 70): scale = 4.0 - 5.2x
      const scale = Math.max(1.3, Math.min(5.2, camDist * 0.050));
      v.modelGroup.scale.set(scale, scale, scale);
      v.hitbox.scale.set(scale, scale, scale);

      // Water surface radar pinpoint & directional hull footprint scaling
      if (v.waterRing) {
        const ringPulse = 1.0 + Math.sin(time * 3.2 + mmsi) * 0.18;
        v.waterRing.scale.set(scale * ringPulse, scale * ringPulse, scale * ringPulse);
      }
      if (v.waterHull) {
        v.waterHull.scale.set(scale, scale, scale);
      }
      if (v.onMapIcon) {
        v.onMapIcon.scale.set(scale, scale, scale);
      }
      if (v.pinLine) {
        v.pinLine.scale.set(scale, scale, scale);
      }

      // 4. Dynamic Wake pulsation
      if (v.wakeMesh) {
        const isMoving = v.speed > 1.0;
        v.wakeMesh.visible = isMoving;
        if (isMoving) {
          const wakePulse = 0.95 + Math.sin(time * 3.5 + mmsi) * 0.15;
          v.wakeMesh.scale.set(scale * wakePulse, 1, scale * wakePulse);
        }
      }

      // 5. Directional Chevron & Beacon Visibility
      if (v.chevron && v.beaconRing) {
        // High-visibility beacon when zoomed out; smoothly fades to highlight detailed 3D hull when zoomed in
        const chevronOpacity = Math.max(0.15, Math.min(1.0, (camDist - 25) / 45));
        v.chevron.material.opacity = chevronOpacity;
        v.beaconRing.material.opacity = chevronOpacity * 0.75;
        const ringPulse = 1.0 + Math.sin(time * 3.2 + mmsi) * 0.22;
        v.beaconRing.scale.set(ringPulse, ringPulse, ringPulse);
      }

      // 6. Selection ring pulse
      if (v.ring && v.ring.visible) {
        const ringPulse = 1.0 + Math.sin(time * 4.0) * 0.15;
        v.ring.scale.set(scale * ringPulse, scale * ringPulse, scale * ringPulse);
      }

      // 7. Floating 2D/3D Vessel Scene Tag (Active when zoomed into a region: camDist < 95)
      const tagObj = this.vesselTags ? this.vesselTags.get(mmsi) : null;
      if (tagObj) {
        const shouldShow = this.visible && camDist < 95 && !!camera;
        if (shouldShow) {
          tempV.set(v.currentX, v.root.position.y + (1.35 * scale), v.currentZ);
          tempV.project(camera);

          // Within screen frustum
          if (tempV.z < 1 && tempV.x >= -1.1 && tempV.x <= 1.1 && tempV.y >= -1.1 && tempV.y <= 1.1) {
            const sx = (tempV.x * widthHalf) + widthHalf;
            const sy = -(tempV.y * heightHalf) + heightHalf;
            tagObj.element.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
            if (tagObj.lastDisplay !== 'flex') {
              tagObj.element.style.display = 'flex';
              tagObj.lastDisplay = 'flex';
            }
          } else {
            if (tagObj.lastDisplay !== 'none') {
              tagObj.element.style.display = 'none';
              tagObj.lastDisplay = 'none';
            }
          }
        } else {
          if (tagObj.lastDisplay !== 'none') {
            tagObj.element.style.display = 'none';
            tagObj.lastDisplay = 'none';
          }
        }
      }
    }

    // 8. Update active voyage route tags and animations
    if (this.activeRoute && camera && this.routeGroup && this.routeGroup.visible) {
      if (this.futureRouteLine && this.futureRouteLine.material) {
        const pulse = 0.85 + Math.sin(time * 3.2) * 0.15;
        this.futureRouteLine.material.opacity = pulse;
      }

      if (this.routeOriginTag && this.routeOriginTag.element) {
        tempV.copy(this.routeOriginTag.pos);
        tempV.y += 2.6;
        tempV.project(camera);
        if (tempV.z < 1) {
          const sx = (tempV.x * widthHalf) + widthHalf;
          const sy = -(tempV.y * heightHalf) + heightHalf;
          this.routeOriginTag.element.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
          this.routeOriginTag.element.style.display = 'flex';
        } else {
          this.routeOriginTag.element.style.display = 'none';
        }
      }

      if (this.routeDestTag && this.routeDestTag.element) {
        tempV.copy(this.routeDestTag.pos);
        tempV.y += 2.6;
        tempV.project(camera);
        if (tempV.z < 1) {
          const sx = (tempV.x * widthHalf) + widthHalf;
          const sy = -(tempV.y * heightHalf) + heightHalf;
          this.routeDestTag.element.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
          this.routeDestTag.element.style.display = 'flex';
        } else {
          this.routeDestTag.element.style.display = 'none';
        }
      }
    }
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
    if (this.routeGroup) {
      this.routeGroup.visible = visible;
    }
    if (this.routeOriginTag && this.routeOriginTag.element) {
      this.routeOriginTag.element.style.display = visible ? 'flex' : 'none';
    }
    if (this.routeDestTag && this.routeDestTag.element) {
      this.routeDestTag.element.style.display = visible ? 'flex' : 'none';
    }
    if (this.vesselTags) {
      this.vesselTags.forEach(t => {
        t.element.style.display = visible ? t.lastDisplay : 'none';
      });
    }
    if (!visible) {
      if (this.hoveredVessel) this.setHoveredVessel(null, null);
      if (this.selectedVessel) this.selectVesselByMmsi(null);
      this.clearVoyageRoute();
    }
  }

  selectVesselByMmsi(mmsi) {
    // Unselect previous
    if (this.selectedVessel && this.vessels.has(this.selectedVessel)) {
      this.vessels.get(this.selectedVessel).ring.visible = false;
    }

    if (mmsi && this.vessels.has(mmsi)) {
      this.selectedVessel = mmsi;
      const vessel = this.vessels.get(mmsi);
      vessel.ring.visible = true;
      this.drawVoyageRoute(vessel.data);
      this.onSelectVessel(vessel.data);
      return vessel;
    } else {
      this.selectedVessel = null;
      this.clearVoyageRoute();
      return null;
    }
  }

  setHoveredVessel(mmsi, screenPos = null) {
    if (this.hoveredVessel === mmsi) {
      // Keep tracking cursor position while hovering the same vessel
      if (mmsi && screenPos && this.vessels.has(mmsi)) {
        this.onHoverVessel(this.vessels.get(mmsi).data, screenPos);
      }
      return;
    }

    // Reset previous hover scale
    if (this.hoveredVessel && this.vessels.has(this.hoveredVessel)) {
      const prevV = this.vessels.get(this.hoveredVessel);
      prevV.modelGroup.scale.set(1, 1, 1);
      if (prevV.onMapIcon) prevV.onMapIcon.scale.set(1, 1, 1);
    }

    this.hoveredVessel = mmsi;

    if (mmsi && this.vessels.has(mmsi)) {
      const v = this.vessels.get(mmsi);
      v.modelGroup.scale.set(1.18, 1.18, 1.18);
      if (v.onMapIcon) v.onMapIcon.scale.set(1.3, 1.3, 1.3);
      this.onHoverVessel(v.data, screenPos);
    } else {
      this.onHoverVessel(null, null);
    }
  }

  // --- VOYAGE NAUTICAL ROUTE SYSTEM (Origem -> Posição Atual -> Destino) ---

  drawVoyageRoute(vessel) {
    if (!vessel) return;
    this.clearVoyageRoute();

    const originCoords = this.getNauticalPortCoords(vessel.origin, vessel.baseLat, vessel.baseLon, -1);
    const destCoords = this.getNauticalPortCoords(vessel.destination, vessel.baseLat, vessel.baseLon, 1);
    const currentCoords = { lat: vessel.lat, lon: vessel.lon };

    // Build intermediate coastal shipping lanes
    const passedWaypoints = this.buildCoastalPath(originCoords, currentCoords);
    const futureWaypoints = this.buildCoastalPath(currentCoords, destCoords);

    // Convert to 3D points elevated at y = 0.084 (safely above ocean & weather layers)
    const passed3D = passedWaypoints.map(pt => {
      const { x, z } = latLonTo3D(pt.lat, pt.lon);
      return new THREE.Vector3(x, 0.084, z);
    });

    const future3D = futureWaypoints.map(pt => {
      const { x, z } = latLonTo3D(pt.lat, pt.lon);
      return new THREE.Vector3(x, 0.084, z);
    });

    // 1. Render Passed Route (Solid Cyan / Emerald glowing line)
    if (passed3D.length >= 2) {
      let passedCurvePts = passed3D;
      if (passed3D.length > 2) {
        const curve = new THREE.CatmullRomCurve3(passed3D, false, 'centripetal');
        passedCurvePts = curve.getPoints(Math.max(25, passed3D.length * 12));
      }
      const passedGeo = new THREE.BufferGeometry().setFromPoints(passedCurvePts);
      const passedMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        linewidth: 3,
        transparent: true,
        opacity: 0.92,
        depthTest: false
      });
      const passedLine = new THREE.Line(passedGeo, passedMat);
      passedLine.renderOrder = 10;
      this.routeGroup.add(passedLine);
    }

    // 2. Render Future Route (Pulsing Dashed Amber line)
    if (future3D.length >= 2) {
      let futureCurvePts = future3D;
      if (future3D.length > 2) {
        const curve = new THREE.CatmullRomCurve3(future3D, false, 'centripetal');
        futureCurvePts = curve.getPoints(Math.max(30, future3D.length * 15));
      }
      const futureGeo = new THREE.BufferGeometry().setFromPoints(futureCurvePts);
      const futureMat = new THREE.LineDashedMaterial({
        color: 0xfbbf24,
        linewidth: 3,
        scale: 1,
        dashSize: 1.0,
        gapSize: 0.6,
        transparent: true,
        opacity: 0.95,
        depthTest: false
      });
      const futureLine = new THREE.Line(futureGeo, futureMat);
      futureLine.computeLineDistances();
      futureLine.renderOrder = 10;
      this.routeGroup.add(futureLine);
      this.futureRouteLine = futureLine;
    }

    // 3. Origin 3D Marker & HTML Tag
    const orig3D = passed3D[0];
    const origMarker = this.createPortMarkerMesh(orig3D, 0x10b981);
    this.routeGroup.add(origMarker);
    this.createPortHTMLTag(orig3D, `🚩 Origem: ${originCoords.name}`, 'port-tag-origin', 'orig');

    // 4. Destination 3D Marker & HTML Tag
    const dest3D = future3D[future3D.length - 1];
    const destMarker = this.createPortMarkerMesh(dest3D, 0xf59e0b);
    this.routeGroup.add(destMarker);
    this.createPortHTMLTag(dest3D, `🏁 Destino: ${destCoords.name}`, 'port-tag-dest', 'dest');

    this.activeRoute = {
      vessel,
      orig3D,
      dest3D,
      originCoords,
      destCoords
    };

    // Update button in vessel card if present
    const btnRoute = document.getElementById('btn-toggle-vessel-route');
    if (btnRoute) {
      btnRoute.textContent = '🗺️ Ocultar Rota';
      btnRoute.classList.add('route-active');
    }
  }

  createPortMarkerMesh(pos, colorHex) {
    const group = new THREE.Group();
    group.position.copy(pos);

    // Ground anchor ring
    const ringGeo = new THREE.RingGeometry(0.6, 0.9, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Vertical beacon pole
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6);
    poleGeo.translate(0, 1.1, 0);
    const poleMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    group.add(pole);

    // Glowing top beacon orb
    const orbGeo = new THREE.SphereGeometry(0.35, 8, 8);
    orbGeo.translate(0, 2.2, 0);
    const orbMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    group.add(orb);

    group.renderOrder = 10;
    return group;
  }

  createPortHTMLTag(pos3D, text, extraClass, idKey) {
    if (!this.uiContainer) this.uiContainer = document.getElementById('ui-container');
    if (!this.uiContainer) return;

    const el = document.createElement('div');
    el.className = `port-scene-tag ${extraClass}`;
    el.textContent = text;
    this.uiContainer.appendChild(el);

    if (idKey === 'orig') {
      this.routeOriginTag = { element: el, pos: pos3D };
    } else {
      this.routeDestTag = { element: el, pos: pos3D };
    }
  }

  clearVoyageRoute() {
    if (this.routeOriginTag && this.routeOriginTag.element) {
      this.routeOriginTag.element.remove();
      this.routeOriginTag = null;
    }
    if (this.routeDestTag && this.routeDestTag.element) {
      this.routeDestTag.element.remove();
      this.routeDestTag = null;
    }
    // Cleanly dispose route group objects
    while (this.routeGroup.children.length > 0) {
      const obj = this.routeGroup.children[0];
      this.routeGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.activeRoute = null;
    this.futureRouteLine = null;

    const btnRoute = document.getElementById('btn-toggle-vessel-route');
    if (btnRoute) {
      btnRoute.textContent = '🗺️ Rota Náutica';
      btnRoute.classList.remove('route-active');
    }
  }

  toggleRouteVisible() {
    if (this.activeRoute) {
      const willBeVisible = !this.routeGroup.visible;
      this.routeGroup.visible = willBeVisible;
      if (this.routeOriginTag && this.routeOriginTag.element) {
        this.routeOriginTag.element.style.display = willBeVisible ? 'flex' : 'none';
      }
      if (this.routeDestTag && this.routeDestTag.element) {
        this.routeDestTag.element.style.display = willBeVisible ? 'flex' : 'none';
      }

      const btnRoute = document.getElementById('btn-toggle-vessel-route');
      if (btnRoute) {
        btnRoute.textContent = willBeVisible ? '🗺️ Ocultar Rota' : '🗺️ Ver Rota';
        btnRoute.classList.toggle('route-active', willBeVisible);
      }
    } else if (this.selectedVessel && this.vessels.has(this.selectedVessel)) {
      this.drawVoyageRoute(this.vessels.get(this.selectedVessel).data);
    }
  }

  getNauticalPortCoords(portName, fallbackLat, fallbackLon, dir = 1) {
    if (!portName || typeof portName !== 'string') {
      return { lat: fallbackLat + dir * 0.8, lon: fallbackLon + dir * 0.8, name: 'Marítimo' };
    }

    const clean = portName.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .trim();

    for (const [key, val] of Object.entries(NAUTICAL_PORTS)) {
      const normKey = key.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (clean.includes(normKey) || normKey.includes(clean)) {
        return val;
      }
    }

    return {
      lat: fallbackLat + (dir * 0.8),
      lon: fallbackLon + (dir * 0.8),
      name: portName.split('(')[0].trim()
    };
  }

  buildCoastalPath(from, to) {
    if (!from || !to) return [];
    const dLat = Math.abs(to.lat - from.lat);
    const dLon = Math.abs(to.lon - from.lon);
    const directDist = Math.sqrt(dLat * dLat + dLon * dLon);

    // If points are very close (harbor, bay or tug maneuver), direct connection
    if (directDist < 1.2) {
      return [from, to];
    }

    // Find closest nodes in coastal chain
    let fromIdx = 0, toIdx = 0;
    let minFromDist = Infinity, minToDist = Infinity;

    for (let i = 0; i < BRAZIL_COASTAL_CHAIN.length; i++) {
      const n = BRAZIL_COASTAL_CHAIN[i];
      const df = Math.hypot(n.lat - from.lat, n.lon - from.lon);
      const dt = Math.hypot(n.lat - to.lat, n.lon - to.lon);
      if (df < minFromDist) { minFromDist = df; fromIdx = i; }
      if (dt < minToDist) { minToDist = dt; toIdx = i; }
    }

    const intermediate = [];
    if (fromIdx < toIdx) {
      for (let i = fromIdx; i <= toIdx; i++) {
        intermediate.push(BRAZIL_COASTAL_CHAIN[i]);
      }
    } else if (fromIdx > toIdx) {
      for (let i = fromIdx; i >= toIdx; i--) {
        intermediate.push(BRAZIL_COASTAL_CHAIN[i]);
      }
    } else {
      intermediate.push(BRAZIL_COASTAL_CHAIN[fromIdx]);
    }

    const rawPath = [from, ...intermediate, to];
    // Filter duplicates or very close consecutive points (< 0.12 deg)
    const cleanPath = [];
    for (let i = 0; i < rawPath.length; i++) {
      const p = rawPath[i];
      if (cleanPath.length === 0) {
        cleanPath.push(p);
      } else {
        const last = cleanPath[cleanPath.length - 1];
        if (Math.hypot(p.lat - last.lat, p.lon - last.lon) > 0.12) {
          cleanPath.push(p);
        }
      }
    }

    return cleanPath.length >= 2 ? cleanPath : [from, to];
  }
}

// Comprehensive Nautical Ports Coordinates Map
export const NAUTICAL_PORTS = {
  'santos': { lat: -23.97, lon: -46.30, name: 'Santos (SP)' },
  'btp': { lat: -23.96, lon: -46.31, name: 'Santos - BTP (SP)' },
  'barra santos': { lat: -24.04, lon: -46.32, name: 'Barra de Santos' },
  'canal de santos': { lat: -23.98, lon: -46.30, name: 'Canal de Santos' },
  'rio de janeiro': { lat: -22.90, lon: -43.16, name: 'Rio de Janeiro (RJ)' },
  'guanabara': { lat: -22.87, lon: -43.15, name: 'Baía de Guanabara' },
  'pier maua': { lat: -22.89, lon: -43.18, name: 'Píer Mauá (RJ)' },
  'ilha redonda': { lat: -22.84, lon: -43.14, name: 'Ilha Redonda (RJ)' },
  'angra': { lat: -23.01, lon: -44.32, name: 'Angra dos Reis (RJ)' },
  'macae': { lat: -22.38, lon: -41.77, name: 'Macaé (RJ)' },
  'bacia de santos': { lat: -24.80, lon: -42.50, name: 'Bacia de Santos (Pré-Sal)' },
  'carioca': { lat: -24.95, lon: -42.70, name: 'FPSO Carioca' },
  'bacia de campos': { lat: -22.40, lon: -40.50, name: 'Bacia de Campos' },
  'paranagua': { lat: -25.50, lon: -48.51, name: 'Paranaguá (PR)' },
  'galheta': { lat: -25.58, lon: -48.32, name: 'Canal da Galheta (PR)' },
  'itajaí': { lat: -26.91, lon: -48.65, name: 'Itajaí (SC)' },
  'itajai': { lat: -26.91, lon: -48.65, name: 'Itajaí (SC)' },
  'rio grande': { lat: -32.05, lon: -52.10, name: 'Rio Grande (RS)' },
  'salvador': { lat: -12.96, lon: -38.51, name: 'Salvador (BA)' },
  'baia de todos': { lat: -12.85, lon: -38.60, name: 'Baía de Todos os Santos' },
  'ilheus': { lat: -14.79, lon: -39.02, name: 'Ilhéus (BA)' },
  'suape': { lat: -8.39, lon: -34.96, name: 'Suape (PE)' },
  'recife': { lat: -8.05, lon: -34.87, name: 'Recife (PE)' },
  'abreu e lima': { lat: -8.41, lon: -34.98, name: 'Refinaria Abreu e Lima' },
  'vitoria': { lat: -20.32, lon: -40.33, name: 'Vitória (ES)' },
  'tubarao': { lat: -20.29, lon: -40.24, name: 'Porto de Tubarão (ES)' },
  'itaqui': { lat: -2.57, lon: -44.36, name: 'Porto do Itaqui (MA)' },
  'sao luis': { lat: -2.53, lon: -44.30, name: 'São Luís (MA)' },
  'fortaleza': { lat: -3.72, lon: -38.47, name: 'Fortaleza (CE)' },
  'mucuripe': { lat: -3.71, lon: -38.48, name: 'Porto do Mucuripe (CE)' },
  'manaus': { lat: -3.14, lon: -60.02, name: 'Manaus (AM)' },
  'chibatao': { lat: -3.15, lon: -59.95, name: 'Porto Chibatão (AM)' },
  'belem': { lat: -1.45, lon: -48.50, name: 'Belém (PA)' },
  'vila do conde': { lat: -1.54, lon: -48.75, name: 'Vila do Conde (PA)' },
  'santarem': { lat: -2.43, lon: -54.71, name: 'Santarém (PA)' },
  'buenos aires': { lat: -34.60, lon: -58.36, name: 'Buenos Aires (AR)' },
  'montevideu': { lat: -34.90, lon: -56.20, name: 'Montevidéu (UY)' },
  'roterda': { lat: 4.0, lon: -30.0, name: 'Roterdã (Atlântico N)' },
  'rotterdam': { lat: 4.0, lon: -30.0, name: 'Roterdã (Atlântico N)' },
  'antuerpia': { lat: 3.5, lon: -30.5, name: 'Antuérpia (Atlântico N)' },
  'antwerp': { lat: 3.5, lon: -30.5, name: 'Antuérpia (Atlântico N)' },
  'algeciras': { lat: 2.8, lon: -31.0, name: 'Algeciras (Atlântico N)' },
  'cingapura': { lat: -26.0, lon: -32.0, name: 'Cingapura (Rota Transatlântica)' },
  'singapore': { lat: -26.0, lon: -32.0, name: 'Cingapura (Rota Transatlântica)' },
  'tianjin': { lat: -16.0, lon: -31.0, name: 'Tianjin (Rota Leste)' }
};

// Coastal Waypoints Chain along Brazilian Littoral & Amazon
export const BRAZIL_COASTAL_CHAIN = [
  { lat: -34.5, lon: -53.5 }, // Rio da Prata / UY
  { lat: -32.2, lon: -51.2 }, // Rio Grande RS
  { lat: -27.5, lon: -48.1 }, // SC / Itajaí
  { lat: -25.6, lon: -47.8 }, // PR / Paranaguá
  { lat: -24.4, lon: -45.8 }, // SP / Santos
  { lat: -23.4, lon: -43.4 }, // RJ / Ilha Grande
  { lat: -23.2, lon: -41.2 }, // RJ / Cabo Frio
  { lat: -20.6, lon: -39.8 }, // ES / Vitória
  { lat: -17.8, lon: -37.8 }, // BA / Abrolhos
  { lat: -13.3, lon: -38.0 }, // BA / Salvador
  { lat: -9.8,  lon: -35.2 }, // AL / Maceió
  { lat: -8.4,  lon: -34.5 }, // PE / Suape
  { lat: -5.4,  lon: -34.6 }, // RN / Natal
  { lat: -3.2,  lon: -38.2 }, // CE / Fortaleza
  { lat: -1.8,  lon: -43.8 }, // MA / Itaqui
  { lat: -0.2,  lon: -47.5 }, // PA / Foz Amazonas
  { lat: -1.8,  lon: -52.0 }, // PA / Rio Amazonas E
  { lat: -2.3,  lon: -54.7 }, // PA / Santarém
  { lat: -2.8,  lon: -58.2 }, // AM / Rio Amazonas O
  { lat: -3.1,  lon: -59.9 }  // AM / Manaus
];

