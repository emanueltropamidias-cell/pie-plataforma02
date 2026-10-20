// O lead vira cadastro sozinho, lendo a própria mensagem.
//
// ── DE ONDE ISTO VEIO, E POR QUE MERECE UMA SEGUNDA CHANCE ──────────────────
//
// Esta lógica vivia no webhook da Meta e NUNCA RODOU. Conferido no banco:
// `select count(*) from liderancas where created_via = 'whatsapp'` devolveu
// zero, com primeiro e último nulos. O endereço estava escrito, a regra estava
// certa, e a Meta nunca chamou — então todo mundo que escaneou um QR impresso e
// mandou mensagem ficou de fora da base.
//
// Agora ela mora aqui, chamada pelo webhook da Evolution, que é por onde as
// mensagens realmente passam.
//
// ── E NÃO ESCREVE MAIS NO BANCO ─────────────────────────────────────────────
//
// Escrevia direto em `liderancas`. Com mil leads por dia isso enche a base de
// linha meia-boca: nome que era apelido do WhatsApp, município adivinhado de
// uma frase solta, duplicado que passou pela busca.
//
// Agora só LÊ o texto e devolve sugestões. Quem escreve é a atendente, com um
// clique, depois de conferir os três campos na ficha.
//
// De brinde, a busca por duplicado saiu do caminho quente: rodava a cada
// mensagem com `ilike '%...%'` sobre 29 mil linhas — leitura sequencial, sem
// índice — e agora roda uma vez por lead, no clique, por igualdade indexada.
//
// ── O QUE ELA FAZ ───────────────────────────────────────────────────────────
//
// É o "cadastro automático" da pauta de métricas: assim que a conversa entrega
// nome, telefone e município, o registro nasce — sem esperar o fim do
// atendimento, porque conversa que esfria no meio também é lead.
//
// A mensagem que o QR monta já diz "Vim pela indicação de FULANA", então dá
// para creditar o lead à liderança certa lendo o próprio texto. E como as
// pessoas mandam o município na mensagem seguinte, cada nova mensagem de quem
// já está na base completa o que falta, em vez de ser ignorada.

import { MUNICIPIOS_BA } from "@/lib/municipios-ba";

function soDigitos(v: string) {
  return (v || "").replace(/\D/g, "");
}

function chave(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** (55) 71 99999-9999 -> (71) 99999-9999, que é como a base guarda. */
export function formatarBR(waId: string) {
  let d = soDigitos(waId);
  if (d.startsWith("55")) d = d.slice(2);
  // Celular antigo às vezes chega sem o nono dígito.
  if (d.length === 10 && "6789".includes(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** "Oii Talita! Vim pela indicação de Maria Souza. 💙" -> "Maria Souza" */
export function nomeIndicado(texto: string): string | null {
  const m = texto.match(/indica[çc][ãa]o\s+de\s+([^.!?\n💙]+)/i);
  return m ? m[1].trim().slice(0, 80) : null;
}

// Índice dos 417 municípios pela forma normalizada, montado uma vez por
// instância — a busca acontece a cada mensagem recebida.
const MUNICIPIOS_POR_CHAVE = new Map(MUNICIPIOS_BA.map((n) => [chave(n), n]));

/**
 * Acha o município citado na mensagem.
 *
 * Prefere o nome mais comprido que couber: sem isso, "Barra do Choça" seria
 * reconhecido como "Barra", que é outro município a 500 km dali.
 */
export function acharMunicipio(texto: string): string | null {
  const t = chave(texto);
  if (!t) return null;
  let achado: string | null = null;
  for (const [k, nome] of MUNICIPIOS_POR_CHAVE) {
    if (k.length < 4) continue; // "Una", "Ipirá": curtos demais para casar solto
    if (!t.includes(k)) continue;
    if (!achado || nome.length > achado.length) achado = nome;
  }
  return achado;
}

/** "sou do bairro Tomba" / "bairro: Cajazeiras" -> "Tomba" / "Cajazeiras" */
export function acharBairro(texto: string): string | null {
  const m = texto.match(/bairro\s*(?:é|eh|:|-)?\s*([A-Za-zÀ-ÿ0-9'\s.]{3,40})/i);
  if (!m) return null;
  const bruto = m[1].split(/[,.\n;]/)[0].trim();
  if (!bruto) return null;
  return bruto
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (["de", "da", "do", "das", "dos", "e"].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
    .slice(0, 60);
}

export type Sugestao = {
  municipio: string | null;
  bairro: string | null;
  indicou: string | null;
};

/**
 * Lê a mensagem e devolve o que dá para propor. Função pura: nenhuma consulta,
 * nenhuma escrita — é o que permite chamá-la a cada mensagem sem custo.
 */
export function lerSugestoes(texto: string): Sugestao {
  const t = (texto ?? "").slice(0, 2000);
  const indicou = nomeIndicado(t);
  return {
    municipio: acharMunicipio(t),
    bairro: acharBairro(t),
    // Vírgula e parênteses quebram a sintaxe de filtro do PostgREST, e este
    // texto veio de alguém digitando.
    indicou: indicou ? indicou.replace(/[(),]/g, " ").trim().slice(0, 80) || null : null,
  };
}
