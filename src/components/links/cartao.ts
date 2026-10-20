// O card que a liderança compartilha: a arte da dobradinha com o QR em cima.
//
// ── POR QUE IMAGEM, E NÃO LINK ──────────────────────────────────────────────
//
// Link no status do WhatsApp não aparece — vira texto pequeno que ninguém
// clica. Imagem ocupa a tela inteira, e a pessoa aponta a câmera de outro
// celular para o QR. É assim que material de campanha circula de verdade.
//
// ── POR QUE O QR VAI EM CIMA DE UMA CAIXA BRANCA ────────────────────────────
//
// QR precisa de contraste para a câmera achar. Desenhado direto sobre a foto,
// ele funciona no computador e falha no comício à noite, com a tela suja e a
// mão tremendo. A caixa branca com margem é o que faz a leitura ser instantânea
// — e leitura que falha duas vezes é gente que desiste.

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, falhou) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => ok(i);
    i.onerror = () => falhou(new Error(`não carregou: ${src}`));
    i.src = src;
  });
}

function caixaArredondada(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function montarCartao(
  qrCanvas: HTMLCanvasElement,
  arteUrl: string | null,
  rodape: string,
): Promise<HTMLCanvasElement | null> {
  // 1080x1920 é o tamanho do STATUS do WhatsApp e do story do Instagram — que é
  // por onde este card circula. Gerar em 1080x1350 faria o WhatsApp cortar em
  // cima e embaixo, e o corte cai justamente no QR.
  const W = 1080;
  const H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0525f7";
  ctx.fillRect(0, 0, W, H);

  if (arteUrl) {
    try {
      const arte = await carregarImg(arteUrl);
      // COBRE, e não estica: arte de proporção diferente ficaria com as pessoas
      // achatadas, e é foto de candidato — deformar é pior que cortar.
      const escala = Math.max(W / arte.width, H / arte.height);
      const aw = arte.width * escala;
      const ah = arte.height * escala;
      ctx.drawImage(arte, (W - aw) / 2, (H - ah) / 2, aw, ah);
    } catch {
      // Sem a arte o card ainda serve: QR sobre o azul da campanha.
    }
  }

  // ── O QR, EMBAIXO ─────────────────────────────────────────────────────────
  //
  // Embaixo e não no meio: a arte tem os rostos no centro, e o QR por cima
  // deles cobre justamente o que faz a pessoa parar para olhar.
  const lado = 460;
  const pad = 34;
  const cx = (W - (lado + pad * 2)) / 2;
  const cy = H - (lado + pad * 2) - 150;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#ffffff";
  caixaArredondada(ctx, cx, cy, lado + pad * 2, lado + pad * 2, 40);
  ctx.fill();
  ctx.restore();

  ctx.drawImage(qrCanvas, cx + pad, cy + pad, lado, lado);

  // ── O ENDEREÇO ESCRITO, EMBAIXO DO QR ─────────────────────────────────────
  //
  // Quando a câmera não pega — e não pega, à noite, com tela riscada — é ele
  // que salva. Fundo escuro atrás porque a arte pode ser clara e o texto
  // sumiria.
  const ty = cy + lado + pad * 2 + 20;
  ctx.font = "600 34px Poppins, system-ui, sans-serif";
  ctx.textAlign = "center";
  const larg = ctx.measureText(rodape).width + 48;
  ctx.fillStyle = "rgba(7,12,48,0.82)";
  caixaArredondada(ctx, (W - larg) / 2, ty, larg, 64, 32);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(rodape, W / 2, ty + 43);

  return cv;
}
