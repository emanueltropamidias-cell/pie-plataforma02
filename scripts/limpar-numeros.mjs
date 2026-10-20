// Junta listas de números soltos (PDF, texto, CSV, planilha) numa lista limpa.
//
//   node scripts/limpar-numeros.mjs --saida=numeros.csv arquivo1.pdf arquivo2.txt ...
//
// Não toca em banco nenhum: lê arquivos, limpa, tira repetido e grava um CSV de
// uma coluna, pronto para `scripts/subir-base-externa.mjs`.
//
// ── POR QUE UM LIMPADOR SEPARADO ────────────────────────────────────────────
//
// A base do Manassés chega como lista de telefone digitada por gente, ao longo
// de anos, em agenda de celular: com prefixo de operadora (041…), com zero na
// frente (071…), com +55, sem DDD, com fixo antigo de oito dígitos, com número
// de fora do Brasil, e com o mesmo número repetido em formatos diferentes.
//
// Subir isso cru encheria a base de linha que nunca vai receber mensagem — e,
// pior, de repetido que a gente não enxerga porque está escrito diferente.

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { normalizarTelefone } from "../src/lib/csv.ts";

// Os 67 DDD que existem. Sem esta conferência, "41 999…" tanto pode ser Curitiba
// quanto o resto de um prefixo de operadora mal cortado.
const DDDS = new Set(
  ("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 " +
    "61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99").split(" "),
);
const BAHIA = new Set(["71", "73", "74", "75", "77", "79"]);

/**
 * Devolve `{ tel, motivo }`. `tel` é DDD + número (10 ou 11 dígitos) quando dá
 * para mandar mensagem; senão vem nulo e `motivo` diz por quê.
 */
export function limpar(bruto, dddPadrao = null) {
  const cru = String(bruto ?? "").trim();
  let d = cru.replace(/\D/g, "");
  if (!d) return { tel: null, motivo: "vazio" };

  // 00 + país: ligação internacional discada. 0041 351… é Portugal, não Bahia.
  if (d.startsWith("00")) {
    const semZeros = d.slice(2);
    if (!semZeros.startsWith("55")) return { tel: null, motivo: "fora do Brasil" };
    d = semZeros;
  }

  // Prefixo de operadora: 0 + 2 dígitos (021, 041, 015…) antes do DDD. Só corta
  // quando o que sobra tem tamanho de telefone — senão comeria o DDD.
  if (d.startsWith("0")) {
    if (d.length >= 13 && DDDS.has(d.slice(3, 5))) d = d.slice(3);
    else if (d.length >= 11) d = d.slice(1);
    else d = d.replace(/^0+/, "");
  }

  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);

  // ── O NÚMERO SEM DDD ──────────────────────────────────────────────────────
  //
  // Agenda de celular antiga guarda o número como a pessoa discava na cidade:
  // "99258-8878", sem DDD. São 224 só no maior arquivo do Manassés. Sem DDD não
  // dá para mandar mensagem, e adivinhar manda para a pessoa errada em outra
  // cidade — por isso só entra quando alguém DIZ qual é o DDD (`--ddd=71`), e o
  // relatório separa quantos entraram por essa porta.
  if (d.length === 8 || d.length === 9) {
    if (!dddPadrao) return { tel: null, motivo: "sem DDD" };
    d = dddPadrao + d;
    return { ...limpar(d), suposto: true };
  }
  if (d.length <= 9) return { tel: null, motivo: "sem DDD" };
  if (d.length > 11) return { tel: null, motivo: "não parece telefone" };
  if (!DDDS.has(d.slice(0, 2))) return { tel: null, motivo: "DDD que não existe" };

  // A mesma régua do resto do PIE: insere o nono dígito no celular antigo e
  // recusa o que não fecha.
  const arrumado = normalizarTelefone(d).replace(/\D/g, "");
  if (!arrumado) return { tel: null, motivo: "não parece telefone" };
  return { tel: arrumado, motivo: null };
}

// ── COMO OS NÚMEROS APARECEM ────────────────────────────────────────────────
//
// Em três formatos, e a ordem importa: o texto do PDF vem com tudo numa linha
// só ("71988605087 71981669664 …"), então um padrão frouxo que aceita espaço no
// meio engole a lista INTEIRA como se fosse um número — foi o que aconteceu na
// primeira tentativa, e o arquivo devolveu zero.
//
//   1. +55 71 99999-9999   com o país, espaços e traço
//   2. 71 99999-9999       só DDD e número, separados por espaço ou traço
//   3. 71999999999         grudado, com ou sem pontuação, sem espaço
//
// Cada achado sai do texto antes da camada seguinte, para o mesmo número não
// entrar duas vezes por dois padrões.
function acharNumeros(texto) {
  const achados = [];
  let resto = texto;
  const camadas = [
    /\+\s*55[\s.-]*\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]?\d{4}/g,
    /\(?\b\d{2}\)?[\s.-]+9?\d{4}[\s.-]?\d{4}\b/g,
    /\d[\d().-]{7,}\d/g,
  ];
  for (const re of camadas) {
    resto = resto.replace(re, (m) => {
      achados.push(m);
      return " ";
    });
  }
  return achados;
}

async function texto(caminho) {
  if (/\.pdf$/i.test(caminho)) {
    const { PDFParse } = await import("pdf-parse");
    const doc = new PDFParse({ data: readFileSync(caminho) });
    try {
      return (await doc.getText()).text;
    } finally {
      await doc.destroy();
    }
  }
  if (/\.xlsx$/i.test(caminho)) {
    const { readSheet } = await import("read-excel-file/node");
    return (await readSheet(caminho)).map((l) => l.join(" ")).join("\n");
  }
  return readFileSync(caminho, "utf8");
}

if (import.meta.filename === process.argv[1]) {
  const saida = process.argv.find((a) => a.startsWith("--saida="))?.slice(8) ?? "numeros-limpos.csv";
  const arquivos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!arquivos.length) {
    console.error("\nUso: node scripts/limpar-numeros.mjs --saida=saida.csv <arquivos>\n");
    process.exit(1);
  }

  const bons = new Map(); // tel -> de onde veio primeiro
  const recusados = new Map(); // motivo -> quantos
  let repetidos = 0;
  let supostos = 0;
  // `--ddd=71`: completa quem veio sem DDD. Só com o dono da base dizendo qual é.
  const dddPadrao = process.argv.find((a) => a.startsWith("--ddd="))?.slice(6) ?? null;
  let achados = 0;

  for (const caminho of arquivos) {
    const conteudo = await texto(caminho);
    // Qualquer sequência de dígitos com pontuação de telefone no meio.
    const pedacos = acharNumeros(conteudo);
    let doArquivo = 0;
    for (const p of pedacos) {
      achados++;
      const { tel, motivo, suposto } = limpar(p, dddPadrao);
      if (!tel) {
        recusados.set(motivo, (recusados.get(motivo) ?? 0) + 1);
        continue;
      }
      if (suposto) supostos++;
      if (bons.has(tel)) {
        repetidos++;
        continue;
      }
      bons.set(tel, basename(caminho));
      doArquivo++;
    }
    console.log(`  ${basename(caminho)}: ${doArquivo.toLocaleString("pt-BR")} números novos`);
  }

  const lista = [...bons.keys()];
  const porDdd = new Map();
  for (const t of lista) porDdd.set(t.slice(0, 2), (porDdd.get(t.slice(0, 2)) ?? 0) + 1);
  const naBahia = lista.filter((t) => BAHIA.has(t.slice(0, 2))).length;

  writeFileSync(saida, "telefone\n" + lista.join("\n") + "\n", "utf8");

  console.log(
    `\n  achados no texto:   ${achados.toLocaleString("pt-BR")}\n` +
      `  números limpos:     ${lista.length.toLocaleString("pt-BR")}\n` +
      `  repetidos:          ${repetidos.toLocaleString("pt-BR")}\n` +
      `  DDD da Bahia:       ${naBahia.toLocaleString("pt-BR")}  ·  de fora: ${(lista.length - naBahia).toLocaleString("pt-BR")}`,
  );
  if (dddPadrao)
    console.log(`  completados com DDD ${dddPadrao}: ${supostos.toLocaleString("pt-BR")} (vieram sem DDD)`);
  console.log("  recusados: " + ([...recusados].map(([m, n]) => `${m}: ${n}`).join(" · ") || "nenhum"));
  console.log(
    "  por DDD: " +
      [...porDdd].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, n]) => `${d}=${n}`).join("  "),
  );
  console.log(`\n  gravado em ${saida}\n`);
}
