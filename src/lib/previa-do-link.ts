import { NextResponse } from "next/server";
import { CANDIDATO, MARCA } from "@/lib/candidato";

// A prévia que o WhatsApp monta quando alguém manda o link do QR num grupo.
//
// ── O PROBLEMA ──────────────────────────────────────────────────────────────
//
// As rotas do QR respondem 302 na hora, porque quem escaneou está no meio da
// rua e cada segundo é gente desistindo. Só que o robô que monta o cartão de
// prévia também passa por ali — e num redirecionamento não existe OG nenhum.
//
// Resultado: o link da dobradinha Talita e Manassés chegava no grupo com a foto
// GENÉRICA do site e a descrição "Plataforma de Inteligência", que é o nome
// interno do sistema. Quem recebe não faz ideia do que isso quer dizer, e o
// material dos dois candidatos aparece sem os dois.
//
// ── POR QUE NÃO DÁ PARA SEPARAR ROBÔ DE GENTE PELO USER-AGENT ───────────────
//
// A primeira versão disto mandava HTML só para quem se identificasse como robô,
// e 302 para o resto. Não funcionou, e a razão é boa de saber:
//
// O WhatsApp monta a prévia NO CELULAR DE QUEM ENVIA, e em várias versões ele
// busca o link com user-agent de navegador comum — não se identifica. Caía no
// caminho de "pessoa", levava o 302, e o cartão saía sem título e sem imagem.
//
// Adivinhar quem é robô é uma corrida que não se ganha: cada aplicativo muda o
// que manda, e o defeito volta calado meses depois.
//
// ── ENTÃO TODO MUNDO RECEBE O MESMO HTML ────────────────────────────────────
//
// As marcas ficam no `<head>`, que é o que o robô lê. E o redirecionamento vai
// em DUAS formas, porque uma sozinha não cobre todo aparelho:
//
// O redirecionamento é SÓ por JavaScript, e isso é deliberado.
//
// A versão anterior tinha também um `meta refresh` — e o robô do Facebook, que
// é quem monta a prévia do WhatsApp, SEGUE meta refresh. Ele lia este HTML,
// obedecia o redirecionamento, ia parar no `api.whatsapp.com` e montava a
// prévia de lá. A arte nunca aparecia.
//
// Robô não executa JavaScript; navegador executa. É essa diferença — e não o
// user-agent — que separa os dois de forma confiável.
//
// `location.replace` em vez de `location.href` para não deixar esta página no
// histórico: assim o botão "voltar" não traz a pessoa de volta para cá.
//
// Num lugar só porque são DUAS rotas que compartilham link (`/l/slug` e
// `/l/slug/lider`), e prévia escrita em dois lugares desencontra no dia em que
// alguém mudar uma.

function escapar(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * O HTML que o robô de prévia recebe.
 *
 * `arte` é o caminho guardado no link. Quando não há arte, cai na capa da
 * campanha — melhor que retângulo cinza, que num grupo de WhatsApp faz o link
 * parecer suspeito.
 */
export function previaDoLink({
  slug,
  nome,
  temArte,
  caminho,
  destino,
}: {
  slug: string;
  nome?: string | null;
  temArte: boolean;
  /** O caminho público, tipo `dobradinha` ou `dobradinha/joao`. */
  caminho: string;
  /** Para onde a PESSOA vai — o WhatsApp da campanha. */
  destino: string;
}) {
  const site = CANDIDATO.site;
  const titulo = nome?.trim() || CANDIDATO.nome;
  // A arte é sempre a do MATERIAL, mesmo no link de uma liderança: quem
  // compartilha espalha a peça da campanha, não um cartão pessoal.
  const imagem = temArte ? `${site}/l/${slug}/arte` : `${site}${MARCA.capa}`;

  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escapar(titulo)}</title>
<meta name="description" content="Fale com a campanha pelo WhatsApp.">
<meta property="og:title" content="${escapar(titulo)}">
<meta property="og:description" content="Fale com a campanha pelo WhatsApp.">
<meta property="og:image" content="${imagem}">
<meta property="og:type" content="website">
<meta property="og:url" content="${site}/l/${escapar(caminho)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${imagem}">
<script>location.replace(${JSON.stringify(destino)})</script>
</head><body style="margin:0;background:#0525f7"><a href="${escapar(destino)}">Abrir conversa</a></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
