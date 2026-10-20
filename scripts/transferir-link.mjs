// Leva um QR (link de /l/) de uma instalação do PIE para outra, sem quebrar o
// que já foi impresso.
//
//   node scripts/transferir-link.mjs --slug=talitaemanasses --para=manasses --seco
//   node scripts/transferir-link.mjs --slug=talitaemanasses --para=manasses
//
// Opções:
//   --de=<candidato>        de onde sai (padrão: a principal, .env.local)
//   --site-destino=<url>    o site público do destino, se o arquivo dele não
//                           tiver NEXT_PUBLIC_SITE_URL
//   --seco                  só mostra o que faria
//
// ── O QUE FAZ, NA ORDEM ─────────────────────────────────────────────────────
//
// 1. Cria o link no destino, com o mesmo slug, nome, destino (WhatsApp) e
//    categoria.
// 2. Copia as leituras, com a data de cada uma — o placar do QR não recomeça do
//    zero. (Leituras de liderança só quando o link não tem liderança; ver 4.)
// 3. Copia a arte, baixada pela rota pública `/l/<slug>/arte` da origem. Se o
//    arquivo do destino não tiver a service_role, avisa para subir pela tela.
// 4. Só DEPOIS de conferir que o destino tem o link e as leituras, aponta o
//    link da origem para `https://<site do destino>/l/<slug>`. A rota da origem
//    reconhece o repasse (src/lib/repasse-link.ts) e não conta mais a leitura.
//
// Se algo falhar antes do passo 4, a origem continua exatamente como estava: o
// QR impresso segue funcionando e contando onde contava.
//
// Link com códigos de liderança (`link_lideres`) PARA: os códigos apontam para
// lideranças do banco de origem, que não existem no destino. Esse caso pede
// uma decisão, não um script.

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim();
const seco = process.argv.includes("--seco");
const slug = arg("slug");
const para = arg("para");
const de = arg("de") ?? "";

function parar(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!slug || !para) parar("Uso: node scripts/transferir-link.mjs --slug=<slug> --para=<candidato> [--de=<candidato>] [--seco]");
if (para === de || (para === "talita" && de === "")) parar("Origem e destino são a mesma instalação.");

const origem = escolherBanco({ candidato: de, silencioso: true });
const destino = escolherBanco({ candidato: para, silencioso: true });
if (origem.ref === destino.ref) parar(`Os dois arquivos apontam para o MESMO projeto (${origem.ref}). Parei.`);
if (!origem.conexao || !destino.conexao) parar("Falta SUPABASE_DB_PASSWORD num dos dois arquivos.");

const siteOrigem = (origem.env.NEXT_PUBLIC_SITE_URL || "https://www.talitaoliveiraoficial.com").replace(/\/+$/, "");
const siteDestino = (arg("site-destino") || destino.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
if (!/^https:\/\//.test(siteDestino))
  parar(`Não sei o site público de "${destino.candidato}". Passe --site-destino=https://... (é a base dos QR dele).`);

console.log(`\n  de:    ${origem.candidato.toUpperCase()} (${origem.ref})  ${siteOrigem}`);
console.log(`  para:  ${destino.candidato.toUpperCase()} (${destino.ref})  ${siteDestino}`);
console.log(`  QR:    /l/${slug}${seco ? "   [SECO — nada será gravado]" : ""}\n`);

const novo = (c) => new pg.Client({ ...c.conexao, ssl: { rejectUnauthorized: false } });
const a = novo(origem);
const b = novo(destino);
await a.connect();
await b.connect();

try {
  const { rows: [link] } = await a.query("select * from links where slug = $1", [slug]);
  if (!link) parar(`Não existe /l/${slug} em ${origem.candidato}.`);

  const novoDestino = `${siteDestino}/l/${slug}`;
  if (link.destino === novoDestino) parar(`/l/${slug} já repassa para ${novoDestino}. Nada a fazer.`);

  const { rows: [{ n: lideres }] } = await a.query("select count(*)::int n from link_lideres where link_id = $1", [link.id]);
  if (lideres > 0) parar(`/l/${slug} tem ${lideres} código(s) de liderança. Eles apontam para lideranças de ${origem.candidato}; transferir exige decidir o que fazer com elas.`);

  const { rows: leituras } = await a.query(
    "select em, referencia, impressao, robo from link_leituras where link_id = $1 order by em",
    [link.id],
  );

  const { rows: [jaExiste] } = await b.query("select id from links where slug = $1", [slug]);
  if (jaExiste) parar(`${destino.candidato} já tem um /l/${slug}. Apague ou renomeie lá antes — não vou misturar leituras.`);

  console.log(`  link:      "${link.nome}"  →  ${link.destino.slice(0, 60)}…`);
  console.log(`  leituras:  ${leituras.length}`);
  console.log(`  arte:      ${link.arte ? "sim" : "não"}`);
  console.log(`  depois:    a origem passa a repassar para ${novoDestino}\n`);

  if (seco) process.exit(0);

  // ── 1 e 2: link e leituras no destino, numa transação ─────────────────────
  await b.query("begin");
  const { rows: [criado] } = await b.query(
    `insert into links (slug, nome, destino, ativo, categoria, criado_em, atualizado_em)
     values ($1, $2, $3, true, $4, $5, now()) returning id`,
    [slug, link.nome, link.destino, link.categoria, link.criado_em],
  );
  for (let i = 0; i < leituras.length; i += 500) {
    const lote = leituras.slice(i, i + 500);
    const valores = [];
    const params = [];
    lote.forEach((l, k) => {
      const o = k * 5;
      valores.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5})`);
      params.push(criado.id, l.em, l.referencia, l.impressao, l.robo);
    });
    await b.query(`insert into link_leituras (link_id, em, referencia, impressao, robo) values ${valores.join(",")}`, params);
  }
  await b.query("commit");

  const { rows: [{ n: conferidas }] } = await b.query("select count(*)::int n from link_leituras where link_id = $1", [criado.id]);
  if (conferidas !== leituras.length) parar(`Destino tem ${conferidas} leituras e a origem ${leituras.length}. Parei ANTES de mexer na origem.`);
  console.log(`  ✓ destino: link criado e ${conferidas} leituras conferidas`);

  // ── 3: arte ────────────────────────────────────────────────────────────────
  if (link.arte) {
    const chave = destino.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!chave) {
      console.log(`  ! arte: o arquivo de ${destino.candidato} não tem SUPABASE_SERVICE_ROLE_KEY — suba a arte pela tela Links/QR dele`);
    } else {
      const r = await fetch(`${siteOrigem}/l/${slug}/arte`);
      if (!r.ok) {
        console.log(`  ! arte: não consegui baixar da origem (${r.status}) — suba pela tela`);
      } else {
        const tipo = r.headers.get("content-type") || "image/jpeg";
        const ext = tipo.includes("png") ? "png" : "jpeg";
        const caminho = `arte-link/${crypto.randomUUID()}.${ext}`;
        const up = await fetch(`${destino.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/audios/${caminho}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${chave}`, "Content-Type": tipo },
          body: Buffer.from(await r.arrayBuffer()),
        });
        if (!up.ok) console.log(`  ! arte: o upload no destino falhou (${up.status}) — suba pela tela`);
        else {
          await b.query("update links set arte = $1 where id = $2", [caminho, criado.id]);
          console.log("  ✓ arte copiada");
        }
      }
    }
  }

  // ── 4: a origem passa a repassar ──────────────────────────────────────────
  await a.query("update links set destino = $1, atualizado_em = now() where id = $2", [novoDestino, link.id]);
  console.log(`  ✓ origem: /l/${slug} agora repassa para ${novoDestino}`);
  console.log(`\n  Confira lendo o QR impresso: tem de abrir o WhatsApp e contar 1 leitura em ${destino.candidato}.\n`);
} finally {
  await a.end();
  await b.end();
}
