// Gera `supabase/seed.sql` — o que uma instalação nova precisa ter no primeiro
// minuto para não nascer vazia.
//
//   node scripts/gerar-semente.mjs
//
// ── O QUE ENTRA, E POR QUÊ SÓ ISTO ──────────────────────────────────────────
//
//   municipios_ba (417)   os municípios da Bahia. Todos os candidatos da
//                         coligação são da Bahia, então serve inteiro.
//   tags (18)             o vocabulário de classificação — os eixos. É o
//                         idioma em que a equipe trabalha; sem ele a caixa de
//                         atendimento abre sem nenhuma etiqueta para marcar.
//   departamentos (2)     Gabinete Salvador e Interior. Também são da Bahia.
//
// ── O QUE FICA DE FORA, E POR QUÊ ───────────────────────────────────────────
//
// O plano previa semear kits e o fluxo também. Olhando as colunas de perto, os
// dois têm de ficar de fora — e a razão de cada um é diferente:
//
//   fluxos + fluxo_passos   `fluxo_passos.mensagem` é a COPY DA TALITA, e
//                           `fluxos.telefones_teste` guarda telefones reais.
//                           Semear isso entrega ao candidato novo um disparo
//                           automático funcionando, escrito para outra pessoa
//                           — e o eleitor dele recebe. Não é semente, é
//                           vazamento com gatilho.
//
//   kits + kit_itens        `kit_itens.material_id` aponta para `materiais`,
//                           que são áudios e imagens guardados no Storage do
//                           projeto da Talita. Num projeto novo o arquivo não
//                           existe: o kit apareceria na tela e não mandaria
//                           nada. Kit é conteúdo do candidato, não estrutura.
//
// As três que entram não têm dono, não têm texto de campanha e não apontam
// para arquivo nenhum. É a linha: semente é o que é IGUAL entre candidatos.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SEMEAR = ["municipios_ba", "tags", "departamentos"];

const { conexao } = escolherBanco({ raiz: RAIZ });
const c = new pg.Client(conexao);
await c.connect();

const literal = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v))
    return `array[${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(", ")}]::text[]`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const partes = [
  `-- ============================================================================
-- A SEMENTE
-- ============================================================================
--
-- GERADO por \`scripts/gerar-semente.mjs\`. Roda DEPOIS de \`0000_base.sql\`.
--
-- É o que é IGUAL entre os candidatos da coligação: os 417 municípios da
-- Bahia, os 18 eixos de classificação e os 2 setores. Nada aqui tem dono, texto
-- de campanha ou arquivo no Storage.
--
-- NÃO estão aqui, de propósito:
--
--   o fluxo automático  — \`fluxo_passos.mensagem\` é a copy da Talita e
--                         \`fluxos.telefones_teste\` tem telefone real. Semear
--                         entregaria ao candidato novo um disparo pronto,
--                         funcionando, escrito para outra pessoa.
--
--   os kits             — apontam para arquivos no Storage do projeto dela.
--                         Num projeto novo o kit apareceria na tela e não
--                         mandaria nada.
--
-- Cada instalação cria os seus. Rode de novo sem medo: tudo é
-- \`on conflict do nothing\`.

set session_replication_role = replica;`,
];

let total = 0;
for (const t of SEMEAR) {
  const cols = (
    await c.query(
      `select attname from pg_attribute
        where attrelid = ('public.' || $1)::regclass and attnum > 0
          and not attisdropped and attgenerated = ''
        order by attnum`,
      [t],
    )
  ).rows.map((r) => r.attname);

  const chave = (
    await c.query(
      `select a.attname from pg_constraint con
         join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
        where con.conrelid = ('public.' || $1)::regclass and con.contype = 'p'`,
      [t],
    )
  ).rows.map((r) => r.attname);

  const { rows } = await c.query(
    `select ${cols.map((x) => `"${x}"`).join(", ")} from public.${t} order by ${chave[0] ?? cols[0]}`,
  );
  total += rows.length;

  partes.push(
    `-- ── ${t} (${rows.length}) ${"─".repeat(Math.max(1, 58 - t.length))}\n` +
      `insert into public.${t} (${cols.join(", ")}) values\n` +
      rows
        .map((r) => `  (${cols.map((x) => literal(r[x])).join(", ")})`)
        .join(",\n") +
      `\non conflict do nothing;`,
  );

  // O `insert` acima grava o id explicitamente e NÃO mexe na sequência. Sem
  // acertar aqui, o primeiro cadastro feito pela tela tentaria o id 1 e
  // esbarraria na chave primária — falha na primeira etiqueta nova, num lugar
  // que não parece ter relação com a semente.
  const seq = (
    await c.query(`select pg_get_serial_sequence($1, $2) as s`, [
      `public.${t}`,
      chave[0] ?? "id",
    ])
  ).rows[0].s;
  if (seq)
    partes.push(
      `select setval('${seq}', (select coalesce(max(${chave[0]}), 0) + 1 from public.${t}), false);`,
    );
}

partes.push(`set session_replication_role = origin;`);

writeFileSync(resolve(RAIZ, "supabase/seed.sql"), `${partes.join("\n\n")}\n`);
console.log(`escrito: supabase/seed.sql — ${total} linhas em ${SEMEAR.length} tabelas`);
await c.end();
