// Ler a agenda exportada de um celular (.vcf).
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// 28/09: a tela "Puxar agenda" lê o telefone pelo WhatsApp, e isso funcionou
// para o Pedro (704 números) e falhou para o Walter. O WhatsApp da conta dele
// já migrou para endereçamento por LID e entrega `27299030286568@lid` no lugar
// do número — em 2.000 contatos, nenhum telefone.
//
// Conferido antes de desistir: a Evolution tem uma tabela `IsOnWhatsapp` com
// 37 mil linhas e uma coluna chamada `lid`, mas ela guarda a palavra "lid"
// literalmente, e nenhum dos 2.000 LIDs do Walter está lá. Não há mapa.
//
// O caminho que sobra é o mais simples e o único que não depende do WhatsApp:
// a pessoa exporta a agenda do próprio celular e manda o arquivo.
//
//   iPhone   Contatos → seleciona tudo → Compartilhar → salva o .vcf
//   Android  Contatos → Ajustes → Exportar → .vcf
//
// Vantagens sobre o QR, além de funcionar sempre:
//
//   · traz TODOS os contatos, inclusive quem não tem WhatsApp
//   · não parea aparelho nenhum, então não há risco de banimento
//   · o dono não precisa estar junto na hora
//
// ── O QUE O FORMATO TEM DE ARMADILHA ────────────────────────────────────────
//
// vCard é de 1996 e cada aparelho exporta de um jeito. As três que quebram um
// leitor ingênuo:
//
//   1. DOBRA DE LINHA — linha longa é cortada e continuada na seguinte, que
//      começa com espaço ou tab. Ler linha a linha parte nomes no meio.
//   2. QUOTED-PRINTABLE — Android antigo escreve acento como =C3=A9, e a
//      dobra usa `=` no fim da linha. Sem decodificar, "José" vira "Jos=C3=A9".
//   3. VÁRIOS TELEFONES — casa, trabalho, celular. Todos entram: o cartão não
//      diz qual é o de WhatsApp, e descartar o errado perde gente.

export type ContatoVcf = { nome: string; telefone: string; tipo?: string };

/** Junta as linhas dobradas. Tem de vir antes de qualquer outra leitura. */
function desdobrar(texto: string): string[] {
  const cruas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const juntas: string[] = [];
  for (const l of cruas) {
    // Continuação por espaço/tab (RFC), ou por `=` no fim (quoted-printable).
    if (juntas.length && /^[ \t]/.test(l)) {
      juntas[juntas.length - 1] += l.slice(1);
    } else if (juntas.length && /=$/.test(juntas[juntas.length - 1])) {
      juntas[juntas.length - 1] = juntas[juntas.length - 1].slice(0, -1) + l.trimStart();
    } else {
      juntas.push(l);
    }
  }
  return juntas;
}

function decodificar(valor: string, parametros: string): string {
  if (!/quoted-printable/i.test(parametros)) return valor;
  try {
    const bytes = valor
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    // O texto veio como bytes UTF-8 disfarçados de caracteres; refaz a leitura.
    return new TextDecoder("utf-8").decode(
      Uint8Array.from(bytes, (ch) => ch.charCodeAt(0) & 0xff),
    );
  } catch {
    return valor;
  }
}

/**
 * Lê um arquivo .vcf inteiro.
 *
 * Um contato com três telefones vira três linhas — a deduplicação por número
 * acontece depois, na gravação, que é onde a regra de telefone já mora.
 */
export function lerVcf(texto: string): ContatoVcf[] {
  const linhas = desdobrar(texto);
  const saida: ContatoVcf[] = [];

  let nome = "";
  let sobrenome = "";
  let telefones: { numero: string; tipo: string }[] = [];

  const fechar = () => {
    // `FN` é o nome de exibição; `N` é a forma estruturada. Nem todo aparelho
    // exporta os dois, e alguns exportam FN vazio.
    const final = nome.trim() || sobrenome.trim();
    for (const t of telefones) saida.push({ nome: final, telefone: t.numero, tipo: t.tipo });
    nome = ""; sobrenome = ""; telefones = [];
  };

  for (const linha of linhas) {
    if (/^BEGIN:VCARD/i.test(linha)) { nome = ""; sobrenome = ""; telefones = []; continue; }
    if (/^END:VCARD/i.test(linha)) { fechar(); continue; }

    const corte = linha.indexOf(":");
    if (corte < 0) continue;
    const esquerda = linha.slice(0, corte);
    const valor = linha.slice(corte + 1);
    const campo = esquerda.split(";")[0].toUpperCase().replace(/^ITEM\d+\./, "");

    if (campo === "FN") {
      nome = decodificar(valor, esquerda);
    } else if (campo === "N" && !nome) {
      // `N` vem como Sobrenome;Nome;Meio;Prefixo;Sufixo
      const p = decodificar(valor, esquerda).split(";");
      sobrenome = [p[1], p[0]].filter(Boolean).join(" ").trim();
    } else if (campo === "TEL") {
      const numero = valor.replace(/[^\d+]/g, "");
      if (numero) {
        const tipo = (esquerda.match(/TYPE=([A-Za-z]+)/i)?.[1] ?? "").toLowerCase();
        telefones.push({ numero, tipo });
      }
    }
  }
  // Arquivo sem END:VCARD no fim (acontece em exportação truncada).
  if (telefones.length) fechar();

  return saida;
}
