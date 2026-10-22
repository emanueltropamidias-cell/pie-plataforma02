// Números em português, usados tanto no servidor (página pública) quanto no
// navegador (abas da Estratégia). Ficam fora de arquivo "use client": função de
// componente de cliente não pode ser chamada pelo servidor.

export const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const pct = (n: number, casas = 1) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
export const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n < 100 ? 2 : 0 });
