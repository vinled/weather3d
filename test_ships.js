process.env.NODE_ENV = 'test';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { fetchLiveAISVessels, getLiveVesselPositions, normalizeMarineTrafficData, BRAZIL_VESSELS_BASE } from './shipsEngine.js';
import { isPointInBrazil } from './public/js/data/brazilData.js';
import { app } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runRigorousTests() {
  let passedCount = 0;
  function assert(name, condition, msg) {
    if (!condition) {
      console.error('❌ FAIL:', name, msg || '');
      process.exit(1);
    }
    passedCount++;
    console.log(`✅ PASS (${passedCount}):`, name);
  }

  // 1. Direct Engine & Kinematic Tests
  console.log('\n--- 1. Testando shipsEngine.js (Kinematics & Corridors) ---');
  const directPositions = getLiveVesselPositions();
  assert('Engine returns 47 vessels', directPositions.length === 47, 'Count: ' + directPositions.length);

  const sample = directPositions[0];
  assert('Sample has valid coordinates', typeof sample.lat === 'number' && typeof sample.lon === 'number');
  assert('Sample has speed and heading', typeof sample.speed === 'number' && typeof sample.heading === 'number');
  assert('Sample heading is within [0, 360]', sample.heading >= 0 && sample.heading <= 360);

  // Kinematic ping-pong continuity test: verify continuous movement without jumps
  console.log('\n--- Testando Continuidade Cinemática (Sem saltos / Sem teletransporte) ---');
  const now = Date.now();
  let maxJumpDegrees = 0;
  for (let h = 0; h <= 24; h += 0.5) {
    const p1 = getLiveVesselPositions(now + h * 3600 * 1000);
    const p2 = getLiveVesselPositions(now + (h + 0.5) * 3600 * 1000);
    for (let i = 0; i < p1.length; i++) {
      const dLat = Math.abs(p2[i].lat - p1[i].lat);
      const dLon = Math.abs(p2[i].lon - p1[i].lon);
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);
      if (dist > maxJumpDegrees) maxJumpDegrees = dist;
    }
  }
  // At 20 knots, 0.5 hours = 10 NM = ~0.17 degrees. Any jump > 0.4 degrees indicates teleportation.
  assert('Kinematic positions are strictly continuous (max 30m delta < 0.35°)', maxJumpDegrees < 0.35, 'Max delta: ' + maxJumpDegrees);

  // Marine water bounds test: verify no vessel crosses onto dry land over 48h simulation
  console.log('\n--- Testando Corredores Marítimos (Zero Navios em Terra Firme) ---');
  let landCrossings = 0;
  for (let h = 0; h <= 48; h += 1) {
    const list = getLiveVesselPositions(now + h * 3600 * 1000);
    for (const v of list) {
      if (v.speed < 0.5 || v.port === 'Manaus') continue;
      const inB = isPointInBrazil(v.lat, v.lon);
      const harbor = (v.port === 'Santos' && v.lat < -23.8 && v.lon > -46.5) ||
                     (v.port === 'Rio de Janeiro' && v.lat < -22.7 && v.lon > -43.3) ||
                     (v.port === 'Paranaguá' && v.lat < -25.4 && v.lon > -48.6) ||
                     (v.port === 'Salvador' && v.lat < -12.8 && v.lon > -38.6) ||
                     (v.port === 'Itaqui' && v.lat < -2.2 && v.lon > -44.5);
      if (inB && !harbor) {
        console.error('Ship crossed on land:', v.name, v.port, `at lat=${v.lat} lon=${v.lon}`);
        landCrossings++;
      }
    }
  }
  assert('Zero land excursions across entire 48h navigation cycle', landCrossings === 0, 'Crossings: ' + landCrossings);

  // MarineTraffic Data Normalizer tests
  console.log('\n--- Testando Normalizador e Caching de MarineTraffic ---');
  const rawRows = [
    {
      MMSI: '710000999',
      NAME: 'TEST VESSEL',
      SPEED: '145',
      HEADING: '180',
      LAT: '-23.5',
      LON: '-45.2',
      TYPE_NAME: 'Container',
      FLAG: 'BR',
      LAST_PORT: 'Santos',
      DESTINATION: 'Rio de Janeiro'
    },
    {
      MMSI: '636000111',
      SHIPNAME: 'LIBERIAN CARRIER',
      SPEED: 12.4,
      HEADING: 90,
      LAT: '-24.0',
      LON: '-46.0',
      TYPE_NAME: 'Bulk Carrier',
      FLAG: 'LR'
    },
    {
      MMSI: '000000000',
      LAT: 'invalid', // should be filtered out
      LON: '-40.0'
    }
  ];
  const normalized = normalizeMarineTrafficData(rawRows);
  assert('Normalizer filters out invalid coordinate rows', normalized.length === 2);
  assert('Normalizer converts tenths of knots (145 -> 14.5)', normalized[0].speed === 14.5);
  assert('Normalizer preserves decimal knots (12.4 -> 12.4)', normalized[1].speed === 12.4);
  assert('Normalizer maps BR flag to Brazilian flag emoji 🇧🇷', normalized[0].flagEmoji === '🇧🇷');
  assert('Normalizer maps LR flag to Liberian flag emoji 🇱🇷', normalized[1].flagEmoji === '🇱🇷');

  // In-memory cache test for fetchLiveAISVessels
  const res1 = await fetchLiveAISVessels();
  const res2 = await fetchLiveAISVessels();
  assert('fetchLiveAISVessels returns cached instance on subsequent call', res1 === res2);

  // 2. Real Fastify Server Integration Tests (Testing server.js directly)
  console.log('\n--- 2. Testando Instância Real do Fastify (server.js) ---');
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const baseUrl = address;
  console.log('Test server active at:', baseUrl);

  // Root endpoint & Health
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert('HTTP 200 from /api/health', healthRes.status === 200);
  const healthData = await healthRes.json();
  assert('/api/health reports status: ok', healthData.status === 'ok');

  // /api/ships endpoint
  const allRes = await fetch(`${baseUrl}/api/ships`);
  assert('HTTP 200 from /api/ships', allRes.status === 200);
  const allData = await allRes.json();
  assert('Response has success: true', allData.success === true);
  assert('Vessels count matches 47', allData.total === 47);

  // /api/marinetraffic redirect/alias
  const mtRes = await fetch(`${baseUrl}/api/marinetraffic`);
  assert('HTTP 200 from /api/marinetraffic', mtRes.status === 200);
  const mtData = await mtRes.json();
  assert('/api/marinetraffic returns ship list', mtData.total === 47);

  // Check required ports coverage
  const requiredPorts = ['Santos', 'Rio de Janeiro', 'Paranaguá', 'Salvador', 'Suape', 'Vitória', 'Itaqui', 'Manaus', 'Atlântico Sul'];
  for (const port of requiredPorts) {
    const pNorm = port.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const hasVessels = allData.vessels.some(v => {
      const p = (v.port || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const o = (v.origin || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const d = (v.destination || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return p.includes(pNorm) || o.includes(pNorm) || d.includes(pNorm);
    });
    assert('Coverage for ' + port, hasVessels);
  }

  // Accent-insensitive port filtering tests (crucial edge case)
  const paranaguaRes = await fetch(`${baseUrl}/api/ships?port=paranagua`);
  const paranaguaData = await paranaguaRes.json();
  assert('Accent-insensitive port filter ?port=paranagua returns vessels', paranaguaData.total >= 4);

  const vitoriaRes = await fetch(`${baseUrl}/api/ships?port=vitoria`);
  const vitoriaData = await vitoriaRes.json();
  assert('Accent-insensitive port filter ?port=vitoria returns vessels', vitoriaData.total >= 4);

  // Type filter test
  const containerRes = await fetch(`${baseUrl}/api/ships?type=container`);
  const containerData = await containerRes.json();
  assert('Type filter ?type=container returns containers', containerData.total >= 8 && containerData.vessels.every(v => v.type.toLowerCase().includes('container')));

  // Status filter test
  const navRes = await fetch(`${baseUrl}/api/ships?status=navegacao`);
  const navData = await navRes.json();
  assert('Status filter ?status=navegacao works', navData.total >= 20);

  // Single ship lookup
  const singleRes = await fetch(`${baseUrl}/api/ships/710000412`);
  assert('Lookup MSC BIANCA status 200', singleRes.status === 200);
  const singleData = await singleRes.json();
  assert('Lookup name matches MSC BIANCA', singleData.vessel.name === 'MSC BIANCA');

  // 404 test
  const notFoundRes = await fetch(`${baseUrl}/api/ships/999999999`);
  assert('Nonexistent MMSI returns 404', notFoundRes.status === 404);

  // 3. UI, HTML & CSS Integration Tests
  console.log('\n--- 3. Testando UI, HTML e CSS ---');
  const indexRes = await fetch(`${baseUrl}/index.html`);
  const html = await indexRes.text();
  assert('index.html contains toggle-ships in map options', html.includes('id="toggle-ships"'));
  assert('index.html contains vessel-card telemetry modal', html.includes('id="vessel-card"'));
  assert('index.html contains ship-hover-tooltip', html.includes('id="ship-hover-tooltip"'));
  assert('index.html contains vessels-count-top badge', html.includes('id="vessels-count-top"'));
  assert('index.html contains btn-focus-vessel', html.includes('id="btn-focus-vessel"'));
  assert('index.html contains btn-marinetraffic-link', html.includes('id="btn-marinetraffic-link"'));

  const cssRes = await fetch(`${baseUrl}/css/style.css`);
  const css = await cssRes.text();
  assert('style.css contains #vessel-card rules', css.includes('#vessel-card'));
  assert('style.css contains #ship-hover-tooltip rules', css.includes('#ship-hover-tooltip'));
  assert('style.css contains .vessel-top-badge', css.includes('.vessel-top-badge'));
  assert('style.css contains .vessel-top-badge-disabled', css.includes('.vessel-top-badge-disabled'));

  const jsRes = await fetch(`${baseUrl}/js/ships.js`);
  assert('ships.js served with HTTP 200', jsRes.status === 200);

  // 4. Testes das Novas Funcionalidades: Rota Náutica, Marcadores e Inicialização
  console.log('\n--- 4. Testando Novas Funcionalidades (Rotas, Ícones, Toggles e .bat) ---');
  
  // Test INICIAR_SERVIDOR.bat
  const batPath = join(__dirname, 'INICIAR_SERVIDOR.bat');
  const batContent = readFileSync(batPath, 'utf8');
  assert('INICIAR_SERVIDOR.bat exists and starts server', batContent.includes('node server.js'));
  assert('INICIAR_SERVIDOR.bat opens browser on localhost:3000', batContent.includes('http://localhost:3000'));

  // Test Default Toggles: ONLY wind is checked!
  assert('toggle-wind-heatmap is checked by default', html.includes('id="toggle-wind-heatmap" checked'));
  assert('toggle-rain-heatmap is UNCHECKED by default', html.includes('id="toggle-rain-heatmap"') && !html.includes('id="toggle-rain-heatmap" checked'));
  assert('toggle-cities is UNCHECKED by default', html.includes('id="toggle-cities"') && !html.includes('id="toggle-cities" checked'));
  assert('toggle-trees is UNCHECKED by default', html.includes('id="toggle-trees"') && !html.includes('id="toggle-trees" checked'));
  assert('toggle-states is UNCHECKED by default', html.includes('id="toggle-states"') && !html.includes('id="toggle-states" checked'));
  assert('toggle-ships is UNCHECKED by default', html.includes('id="toggle-ships"') && !html.includes('id="toggle-ships" checked'));

  // Test UI Route & Directional Tag Elements
  assert('index.html contains btn-toggle-vessel-route', html.includes('id="btn-toggle-vessel-route"'));
  assert('style.css contains .btn-route styling', css.includes('.btn-route'));
  assert('style.css contains .vessel-tag-arrow', css.includes('.vessel-tag-arrow'));
  assert('style.css contains .port-scene-tag', css.includes('.port-scene-tag'));
  assert('style.css contains .vessel-scene-tag::after pointer pin', css.includes('.vessel-scene-tag::after'));

  // Test Ships.js exports & Coastal Chain
  const shipsJsText = await jsRes.text();
  assert('ships.js contains NAUTICAL_PORTS dictionary', shipsJsText.includes('NAUTICAL_PORTS'));
  assert('ships.js contains BRAZIL_COASTAL_CHAIN', shipsJsText.includes('BRAZIL_COASTAL_CHAIN'));
  assert('ships.js contains drawVoyageRoute method', shipsJsText.includes('drawVoyageRoute('));
  assert('ships.js contains clearVoyageRoute method', shipsJsText.includes('clearVoyageRoute('));
  assert('ships.js contains toggleRouteVisible method', shipsJsText.includes('toggleRouteVisible('));

  try {
    if (app.server && typeof app.server.closeAllConnections === 'function') {
      app.server.closeAllConnections();
    }
    await app.close();
  } catch (e) {}

  console.log('\n======================================================');
  console.log(`🎉 TODOS OS ${passedCount} TESTES PASSARAM COM SUCESSO!`);
  console.log('======================================================\n');
  process.exit(0);
}

runRigorousTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
