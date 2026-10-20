// Sincroniza o tráfego das contas de anúncio direto no banco, fora da Vercel.
//
// A rotina do dia a dia é o cron da Vercel (`/api/trafego/sync`). Este script
// existe para o que não cabe numa função de 60 segundos: a carga de TRÊS ANOS
// das cinco contas, e o conserto quando uma conta ficou para trás.
//
// Lê a Meta com `src/lib/trafego/meta.ts` — o mesmo arquivo que a rota usa, lido
// pelo Node sem compilação (Node 23+) — e grava com `trafego_gravar()`, a mesma
// função do banco que a rota chama. Nenhuma regra existe duas vezes.
//
//   node scripts/sync-trafego.mjs --modo=completo --seco      lê e mostra, não grava
//   node scripts/sync-trafego.mjs --modo=completo              grava as contas todas
//   node scripts/sync-trafego.mjs --modo=hoje --conta=2734...  uma conta só

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const [maior] = process.versions.node.split(".").map(Number);
if (maior < 23) {
  console.error(`\n  Este script precisa do Node 23 ou mais novo (este é ${process.versions.node}).\n  Ele lê src/lib/trafego/meta.ts direto, sem compilar.\n`);
  process.exit(1);
}

const { lerConta, listarContasDeTodos, tokensDaMeta } = await import("../src/lib/trafego/meta.ts");

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
const modo = arg("modo") ?? "hoje";
const soConta = arg("conta")?.replace(/^act_/, "");
const seco = process.argv.includes("--seco");

if (!["hoje", "recente", "completo"].includes(modo)) {
  console.error(`  --modo tem de ser hoje, recente ou completo (veio "${modo}").`);
  process.exit(1);
}

const { env, conexao } = escolherBanco();
const token = process.env.META_ACCESS_TOKEN || env.META_ACCESS_TOKEN;
if (!token) {
  console.error("  Falta META_ACCESS_TOKEN no .env da instalação.");
  process.exit(1);
}

const reais = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let contas = await listarContasDeTodos(token);
if (soConta) contas = contas.filter((c) => c.id === soConta);
console.log(`  modo ${modo}${seco ? " · SECO, nada é gravado" : ""} · ${contas.length} conta(s)${tokensDaMeta(token).length > 1 ? ` · ${tokensDaMeta(token).length} tokens` : ""}\n`);

const cliente = seco ? null : new pg.Client({ ...conexao, ssl: { rejectUnauthorized: false } });
if (cliente) await cliente.connect();

let falhas = 0;
for (const conta of contas) {
  const t0 = Date.now();
  try {
    const { doc, diagnostico } = await lerConta(conta, conta.token ?? token, modo);
    const hoje = doc.until;
    const gastoHoje = doc.metricas.filter((m) => m.data === hoje).reduce((s, m) => s + m.gasto, 0);
    const resHoje = doc.metricas.filter((m) => m.data === hoje).reduce((s, m) => s + m.resultados, 0);
    const gastoPeriodo = doc.metricas.reduce((s, m) => s + m.gasto, 0);

    let gravado = "";
    if (cliente) {
      const { rows } = await cliente.query("select public.trafego_gravar($1::jsonb) as r", [JSON.stringify(doc)]);
      const r = rows[0].r;
      gravado = ` · gravou ${r.metricas} dias-campanha, ${r.campanhas} campanhas, ${r.criativos} criativos`;
    }

    console.log(
      `  ${conta.nome.padEnd(14)} status ${conta.status}  hoje ${reais(gastoHoje)} / ${resHoje} resultados` +
        `  · ${doc.since} a ${doc.until}: ${reais(gastoPeriodo)} em ${doc.metricas.length} linhas` +
        `  (${((Date.now() - t0) / 1000).toFixed(1)}s)${gravado}`,
    );
    if (diagnostico.arte) console.log(`      arte: ${JSON.stringify(diagnostico.arte)}`);
    for (const a of diagnostico.avisos) console.log(`      aviso: ${a}`);
  } catch (e) {
    falhas++;
    console.log(`  ${conta.nome.padEnd(14)} FALHOU: ${e.message}`);
    if (cliente) await cliente.query("select public.trafego_registrar_erro($1, $2, $3)", [conta.id, conta.nome, e.message]).catch(() => {});
  }
}

if (cliente) await cliente.end();
console.log(falhas ? `\n  ${falhas} conta(s) com falha.` : "\n  OK.");
process.exitCode = falhas ? 1 : 0;
