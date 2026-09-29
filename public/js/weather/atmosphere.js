import * as THREE from 'three';

export class AtmosphereSystem {
  constructor(scene) {
    this.scene = scene;
    // Store references to scene lights (find them by traversal)
    this.ambientLight = null;
    this.sunLight = null;
    this.hemiLight = null;
    this.defaultBackground = new THREE.Color(0x070d14);
    this.stormBackground = new THREE.Color(0x0a0e18);
    this.nightBackground = new THREE.Color(0x020408);
    
    // Cached colors for interpolation to prevent allocation in update loop
    this.currentAmbientColor = new THREE.Color();
    this.currentSunColor = new THREE.Color();
    this.currentBgColor = new THREE.Color();
    
    this.colorA = new THREE.Color();
    this.colorB = new THREE.Color();
    
    // Base light intensities
    this.baseAmbient = 0.95;
    this.baseSun = 1.4;
    this.baseHemi = 0.6;
    
    // Current state
    this.stormIntensity = 0; // 0 = clear, 1 = full storm
    this.targetStormIntensity = 0;
    this.timeOfDay = 12; // 0-24 hours
    this.targetTimeOfDay = 12;
    
    this.findLights();
  }
  
  findLights() {
    this.scene.traverse(obj => {
      if (obj.isAmbientLight) this.ambientLight = obj;
      else if (obj.isDirectionalLight) this.sunLight = obj;
      else if (obj.isHemisphereLight) this.hemiLight = obj;
    });
  }
  
  // Called when weather layer changes or storm is detected
  setStormIntensity(intensity) {
    this.targetStormIntensity = Math.max(0, Math.min(1, intensity));
  }
  
  // Called when forecast hour changes - map hour offset to time of day
  setForecastHour(hourOffset) {
    // Current local time in Brazil (UTC-3) plus offset
    const now = new Date();
    const brazilHour = (now.getUTCHours() - 3 + 24) % 24;
    this.targetTimeOfDay = (brazilHour + hourOffset) % 24;
  }
  
  update(delta) {
    // Smooth interpolation toward target values
    this.stormIntensity += (this.targetStormIntensity - this.stormIntensity) * delta * 2.0;
    
    // Day/Night mode removed per user request - always keep day mode
    const dayFactor = 1.0;
    
    // Apply storm darkening
    const stormDim = 1.0 - this.stormIntensity * 0.45;
    
    // Combined factor
    const lightMul = dayFactor * stormDim;
    
    if (this.ambientLight) {
      this.ambientLight.intensity = this.baseAmbient * lightMul;
      // Night tint: shift ambient toward blue
      if (dayFactor < 0.5) {
        this.lerpColorCache(0x1e3a5f, 0xdbeafe, dayFactor * 2, this.currentAmbientColor);
      } else {
        this.currentAmbientColor.setHex(0xdbeafe);
      }
      this.ambientLight.color.copy(this.currentAmbientColor);
    }
    
    if (this.sunLight) {
      this.sunLight.intensity = this.baseSun * lightMul;
      // Sunset/sunrise warm tint
      if (dayFactor > 0.3 && dayFactor < 0.7) {
        const sunsetPhase = 1.0 - Math.abs(dayFactor - 0.5) * 5.0;
        if (sunsetPhase > 0) {
          this.lerpColorCache(0xfff7ed, 0xff9944, sunsetPhase * 0.4, this.currentSunColor);
        } else {
          this.currentSunColor.setHex(0xfff7ed);
        }
      } else {
        this.currentSunColor.setHex(0xfff7ed);
      }
      this.sunLight.color.copy(this.currentSunColor);
    }
    
    if (this.hemiLight) {
      this.hemiLight.intensity = this.baseHemi * Math.max(0.15, lightMul);
    }
    
    // Background color shift
    if (this.scene.background) {
      this.currentBgColor.copy(this.nightBackground).lerp(this.defaultBackground, dayFactor);
      this.currentBgColor.lerp(this.stormBackground, this.stormIntensity * 0.5);
      this.scene.background.copy(this.currentBgColor);
    }
    
    // Fog density increases at night and during storms
    if (this.scene.fog) {
      this.scene.fog.density = 0.0055 + (1.0 - dayFactor) * 0.003 + this.stormIntensity * 0.004;
    }
  }
  
  // Flash effect for lightning (temporarily spike ambient for 80ms)
  triggerLightningFlash() {
    if (this.ambientLight) {
      const originalIntensity = this.ambientLight.intensity;
      this.ambientLight.intensity = originalIntensity * 2.5;
      setTimeout(() => {
        if (this.ambientLight) {
          this.ambientLight.intensity = originalIntensity;
        }
      }, 80);
    }
  }

  calculateDayFactor(hour) {
    // Sunrise ~6, sunset ~18, with smooth transitions
    if (hour >= 7 && hour <= 17) return 1.0; // Full day
    if (hour >= 20 || hour <= 4) return 0.12; // Night (not pure black)
    if (hour > 4 && hour < 7) return 0.12 + (hour - 4) / 3 * 0.88; // Dawn
    if (hour > 17 && hour < 20) return 1.0 - (hour - 17) / 3 * 0.88; // Dusk
    return 0.5;
  }

  lerpColorCache(hexA, hexB, t, outColor) {
    this.colorA.setHex(hexA);
    this.colorB.setHex(hexB);
    outColor.copy(this.colorA).lerp(this.colorB, t);
  }
}
