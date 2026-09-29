# 🌪️ Weather 3D - Windy Brasil

Visualizador meteorológico tridimensional interativo do Brasil e Atlântico Sul, inspirado no visual e rigor meteorológico do **Windy.com** e na estética minimalista do **Apple Maps**.

Desenvolvido com **Three.js** e backend em **Node.js (Fastify)**, consumindo dados meteorológicos de alta precisão em tempo real dos modelos globais **ECMWF IFS (9 km)** e **GFS (22 km)**.

---

## ✨ Funcionalidades Principais

* **💨 Heatmap e Streamlines de Vento em 3D:**
  * Malha de interpolação barométrica com física de atrito costa-continente.
  * Milhares de partículas e linhas de fluxo animadas em 60 FPS com gradiente de velocidade Windy (azul, ciano, verde, amarelo, laranja, vermelho e magenta).
  * Detecção de núcleos de Alta (A) e Baixa (B) pressão com badges dinâmicos.

* **🌧️ Radar Doppler e Precipitação Volumétrica:**
  * Simulação de chuva com gotas tridimensionais, velocidade e densidade moduladas em tempo real pelos milímetros de precipitação (`mm/h`).
  * Shader de radar meteorológico com ondulações no solo (*ground ripples*).

* **⚡ Raios e Descargas Elétricas Convectivas:**
  * Disparos estocásticos de relâmpagos dendríticos ramificados com clarão de luz ambiente temporário sobre regiões de tempestade (código WMO 95+).

* **🌀 Frentes Sinóticas Tridimensionais:**
  * Frentes Frias (triângulos azuis), Frentes Quentes (semicírculos vermelhos) e Frentes Oclusas calculadas sobre o Atlântico Sul e América do Sul.

* **🌊 Rios Voadores da Amazônia:**
  * Visualização volumétrica do transporte de umidade da Bacia Amazônica desviado pela Cordilheira dos Andes rumo ao Centro-Oeste e Sudeste.

* **📉 Isóbaras em 3D (Pressão ao Nível do Mar):**
  * Curvas de contorno de pressão atmosférica em tempo real de 1004 hPa a 1024 hPa.

* **🏞️ Grandes Rios Brasileiros em 3D:**
  * Modelagem dos principais cursos d'água: Rio Amazonas, Rio Paraná, Rio São Francisco, Tocantins-Araguaia e Rio da Prata.

* **🇧🇷 Relevo e Divisas Territoriais (IBGE / OSM):**
  * Mapa de elevação do relevo brasileiro (Planalto Central, Mantiqueira, Serra do Mar, Chapadas e Bacia Amazônica).
  * Limites dos 27 estados e perímetro litorâneo em traço duplo de alto contraste visível sobre qualquer camada de calor.

* **🏙️ Cidades e Vegetação por Bioma:**
  * Capitais e centros urbanos com prédios 3D procedurais e cartões flutuantes de temperatura e vento.
  * Instanced mesh com milhares de árvores divididas por biomas (Floresta Amazônica, Mata Atlântica, Cerrado, Araucárias e Pantanal).

* **🌗 Ciclo Atmosférico e Linha do Tempo:**
  * Controle de previsão horária (Agora, +6h, +12h, +24h, +48h, +72h).
  * Transição suave de iluminação solar e crepuscular com base na hora do dia.

---

## 🚀 Como Executar

### Pré-requisitos
* [Node.js](https://nodejs.org/) (versão 18+)
* [Git](https://git-scm.com/)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/vinled/weather3d.git

# Acesse o diretório
cd weather3d

# Instale as dependências
npm install

# Inicie o servidor
npm start
```

Abra no navegador em [http://localhost:3000](http://localhost:3000).

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** [Three.js](https://threejs.org/) (WebGL), JavaScript Moderno (ES Modules), CSS3 Glassmorphism
* **Backend:** [Node.js](https://nodejs.org/) com [Fastify](https://fastify.dev/)
* **APIs Meteorológicas:** [Open-Meteo API](https://open-meteo.com/) (ECMWF IFS 0.25° e GFS Seamless)
* **Fontes Geográficas:** IBGE e OpenStreetMap

---

## 📄 Licença

Este projeto está sob a licença MIT.
