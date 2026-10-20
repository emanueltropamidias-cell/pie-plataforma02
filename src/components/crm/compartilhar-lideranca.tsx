"use client";

import { useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { linkWhatsApp } from "@/lib/whatsapp";
import { CANDIDATO, MARCA } from "@/lib/candidato";

const SITE_URL = CANDIDATO.site;

function carregarImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function montarCard(qrCanvas: HTMLCanvasElement, nome: string): Promise<HTMLCanvasElement | null> {
  // O canvas desenha com a fonte que estiver pronta NA HORA. Sem esta espera,
  // um card gerado antes da Poppins carregar sai em Arial — e o erro só
  // aparece na imagem baixada, quando já foi para a rua.
  try {
    if (typeof document !== "undefined" && document.fonts) {
      await document.fonts.load("800 68px Poppins");
      await document.fonts.ready;
    }
  } catch {
    // Sem suporte a document.fonts: segue e desenha com o que houver.
  }

  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  const [bg, logo] = await Promise.all([
    carregarImg(MARCA.capa),
    carregarImg(MARCA.branca),
  ]);

  const escala = Math.max(W / bg.width, H / bg.height);
  const bw = bg.width * escala;
  const bh = bg.height * escala;
  ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "rgba(5,37,247,0.55)");
  grad.addColorStop(1, "rgba(7,12,48,0.9)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // A logo entra limitada pela ALTURA, e não pela largura.
  //
  // Ela já foi uma faixa baixa (1135 × 274) e virou um bloco alto (1148 × 689,
  // com "DEPUTADA FEDERAL" em cima e o 1022 embaixo). Como a largura estava
  // fixa em 300, a arte nova cresceu para baixo — de 72 para 180 px de altura —
  // e foi parar em cima do "Venha fazer parte", que tem posição fixa logo
  // abaixo. Limitando a altura, trocar a arte de novo não empurra nada.
  const LOGO_ALT = 148;
  const LOGO_LARG = 320;
  const k = Math.min(LOGO_LARG / logo.width, LOGO_ALT / logo.height);
  const lw = logo.width * k;
  const lh = logo.height * k;
  ctx.drawImage(logo, (W - lw) / 2, 64, lw, lh);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  // Duas linhas: a frase inteira não cabe na largura do card no tamanho em
  // que ela é lida de longe, e o card é visto de longe.
  ctx.font = "800 68px 'Poppins', Arial, sans-serif";
  ctx.fillText("Venha fazer parte", W / 2, 300);
  ctx.fillText("do time!", W / 2, 376);
  ctx.font = "600 34px 'Poppins', Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("Aponte a câmera e fale no WhatsApp", W / 2, 432);

  const cw = 640;
  const ch = 745;
  const cx = (W - cw) / 2;
  const cy = 478;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, cx, cy, cw, ch, 44);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.drawImage(qrCanvas, cx + (cw - 500) / 2, cy + 70, 500, 500);

  ctx.fillStyle = "#0d1326";
  ctx.font = "700 34px 'Poppins', Arial, sans-serif";
  ctx.fillText("Fale comigo no WhatsApp", W / 2, cy + 630);

  // O card é de alguém. Assinar resolve duas coisas: dá rosto ao convite e
  // deixa claro, no impresso, de quem é aquele QR quando há vários na mesa.
  ctx.fillStyle = "#5b6478";
  ctx.font = "500 28px 'Poppins', Arial, sans-serif";
  ctx.fillText(nome ? `Indicação de ${nome}` : "é rápido e é pelo WhatsApp", W / 2, cy + 674);

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "600 36px 'Poppins', Arial, sans-serif";
  ctx.fillText("Talita Oliveira · Bahia", W / 2, H - 70);

  return cv;
}

export function CompartilharLideranca({
  linkCode,
  nome,
  mensagemQr,
  aberto,
  onOpenChange,
}: {
  linkCode: string;
  nome: string;
  /**
   * A frase própria desta liderança, quando houver.
   *
   * Ela precisa chegar ATÉ AQUI, e não ser buscada na página do QR: este QR
   * NÃO passa pela nossa página — vai direto para o WhatsApp, com a frase
   * gravada dentro do desenho. Mudar o site não muda um QR já impresso.
   */
  mensagemQr?: string | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [gerandoCard, setGerandoCard] = useState(false);
  const qrCardRef = useRef<HTMLDivElement>(null);
  const link = `${SITE_URL}/c/${linkCode}`;

  // QR IMPRESSO vai DIRETO para o WhatsApp, sem passar pela nossa página.
  // Motivo de campo: plano pré-pago libera WhatsApp fora da franquia, mas não
  // abre site — quem está sem dados chegava a uma página em branco e se perdia.
  // A origem continua identificada porque o nome de quem indicou vai na mensagem.
  // A frase própria vence a padrão. Sem isto, o QR de um coletivo sairia com
  // "vim pela indicação de FULANA" gravado dentro — e reimprimir material é a
  // única correção possível depois.
  const linkWhats = linkWhatsApp(nome, mensagemQr ?? undefined);

  function copiar() {
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  const nomeArquivo = (nome || "lideranca").replace(/\s+/g, "-").toLowerCase();

  // Compartilha (celular) ou baixa (PC) uma imagem
  async function compartilharImagem(dataUrl: string, filename: string) {
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: "image/png" });
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: link });
        return;
      }
    } catch {
      // cai no download
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  // QR sozinho (com margem branca pra escanear)
  function qrDataUrl() {
    const qr = qrCardRef.current?.querySelector("canvas");
    if (!qr) return "";
    const pad = 48;
    const cv = document.createElement("canvas");
    cv.width = qr.width + pad * 2;
    cv.height = qr.height + pad * 2;
    const ctx = cv.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(qr, pad, pad);
    return cv.toDataURL("image/png");
  }

  async function acaoLink() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: link });
        return;
      } catch {
        // cancelou ou não suportado → copia
      }
    }
    copiar();
  }

  const acaoQR = () => compartilharImagem(qrDataUrl(), `qr-${nomeArquivo}.png`);

  // Gera o card só quando o usuário pede (evita travar a abertura do modal)
  async function acaoCard() {
    const qrCanvas = qrCardRef.current?.querySelector("canvas");
    if (!qrCanvas) return;
    setGerandoCard(true);
    const cv = await montarCard(qrCanvas, nome);
    setGerandoCard(false);
    if (cv) await compartilharImagem(cv.toDataURL("image/png"), `card-${nomeArquivo}.png`);
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de indicação</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-tinta-500">
            Compartilhe o link/QR de <b className="text-tinta-800">{nome}</b>. Quem tocar
            cai no <b className="text-tinta-800">WhatsApp do atendimento</b>, e o contato
            fica creditado a ela.
          </p>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-[12px] text-amber-800">
            <b>QR impresso</b> abre o WhatsApp direto — funciona mesmo com o celular sem
            internet. O <b>link copiado</b> passa pela plataforma e conta o acesso.
          </p>

          <div className="rounded-xl border border-tinta-200 bg-white p-3">
            {linkCode ? <QRCodeSVG value={linkWhats} size={180} /> : <p className="text-sm text-tinta-400">sem código</p>}
          </div>

          <div className="flex w-full gap-2">
            <input
              readOnly
              value={link}
              className="h-10 flex-1 rounded-md border border-tinta-200 bg-tinta-50 px-3 text-[13px] text-tinta-600"
            />
            <Button type="button" variant="outline" onClick={copiar}>
              {copiado ? "✓ Copiado" : "Copiar"}
            </Button>
          </div>

          <div className="grid w-full grid-cols-3 gap-2">
            <button
              type="button"
              onClick={acaoLink}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-tinta-200 bg-white py-3 text-[12px] font-semibold text-tinta-700 transition-colors hover:bg-tinta-50"
            >
              <span className="text-lg">🔗</span>
              Link
            </button>
            <button
              type="button"
              onClick={acaoQR}
              disabled={!linkCode}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-tinta-200 bg-white py-3 text-[12px] font-semibold text-tinta-700 transition-colors hover:bg-tinta-50 disabled:opacity-50"
            >
              <span className="text-lg">📷</span>
              QR Code
            </button>
            <button
              type="button"
              onClick={acaoCard}
              disabled={!linkCode || gerandoCard}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border border-tinta-200 bg-white py-3 text-[12px] font-semibold text-tinta-700 transition-colors hover:bg-tinta-50 disabled:opacity-50"
            >
              <span className="text-lg">🎨</span>
              {gerandoCard ? "..." : "Card"}
            </button>
          </div>
          <p className="text-center text-[11px] text-tinta-400">
            No celular abre o compartilhar; no PC copia o link / baixa a imagem.
          </p>
        </div>

        {/* QR em alta resolução (escondido) só pra montar o card */}
        <div ref={qrCardRef} className="pointer-events-none absolute -z-10 opacity-0">
          {linkCode && <QRCodeCanvas value={linkWhats} size={560} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
