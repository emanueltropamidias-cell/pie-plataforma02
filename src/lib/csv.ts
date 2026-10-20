// Leitor de CSV tolerante ao que sai do Excel brasileiro: separador ponto e
// vírgula ou vírgula, campos entre aspas com separador dentro, aspas escapadas
// como "" e BOM no começo do arquivo.

export type LinhaCSV = Record<string, string>;

function detectarSeparador(cabecalho: string) {
  const ponto = (cabecalho.match(/;/g) ?? []).length;
  const virgula = (cabecalho.match(/,/g) ?? []).length;
  const tab = (cabecalho.match(/\t/g) ?? []).length;
  if (tab > ponto && tab > virgula) return "\t";
  return ponto >= virgula ? ";" : ",";
}

/** Quebra o texto em células respeitando aspas. Devolve linhas de strings. */
function dividir(texto: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let celula = "";
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celula += '"';
          i++;
        } else dentroDeAspas = false;
      } else celula += c;
      continue;
    }
    if (c === '"') dentroDeAspas = true;
    else if (c === sep) {
      linha.push(celula);
      celula = "";
    } else if (c === "\n") {
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
    } else if (c !== "\r") celula += c;
  }
  if (celula || linha.length) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim()));
}

export function lerCSV(texto: string): { colunas: string[]; linhas: LinhaCSV[] } {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.split("\n")[0] ?? "";
  const sep = detectarSeparador(primeira);
  const bruto = dividir(limpo, sep);
  if (!bruto.length) return { colunas: [], linhas: [] };

  const colunas = bruto[0].map((c) => c.trim());
  const linhas = bruto.slice(1).map((l) => {
    const obj: LinhaCSV = {};
    colunas.forEach((col, i) => {
      obj[col] = (l[i] ?? "").trim();
    });
    return obj;
  });
  return { colunas, linhas };
}

/** Acha a coluna do arquivo que corresponde a um campo nosso. */
export function adivinharColuna(colunas: string[], alvos: string[]): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  for (const alvo of alvos) {
    const a = norm(alvo);
    const achou = colunas.find((c) => norm(c) === a);
    if (achou) return achou;
  }
  for (const alvo of alvos) {
    const a = norm(alvo);
    const achou = colunas.find((c) => norm(c).includes(a));
    if (achou) return achou;
  }
  return "";
}

// Os 67 DDD que existem no Brasil. Serve para decidir onde cortar um número
// que veio com dígito sobrando — sem isso, 71996495930|0 poderia ser lido pela
// direita e virar um telefone de Campinas.
const DDDS = new Set(
  ("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 " +
    "44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 " +
    "79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99").split(" "),
);

/** (71) 99999-9999 a partir de qualquer coisa; vazio se não for telefone. */
export function normalizarTelefone(v: string): string {
  let d = (v || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);

  // DOZE DÍGITOS COM UM ZERO GRUDADO NO FIM.
  //
  // É como a exportação do Gabiflow entrega: `719964959300`. Na Planilha de
  // Atendimentos são 2.539 linhas assim — 76% de todos os telefones.
  //
  // Antes, isto caía no `return ""` lá embaixo: a pessoa era importada SEM
  // telefone, sem aviso nenhum. E telefone é o que liga o cadastro à conversa
  // do WhatsApp (`telefone_digitos`), então o lead nunca mais reencontrava a
  // ficha — e ninguém veria, porque não há erro, só um campo vazio.
  //
  // Corta pela ESQUERDA porque foi assim que os 2.539 casaram: 100% formam
  // celular válido nos 11 primeiros, com DDD 75/77/73/71/74. Lidos pela
  // direita, só 33% fechavam, e o DDD virava 59/19/39 — que não existem.
  if (d.length === 12 && DDDS.has(d.slice(0, 2)) && d[2] === "9") d = d.slice(0, 11);

  if (d.length === 10 && "6789".includes(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return "";
}

export function nomeProprio(s: string) {
  const minusculas = new Set(["da", "de", "do", "das", "dos", "e", "di", "du"]);
  return (s || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (minusculas.has(p) && i > 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}
