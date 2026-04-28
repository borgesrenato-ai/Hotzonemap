const map = L.map("map").setView([-14.235, -51.9253], 4);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let todosDados = [];
let camadaPontos = L.layerGroup().addTo(map);

const ufFilter = document.getElementById("ufFilter");
const linhaFilter = document.getElementById("linhaFilter");
const searchInput = document.getElementById("searchInput");
const resetButton = document.getElementById("resetButton");
const totalEmpresas = document.getElementById("totalEmpresas");

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
}

function aplicarFiltros() {
  const ufSelecionado = ufFilter.value;
  const linhaSelecionada = linhaFilter.value;
  const busca = searchInput.value.trim().toLowerCase();

  const filtrados = todosDados.filter(item => {
    const p = item.properties;

    const passaUf = !ufSelecionado || p.uf === ufSelecionado;
    const passaLinha = !linhaSelecionada || p.linha === linhaSelecionada;

    const textoBusca = [
      p.razao,
      p.cnpj,
      p.cidade,
      p.uf,
      p.cidadeUf,
      p.cnae,
      p.mesorregiao,
      p.linha
    ]
      .join(" ")
      .toLowerCase();

    const passaBusca = !busca || textoBusca.includes(busca);

    return passaUf && passaLinha && passaBusca;
  });

  totalEmpresas.textContent = filtrados.length.toLocaleString("pt-BR");

  desenharPontos(filtrados);
}

function desenharPontos(features) {
  camadaPontos.clearLayers();

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
      <div>
        <div class="popup-title">${p.razao || "Sem razão social"}</div>
        <div class="popup-line"><b>CNPJ:</b> ${p.cnpj || "-"}</div>
        <div class="popup-line"><b>Cidade/UF:</b> ${p.cidadeUf || "-"}</div>
        <div class="popup-line"><b>CEP:</b> ${p.cep || "-"}</div>
        <div class="popup-line"><b>CNAE:</b> ${p.cnae || "-"}</div>
        <div class="popup-line"><b>Faturamento:</b> ${p.faturamento || "-"}</div>
        <div class="popup-line"><b>Mesorregião:</b> ${p.mesorregiao || "-"}</div>
        <div class="popup-line"><b>Linha:</b> ${p.linha || "-"}</div>
        <a class="popup-route" href="${rotaUrl}" target="_blank">Abrir rota</a>
      </div>
    `);

    marker.addTo(camadaPontos);
  });

  if (features.length > 0 && features.length <= 2000) {
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
}

ufFilter.addEventListener("change", aplicarFiltros);
linhaFilter.addEventListener("change", aplicarFiltros);
searchInput.addEventListener("input", aplicarFiltros);

resetButton.addEventListener("click", () => {
  ufFilter.value = "";
  linhaFilter.value = "";
  searchInput.value = "";
  map.setView([-14.235, -51.9253], 4);
  aplicarFiltros();
});
