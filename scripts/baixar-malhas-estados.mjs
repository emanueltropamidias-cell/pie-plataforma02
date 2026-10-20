import fs from "fs";
import path from "path";

const UFS = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
  MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35,
  PR: 41, SC: 42, RS: 43,
  MS: 50, MT: 51, GO: 52, DF: 53
};

const OUT_DIR = path.resolve("public/malhas");
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function baixarTodos() {
  console.log("Iniciando download das malhas dos 27 estados...");
  for (const [uf, cod] of Object.entries(UFS)) {
    const outFile = path.join(OUT_DIR, `${uf.toLowerCase()}-municipios.json`);
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
      console.log(`[${uf}] Já existe (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB), pulando.`);
      continue;
    }

    const url = `https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${cod}-mun.json`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`[${uf}] Falha HTTP ${resp.status} em ${url}`);
        continue;
      }
      const data = await resp.json();
      
      // Normalizar properties para garantir name e nome
      if (data.features) {
        for (const feat of data.features) {
          if (!feat.properties) feat.properties = {};
          const nome = feat.properties.name || feat.properties.nome || feat.properties.description || "";
          feat.properties.name = nome;
          feat.properties.nome = nome;
        }
      }

      fs.writeFileSync(outFile, JSON.stringify(data));
      const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
      console.log(`[${uf}] Baixado com sucesso! ${data.features?.length || 0} municípios (${kb} KB)`);
    } catch (e) {
      console.error(`[${uf}] Erro:`, e.message);
    }
  }
  console.log("Processo finalizado!");
}

baixarTodos();
