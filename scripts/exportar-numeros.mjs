// Todo mundo que já falou com a campanha, em planilha — cadastrado ou não.
//
// ── POR QUE ELE EXISTE ──────────────────────────────────────────────────────
//
// Quando um chip cai, a conversa continua: a pessoa escreve para outro número,
// ou o atendimento responde pelo aparelho. Ela falou com a campanha, mas pode
// nunca ter virado cadastro em `liderancas` — e some de toda lista feita a
// partir da base.
//
// Para disparo isso é perda direta: o telefone existe, a pessoa já conversou, e
// não está na planilha que vai para o Gerenciador. Hoje são 5.207 pessoas nessa
// situação, contra 5.066 cadastradas. Metade da gente que falou com a campanha
// está fora de qualquer lista tirada da base.
//
// ── O 55 QUE NÃO CASAVA ─────────────────────────────────────────────────────
//
// As duas tabelas guardam telefone em formatos diferentes, e isso não estava
// escrito em lugar nenhum:
//
//   conversas.telefone           13 dígitos — 55 + DDD + 9 dígitos (vem do
//                                WhatsApp, que sempre manda com o país)
//   liderancas.telefone_digitos  11 dígitos — DDD + 9 dígitos
//
// Comparar as duas direto dá quase zero em comum: dos 10.411 telefones que já
// falaram, só 465 casavam — e a leitura ingênua disso é "9.946 pessoas fora da
// base", que é falso. Aqui os dois lados são cortados nos últimos 11 dígitos
// antes de comparar.
//
//   node scripts/exportar-numeros.mjs                 todos, cadastrados ou não
//   node scripts/exportar-numeros.mjs --fora          só quem não está na base
//   node scripts/exportar-numeros.mjs --saida C:/...  onde gravar

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const soFora = process.argv.includes("--fora");
const iSaida = process.argv.indexOf("--saida");
const saida = resolve(
  iSaida > -1
    ? process.argv[iSaida + 1]
    : `numeros-da-campanha-${new Date().toISOString().slice(0, 10)}.csv`,
);

const { conexao } = escolherBanco();
if (!conexao) {
  console.error("Falta SUPABASE_DB_PASSWORD no .env da instalação.");
  process.exit(1);
}

const cliente = new pg.Client({ ...conexao, ssl: { rejectUnauthorized: false } });
await cliente.connect();

const { rows } = await cliente.query(`
  with falaram as (
    select right(public.so_digitos(c.telefone), 11) as tel,
           -- O nome que o WhatsApp mostra, do registro mais recente que tiver um.
           (array_agg(nullif(btrim(c.nome), '') order by c.ultima_msg_at desc nulls last))[1] as nome_wa,
           max(c.ultima_msg_at) as ultima,
           count(*)::int as conversas
      from public.conversas c
     where length(public.so_digitos(c.telefone)) between 11 and 13
     group by 1
  )
  -- distinct on porque a base TEM telefone repetido: o mesmo número aparece em
  -- mais de um cadastro, e o join cru devolvia 10.514 linhas para 10.273
  -- telefones. Planilha de disparo com linha repetida manda a mesma mensagem
  -- duas vezes para a mesma pessoa — que é como se queima um chip.
  select distinct on (f.tel)
         f.tel,
         coalesce(l.nome, f.nome_wa) as nome,
         (l.id is not null) as cadastrado,
         l.municipio,
         f.ultima,
         f.conversas
    from falaram f
    left join public.liderancas l on l.telefone_digitos = f.tel
   where ($1::bool = false or l.id is null)
   order by f.tel, l.created_at asc nulls last
`, [soFora]);

await cliente.end();

// BOM, ponto e vírgula e ="dígitos" — senão o Excel em português come o acento,
// joga tudo numa coluna e transforma treze dígitos em notação científica.
const campo = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const linhas = [
  ["telefone", "nome", "cadastrado", "municipio", "ultima_conversa", "conversas"].join(";"),
  ...rows.map((r) =>
    [
      `="55${r.tel}"`,
      campo(r.nome),
      r.cadastrado ? "sim" : "não",
      campo(r.municipio),
      campo(r.ultima ? new Date(r.ultima).toLocaleString("pt-BR") : ""),
      r.conversas,
    ].join(";"),
  ),
];

writeFileSync(saida, "\uFEFF" + linhas.join("\r\n"), "utf8");

const cadastrados = rows.filter((r) => r.cadastrado).length;
const semNome = rows.filter((r) => !r.nome).length;

console.log(`\n  ${rows.length.toLocaleString("pt-BR")} telefones`);
console.log(`  ${cadastrados.toLocaleString("pt-BR")} cadastrados · ${(rows.length - cadastrados).toLocaleString("pt-BR")} fora da base`);
console.log(`  ${semNome.toLocaleString("pt-BR")} sem nome nenhum`);
console.log(`\n  ${saida}\n`);
