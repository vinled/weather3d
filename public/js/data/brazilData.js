// Brazilian geographic and meteorological metadata with multi-level zoom tiers (LOD)
export const BRAZIL_CITIES = [
  // --- SUDESTE ---
  // Tier 1: Metrópoles
  { name: 'São Paulo', uf: 'SP', lat: -23.5505, lon: -46.6333, pop: 12300000, buildings: 18, elevation: 760, region: 'Sudeste', tier: 1 },
  { name: 'Rio de Janeiro', uf: 'RJ', lat: -22.9068, lon: -43.1729, pop: 6700000, buildings: 16, elevation: 10, region: 'Sudeste', tier: 1 },
  { name: 'Belo Horizonte', uf: 'MG', lat: -19.9167, lon: -43.9345, pop: 2500000, buildings: 12, elevation: 852, region: 'Sudeste', tier: 1 },

  // Tier 2: Capitais e Grandes Polos
  { name: 'Vitória', uf: 'ES', lat: -20.3155, lon: -40.3128, pop: 370000, buildings: 8, elevation: 12, region: 'Sudeste', tier: 2 },
  { name: 'Campinas', uf: 'SP', lat: -22.9071, lon: -47.0632, pop: 1200000, buildings: 9, elevation: 685, region: 'Sudeste', tier: 2 },
  { name: 'Santos', uf: 'SP', lat: -23.9608, lon: -46.3331, pop: 430000, buildings: 7, elevation: 2, region: 'Sudeste', tier: 2 },
  { name: 'São José dos Campos', uf: 'SP', lat: -23.1896, lon: -45.8841, pop: 730000, buildings: 8, elevation: 600, region: 'Sudeste', tier: 2 },
  { name: 'Ribeirão Preto', uf: 'SP', lat: -21.1704, lon: -47.8103, pop: 710000, buildings: 8, elevation: 546, region: 'Sudeste', tier: 2 },
  { name: 'Sorocaba', uf: 'SP', lat: -23.5015, lon: -47.4587, pop: 690000, buildings: 7, elevation: 601, region: 'Sudeste', tier: 2 },
  { name: 'Uberlândia', uf: 'MG', lat: -18.9186, lon: -48.2772, pop: 700000, buildings: 7, elevation: 863, region: 'Sudeste', tier: 2 },
  { name: 'Juiz de Fora', uf: 'MG', lat: -21.7642, lon: -43.3496, pop: 570000, buildings: 7, elevation: 678, region: 'Sudeste', tier: 2 },
  { name: 'Niterói', uf: 'RJ', lat: -22.8832, lon: -43.1034, pop: 515000, buildings: 7, elevation: 5, region: 'Sudeste', tier: 2 },

  // Tier 3: Cidades Intermediárias / Turísticas
  { name: 'São José do Rio Preto', uf: 'SP', lat: -20.8113, lon: -49.3758, pop: 460000, buildings: 6, elevation: 489, region: 'Sudeste', tier: 3 },
  { name: 'Bauru', uf: 'SP', lat: -22.3147, lon: -49.0606, pop: 380000, buildings: 6, elevation: 526, region: 'Sudeste', tier: 3 },
  { name: 'Piracicaba', uf: 'SP', lat: -22.7338, lon: -47.6476, pop: 400000, buildings: 6, elevation: 547, region: 'Sudeste', tier: 3 },
  { name: 'Ubatuba', uf: 'SP', lat: -23.4339, lon: -45.0838, pop: 92000, buildings: 4, elevation: 3, region: 'Sudeste', tier: 3 },
  { name: 'Petrópolis', uf: 'RJ', lat: -22.5050, lon: -43.1789, pop: 300000, buildings: 6, elevation: 845, region: 'Sudeste', tier: 3 },
  { name: 'Volta Redonda', uf: 'RJ', lat: -22.5232, lon: -44.1042, pop: 275000, buildings: 6, elevation: 390, region: 'Sudeste', tier: 3 },
  { name: 'Cabo Frio', uf: 'RJ', lat: -22.8808, lon: -42.0186, pop: 230000, buildings: 5, elevation: 4, region: 'Sudeste', tier: 3 },
  { name: 'Campos dos Goytacazes', uf: 'RJ', lat: -21.7545, lon: -41.3244, pop: 510000, buildings: 6, elevation: 14, region: 'Sudeste', tier: 3 },
  { name: 'Montes Claros', uf: 'MG', lat: -16.7350, lon: -43.8617, pop: 410000, buildings: 6, elevation: 678, region: 'Sudeste', tier: 3 },
  { name: 'Poços de Caldas', uf: 'MG', lat: -21.7850, lon: -46.5628, pop: 170000, buildings: 5, elevation: 1186, region: 'Sudeste', tier: 3 },

  // --- SUL ---
  // Tier 1
  { name: 'Curitiba', uf: 'PR', lat: -25.4284, lon: -49.2733, pop: 1960000, buildings: 11, elevation: 934, region: 'Sul', tier: 1 },
  { name: 'Porto Alegre', uf: 'RS', lat: -30.0346, lon: -51.2177, pop: 1490000, buildings: 10, elevation: 10, region: 'Sul', tier: 1 },

  // Tier 2
  { name: 'Florianópolis', uf: 'SC', lat: -27.5954, lon: -48.5480, pop: 510000, buildings: 8, elevation: 3, region: 'Sul', tier: 2 },
  { name: 'Joinville', uf: 'SC', lat: -26.3045, lon: -48.8487, pop: 600000, buildings: 8, elevation: 4, region: 'Sul', tier: 2 },
  { name: 'Londrina', uf: 'PR', lat: -23.3045, lon: -51.1696, pop: 580000, buildings: 7, elevation: 610, region: 'Sul', tier: 2 },
  { name: 'Maringá', uf: 'PR', lat: -23.4210, lon: -51.9331, pop: 430000, buildings: 7, elevation: 515, region: 'Sul', tier: 2 },
  { name: 'Foz do Iguaçu', uf: 'PR', lat: -25.5478, lon: -54.5882, pop: 260000, buildings: 6, elevation: 164, region: 'Sul', tier: 2 },
  { name: 'Caxias do Sul', uf: 'RS', lat: -29.1678, lon: -51.1794, pop: 520000, buildings: 7, elevation: 817, region: 'Sul', tier: 2 },
  { name: 'Pelotas', uf: 'RS', lat: -31.7654, lon: -52.3376, pop: 340000, buildings: 6, elevation: 7, region: 'Sul', tier: 2 },

  // Tier 3
  { name: 'Blumenau', uf: 'SC', lat: -26.9194, lon: -49.0661, pop: 360000, buildings: 6, elevation: 21, region: 'Sul', tier: 3 },
  { name: 'Balneário Camboriú', uf: 'SC', lat: -26.9926, lon: -48.6353, pop: 145000, buildings: 8, elevation: 2, region: 'Sul', tier: 3 },
  { name: 'Chapecó', uf: 'SC', lat: -27.1004, lon: -52.6152, pop: 225000, buildings: 6, elevation: 674, region: 'Sul', tier: 3 },
  { name: 'Cascavel', uf: 'PR', lat: -24.9578, lon: -53.4595, pop: 330000, buildings: 6, elevation: 781, region: 'Sul', tier: 3 },
  { name: 'Ponta Grossa', uf: 'PR', lat: -25.0994, lon: -50.1583, pop: 355000, buildings: 6, elevation: 975, region: 'Sul', tier: 3 },
  { name: 'Santa Maria', uf: 'RS', lat: -29.6842, lon: -53.8069, pop: 285000, buildings: 6, elevation: 151, region: 'Sul', tier: 3 },
  { name: 'Passo Fundo', uf: 'RS', lat: -28.2612, lon: -52.4083, pop: 205000, buildings: 5, elevation: 687, region: 'Sul', tier: 3 },
  { name: 'Gramado', uf: 'RS', lat: -29.3788, lon: -50.8739, pop: 36000, buildings: 4, elevation: 830, region: 'Sul', tier: 3 },

  // --- CENTRO-OESTE ---
  // Tier 1
  { name: 'Brasília', uf: 'DF', lat: -15.7975, lon: -47.8919, pop: 3100000, buildings: 14, elevation: 1172, region: 'Centro-Oeste', tier: 1 },
  { name: 'Goiânia', uf: 'GO', lat: -16.6869, lon: -49.2648, pop: 1550000, buildings: 10, elevation: 749, region: 'Centro-Oeste', tier: 1 },

  // Tier 2
  { name: 'Cuiabá', uf: 'MT', lat: -15.6010, lon: -56.0974, pop: 620000, buildings: 8, elevation: 165, region: 'Centro-Oeste', tier: 2 },
  { name: 'Campo Grande', uf: 'MS', lat: -20.4697, lon: -54.6201, pop: 910000, buildings: 8, elevation: 532, region: 'Centro-Oeste', tier: 2 },
  { name: 'Anápolis', uf: 'GO', lat: -16.3268, lon: -48.9534, pop: 395000, buildings: 6, elevation: 1017, region: 'Centro-Oeste', tier: 2 },

  // Tier 3
  { name: 'Rondonópolis', uf: 'MT', lat: -16.4674, lon: -54.6372, pop: 240000, buildings: 5, elevation: 227, region: 'Centro-Oeste', tier: 3 },
  { name: 'Sinop', uf: 'MT', lat: -11.8642, lon: -55.5050, pop: 195000, buildings: 5, elevation: 384, region: 'Centro-Oeste', tier: 3 },
  { name: 'Dourados', uf: 'MS', lat: -22.2211, lon: -54.8056, pop: 225000, buildings: 5, elevation: 430, region: 'Centro-Oeste', tier: 3 },
  { name: 'Rio Verde', uf: 'GO', lat: -17.7925, lon: -50.9192, pop: 240000, buildings: 5, elevation: 748, region: 'Centro-Oeste', tier: 3 },

  // --- NORDESTE ---
  // Tier 1
  { name: 'Salvador', uf: 'BA', lat: -12.9714, lon: -38.5014, pop: 2900000, buildings: 12, elevation: 8, region: 'Nordeste', tier: 1 },
  { name: 'Fortaleza', uf: 'CE', lat: -3.7172, lon: -38.5433, pop: 2700000, buildings: 11, elevation: 21, region: 'Nordeste', tier: 1 },
  { name: 'Recife', uf: 'PE', lat: -8.0476, lon: -34.8770, pop: 1660000, buildings: 11, elevation: 4, region: 'Nordeste', tier: 1 },

  // Tier 2
  { name: 'São Luís', uf: 'MA', lat: -2.5307, lon: -44.3068, pop: 1110000, buildings: 8, elevation: 24, region: 'Nordeste', tier: 2 },
  { name: 'Maceió', uf: 'AL', lat: -9.6658, lon: -35.7350, pop: 1020000, buildings: 8, elevation: 7, region: 'Nordeste', tier: 2 },
  { name: 'Natal', uf: 'RN', lat: -5.7945, lon: -35.2110, pop: 890000, buildings: 8, elevation: 30, region: 'Nordeste', tier: 2 },
  { name: 'Teresina', uf: 'PI', lat: -5.0920, lon: -42.8038, pop: 870000, buildings: 7, elevation: 72, region: 'Nordeste', tier: 2 },
  { name: 'João Pessoa', uf: 'PB', lat: -7.1153, lon: -34.8610, pop: 820000, buildings: 8, elevation: 40, region: 'Nordeste', tier: 2 },
  { name: 'Aracaju', uf: 'SE', lat: -10.9472, lon: -37.0731, pop: 670000, buildings: 7, elevation: 4, region: 'Nordeste', tier: 2 },
  { name: 'Feira de Santana', uf: 'BA', lat: -12.2664, lon: -38.9663, pop: 620000, buildings: 6, elevation: 234, region: 'Nordeste', tier: 2 },

  // Tier 3
  { name: 'Vitória da Conquista', uf: 'BA', lat: -14.8661, lon: -40.8394, pop: 370000, buildings: 5, elevation: 923, region: 'Nordeste', tier: 3 },
  { name: 'Ilhéus', uf: 'BA', lat: -14.7889, lon: -39.0494, pop: 160000, buildings: 5, elevation: 52, region: 'Nordeste', tier: 3 },
  { name: 'Porto Seguro', uf: 'BA', lat: -16.4497, lon: -39.0647, pop: 150000, buildings: 4, elevation: 4, region: 'Nordeste', tier: 3 },
  { name: 'Caruaru', uf: 'PE', lat: -8.2831, lon: -35.9761, pop: 380000, buildings: 5, elevation: 545, region: 'Nordeste', tier: 3 },
  { name: 'Petrolina', uf: 'PE', lat: -9.3891, lon: -40.5028, pop: 350000, buildings: 5, elevation: 376, region: 'Nordeste', tier: 3 },
  { name: 'Campina Grande', uf: 'PB', lat: -7.2247, lon: -35.8811, pop: 410000, buildings: 6, elevation: 552, region: 'Nordeste', tier: 3 },
  { name: 'Mossoró', uf: 'RN', lat: -5.1878, lon: -37.3442, pop: 300000, buildings: 5, elevation: 16, region: 'Nordeste', tier: 3 },
  { name: 'Sobral', uf: 'CE', lat: -3.6894, lon: -40.3481, pop: 210000, buildings: 5, elevation: 70, region: 'Nordeste', tier: 3 },
  { name: 'Imperatriz', uf: 'MA', lat: -5.5264, lon: -47.4917, pop: 260000, buildings: 5, elevation: 120, region: 'Nordeste', tier: 3 },

  // --- NORTE ---
  // Tier 1
  { name: 'Manaus', uf: 'AM', lat: -3.1190, lon: -60.0217, pop: 2260000, buildings: 11, elevation: 92, region: 'Norte', tier: 1 },
  { name: 'Belém', uf: 'PA', lat: -1.4558, lon: -48.5039, pop: 1500000, buildings: 10, elevation: 10, region: 'Norte', tier: 1 },

  // Tier 2
  { name: 'Porto Velho', uf: 'RO', lat: -8.7619, lon: -63.9039, pop: 540000, buildings: 7, elevation: 85, region: 'Norte', tier: 2 },
  { name: 'Palmas', uf: 'TO', lat: -10.2491, lon: -48.3243, pop: 310000, buildings: 6, elevation: 230, region: 'Norte', tier: 2 },
  { name: 'Macapá', uf: 'AP', lat: 0.0349, lon: -51.0694, pop: 520000, buildings: 6, elevation: 14, region: 'Norte', tier: 2 },
  { name: 'Rio Branco', uf: 'AC', lat: -9.9749, lon: -67.8243, pop: 410000, buildings: 6, elevation: 153, region: 'Norte', tier: 2 },
  { name: 'Boa Vista', uf: 'RR', lat: 2.8235, lon: -60.6758, pop: 420000, buildings: 6, elevation: 85, region: 'Norte', tier: 2 },

  // Tier 3
  { name: 'Santarém', uf: 'PA', lat: -2.4431, lon: -54.7083, pop: 310000, buildings: 5, elevation: 51, region: 'Norte', tier: 3 },
  { name: 'Marabá', uf: 'PA', lat: -5.3686, lon: -49.1178, pop: 280000, buildings: 5, elevation: 84, region: 'Norte', tier: 3 },
  { name: 'Ji-Paraná', uf: 'RO', lat: -10.8842, lon: -61.9514, pop: 130000, buildings: 4, elevation: 159, region: 'Norte', tier: 3 }
];

// Stylized Mountain Ranges / Highland centers in Brazil for 3D Relief
// Peaks tuned for Apple aesthetic: gentle but visible (0.15–0.45 range)
export const HIGHLAND_FEATURES = [
  // Serra do Mar & Mantiqueira (RJ, SP, MG, PR, SC) — highest peaks in SE Brazil
  { lat: -22.4, lon: -44.5, radius: 7.0, peak: 0.40, name: 'Serra da Mantiqueira' },
  { lat: -23.5, lon: -45.5, radius: 6.5, peak: 0.32, name: 'Serra do Mar' },
  { lat: -20.5, lon: -43.5, radius: 6.0, peak: 0.35, name: 'Serra do Espinhaço' },
  { lat: -28.0, lon: -49.5, radius: 6.0, peak: 0.30, name: 'Serra Geral' },
  // Planalto Central (DF, GO)
  { lat: -15.8, lon: -47.9, radius: 7.5, peak: 0.22, name: 'Planalto Central' },
  { lat: -14.0, lon: -47.5, radius: 5.0, peak: 0.25, name: 'Chapada dos Veadeiros' },
  // Chapada Diamantina (BA)
  { lat: -12.5, lon: -41.5, radius: 5.0, peak: 0.28, name: 'Chapada Diamantina' },
  // Chapada dos Guimarães (MT)
  { lat: -15.4, lon: -55.7, radius: 4.5, peak: 0.18, name: 'Chapada dos Guimarães' },
  // Serra da Canastra (MG)
  { lat: -20.2, lon: -46.6, radius: 4.5, peak: 0.25, name: 'Serra da Canastra' },
  // Planalto das Guianas (Norte extremo)
  { lat: 1.5, lon: -62.0, radius: 6.5, peak: 0.30, name: 'Planalto das Guianas' },
  // Andes foothills (West border)
  { lat: -9.0, lon: -72.0, radius: 5.0, peak: 0.22, name: 'Serra do Divisor' }
];

// Major Forest & Vegetation Density Zones
export const VEGETATION_ZONES = [
  // Amazônia Ocidental & Central (densa floresta tropical)
  { centerLat: -3.5, centerLon: -62.0, radiusLat: 6.0, radiusLon: 10.0, density: 0.95, type: 'rainforest' },
  { centerLat: -1.0, centerLon: -54.0, radiusLat: 4.5, radiusLon: 7.0, density: 0.85, type: 'rainforest' },
  { centerLat: -8.0, centerLon: -65.0, radiusLat: 4.0, radiusLon: 6.0, density: 0.88, type: 'rainforest' },
  // Mata Atlântica (costa Sudeste e Sul)
  { centerLat: -24.0, centerLon: -48.0, radiusLat: 3.5, radiusLon: 3.5, density: 0.75, type: 'atlantic' },
  { centerLat: -21.0, centerLon: -42.5, radiusLat: 3.0, radiusLon: 3.0, density: 0.70, type: 'atlantic' },
  { centerLat: -14.0, centerLon: -39.5, radiusLat: 2.5, radiusLon: 2.0, density: 0.65, type: 'atlantic' },
  { centerLat: -27.5, centerLon: -50.5, radiusLat: 3.0, radiusLon: 3.0, density: 0.68, type: 'araucaria' },
  // Pantanal (vegetação pantaneira e capões)
  { centerLat: -17.5, centerLon: -56.5, radiusLat: 3.0, radiusLon: 3.0, density: 0.60, type: 'pantanal' },
  // Cerrado (árvores retorcidas e esparsas)
  { centerLat: -14.5, centerLon: -49.0, radiusLat: 4.5, radiusLon: 5.0, density: 0.35, type: 'cerrado' }
];

// Polygon boundary for Brazil landmask
// Points defined clockwise [lat, lon]
export const BRAZIL_BOUNDARY = [
  // Norte (fronteira norte)
  [4.5, -51.5], [3.8, -51.8], [2.0, -50.4], [0.8, -50.0],
  // Costa Nordeste
  [-0.5, -47.0], [-1.5, -45.0], [-2.5, -44.0], [-2.9, -41.0], [-3.8, -38.5],
  // Ponta do Seixas / leste extremo
  [-5.2, -35.5], [-7.0, -34.8], [-9.5, -35.6], [-11.0, -37.0],
  // Costa Leste / Sudeste
  [-13.0, -38.5], [-16.0, -38.9], [-18.5, -39.7], [-21.0, -40.8], [-23.0, -42.0],
  [-23.8, -45.5], [-24.5, -47.5], [-26.0, -48.6], [-28.0, -48.7],
  // Costa Sul
  [-30.0, -50.0], [-32.0, -52.0], [-33.7, -53.3],
  // Fronteira Sul (Uruguai, Argentina)
  [-31.0, -55.5], [-29.5, -57.0], [-27.5, -54.0], [-25.5, -54.6],
  // Fronteira Centro-Oeste (Paraguai, Bolívia)
  [-24.0, -54.5], [-22.0, -57.5], [-19.0, -57.7], [-16.5, -58.5], [-14.0, -60.5],
  // Fronteira Noroeste (Bolívia, Peru, Colômbia)
  [-12.0, -64.0], [-10.0, -65.5], [-9.8, -69.5], [-7.5, -73.5], [-4.0, -70.0],
  [-2.0, -69.5], [1.0, -67.0], [2.0, -64.0], [4.0, -60.5], [5.2, -60.2],
  [4.2, -54.0], [4.5, -51.5]
];

/**
 * Checks if a geographic coordinate is within Brazilian territory polygon
 */
export function isPointInBrazil(lat, lon) {
  if (lat < -34.0 || lat > 5.3 || lon < -74.0 || lon > -34.8) return false;
  let inside = false;
  const poly = BRAZIL_BOUNDARY;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][1], yi = poly[i][0];
    const xj = poly[j][1], yj = poly[j][0];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
