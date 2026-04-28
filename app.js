const map = L.map("map").setView([-14.235, -51.9253], 4);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let todosDados = [];
let camadaPontos = L.layerGroup().addTo(map);
let camadaHeatmap = null;

const ufFilter = document.getElementById("ufFilter");
const linhaFilter = document.getElementById("linhaFilter");
const faturamentoFilter = document.getElementById("faturamentoFilter");
const searchInput = document.getElementById("searchInput");
const resetButton = document.getElementById("resetButton");
const totalEmpresas = document.getElementById("totalEmpresas");
const rankingCidades = document.getElementById("rankingCidades");
const heatmapToggle = document.getElementById("heatmapToggle");
const pointsToggle = document.getElementById("pointsToggle");

fetch("data/mapa_base.geojson")
  .then(response => response.json())
  .then(data => {
    todosDados = data.features || [];
    preencherFiltros(todosDados);
    aplicarFiltros();
  })
  .catch(error => {
    console.warn("Arquivo de dados ainda não encontrado:", error);
    totalEmpresas.textContent = "0";
  });

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getCorLinha(linha) {
  const linhaNormalizada = normalizarTexto(linha);

  if (linhaNormalizada.includes("limpeza")) {
    return "#2563eb"; // Azul - Equipamentos de limpeza
  }

  if (linhaNormalizada.includes("perfuratriz") || linhaNormalizada.includes("perfuratrizes")) {
    return "#f97316"; // Laranja - Perfuratrizes
  }

  if (linhaNormalizada.includes("tratamento")) {
    return "#16a34a"; // Verde - Tratamento primário
  }

  return "#6b7280"; // Cinza - fallback
}

function preencherFiltros(features) {
  const ufs = [...new Set(features.map(item => item.properties.uf).filter(Boolean))].sort();
  const linhas = [...new Set(features.map(item => item.properties.linha).filter(Boolean))].sort();

  const faturamentos = [
    ...new Set(features.map(item => item.properties.faturamento).filter(Boolean))
  ].sort((a, b) => {
    return extrairPrimeiroValor(a) - extrairPrimeiroValor(b);
  });

  ufs.forEach(uf => {
    const option = document.createElement("option");
    option.value = uf;
    option.textContent = uf;
    ufFilter.appendChild(option);
  });

  linhas.forEach(linha => {
    const option = document.createElement("option");
    option.value = linha;
    option.textContent = linha;
    linhaFilter.appendChild(option);
  });

  faturamentos.forEach(faturamento => {
    const option = document.createElement("option");
    option.value = faturamento;
    option.textContent = faturamento;
    faturamentoFilter.appendChild(option);
  });
}

function extrairPrimeiroValor(texto) {
  const numero = String(texto || "")
    .replace(/[^\d,]/g, "")
    .split(",")[0];

  return Number(numero) || 0;
}

function aplicarFiltros() {
  const ufSelecionado = ufFilter.value;
  const linhaSelecionada = linhaFilter.value;
  const faturamentoSelecionado = faturamentoFilter.value;
  const busca = normalizarTexto(searchInput.value);

  const filtrados = todosDados.filter(item => {
    const p = item.properties;

    const passaUf = !ufSelecionado || p.uf === ufSelecionado;
    const passaLinha = !linhaSelecionada || p.linha === linhaSelecionada;
    const passaFaturamento = !faturamentoSelecionado || p.faturamento === faturamentoSelecionado;

    const textoBusca = normalizarTexto([
      p.razao,
      p.cnpj,
      p.cidade,
      p.uf,
      p.cidadeUf,
      p.cnae,
      p.mesorregiao,
      p.linha,
      p.faturamento
    ].join(" "));

    const passaBusca = !busca || textoBusca.includes(busca);

    return passaUf && passaLinha && passaFaturamento && passaBusca;
  });

  totalEmpresas.textContent = filtrados.length.toLocaleString("pt-BR");

  atualizarRankingCidades(filtrados);
  desenharHeatmap(filtrados);
  desenharPontos(filtrados);
  ajustarMapa(filtrados);
}

function atualizarRankingCidades(features) {
  if (!rankingCidades) {
    return;
  }

  rankingCidades.innerHTML = "";

  if (!features || features.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nenhuma cidade encontrada";
    rankingCidades.appendChild(li);
    return;
  }

  const cidades = new Map();

  features.forEach(item => {
    const p = item.properties || {};
    const coords = item.geometry.coordinates || [];

    const lng = coords[0];
    const lat = coords[1];

    const nomeCidade =
      p.cidadeUf ||
      [p.cidade, p.uf].filter(Boolean).join(" - ") ||
      "Cidade não informada";

    if (!cidades.has(nomeCidade)) {
      cidades.set(nomeCidade, {
        nome: nomeCidade,
        total: 0,
        latSoma: 0,
        lngSoma: 0,
        pontosValidos: 0
      });
    }

    const cidade = cidades.get(nomeCidade);
    cidade.total += 1;

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      cidade.latSoma += lat;
      cidade.lngSoma += lng;
      cidade.pontosValidos += 1;
    }
  });

  const ranking = [...cidades.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  ranking.forEach(cidade => {
    const li = document.createElement("li");
    li.className = "ranking-item";

    const nome = document.createElement("span");
    nome.className = "ranking-city";
    nome.textContent = cidade.nome;

    const total = document.createElement("span");
    total.className = "ranking-total";
    total.textContent = cidade.total.toLocaleString("pt-BR");

    li.appendChild(nome);
    li.appendChild(total);

    if (cidade.pontosValidos > 0) {
      const latMedia = cidade.latSoma / cidade.pontosValidos;
      const lngMedia = cidade.lngSoma / cidade.pontosValidos;

      li.title = "Clique para aproximar no mapa";
      li.addEventListener("click", () => {
        map.setView([latMedia, lngMedia], 10);
      });
    }

    rankingCidades.appendChild(li);
  });
}

function desenharHeatmap(features) {
  if (camadaHeatmap) {
    map.removeLayer(camadaHeatmap);
    camadaHeatmap = null;
  }

  if (!heatmapToggle.checked || features.length === 0) {
    return;
  }

  const pontosHeat = features.map(item => {
    const coords = item.geometry.coordinates;
    const lng = coords[0];
    const lat = coords[1];

    return [lat, lng, 0.65];
  });

  camadaHeatmap = L.heatLayer(pontosHeat, {
    radius: 28,
    blur: 22,
    maxZoom: 9,
    minOpacity: 0.35
  }).addTo(map);
}

function desenharPontos(features) {
  camadaPontos.clearLayers();

  if (!pointsToggle.checked) {
    return;
  }

  if (features.length > 2000) {
    return;
  }

  features.forEach(item => {
    const p = item.properties;
    const coords = item.geometry.coordinates;

    const lng = coords[0];
    const lat = coords[1];

    const corLinha = getCorLinha(p.linha);

    const marker = L.circleMarker([lat, lng], {
      radius: 7,
      color: corLinha,
      fillColor: corLinha,
      weight: 1.5,
      opacity: 0.95,
      fillOpacity: 0.72
    });

    const rotaUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

    marker.bindPopup(`
      <div class="popup-card">
        <div class="popup-title">${p.razao || "Sem razão social"}</div>

        <div class="popup-badge" style="background:${corLinha};">
          ${p.linha || "Linha não informada"}
        </div>

        <div class="popup-section">
          <div class="popup-line"><b>Cidade/UF:</b> ${p.cidadeUf || "-"}</div>
          <div class="popup-line"><b>Mesorregião:</b> ${p.mesorregiao || "-"}</div>
          <div class="popup-line"><b>Faturamento:</b> ${p.faturamento || "-"}</div>
        </div>

        <div class="popup-section">
          <div class="popup-line"><b>CNPJ:</b> ${p.cnpj || "-"}</div>
          <div class="popup-line"><b>CEP:</b> ${p.cep || "-"}</div>
          <div class="popup-line"><b>CNAE:</b> ${p.cnae || "-"}</div>
        </div>

        <div class="popup-actions">
          <a class="popup-route" href="${rotaUrl}" target="_blank">Abrir rota</a>
          <a class="popup-search" href="https://www.google.com/search?q=${encodeURIComponent((p.razao || "") + " " + (p.cnpj || ""))}" target="_blank">Pesquisar</a>
        </div>
      </div>
    `);

    marker.addTo(camadaPontos);
  });
}

function ajustarMapa(features) {
  if (features.length === 0) {
    return;
  }

  if (features.length > 3000) {
    return;
  }

  const bounds = L.latLngBounds(
    features.map(item => {
      const coords = item.geometry.coordinates;
      return [coords[1], coords[0]];
    })
  );

  map.fitBounds(bounds, {
    padding: [30, 30],
    maxZoom: 9
  });
}

ufFilter.addEventListener("change", aplicarFiltros);
linhaFilter.addEventListener("change", aplicarFiltros);
faturamentoFilter.addEventListener("change", aplicarFiltros);
searchInput.addEventListener("input", aplicarFiltros);
heatmapToggle.addEventListener("change", aplicarFiltros);
pointsToggle.addEventListener("change", aplicarFiltros);

resetButton.addEventListener("click", () => {
  ufFilter.value = "";
  linhaFilter.value = "";
  faturamentoFilter.value = "";
  searchInput.value = "";
  heatmapToggle.checked = true;
  pointsToggle.checked = true;
  map.setView([-14.235, -51.9253], 4);
  aplicarFiltros();
});
