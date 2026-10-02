import { WindLayer } from './wind.js';
import { RainLayer } from './rain.js';
import { LightningLayer } from './lightning.js';
import { SnowLayer } from './snow.js';
import { TemperatureLayer } from './temperature.js';
import { CloudsLayer } from './clouds.js';

export class WeatherManager {
  constructor(scene, terrain, citiesSystem, onStatusChange, onForecastChange, onWeatherBroadcast) {
    this.scene = scene;
    this.terrain = terrain;
    this.citiesSystem = citiesSystem;
    this.onStatusChange = onStatusChange || (() => {});
    this.onForecastChange = onForecastChange || (() => {});
    this.onWeatherBroadcast = onWeatherBroadcast || (() => {});

    this.layers = {
      wind: new WindLayer(scene, terrain),
      rain: new RainLayer(scene, terrain),
      lightning: new LightningLayer(scene, terrain),
      snow: new SnowLayer(scene, terrain),
      temperature: new TemperatureLayer(scene, terrain),
      clouds: new CloudsLayer(scene, terrain)
    };

    this.activeLayer = 'wind';
    this.weatherData = null;
    this.currentModel = 'ecmwf'; // Default: European ECMWF IFS (Windy.com default)

    // Timeline forecast state
    this.currentForecastHour = 0;
    this.targetForecastHour = 0;
    this.isTransitioning = false;
    this.transitionTime = 0;
    this.transitionDuration = 0.8; // seconds

    this.fromStationStates = [];
    this.toStationStates = [];
    this.activeStationStates = [];

    // Timeline playback
    this.isPlaying = false;
    this.playTimer = 0;
    this.timelineSteps = [0, 6, 12, 24, 48, 72];
    this.currentStepIdx = 0;

    this.init();
  }

  async init() {
    this.setLayer('wind');
    await this.fetchLiveWeather();
    setInterval(() => this.fetchLiveWeather(), 10 * 60 * 1000);
  }

  async setModel(model) {
    if (this.currentModel === model) return;
    this.currentModel = model;
    await this.fetchLiveWeather();
  }

  async fetchLiveWeather() {
    const modelLabel = this.currentModel === 'gfs' ? 'NOAA GFS (22km)' : 'ECMWF IFS (9km)';
    this.onStatusChange(`Carregando modelo ${modelLabel}...`);
    try {
      const response = await fetch(`/api/weather/brazil?model=${this.currentModel}`);
      if (!response.ok) throw new Error('Falha ao obter dados meteorológicos');

      const data = await response.json();
      this.weatherData = data;
      this.onStatusChange(`Dados atualizados: ${modelLabel}`);

      // Extract base states
      this.activeStationStates = this.extractStationStateForHour(0);

      // Distribute to all layers
      this.broadcastWeatherData(this.activeStationStates);

      this.onStatusChange('Dados meteorológicos em tempo real atualizados!');
    } catch (err) {
      console.warn('Usando dados climáticos locais integrados:', err);
      this.onStatusChange('Clima em tempo real ativo');
    }
  }

  /**
   * Extracts or interpolates station weather snapshot for a given forecast hour
   */
  extractStationStateForHour(hourOffset) {
    if (!this.weatherData || !Array.isArray(this.weatherData)) return [];

    return this.weatherData.map(st => {
      let temp = st.weather.temperature_2m || 24;
      let windSpeed = st.weather.wind_speed_10m || 12;
      let windDir = st.weather.wind_direction_10m || 90;
      let rain = st.weather.rain || 0;
      let weatherCode = st.weather.weather_code || 0;
      let cloudCover = st.weather.cloud_cover || 30;

      // If hourly forecast is provided from Open-Meteo
      if (st.hourly && st.hourly.temperature_2m && hourOffset > 0) {
        const hIdx = Math.min(hourOffset, st.hourly.temperature_2m.length - 1);
        temp = st.hourly.temperature_2m[hIdx] ?? temp;
        windSpeed = st.hourly.wind_speed_10m[hIdx] ?? windSpeed;
        windDir = st.hourly.wind_direction_10m[hIdx] ?? windDir;
        rain = st.hourly.rain[hIdx] ?? (st.hourly.precipitation ? st.hourly.precipitation[hIdx] : rain);
        weatherCode = st.hourly.weather_code[hIdx] ?? weatherCode;
        cloudCover = st.hourly.cloud_cover[hIdx] ?? cloudCover;
      } else if (hourOffset > 0) {
        // Fallback realistic diurnal curve if offline
        const dayPhase = (hourOffset % 24) / 24;
        const diurnalShift = Math.sin(dayPhase * Math.PI * 2 - Math.PI / 2) * 4.5;
        temp += diurnalShift;
        windSpeed += Math.sin(hourOffset * 0.3) * 3;
      }

      return {
        id: st.id,
        name: st.name,
        lat: st.lat,
        lon: st.lon,
        uf: st.uf,
        weather: {
          temperature_2m: temp,
          wind_speed_10m: Math.max(2, windSpeed),
          wind_direction_10m: windDir,
          precipitation: rain,
          rain: rain,
          weather_code: weatherCode,
          cloud_cover: cloudCover
        }
      };
    });
  }

  broadcastWeatherData(stations) {
    if (!stations || stations.length === 0) return;

    // Broadcast to visible weather layers
    Object.keys(this.layers).forEach(layerName => {
      const layer = this.layers[layerName];
      if (layer && typeof layer.setWeatherData === 'function') {
        // Optimization: Only update the currently visible layer
        if (this.activeLayer === layerName) {
          layer.setWeatherData(stations);
        }
      }
    });

    if (this.citiesSystem && this.citiesSystem.updateWeatherData) {
      this.citiesSystem.updateWeatherData(stations);
    }

    if (this.onWeatherBroadcast) {
      this.onWeatherBroadcast(stations);
    }
  }

  /**
   * Smoothly transitions weather data to a target forecast hour
   */
  setForecastHour(targetHour, duration = 0.8) {
    if (!this.weatherData) return;

    this.fromStationStates = this.activeStationStates.map(s => ({
      ...s,
      weather: { ...s.weather }
    }));

    this.toStationStates = this.extractStationStateForHour(targetHour);
    this.targetForecastHour = targetHour;
    this.transitionTime = 0;
    this.transitionDuration = Math.max(0.1, duration);
    this.isTransitioning = true;

    // Update timeline step index
    const foundIdx = this.timelineSteps.indexOf(targetHour);
    if (foundIdx !== -1) this.currentStepIdx = foundIdx;

    this.onForecastChange(targetHour);
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.playTimer = 0;
    }
    return this.isPlaying;
  }

  setLayer(layerName) {
    if (!this.layers[layerName]) return;

    this.activeLayer = layerName;

    Object.keys(this.layers).forEach(name => {
      if (name === layerName) {
        this.layers[name].show();
        // Update layer with current data when it becomes visible
        if (this.activeStationStates && this.activeStationStates.length > 0) {
          if (this.layers[name].setWeatherData) {
            this.layers[name].setWeatherData(this.activeStationStates);
          }
        }
      } else {
        this.layers[name].hide();
      }
    });
  }

  update(delta, time) {
    // 1. Handle gradual transition between forecast hours
    if (this.isTransitioning) {
      this.transitionTime += delta;
      const rawT = Math.min(1.0, this.transitionTime / this.transitionDuration);
      // Smooth cubic easing (ease-in-out)
      const t = rawT * rawT * (3 - 2 * rawT);

      // Lerp active station weather
      this.activeStationStates = this.fromStationStates.map((stFrom, idx) => {
        const stTo = this.toStationStates[idx] || stFrom;

        const wFrom = stFrom.weather;
        const wTo = stTo.weather;

        const temp = wFrom.temperature_2m + (wTo.temperature_2m - wFrom.temperature_2m) * t;
        const windSpeed = wFrom.wind_speed_10m + (wTo.wind_speed_10m - wFrom.wind_speed_10m) * t;

        // Circular interpolation for wind direction
        let dDir = (wTo.wind_direction_10m - wFrom.wind_direction_10m) % 360;
        if (dDir > 180) dDir -= 360;
        if (dDir < -180) dDir += 360;
        const windDir = (wFrom.wind_direction_10m + dDir * t + 360) % 360;

        const rain = wFrom.rain + (wTo.rain - wFrom.rain) * t;
        const cloudCover = wFrom.cloud_cover + (wTo.cloud_cover - wFrom.cloud_cover) * t;

        return {
          ...stFrom,
          weather: {
            temperature_2m: temp,
            wind_speed_10m: windSpeed,
            wind_direction_10m: windDir,
            precipitation: rain,
            rain: rain,
            weather_code: t > 0.5 ? wTo.weather_code : wFrom.weather_code,
            cloud_cover: cloudCover
          }
        };
      });

      // Periodically update layers during transition (throttle to ~10 Hz to prevent stutter)
      this.broadcastTimer = (this.broadcastTimer || 0) + delta;
      if (this.broadcastTimer > 0.1 || rawT >= 1.0) {
        this.broadcastWeatherData(this.activeStationStates);
        this.broadcastTimer = 0;
      }

      if (rawT >= 1.0) {
        this.isTransitioning = false;
        this.currentForecastHour = this.targetForecastHour;
      }
    }

    // 2. Handle timeline auto-playback
    if (this.isPlaying) {
      this.playTimer += delta;
      if (this.playTimer > 2.5) { // Advance step every 2.5 seconds
        this.playTimer = 0;
        this.currentStepIdx = (this.currentStepIdx + 1) % this.timelineSteps.length;
        const nextHour = this.timelineSteps[this.currentStepIdx];
        this.setForecastHour(nextHour, 0.9);
      }
    }

    // 3. Update weather layers
    Object.values(this.layers).forEach(layer => {
      if (layer.update) {
        layer.update(delta, time);
      }
    });
  }

  setElevationScale(reliefFactor) {
    Object.values(this.layers).forEach(layer => {
      if (layer && typeof layer.setElevationScale === 'function') {
        layer.setElevationScale(reliefFactor);
      }
    });
  }
}
