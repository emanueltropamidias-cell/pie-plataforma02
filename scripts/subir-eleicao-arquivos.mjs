// Manda os arquivos de `gerar-eleicao-arquivos.mjs` para o bucket `eleicao`.
//
//   node scripts/subir-eleicao-arquivos.mjs --ano=2022              conta
//   node scripts/subir-eleicao-arquivos.mjs --ano=2022 --confirmo   sobe
//
// Antes de subir, escreve `<ano>/manifesto.json`: os estados que existem, com
// quantas candidaturas e quantos municípios com voto. É dele que a tela tira
// quais anos e estados oferecer — contado aqui, uma vez, e não a cada
// abertura de página (ver a migração 0059 sobre o que isso custou).

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { escolherBanco } from "./banco.mjs";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const arg = (n, p) =>
  args
    .find((a) => a.startsWith(`--${n}=`))
    ?.slice(n.length + 3)
    .trim() ?? p;
const ano = arg("ano", "2022");
const gravar = args.includes("--confirmo");
const PASTA = resolve(RAIZ, ".cache/eleicao-arquivos", ano);
const BUCKET = "eleicao";

const ler = (rel) => JSON.parse(readFileSync(resolve(PASTA, rel), "utf8"));
const listar = (dir) => {
  const fora = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) fora.push(...listar(p));
    else fora.push(p);
  }
  return fora;
};

// ── manifesto ───────────────────────────────────────────────────────────────
const municipal = Number(ano) % 4 === 0;
const manifesto = {
  ano: Number(ano),
  gerado_em: new Date().toISOString(),
  ufs: {},
};
for (const arq of readdirSync(resolve(PASTA, "indice"))) {
  const uf = arq.replace(".json", "");
  const indice = ler(`indice/${arq}`);
  const cidades = new Set();
  if (municipal) {
    try {
      for (const n of readdirSync(resolve(PASTA, "m", uf))) cidades.add(n);
    } catch {
      /* estado sem cidade com voto */
    }
  } else {
    for (const linha of indice) {
      if (!linha[9]) continue;
      const votos = ler(`c/${linha[0]}.json`).votos;
      for (const [u, porMun] of Object.entries(votos))
        for (const m of Object.keys(porMun)) cidades.add(`${u}:${m}`);
    }
  }
  manifesto.ufs[uf] = { candidaturas: indice.length, municipios: cidades.size };
}
writeFileSync(resolve(PASTA, "manifesto.json"), JSON.stringify(manifesto));

const arquivos = listar(PASTA);
const bytes = arquivos.reduce((s, a) => s + statSync(a).size, 0);
console.log(
  `${ano}: ${arquivos.length} arquivos, ${(bytes / 1e6).toFixed(1)} MB de conteúdo, ${Object.keys(manifesto.ufs).length} estados`,
);
if (!gravar) {
  console.log("Sem --confirmo: nada subido.");
  process.exit(0);
}

const { env } = escolherBanco({ raiz: RAIZ });
const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const chave = env.SUPABASE_SERVICE_ROLE_KEY;
const cab = { Authorization: `Bearer ${chave}`, apikey: chave };

const criar = await fetch(`${base}/storage/v1/bucket`, {
  method: "POST",
  headers: { ...cab, "Content-Type": "application/json" },
  body: JSON.stringify({
    id: BUCKET,
    name: BUCKET,
    public: true,
    allowed_mime_types: ["application/json"],
  }),
});
if (!criar.ok && !(await criar.text()).includes("already exists")) {
  console.error(`Não consegui criar o bucket: HTTP ${criar.status}`);
  process.exit(1);
}

// O manifesto vai por ÚLTIMO: enquanto ele não sobe, a tela continua vendo o
// estado anterior, e não um meio-termo.
const MANIFESTO = resolve(PASTA, "manifesto.json");
// `--apenas=<regex>`: reenviar só o que mudou (ex.: os arquivos do presidente,
// `--apenas="indice/BR|c/28"`), sem subir de novo os 25 mil do ano.
const apenas = arg("apenas", "");
const filtro = apenas ? new RegExp(apenas) : null;
const ordem = arquivos.filter((a) => a !== MANIFESTO && (!filtro || filtro.test(relative(PASTA, a))));
let feitos = 0;
const falhas = [];

async function subir(a) {
  const caminho = `${ano}/${relative(PASTA, a)}`;
  let erro = "";
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${caminho}`, {
        method: "POST",
        headers: {
          ...cab,
          "Content-Type": "application/json",
          "x-upsert": "true",
          "Cache-Control": "3600",
        },
        body: readFileSync(a),
      });
      if (r.ok) return feitos++;
      erro = `HTTP ${r.status}`;
    } catch (e) {
      erro = e.message;
    }
    await new Promise((r) => setTimeout(r, 1000 * (t + 1)));
  }
  falhas.push(`${caminho}: ${erro}`);
}

const PARALELO = 16;
for (let i = 0; i < ordem.length; i += PARALELO) {
  await Promise.all(ordem.slice(i, i + PARALELO).map(subir));
  process.stdout.write(`\r${feitos}/${ordem.length}`);
}
if (!falhas.length) await subir(MANIFESTO);
console.log(`\n${feitos} subidos, ${falhas.length} falhas`);
if (falhas.length) {
  console.log(falhas.slice(0, 10).join("\n"));
  process.exit(1);
}
