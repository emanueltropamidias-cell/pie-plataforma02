// Puxa a AGENDA dos aparelhos — os contatos salvos em cada chip.
//
// ── O QUE ISTO TRAZ, E O QUE NÃO TRAZ ────────────────────────────────────────
//
// Não é quem falou com a campanha (isso é `exportar-numeros.mjs`). É quem está
// salvo nos contatos do celular: gente que a equipe conhece, que já foi
// atendida algum dia, que pediu alguma coisa, ou que simplesmente entrou na
// agenda por outro motivo.
//
// Medido em 15/09, nos 19 chips da Talita: 21.301 celulares aproveitáveis,
// 86% da Bahia, 21.082 com nome. Desses, 20.987 NÃO existiam na plataforma.
//
// ── O AVISO QUE VEM ANTES DO NÚMERO ─────────────────────────────────────────
//
// Agenda de celular não é lista de apoiador. Ali dentro tem médico, entregador,
// escola das crianças, fornecedor, e gente que não faz ideia de quem é o
// candidato. Tratar isso como base de campanha é errado de duas formas: mente
// no número e queima chip quando alguém dispara para todo mundo.
//
// Por isso o destino padrão é BASE EXTERNA — a gaveta separada, que não se
// mistura com `liderancas` nem entra nas métricas da campanha.
//
// ── O NONO DÍGITO ───────────────────────────────────────────────────────────
//
// O WhatsApp guarda número brasileiro no formato ANTIGO, de 8 dígitos, para a
// maioria dos contatos: dos 21.301, só 840 vinham completos. Acrescentar o 9 é
// conversão determinística — a Anatel o acrescentou a TODO celular — e não
// chute: só vale quando o primeiro dígito do número local é 6, 7, 8 ou 9. De 2
// a 5 é telefone fixo, que não recebe WhatsApp e fica de fora.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/puxar-agenda.mjs                      # só mostra, por chip
//   node scripts/puxar-agenda.mjs --chip=luth          # um chip só
//   node scripts/puxar-agenda.mjs --csv                # planilha na Área de Trabalho
//   node scripts/puxar-agenda.mjs --subir --nome="Agenda dos chips"
//
// Sem `--subir` nada é gravado. Olhe os números antes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";
import { normalizarContato } from "../src/lib/agenda-wa.ts";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const soChip = arg("chip");
const querCsv = process.argv.includes("--csv");
const querSubir = process.argv.includes("--subir");
// ── SÓ QUEM A CAMPANHA NUNCA TOCOU ──────────────────────────────────────────
//
// Sem isto o script sobe a agenda INTEIRA, e dois terços dela já estão em
// `conversas` ou `liderancas`. A base externa nasceria repetindo o que a
// plataforma já sabe, e qualquer contagem por cima dela contaria a mesma
// pessoa duas vezes.
const soNovos = process.argv.includes("--so-novos");
const nomeBase = arg("nome") || "Agenda dos aparelhos";
const admin = arg("admin");

const VPS = arg("vps") || "root@evo.talitaoliveiraoficial.com";
const CONTAINER = arg("container") || "evolution-postgres-1";

const DDD_BR = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,
  44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,
  87,88,89,91,92,93,94,95,96,97,98,99]);
const DDD_BA = new Set([71,73,74,75,77]);

/**
 * JID do WhatsApp → telefone utilizável, ou null.
 *
 * Devolve também POR QUE recusou: número descartado em silêncio é número que
 * ninguém vai investigar depois.
 */
// A regra mora em src/lib/agenda-wa.ts desde 28/09, quando a tela de Base
// ganhou o mesmo recurso. Manter uma copia aqui criaria a segunda regra de
// telefone da plataforma -- e o mesmo fato escrito em dois lugares sempre
// desencontra.
const normalizar = (jid) => normalizarContato(jid);


// ── 1. LER A AGENDA NA EVOLUTION ────────────────────────────────────────────
const filtro = soChip ? `and i.name = '${soChip.replace(/'/g, "''")}'` : "";
const sql = `
select json_agg(x) from (
  select split_part(c."remoteJid", '@', 1) as jid,
         max(c."pushName")                 as nome,
         string_agg(distinct i.name, ',')  as chips
    from "Contact" c join "Instance" i on i.id = c."instanceId"
   where c."remoteJid" like '%@s.whatsapp.net' ${filtro}
   group by 1
) x;`;

console.log(`\nlendo a agenda${soChip ? ` do chip ${soChip}` : " de todos os chips"}…`);
const cru = execFileSync("ssh",
  ["-i", `${os.homedir()}/.ssh/pie_vps`, "-o", "StrictHostKeyChecking=no", VPS,
   `docker exec -i ${CONTAINER} psql -U evolution -d evolution -At`],
  { input: sql, encoding: "utf8", maxBuffer: 200 * 1024 * 1024 }).trim();

const contatos = cru ? JSON.parse(cru) : [];
if (!contatos?.length) {
  console.log("  a Evolution não tem contato nesse recorte.\n");
  process.exit(0);
}

// ── 2. NORMALIZAR ───────────────────────────────────────────────────────────
const bons = [];
const recusas = {};
for (const c of contatos) {
  const r = normalizar(c.jid);
  if (r.erro) { recusas[r.erro] = (recusas[r.erro] ?? 0) + 1; continue; }
  bons.push({ fone: r.fone, nome: (c.nome || "").trim() || null, chips: c.chips, convertido: !!r.convertido });
}

const daBahia = bons.filter((b) => DDD_BA.has(Number(b.fone.slice(0, 2))));
console.log(`\n  contatos lidos:        ${contatos.length.toLocaleString("pt-BR")}`);
console.log(`  celulares aproveitáveis: ${bons.length.toLocaleString("pt-BR")}`);
console.log(`    ganharam o 9:        ${bons.filter((b) => b.convertido).length.toLocaleString("pt-BR")}`);
console.log(`  da Bahia:              ${daBahia.length.toLocaleString("pt-BR")} (${Math.round(100 * daBahia.length / bons.length)}%)`);
console.log(`  com nome:              ${bons.filter((b) => b.nome).length.toLocaleString("pt-BR")}`);
for (const [motivo, n] of Object.entries(recusas).sort((a, b) => b[1] - a[1])) {
  console.log(`  fora — ${motivo}: ${n}`);
}

// ── 3. QUANTOS SÃO NOVOS ────────────────────────────────────────────────────
const { conexao, env } = escolherBanco();
const banco = new pg.Client({ ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 25_000, query_timeout: 180_000 });
await banco.connect();

const { rows: [conta] } = await banco.query(`
  -- ── POR QUE JUNÇÃO E NÃO \`exists\` ────────────────────────────────────────
  --
  -- A versão anterior fazia um \`exists\` correlacionado: para CADA contato da
  -- agenda, varrer a base inteira aplicando regex linha a linha. 21 mil contra
  -- 37 mil é 780 milhões de comparações com regex no meio — estourou o
  -- \`statement_timeout\` em 26/09, e teria estourado sempre; só não aparecia
  -- porque a agenda era menor.
  --
  -- \`materialized\` força as duas pontas a virarem tabela temporária uma vez,
  -- e a junção vira hash: uma passada em cada lado.
  --
  -- ── E POR QUE \`fone_canonico\` DOS DOIS LADOS ──────────────────────────────
  --
  -- O regex cru só tirava pontuação. Mas \`conversas\` guarda com e sem o 55, e
  -- com e sem o nono dígito: o MESMO número aparecia como novo porque estava
  -- escrito diferente. \`fone_canonico\` é a função que o resto da plataforma
  -- usa para isso, e usar outra coisa aqui criaria a segunda regra.
  with agenda as materialized (
    select distinct public.fone_canonico(f) as fone
      from unnest($1::text[]) f
     where public.fone_canonico(f) <> ''
  ),
  base as materialized (
    select public.fone_canonico(telefone) as fone
      from public.liderancas where telefone is not null
    union
    select public.fone_canonico(telefone)
      from public.conversas
     where telefone is not null and telefone not like 'lid.%'
  )
  select count(*) filter (where b.fone is not null) as ja_temos,
         count(*) filter (where b.fone is null)     as novos,
         -- A lista dos conhecidos volta junto: com ela dá para filtrar a
         -- agenda sem uma segunda ida ao banco, e o filtro usa exatamente o
         -- mesmo critério da contagem. Contar por uma regra e filtrar por
         -- outra é como número de tela deixa de bater com planilha.
         coalesce(array_agg(a.fone) filter (where b.fone is not null), '{}') as conhecidos
    from agenda a
    left join base b on b.fone = a.fone`, [bons.map((b) => b.fone)]);
console.log(`\n  já estão na plataforma: ${Number(conta.ja_temos).toLocaleString("pt-BR")}`);
console.log(`  NOVOS:                  ${Number(conta.novos).toLocaleString("pt-BR")}`);

// `conhecidos` vem canonizado pelo banco; `bons` está no formato do script.
// Canonizar os dois lados com a MESMA função é o que impede o mesmo número
// passar por novo só porque está escrito diferente.
let paraSubir = bons;
if (soNovos) {
  const { rows: canon } = await banco.query(
    `select f as bruto, public.fone_canonico(f) as canon from unnest($1::text[]) f`,
    [bons.map((b) => b.fone)]);
  const mapa = new Map(canon.map((r) => [r.bruto, r.canon]));
  const conhecidos = new Set(conta.conhecidos ?? []);
  paraSubir = bons.filter((b) => !conhecidos.has(mapa.get(b.fone)));
  console.log(`  --so-novos: vão subir ${paraSubir.length.toLocaleString("pt-BR")}`);
}

// ── 4. PLANILHA ─────────────────────────────────────────────────────────────
if (querCsv) {
  const linhas = ["telefone,nome,chips"];
  for (const b of bons) {
    const nome = (b.nome ?? "").replace(/"/g, '""');
    linhas.push(`${b.fone},"${nome}","${b.chips}"`);
  }
  const arquivo = path.join(os.homedir(), "Desktop",
    `agenda-${soChip ?? "todos-os-chips"}-${new Date().toISOString().slice(0, 10)}.csv`);
  // BOM na frente: sem ele o Excel abre acentuação quebrada, e o nome das
  // pessoas vira lixo na planilha que alguém vai usar.
  fs.writeFileSync(arquivo, "﻿" + linhas.join("\n"));
  console.log(`\n  planilha: ${arquivo}`);
}

// ── 5. SUBIR COMO BASE EXTERNA ──────────────────────────────────────────────
if (querSubir) {
  if (!admin) {
    console.log(`
  Para subir, preciso do id da conta de coordenação (as funções de base exigem
  perfil_admin). Rode com:

    --subir --admin=<uuid do admin> --nome="${nomeBase}"
`);
    await banco.end();
    process.exit(1);
  }
  await banco.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: admin, role: "authenticated" })]);
  const { rows: [v] } = await banco.query("select public.perfil_admin() as ok");
  if (!v.ok) { console.log("\n  essa conta não é de coordenação. Parando."); await banco.end(); process.exit(1); }

  const { rows: [b] } = await banco.query(
    `select public.base_externa_criar($1,$2,$3,$4,$5) as id`,
    [nomeBase, "outra",
     `Contatos salvos na agenda ${soChip ? `do chip ${soChip}` : "dos chips"}. NÃO é lista de apoiadores.`,
     "evolution:Contact", paraSubir.length]);

  let novas = 0;
  for (let i = 0; i < paraSubir.length; i += 1000) {
    const lote = paraSubir.slice(i, i + 1000).map((x, k) => ({
      linha: i + k + 1, nome: x.nome, telefone: x.fone,
      extras: { chips: x.chips, origem: "agenda do aparelho" },
    }));
    const { rows: [r] } = await banco.query(
      `select public.base_externa_adicionar($1,$2::jsonb) as r`, [b.id, JSON.stringify(lote)]);
    novas += r.r.novas;
    process.stdout.write(`\r  subindo… ${Math.min(i + 1000, paraSubir.length)}/${paraSubir.length}`);
  }
  await banco.query(`select public.base_externa_concluir($1)`, [b.id]);
  console.log(`\n  base "${nomeBase}" criada com ${novas.toLocaleString("pt-BR")} pessoas.`);
} else {
  console.log(`
  Nada foi gravado. Para subir como base separada:

    node scripts/puxar-agenda.mjs --subir --admin=<uuid> --nome="${nomeBase}"
`);
}

await banco.end();
