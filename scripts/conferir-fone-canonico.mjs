// As duas versões de `fone_canonico` concordam?
//
// Uma mora no banco (SQL, IMMUTABLE, usada pela coluna gerada
// `bases_externas_pessoas.fone`) e a outra em `src/lib/telefone.ts`, porque as
// exportações precisam dela sem ir ao banco linha a linha.
//
// Duas cópias da mesma regra sempre desencontram — a diferença é se alguém
// descobre. Este script roda as duas contra TODOS os telefones que existem no
// banco e falha se UMA linha divergir.
//
//   node scripts/conferir-fone-canonico.mjs
//
// Quem mexer em qualquer uma das duas roda isto antes de subir.

import pg from "pg";
import { escolherBanco } from "./banco.mjs";
import { readFileSync } from "node:fs";

// Lê a função direto do arquivo TypeScript. Importar .ts daqui exigiria
// compilar; e copiar o corpo para cá criaria uma TERCEIRA versão, que é
// exatamente o que este script existe para impedir.
const fonte = readFileSync(new URL("../src/lib/telefone.ts", import.meta.url), "utf8");
const corpo = fonte.match(/export function foneCanonico\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
if (!corpo) {
  console.error("Não achei foneCanonico em src/lib/telefone.ts.");
  process.exit(1);
}
const foneCanonico = new Function("bruto", corpo[1].replace(/: string/g, ""));

const { conexao } = escolherBanco();
const c = new pg.Client(conexao);
await c.connect();

const FONTES = [
  ["bases_externas_pessoas", "telefone"],
  ["conversas", "telefone"],
  ["liderancas", "telefone"],
];

let total = 0;
const divergencias = [];

for (const [tabela, coluna] of FONTES) {
  const { rows } = await c.query(
    `select distinct ${coluna} as bruto, public.fone_canonico(${coluna}) as sql
       from public.${tabela} where ${coluna} is not null`,
  );
  for (const r of rows) {
    total++;
    const js = foneCanonico(r.bruto);
    if (js !== r.sql) divergencias.push({ tabela, bruto: r.bruto, sql: r.sql, js });
  }
  console.log(`  ${tabela}.${coluna}: ${rows.length.toLocaleString("pt-BR")} distintos`);
}

await c.end();

console.log(`\n  ${total.toLocaleString("pt-BR")} telefones distintos conferidos`);
if (divergencias.length === 0) {
  console.log("  as duas versões concordam em todos.\n");
  process.exit(0);
}

console.error(`\n  DIVERGIRAM em ${divergencias.length}:\n`);
for (const d of divergencias.slice(0, 20))
  console.error(`    ${d.tabela}  ${d.bruto}   sql=${d.sql}   js=${d.js}`);
if (divergencias.length > 20) console.error(`    ... e mais ${divergencias.length - 20}`);
console.error("");
process.exit(1);
