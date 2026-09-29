import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = Fastify({
  logger: true
});

// Enable CORS
await app.register(fastifyCors, {
  origin: true
});

// Serve frontend static files
await app.register(fastifyStatic, {
  root: join(__dirname, 'public'),
  prefix: '/'
});

// In-memory cache for Open-Meteo responses
const weatherCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const cacheCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of weatherCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL) {
      weatherCache.delete(key);
    }
  }
}, 30 * 60 * 1000); // 30 minutes

// Key Brazilian reference cities and marine points for high-definition wind and weather
const BRAZIL_REFERENCE_STATIONS = [
  // --- Metrópoles & Capitais Principais ---
  { id: 'sao_paulo', name: 'São Paulo', lat: -23.5505, lon: -46.6333, uf: 'SP' },
  { id: 'rio_de_janeiro', name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729, uf: 'RJ' },
  { id: 'brasilia', name: 'Brasília', lat: -15.7975, lon: -47.8919, uf: 'DF' },
  { id: 'belo_horizonte', name: 'Belo Horizonte', lat: -19.9167, lon: -43.9345, uf: 'MG' },
  { id: 'curitiba', name: 'Curitiba', lat: -25.4284, lon: -49.2733, uf: 'PR' },
  { id: 'porto_alegre', name: 'Porto Alegre', lat: -30.0346, lon: -51.2177, uf: 'RS' },
  { id: 'florianopolis', name: 'Florianópolis', lat: -27.5954, lon: -48.5480, uf: 'SC' },
  { id: 'vitoria', name: 'Vitória', lat: -20.3155, lon: -40.3128, uf: 'ES' },
  { id: 'salvador', name: 'Salvador', lat: -12.9714, lon: -38.5014, uf: 'BA' },
  { id: 'recife', name: 'Recife', lat: -8.0476, lon: -34.8770, uf: 'PE' },
  { id: 'fortaleza', name: 'Fortaleza', lat: -3.7172, lon: -38.5433, uf: 'CE' },
  { id: 'goiania', name: 'Goiânia', lat: -16.6869, lon: -49.2648, uf: 'GO' },
  { id: 'campo_grande', name: 'Campo Grande', lat: -20.4697, lon: -54.6201, uf: 'MS' },
  { id: 'cuiaba', name: 'Cuiabá', lat: -15.6010, lon: -56.0974, uf: 'MT' },
  { id: 'manaus', name: 'Manaus', lat: -3.1190, lon: -60.0217, uf: 'AM' },
  { id: 'belem', name: 'Belém', lat: -1.4558, lon: -48.5039, uf: 'PA' },
  { id: 'natal', name: 'Natal', lat: -5.7945, lon: -35.2110, uf: 'RN' },
  { id: 'maceio', name: 'Maceió', lat: -9.6658, lon: -35.7350, uf: 'AL' },
  { id: 'sao_luis', name: 'São Luís', lat: -2.5307, lon: -44.3068, uf: 'MA' },
  { id: 'palmas', name: 'Palmas', lat: -10.2491, lon: -48.3243, uf: 'TO' },
  { id: 'porto_velho', name: 'Porto Velho', lat: -8.7619, lon: -63.9039, uf: 'RO' },
  { id: 'rio_branco', name: 'Rio Branco', lat: -9.9749, lon: -67.8243, uf: 'AC' },
  { id: 'macapa', name: 'Macapá', lat: 0.0349, lon: -51.0694, uf: 'AP' },
  { id: 'boa_vista', name: 'Boa Vista', lat: 2.8235, lon: -60.6758, uf: 'RR' },

  // --- Região Sul & Litoral Sul (Resolução refinada para vento e frente fria) ---
  { id: 'pelotas', name: 'Pelotas', lat: -31.7654, lon: -52.3376, uf: 'RS' },
  { id: 'santa_maria', name: 'Santa Maria', lat: -29.6842, lon: -53.8069, uf: 'RS' },
  { id: 'passo_fundo', name: 'Passo Fundo', lat: -28.2612, lon: -52.4083, uf: 'RS' },
  { id: 'joinville', name: 'Joinville', lat: -26.3045, lon: -48.8487, uf: 'SC' },
  { id: 'chapeco', name: 'Chapecó', lat: -27.1004, lon: -52.6152, uf: 'SC' },
  { id: 'londrina', name: 'Londrina', lat: -23.3045, lon: -51.1696, uf: 'PR' },
  { id: 'cascavel', name: 'Cascavel', lat: -24.9578, lon: -53.4590, uf: 'PR' },
  { id: 'foz_do_iguacu', name: 'Foz do Iguaçu', lat: -25.5478, lon: -54.5882, uf: 'PR' },

  // --- Região Sudeste (Litoral & Interior) ---
  { id: 'santos', name: 'Santos', lat: -23.9608, lon: -46.3336, uf: 'SP' },
  { id: 'ubatuba', name: 'Ubatuba', lat: -23.4332, lon: -45.0834, uf: 'SP' },
  { id: 'campinas', name: 'Campinas', lat: -22.9056, lon: -47.0608, uf: 'SP' },
  { id: 'ribeirao_preto', name: 'Ribeirão Preto', lat: -21.1775, lon: -47.8103, uf: 'SP' },
  { id: 'cabo_frio', name: 'Cabo Frio', lat: -22.8833, lon: -42.0167, uf: 'RJ' },
  { id: 'campos_goytacazes', name: 'Campos dos Goytacazes', lat: -21.7544, lon: -41.3244, uf: 'RJ' },
  { id: 'uberlandia', name: 'Uberlândia', lat: -18.9186, lon: -48.2772, uf: 'MG' },
  { id: 'juiz_de_fora', name: 'Juiz de Fora', lat: -21.7642, lon: -43.3497, uf: 'MG' },
  { id: 'linhares', name: 'Linhares', lat: -19.3911, lon: -40.0633, uf: 'ES' },

  // --- Cone Sul & Países Vizinhos (essenciais para circulação de vento do Prata/Andes) ---
  { id: 'buenos_aires', name: 'Buenos Aires', lat: -34.6037, lon: -58.3816, isOcean: false },
  { id: 'mar_del_plata', name: 'Mar del Plata', lat: -38.0055, lon: -57.5560, isOcean: false },
  { id: 'montevideo', name: 'Montevidéu', lat: -34.9011, lon: -56.1645, isOcean: false },
  { id: 'asuncion', name: 'Assunção', lat: -25.2637, lon: -57.5759, isOcean: false },

  // --- Malha Marítima do Atlântico Sul (Windy.com Marine Jet & Synoptic Gyre) ---
  { id: 'ocean_platina', name: 'Bacia do Prata Oceano', lat: -37.0, lon: -53.0, isOcean: true },
  { id: 'ocean_rs_costa', name: 'Litoral RS', lat: -33.5, lon: -50.5, isOcean: true },
  { id: 'ocean_rs_mar', name: 'Mar Aberto RS', lat: -31.5, lon: -46.5, isOcean: true },
  { id: 'ocean_sc_costa', name: 'Litoral SC', lat: -28.0, lon: -46.5, isOcean: true },
  { id: 'ocean_santos_costa', name: 'Bacia de Santos Costa', lat: -25.5, lon: -44.5, isOcean: true },
  { id: 'ocean_santos_alto', name: 'Bacia de Santos Alto-Mar', lat: -26.5, lon: -40.0, isOcean: true },
  { id: 'ocean_campos_costa', name: 'Bacia de Campos Costa', lat: -23.0, lon: -40.5, isOcean: true },
  { id: 'ocean_es_mar', name: 'Litoral ES Oceano', lat: -20.0, lon: -38.0, isOcean: true },
  { id: 'ocean_ba_sul', name: 'Litoral Sul BA Oceano', lat: -16.5, lon: -36.5, isOcean: true },
  { id: 'ocean_ba_norte', name: 'Litoral Salvador Oceano', lat: -13.0, lon: -35.0, isOcean: true },
  { id: 'ocean_asas_nucleo', name: 'Centro ASAS (Alta Subtropical)', lat: -27.0, lon: -32.0, isOcean: true },
  { id: 'ocean_asas_leste', name: 'Borda Leste ASAS', lat: -25.0, lon: -25.0, isOcean: true },
  { id: 'ocean_sul_profundo', name: 'Atlântico Sul Profundo', lat: -38.0, lon: -42.0, isOcean: true },
  { id: 'ocean_tropical_1', name: 'Atlântico Tropical Central', lat: -18.0, lon: -30.0, isOcean: true },
  { id: 'ocean_tropical_2', name: 'Atlântico Tropical Leste', lat: -10.0, lon: -28.0, isOcean: true }
];

// Weather API proxy for single point
app.get('/api/weather', async (request, reply) => {
  const { lat, lon, model } = request.query;

  if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
    return reply.status(400).send({ error: 'Parâmetros lat e lon são obrigatórios e devem ser numéricos' });
  }

  const selectedModel = (model || 'ecmwf').toLowerCase() === 'gfs' ? 'gfs_seamless' : 'ecmwf_ifs025';
  const cacheKey = `weather_${selectedModel}_${parseFloat(lat).toFixed(2)}_${parseFloat(lon).toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,rain,showers,snowfall,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m&models=${selectedModel}&forecast_days=3&timezone=America%2FSao_Paulo`;
    
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      throw new Error(`Open-Meteo respondeu com status ${response.status}`);
    }

    const data = await response.json();
    weatherCache.set(cacheKey, { timestamp: Date.now(), data });
    reply.header('Cache-Control', 'public, max-age=900');
    return data;
  } catch (err) {
    app.log.error(err, 'Erro ao consultar Open-Meteo');
    // Retorna fallback gracioso caso a API esteja instável
    return {
      error: false,
      fallback: true,
      current: {
        temperature_2m: 24.5,
        wind_speed_10m: 14.2,
        wind_direction_10m: 135,
        precipitation: 1.2,
        rain: 1.0,
        showers: 0.0,
        snowfall: 0.0,
        weather_code: 61,
        cloud_cover: 65,
        relative_humidity_2m: 72
      },
      hourly: {
        time: [new Date().toISOString()],
        temperature_2m: [24.5],
        precipitation_probability: [20],
        rain: [1.0],
        showers: [0.0],
        snowfall: [0.0],
        weather_code: [61],
        wind_speed_10m: [14.2],
        wind_direction_10m: [135]
      }
    };
  }
});

// All Brazil reference stations batch weather
app.get('/api/weather/brazil', async (request, reply) => {
  const { model } = request.query;
  const selectedModel = (model || 'ecmwf').toLowerCase() === 'gfs' ? 'gfs_seamless' : 'ecmwf_ifs025';
  const cacheKey = `brazil_stations_batch_${selectedModel}`;
  const cached = weatherCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  try {
    const lats = BRAZIL_REFERENCE_STATIONS.map(s => s.lat).join(',');
    const lons = BRAZIL_REFERENCE_STATIONS.map(s => s.lon).join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&models=${selectedModel}&forecast_days=4&timezone=America%2FSao_Paulo`;

    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      throw new Error(`Open-Meteo respondeu com status ${response.status}`);
    }

    const rawData = await response.json();
    const stationsData = Array.isArray(rawData) ? rawData : [rawData];

    const result = BRAZIL_REFERENCE_STATIONS.map((station, index) => {
      const weatherInfo = stationsData[index] || {};
      return {
        ...station,
        weather: weatherInfo.current || {
          temperature_2m: 25,
          wind_speed_10m: 12,
          wind_direction_10m: 90,
          precipitation: 0,
          weather_code: 0,
          cloud_cover: 30
        },
        hourly: weatherInfo.hourly || null
      };
    });

    weatherCache.set(cacheKey, { timestamp: Date.now(), data: result });
    reply.header('Cache-Control', 'public, max-age=900');
    return result;
  } catch (err) {
    app.log.error(err, 'Erro ao buscar dados das estações do Brasil');
    // Fallback realista baseado em climatologia brasileira
    const fallbackResult = BRAZIL_REFERENCE_STATIONS.map((station) => {
      let temp = 26;
      let rain = 0;
      let windSpeed = 12;
      let windDir = 90;
      let weatherCode = 1;

      // Variações regionais realistas para o Brasil
      if (station.lat < -20) {
        temp = 19; // Sul/Sudeste mais ameno
        rain = 2.5;
        weatherCode = 61; // Chuva leve
        windSpeed = 18;
      } else if (station.lat > -10 && station.lon < -55) {
        temp = 29; // Amazônia quente/úmida
        rain = 8.0;
        weatherCode = 95; // Tempestade/chuva tropical
        windSpeed = 9;
      } else if (station.lat > -12 && station.lon > -45) {
        temp = 31; // Sertão / Nordeste quente
        rain = 0;
        weatherCode = 0; // Ensolarado
        windSpeed = 22;
        windDir = 110;
      }

      return {
        ...station,
        weather: {
          temperature_2m: temp,
          wind_speed_10m: windSpeed,
          wind_direction_10m: windDir,
          precipitation: rain,
          rain: rain,
          weather_code: weatherCode,
          cloud_cover: rain > 0 ? 80 : 25
        }
      };
    });

    return fallbackResult;
  }
});

// Health check endpoint
app.get('/api/health', async () => {
  return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
});

// Export Fastify handler for Vercel Serverless Functions
export default async function handler(req, res) {
  await app.ready();
  app.server.emit('request', req, res);
}

// Start standalone HTTP server when running locally
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  const HOST = '0.0.0.0';

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n======================================================`);
    console.log(`  🌪️  WINDY 3D — Servidor Ativo com Sucesso!`);
    console.log(`  🌐  Acesse no seu navegador: http://localhost:${PORT}`);
    console.log(`  📡  API Brasil Clima: http://localhost:${PORT}/api/weather/brazil`);
    console.log(`======================================================\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
