// Sobe uma planilha para uma base de fora (Base → Outras bases), pelo terminal.
//
//   node scripts/subir-base-externa.mjs --candidato=manasses --base="Base do Manassés" --arquivo="C:/caminho/numeros.xlsx" --seco
//   node scripts/subir-base-externa.mjs --candidato=manasses --base="Base do Manassés" --arquivo="C:/caminho/numeros.xlsx"
//
//   --base       o nome da gaveta. Já existe? ACRESCENTA nela. Não existe? cria.
//   --arquivo    .xlsx, .csv ou .txt. Pode repetir para mandar vários de uma vez.
//   --categoria  mandato | dobradinha | parceiro | outra   (padrão: outra)
//   --coluna     número da coluna do telefone, se a adivinhação errar (1 = a primeira)
//   --seco       só mostra o que faria
//
// ── POR QUE PELO TERMINAL, E NÃO PELA TELA ──────────────────────────────────
//
// A base do candidato chega em pedaços, por WhatsApp, e quem recebe sou eu. A
// tela continua existindo e faz o mesmo — as duas chamam a MESMA função de
// gravação no banco (`base_externa_gravar`, 0036), então a regra de telefone,
// de município e de repetido é uma só.
//
// ── A BASE QUE É SÓ NÚMERO ──────────────────────────────────────────────────
//
// A do Manassés não tem nome nem cabeçalho: a primeira linha já é telefone.
// Tomar essa linha como cabeçalho comeria um número por arquivo, calado. Por
// isso a coluna do telefone é achada pelo CONTEÚDO, e a primeira linha só é
// descartada quando de fato parece cabeçalho.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";
import { lerCSV, normalizarTelefone } from "../src/lib/csv.ts";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim();
const todos = (n) => process.argv.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.slice(n.length + 3).trim());
const seco = process.argv.includes("--seco");

const nomeBase = arg("base");
const arquivos = todos("arquivo");
const categoria = arg("categoria") ?? "outra";
const colunaPedida = Number(arg("coluna") ?? 0);

function parar(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

if (!nomeBase || arquivos.length === 0)
  parar('Uso: node scripts/subir-base-externa.mjs --candidato=<quem> --base="<nome>" --arquivo=<planilha> [--seco]');

const LOTE = 2000;

/** Parece telefone: de 10 a 13 dígitos, e nenhuma letra. (Igual ao da tela.) */
function pareceTelefone(v) {
  const t = String(v ?? "").trim();
  if (!t || /[a-zA-ZÀ-ÿ]/.test(t)) return false;
  const d = t.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13;
}

const celula = (v) => (v == null ? "" : v instanceof Date ? v.toLocaleDateString("pt-BR") : String(v).trim());

async function lerArquivo(caminho) {
  if (/\.xlsx$/i.test(caminho)) {
    const { readSheet } = await import("read-excel-file/node");
    const dados = await readSheet(caminho);
    return dados.map((l) => l.map(celula));
  }
  const { colunas, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  // O CSV volta como objetos; aqui tudo é matriz, e o cabeçalho é só a linha 1.
  return [colunas, ...linhas.map((l) => colunas.map((c) => l[c] ?? ""))];
}

const banco = escolherBanco();
if (!banco.conexao) parar("Falta SUPABASE_DB_PASSWORD no arquivo desta instalação.");
const cliente = new pg.Client({ ...banco.conexao, ssl: { rejectUnauthorized: false } });
await cliente.connect();

try {
  let idBase = null;
  for (const caminho of arquivos) {
    const matriz = await lerArquivo(caminho);
    if (matriz.length === 0) parar(`${caminho} está vazio.`);

    // A coluna do telefone: a pedida, ou a que mais parece telefone.
    const largura = Math.max(...matriz.map((l) => l.length));
    let coluna = colunaPedida - 1;
    if (coluna < 0) {
      let placar = -1;
      for (let c = 0; c < largura; c++) {
        const p = matriz.slice(0, 200).filter((l) => pareceTelefone(l[c])).length;
        if (p > placar) {
          placar = p;
          coluna = c;
        }
      }
      if (placar <= 0) parar(`Não achei coluna de telefone em ${basename(caminho)}. Use --coluna=<número>.`);
    }

    const cabecalho = !pareceTelefone(matriz[0]?.[coluna]);
    const corpo = matriz.slice(cabecalho ? 1 : 0);

    const vistos = new Set();
    const linhas = [];
    let invalidos = 0;
    let repetidos = 0;
    corpo.forEach((l, i) => {
      const bruto = celula(l[coluna]);
      if (!bruto) return;
      const d = normalizarTelefone(bruto).replace(/\D/g, "");
      if (!d) {
        invalidos++;
        return;
      }
      if (vistos.has(d)) {
        repetidos++;
        return;
      }
      vistos.add(d);
      linhas.push({ linha: i + 1, nome: "", telefone: d, municipio: "", bairro: "", extras: {} });
    });

    console.log(
      `\n  ${basename(caminho)}\n` +
        `    linhas no arquivo: ${corpo.length.toLocaleString("pt-BR")}${cabecalho ? " (fora o cabeçalho)" : " (sem cabeçalho)"}\n` +
        `    coluna do telefone: ${coluna + 1}\n` +
        `    números válidos:   ${linhas.length.toLocaleString("pt-BR")}\n` +
        `    repetidos no arquivo: ${repetidos.toLocaleString("pt-BR")}\n` +
        `    não são telefone:     ${invalidos.toLocaleString("pt-BR")}`,
    );
    console.log(`    exemplos: ${linhas.slice(0, 3).map((l) => l.telefone.slice(0, 4) + "…" + l.telefone.slice(-2)).join("  ")}`);

    if (seco) continue;

    if (idBase === null) {
      const { rows: [r] } = await cliente.query(
        "select public.base_externa_servico_abrir($1, $2, null, $3, $4) as id",
        [nomeBase, categoria, basename(caminho), linhas.length],
      );
      idBase = r.id;
    } else {
      await cliente.query("select public.base_externa_servico_abrir($1, $2, null, $3, $4)", [
        nomeBase,
        categoria,
        basename(caminho),
        linhas.length,
      ]);
    }

    let novas = 0;
    for (let i = 0; i < linhas.length; i += LOTE) {
      const { rows: [r] } = await cliente.query("select public.base_externa_gravar($1, $2::jsonb) as r", [
        idBase,
        JSON.stringify(linhas.slice(i, i + LOTE)),
      ]);
      novas += r.r.novas;
      process.stdout.write(`\r    gravando… ${Math.min(i + LOTE, linhas.length).toLocaleString("pt-BR")}/${linhas.length.toLocaleString("pt-BR")}`);
    }
    console.log(`\r    entraram: ${novas.toLocaleString("pt-BR")} novas (o resto já estava na base)        `);
  }

  if (seco) {
    console.log("\n  SECO — nada foi gravado.\n");
    process.exit(0);
  }

  await cliente.query("select public.base_externa_servico_concluir($1)", [idBase]);
  const { rows: [{ c }] } = await cliente.query("select public.base_externa_contar($1) as c", [idBase]);
  console.log(
    `\n  Base "${nomeBase}" agora tem ${Number(c.pessoas).toLocaleString("pt-BR")} pessoas com telefone` +
      ` (${Number(c.so_numero).toLocaleString("pt-BR")} só o número).\n`,
  );
} finally {
  await cliente.end();
}
