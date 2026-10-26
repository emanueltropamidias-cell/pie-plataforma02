// Planilha CSV no formato que o Excel brasileiro abre direto: ponto e vírgula
// como separador, vírgula decimal, BOM no começo (sem ele os acentos viram
// "Ã§") e quebra de linha do Windows. Serve no servidor e no navegador.

type Celula = string | number | null | undefined;

function celula(v: Celula) {
  if (v === null || v === undefined) return '""';
  const texto = typeof v === "number" ? v.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 4 }) : v;
  return `"${String(texto).replace(/"/g, '""')}"`;
}

export function planilha(cabecalho: string[], linhas: Celula[][]) {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n");
}

/** Nome de arquivo sem acento nem espaço. */
export function nomeDeArquivo(...partes: (string | number)[]) {
  return (
    partes
      .map((p) =>
        String(p)
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^A-Za-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase(),
      )
      .filter(Boolean)
      .join("-") + ".csv"
  );
}
