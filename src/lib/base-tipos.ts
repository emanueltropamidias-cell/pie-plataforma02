import { DDDS, foneCanonico } from "@/lib/telefone";

// Os tipos da base e o formato da planilha — num lugar só.
//
// A base da campanha (`/api/base/exportar`) e as outras bases
// (`/api/base/externas/[id]/exportar`) usam os mesmos cinco tipos e a mesma
// planilha. Escritos em duas rotas, um dia um rótulo muda numa e não na outra.

// Os cinco primeiros olham o MUNICÍPIO declarado. Os dois últimos olham o DDD
// — e existem porque agenda de celular não traz cidade nenhuma: sem eles, uma
// base de 5 mil pessoas só saberia exportar tudo ou nada.
export const TIPOS_BASE = [
  "completos", "sem_municipio", "so_numero", "outro_estado", "sem_telefone",
  "ddd_bahia", "ddd_fora",
] as const;
export type TipoBase = (typeof TIPOS_BASE)[number];

export const ROTULO_TIPO: Record<string, string> = {
  completos: "1 - completo (Bahia)",
  outro_estado: "outro estado",
  sem_municipio: "2 - sem municipio",
  so_numero: "3 - so o numero",
  sem_telefone: "sem telefone",
  // Por DDD, e não por cidade. Agenda de celular não traz município nenhum —
  // sem estes dois, uma base de 5 mil só saberia exportar tudo ou nada.
  ddd_bahia: "ddd da bahia",
  ddd_fora: "ddd de fora",
};

/** Célula de CSV entre aspas. */
export const campo = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Telefone que o Excel não transforma em notação científica. */
export const telefoneCSV = (t: string | null) => (t ? `="55${t}"` : '""');

export const dataCSV = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }) : "";

export const hojeBahia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });

// ── A PLANILHA SÓ COM OS NÚMEROS ────────────────────────────────────────────
//
// 30/09, Emanuel, com um print do Google Planilhas: "todas as bases precisam
// estar nesse formato, uma célula da quantidade e a outra célula o número com
// DDI + DDD + Telefone".
//
// É outro uso, e por isso é outro botão em vez de um formato novo para o de
// sempre: a planilha completa serve para FALAR com a pessoa — tem nome,
// município e bairro, e a equipe abre para saber com quem está lidando. Esta
// serve para ALIMENTAR alguma coisa: subir público na Meta, carregar
// disparador, cruzar com outra lista. Quem precisa de uma raramente quer a
// outra no mesmo arquivo.
//
// ── SEM REPETIDO, E É POR ISSO QUE A CONTAGEM VALE ──────────────────────────
//
// A mesma pessoa aparece em mais de uma base, e pode ter conversado por dois
// números da campanha. Na planilha completa isso é informação — são dois
// cadastros de verdade. Aqui seria erro: a coluna da esquerda diz "1, 2, 3", e
// uma lista numerada que conta a mesma pessoa duas vezes mente no próprio
// número que ela existe para mostrar.
//
// A comparação é por `foneCanonico`, a mesma regra que o banco usa para
// decidir se dois cadastros são a mesma pessoa.
//
// ── POR QUE O TELEFONE CONTINUA COMO `="55…"` ───────────────────────────────
//
// No print que ele mandou os números estão ALINHADOS À ESQUERDA — o Google leu
// como texto, que é o que esta fórmula produz. Dígito puro entraria como
// número: alinhado à direita no Google, e no Excel exibido como 5,57199E+12.

/**
 * O que pode levar o `55` na frente.
 *
 * ── O `55` É O MOTIVO DESTA FUNÇÃO SER RIGOROSA ─────────────────────────────
 *
 * A planilha prefixa o código do Brasil sem perguntar. Então qualquer coisa
 * que não seja um telefone brasileiro sai daqui como um número brasileiro
 * FALSO, com cara de válido — o pior formato de erro que existe, porque
 * ninguém olhando o arquivo desconfia.
 *
 * Medido em 30/09 nas conversas, com o filtro anterior que só exigia dez
 * dígitos: 588 linhas passavam, e nenhuma era telefone daqui.
 *
 *   525  LID — o identificador opaco que o WhatsApp passou a usar no lugar do
 *        número (`180088146530322`, 14 e 15 dígitos). Não é telefone de
 *        ninguém e não disca.
 *    32  estrangeiros de verdade (`5493484314689` é Argentina). Estes são
 *        gente real — e justamente por isso não podem sair com `55` colado na
 *        frente, o que os transformaria em outro número qualquer.
 *    29  malformados, com um dígito a mais
 *     2  a string literal `lid.0`
 *
 * Dez dígitos é fixo, onze é celular — `foneCanonico` já acrescentou o 9 nos
 * celulares antigos antes de chegar aqui. O DDD é conferido contra a lista de
 * `telefone.ts`, a mesma que recusa o que a equipe digita errado.
 *
 * O fixo FICA. Não serve para disparo de WhatsApp, mas é telefone de verdade e
 * serve para público da Meta — e sumir com dado real sem avisar é pior que
 * entregar uma linha que quem usa sabe descartar.
 */
function podeLevarO55(fone: string): boolean {
  if (fone.length !== 10 && fone.length !== 11) return false;
  return DDDS.has(Number(fone.slice(0, 2)));
}

export function linhasSoNumeros(telefones: (string | null | undefined)[]): string[] {
  const vistos = new Set<string>();
  const linhas: string[] = [];

  for (const bruto of telefones) {
    const fone = foneCanonico(bruto);
    if (!podeLevarO55(fone) || vistos.has(fone)) continue;
    vistos.add(fone);
    linhas.push(`${linhas.length + 1};="55${fone}"`);
  }
  return linhas;
}

/** BOM + ponto e vírgula + CRLF: abre certo no Excel brasileiro. */
export function respostaCSV(linhas: string[], arquivo: string) {
  return new Response("\uFEFF" + linhas.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
