// O formato do telefone, num lugar só.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// Telefone é a chave da base. É por ele que a conversa acha a pessoa, que o
// cadastro descobre duplicata, que o placar credita a indicação e que a mídia
// chega. Telefone torto não dá erro em lugar nenhum — ele cria uma segunda
// pessoa, e as duas vivem lado a lado para sempre.
//
// Havia TRÊS telas escrevendo telefone na mesma base com três regras
// diferentes: o cadastro manual pedia 10 ou 11 dígitos, a ficha da liderança
// aceitava qualquer coisa, e a tela de leads também. Regra escrita em três
// lugares sempre desencontra — então agora é uma só, aqui.
//
// ── O FORMATO ───────────────────────────────────────────────────────────────
//
//     71 9 9999-9999
//
// DDD com dois dígitos, o 9 do celular, e oito dígitos. Onze no total.
//
// ── POR QUE O 9 É OBRIGATÓRIO ───────────────────────────────────────────────
//
// Celular no Brasil tem nove dígitos desde 2013. Um número de dez dígitos hoje
// é fixo — e fixo não recebe WhatsApp, que é por onde esta campanha inteira
// fala. Cadastrar um fixo é cadastrar alguém com quem ninguém vai conseguir
// falar, e isso só se descobre no dia em que a mensagem não entrega.
//
// EXCEÇÃO QUE NÃO PASSA POR AQUI: os números da própria campanha, em
// `numeros.tsx`. Conta antiga de WhatsApp pode ter JID de doze dígitos (55 +
// DDD + oito), e o WhatsApp entrega neles normalmente. Aquela tela tem regra
// própria de propósito.

/**
 * Os DDDs que existem no Brasil. O que não está aqui é erro de digitação.
 *
 * EXPORTADA porque a mesma lista estava escrita de novo em `agenda-wa.ts`, e
 * duas cópias da mesma lista sempre desencontram — bastava a Anatel criar um
 * DDD para a agenda aceitar o que o cadastro recusa, ou o contrário.
 */
export const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Só os dígitos, sem o 55 do Brasil se alguém colar com ele. */
export function soDigitos(bruto: string): string {
  const d = (bruto ?? "").replace(/\D/g, "");
  // Colar do WhatsApp traz "+55 71 9...". O 55 na frente de onze dígitos é o
  // código do país, não DDD — nenhum DDD começa com 5 seguido de 5.
  return d.length === 13 && d.startsWith("55") ? d.slice(2) : d;
}

/**
 * O telefone na forma canônica: DDD + número, sem o 55, com o 9º dígito.
 *
 * ── ISTO É O GÊMEO DE `public.fone_canonico` NO BANCO ───────────────────────
 *
 * As duas versões têm de dar o MESMO resultado, sempre. É a regra que decide
 * se dois cadastros são a mesma pessoa — e a coluna gerada
 * `bases_externas_pessoas.fone` já está guardada com o resultado da versão SQL.
 * Discordar aqui faria uma exportação apresentar como duas pessoas quem a base
 * conta como uma.
 *
 * `scripts/conferir-fone-canonico.mjs` roda as duas contra TODOS os telefones
 * do banco e falha se alguma linha divergir. Quem mexer numa das duas roda ele.
 *
 * ── POR QUE NÃO SERVE `soDigitos` ───────────────────────────────────────────
 *
 * Ele tira o 55 só de treze dígitos (fixo com DDI tem doze) e não acrescenta o
 * 9. São regras de campo de digitação, onde o número chega pela metade e
 * adivinhar atrapalha. Aqui o número já está guardado e completo.
 */
export function foneCanonico(bruto: string | null | undefined): string {
  const d = (bruto ?? "").replace(/\D/g, "");
  // 12 é fixo com DDI (55 + DDD + 8), 13 é celular com DDI (55 + DDD + 9).
  const n = (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;

  if (n.length === 11 && n[2] === "9") return n;
  // Dez dígitos começando o número local em 6, 7, 8 ou 9: celular anterior ao
  // nono dígito que a Anatel acrescentou. De 2 a 5 é fixo, e fixo não ganha 9.
  if (n.length === 10 && ["6", "7", "8", "9"].includes(n[2]))
    return n.slice(0, 2) + "9" + n.slice(2);
  return n;
}

/**
 * Escreve o que a pessoa digitou no formato `71 9 9999-9999`.
 *
 * Formata ENQUANTO se digita, e por isso precisa aceitar o número pela metade:
 * "71 9 9999" é um estado legítimo de quem ainda está digitando. Máscara que só
 * funciona no fim faz o campo dar pulo a cada tecla.
 */
export function formatarTelefone(bruto: string): string {
  const d = soDigitos(bruto).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length === 3) return `${d.slice(0, 2)} ${d[2]}`;
  if (d.length <= 7) return `${d.slice(0, 2)} ${d[2]} ${d.slice(3)}`;
  return `${d.slice(0, 2)} ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`;
}

/**
 * O que está errado no telefone — ou `null` quando está certo.
 *
 * Devolve a FRASE, e não um booleano, porque o que a atendente precisa na tela
 * é saber o que consertar. "Telefone inválido" faz ela apagar tudo e digitar de
 * novo igual; "falta um dígito" faz ela olhar o que digitou.
 */
export function problemaNoTelefone(bruto: string): string | null {
  const d = soDigitos(bruto);

  if (d.length === 0) return "Falta o telefone.";

  // ── FIXO ANTES DE "INCOMPLETO" ────────────────────────────────────────────
  //
  // Dez dígitos sem o 9 na terceira casa não é celular faltando um dígito — é
  // telefone FIXO, inteiro. Dizer "falta 1 dígito" para quem digitou um fixo
  // faz a atendente INVENTAR um dígito para o campo aceitar, e aí entra na base
  // um número que não existe. Pior que recusar: recusar ensinando errado.
  if (d.length === 10 && d[2] !== "9")
    return "Isso é um telefone fixo, e fixo não recebe WhatsApp. Peça o celular — 71 9 9999-9999.";

  if (d.length < 11) {
    const faltam = 11 - d.length;
    return `Telefone incompleto — ${faltam === 1 ? "falta 1 dígito" : `faltam ${faltam} dígitos`}. O formato é 71 9 9999-9999.`;
  }

  if (d.length > 11)
    return "Telefone com dígito a mais. O formato é 71 9 9999-9999.";

  if (!DDDS.has(Number(d.slice(0, 2))))
    return `DDD ${d.slice(0, 2)} não existe. Confira os dois primeiros dígitos.`;

  // O 9 é o terceiro dígito. Sem ele são dez dígitos, que é telefone fixo — e
  // fixo não recebe WhatsApp.
  if (d[2] !== "9")
    return "Falta o 9 do celular. O formato é 71 9 9999-9999 — número fixo não recebe WhatsApp.";

  return null;
}

/** Atalho para quem só quer saber se pode salvar. */
export function telefoneValido(bruto: string): boolean {
  return problemaNoTelefone(bruto) === null;
}

/** O formato mostrado no campo vazio, para não repetir a string por aí. */
export const EXEMPLO_TELEFONE = "71 9 9999-9999";
