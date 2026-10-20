// Sobe as fotos de urna do TSE para o Storage e aponta o candidato para elas.
//
// ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
//
// O endereço de foto que o TSE publica (divulgacandcontas) recusa acesso que
// não venha do próprio site, então a tela passava por um proxy nosso. O proxy
// lia as fotos de `public/urna/` com `fs` — o que funciona na máquina e NÃO na
// Vercel: lá o `public/` vai para a CDN e não existe dentro da função. Em
// produção toda foto caía no TSE, e o TSE recusava.
//
// Aqui elas vão para o bucket público `urna`, em `<ano>/<UF>/<sq>.jpg`, e a
// coluna `foto_url` passa a apontar para lá. A tela usa o endereço direto.
//
// ── DE ONDE VÊM ──────────────────────────────────────────────────────────────
//
// Do pacote oficial `foto_cand<ano>_<UF>_div.zip` do TSE, descompactado numa
// pasta. Os arquivos chegam como `F<UF><sq>_div.jpg` (ou `.jpeg`).
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/subir-fotos-urna.mjs --ano=2022 --uf=BA --pasta=public/urna
//   node scripts/subir-fotos-urna.mjs ... --confirmo      (sobe e grava)

import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const arg = (n, p) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim() ?? p;

const ano = parseInt(arg("ano", "2022"), 10);
const uf = arg("uf", "BA").toUpperCase();
const pasta = resolve(RAIZ, arg("pasta", "public/urna"));
const gravar = args.includes("--confirmo");
const BUCKET = "urna";

const { env, conexao } = escolherBanco({ raiz: RAIZ });
const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const chave = env.SUPABASE_SERVICE_ROLE_KEY;
if (!chave) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY no arquivo de ambiente.");
  process.exit(1);
}
const cabecalho = { Authorization: `Bearer ${chave}`, apikey: chave };

const padrao = new RegExp(`^F${uf}(\\d+)_div\\.jpe?g$`, "i");
const fotos = readdirSync(pasta)
  .map((nome) => ({ nome, sq: nome.match(padrao)?.[1] }))
  .filter((f) => f.sq);

const cliente = new pg.Client({ ...conexao, ssl: { rejectUnauthorized: false } });
await cliente.connect();
const { rows } = await cliente.query(
  `select distinct sq_candidato from public.eleicao_candidatos where ano = $1 and uf = $2`,
  [ano, uf],
);
const noBanco = new Set(rows.map((r) => r.sq_candidato));
const casam = fotos.filter((f) => noBanco.has(f.sq));

console.log(`${fotos.length} fotos na pasta, ${noBanco.size} candidaturas no banco, ${casam.length} casam.`);
if (!gravar) {
  console.log("Sem --confirmo: nada subido.");
  await cliente.end();
  process.exit(0);
}

// Bucket público: foto de urna é dado público do TSE, e a tela precisa dela
// sem login (o <img> não manda sessão).
const criar = await fetch(`${base}/storage/v1/bucket`, {
  method: "POST",
  headers: { ...cabecalho, "Content-Type": "application/json" },
  body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, allowed_mime_types: ["image/jpeg"] }),
});
if (!criar.ok && criar.status !== 409 && !(await criar.text()).includes("already exists")) {
  console.error(`Não consegui criar o bucket: HTTP ${criar.status}`);
  process.exit(1);
}

const subidas = [];
const falhas = [];
const PARALELO = 8;
for (let i = 0; i < casam.length; i += PARALELO) {
  await Promise.all(
    casam.slice(i, i + PARALELO).map(async (f) => {
      const caminho = `${ano}/${uf}/${f.sq}.jpg`;
      // A rede cai no meio de 1.700 envios; o upsert torna repetir seguro.
      let erro = "";
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        try {
          const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${caminho}`, {
            method: "POST",
            headers: { ...cabecalho, "Content-Type": "image/jpeg", "x-upsert": "true", "Cache-Control": "31536000" },
            body: readFileSync(resolve(pasta, f.nome)),
          });
          if (res.ok) {
            subidas.push({ sq: f.sq, url: `${base}/storage/v1/object/public/${BUCKET}/${caminho}` });
            return;
          }
          erro = `HTTP ${res.status}`;
        } catch (e) {
          erro = e.message;
        }
        await new Promise((r) => setTimeout(r, 1000 * (tentativa + 1)));
      }
      falhas.push(`${f.nome}: ${erro}`);
    }),
  );
  process.stdout.write(`\r${subidas.length}/${casam.length}`);
}

// Só aponta para o Storage o que de fato subiu.
await cliente.query(
  `update public.eleicao_candidatos c set foto_url = t.url
     from jsonb_to_recordset($1::jsonb) as t(sq text, url text)
    where c.ano = $2 and c.uf = $3 and c.sq_candidato = t.sq`,
  [JSON.stringify(subidas), ano, uf],
);

// Conferência: o que está gravado, não o que se pensa ter gravado.
const { rows: conf } = await cliente.query(
  `select count(*) filter (where foto_url like '%/storage/v1/object/public/${BUCKET}/%') as no_storage,
          count(*) as total
     from public.eleicao_candidatos where ano = $1 and uf = $2`,
  [ano, uf],
);
console.log(`\n${subidas.length} subidas, ${falhas.length} falhas. No banco: ${conf[0].no_storage} de ${conf[0].total} com foto no Storage.`);
if (falhas.length) console.log(falhas.slice(0, 10).join("\n"));
await cliente.end();
