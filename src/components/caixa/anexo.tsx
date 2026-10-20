"use client";

import { useRef, useState } from "react";
import { Paperclip, X, Send, ImageIcon, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Mandar foto e vídeo.
//
// ── O ARQUIVO NÃO PASSA PELO SERVIDOR DA VERCEL ─────────────────────────────
//
// Ele vai do celular DIRETO para o balde do Supabase, com um endereço de escrita
// que a nossa rota assina e que vale poucos minutos. A função da Vercel recusa
// corpo acima de 4,5 MB e tem 10 segundos de vida — vídeo de celular estoura os
// dois. Assinando em vez de repassar, a função carrega um texto curto e o
// arquivo pesado nunca a toca.
//
// ── A FOTO É ENCOLHIDA ANTES DE SUBIR, E ISSO É O QUE MAIS IMPORTA ──────────
//
// Foto de celular sai com 3 a 8 MB e 4000 pixels de largura. O WhatsApp do outro
// lado vai reduzir de qualquer jeito — ninguém olha um lead em 4000px. Subir o
// original é pagar trinta segundos de rede móvel por pixel que será jogado fora
// no caminho.
//
// Reduzida para 1600px e qualidade 0,82, a mesma foto dá uns 250 KB: dez a
// trinta vezes menor, sem diferença visível na tela de quem recebe. Numa
// atendente com sinal ruim em Feira de Santana, é a diferença entre mandar e
// desistir de mandar.
//
// Vídeo NÃO é encolhido: comprimir vídeo no navegador exige recodificar, o que
// trava o aparelho por minutos. Ele vai como está, com teto de 16 MB — que é o
// limite do próprio WhatsApp.

/** 1600px no maior lado. Acima disso é resolução que o destino descarta. */
const LADO_MAXIMO = 1600;
/** A miniatura que a bolha desenha na hora, sem esperar link assinado. */
const LADO_PREVIA = 320;

type Escolhido = {
  arquivo: File | Blob;
  tipo: "imagem" | "video";
  mime: string;
  nome: string;
  /** Endereço local para desenhar a prévia. Precisa ser revogado depois. */
  espiada: string;
  /** base64 pequenininho, para gravar junto com a mensagem. */
  previa: string | null;
  bytes: number;
};

/** Desenha num canvas e devolve JPEG. Devolve `null` se o navegador recusar —
 *  aí o original sobe como está, que é melhor do que não mandar nada. */
function doCanvas(
  fonte: HTMLImageElement | HTMLVideoElement,
  larguraOriginal: number,
  alturaOriginal: number,
  lado: number,
  qualidade: number,
): Promise<Blob | null> {
  const escala = Math.min(1, lado / Math.max(larguraOriginal, alturaOriginal));
  const tela = document.createElement("canvas");
  tela.width = Math.round(larguraOriginal * escala);
  tela.height = Math.round(alturaOriginal * escala);
  const ctx = tela.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(fonte, 0, 0, tela.width, tela.height);
  return new Promise((ok) =>
    tela.toBlob((b) => ok(b), "image/jpeg", qualidade),
  );
}

function lerImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error("imagem ilegível"));
    img.src = URL.createObjectURL(arquivo);
  });
}

/** O primeiro quadro do vídeo, para servir de capa. Sem ele a bolha fica um
 *  retângulo cinza e a atendente não sabe se mandou o vídeo certo. */
function primeiroQuadro(arquivo: File): Promise<HTMLVideoElement | null> {
  return new Promise((ok) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    // Alguns navegadores só pintam o quadro depois de um seek; meio segundo
    // também evita a capa preta de vídeo que começa no escuro.
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    };
    v.onseeked = () => ok(v);
    v.onerror = () => ok(null);
    v.src = URL.createObjectURL(arquivo);
  });
}

async function comoBase64(b: Blob | null): Promise<string | null> {
  if (!b) return null;
  return new Promise((ok) => {
    const fr = new FileReader();
    fr.onload = () => ok(typeof fr.result === "string" ? fr.result : null);
    fr.onerror = () => ok(null);
    fr.readAsDataURL(b);
  });
}

export function Anexo({
  conversaId,
  podeEnviar,
  aoEnviar,
}: {
  conversaId: number;
  /** Conversa encerrada ou sem dono não recebe anexo — mesma regra do texto. */
  podeEnviar: boolean;
  /** Deu certo: a lista de mensagens precisa recarregar. */
  aoEnviar: () => void;
}) {
  const supabase = createClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<Escolhido | null>(null);
  const [legenda, setLegenda] = useState("");
  const [fase, setFase] = useState<"parado" | "preparando" | "enviando">(
    "parado",
  );
  const [erro, setErro] = useState<string | null>(null);

  function limpar() {
    if (item) URL.revokeObjectURL(item.espiada);
    setItem(null);
    setLegenda("");
    setErro(null);
    setFase("parado");
    if (entrada.current) entrada.current.value = "";
  }

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErro(null);
    setFase("preparando");

    try {
      const ehVideo = f.type.startsWith("video/");

      if (ehVideo) {
        if (f.size > 16 * 1024 * 1024) {
          setErro(
            `O vídeo tem ${(f.size / 1024 / 1024).toFixed(1)} MB. O WhatsApp aceita até 16 MB — grave um mais curto.`,
          );
          setFase("parado");
          if (entrada.current) entrada.current.value = "";
          return;
        }

        const v = await primeiroQuadro(f);
        const previa = v
          ? await comoBase64(
              await doCanvas(v, v.videoWidth, v.videoHeight, LADO_PREVIA, 0.5),
            )
          : null;

        setItem({
          arquivo: f,
          tipo: "video",
          mime: f.type || "video/mp4",
          nome: f.name || "video.mp4",
          espiada: URL.createObjectURL(f),
          previa,
          bytes: f.size,
        });
        setFase("parado");
        return;
      }

      // ── foto ────────────────────────────────────────────────────────────
      const img = await lerImagem(f);
      const menor = await doCanvas(
        img,
        img.naturalWidth,
        img.naturalHeight,
        LADO_MAXIMO,
        0.82,
      );
      const previa = await comoBase64(
        await doCanvas(
          img,
          img.naturalWidth,
          img.naturalHeight,
          LADO_PREVIA,
          0.5,
        ),
      );
      URL.revokeObjectURL(img.src);

      // Se encolher falhou, sobe o original. Um envio pesado é melhor do que um
      // botão que não faz nada.
      const usar = menor ?? f;
      const mime = menor ? "image/jpeg" : f.type || "image/jpeg";

      setItem({
        arquivo: usar,
        tipo: "imagem",
        mime,
        nome: menor ? "foto.jpg" : f.name || "foto.jpg",
        espiada: URL.createObjectURL(usar),
        previa,
        bytes: usar.size,
      });
      setFase("parado");
    } catch {
      setErro("Não consegui ler esse arquivo. Tente outro.");
      setFase("parado");
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function enviar() {
    if (!item) return;
    setFase("enviando");
    setErro(null);

    try {
      // 1. a permissão de escrita, com o teto conferido no servidor
      const r1 = await fetch("/api/atendimento/anexo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId,
          mime: item.mime,
          bytes: item.bytes,
        }),
      });
      const j1 = await r1.json();
      if (!r1.ok) {
        setErro(j1?.erro ?? "Não consegui liberar o envio.");
        setFase("parado");
        return;
      }

      // 2. o arquivo, direto do celular para o balde
      const { error: erroSubida } = await supabase.storage
        .from("conversas")
        .uploadToSignedUrl(j1.caminho, j1.token, item.arquivo, {
          contentType: item.mime,
        });

      if (erroSubida) {
        setErro(
          `A ${item.tipo === "video" ? "gravação" : "foto"} não subiu: ${erroSubida.message}`,
        );
        setFase("parado");
        return;
      }

      // 3. a Evolution busca no balde e manda pelo WhatsApp
      const r2 = await fetch("/api/atendimento/enviar-midia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId,
          caminho: j1.caminho,
          tipo: item.tipo,
          mime: item.mime,
          nomeArquivo: item.nome,
          legenda,
          previa: item.previa,
        }),
      });
      const j2 = await r2.json();
      if (!r2.ok) {
        setErro(j2?.erro ?? "O WhatsApp recusou o envio.");
        setFase("parado");
        return;
      }

      limpar();
      aoEnviar();
    } catch {
      setErro("Falha de rede. Tente de novo.");
      setFase("parado");
    }
  }

  return (
    <>
      <input
        ref={entrada}
        type="file"
        // Sem `capture`: com ele o celular abre a câmera direto e a atendente
        // perde o acesso à galeria, que é de onde sai a maioria das fotos.
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/3gpp"
        onChange={escolher}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={!podeEnviar || fase !== "parado"}
        aria-label="Mandar foto ou vídeo"
        title="Mandar foto ou vídeo"
        className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 transition-colors hover:border-tinta-300 hover:bg-tinta-100 hover:text-tinta-900 disabled:opacity-40"
      >
        <Paperclip size={16} />
        Anexo
      </button>

      {/* ── a prévia, antes de mandar ───────────────────────────────────────
          Ela existe porque anexo é o gesto que mais dá engano: a atendente
          escolhe da galeria, erra a foto por uma linha, e manda o documento de
          outro eleitor. Ver antes é o que evita isso — e depois de sair, não
          há como recolher. */}
      {(item || fase === "preparando" || erro) && (
        <div className="absolute inset-x-0 bottom-full z-30 mx-3 mb-2 rounded-xl border border-tinta-200 bg-white p-3 shadow-xl sm:mx-4">
          {erro && (
            <p className="mb-2 rounded-lg bg-[#fdf1f1] px-3 py-2 text-[12px] leading-snug text-[#c02020]">
              {erro}
            </p>
          )}

          {fase === "preparando" && !item && (
            <p className="py-3 text-center text-[12.5px] text-tinta-400">
              preparando o arquivo…
            </p>
          )}

          {item && (
            <>
              <div className="flex items-start gap-3">
                <div className="relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-lg bg-tinta-100">
                  {item.tipo === "imagem" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.espiada}
                      alt="A foto escolhida"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video
                      src={item.espiada}
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-tinta-900">
                    {item.tipo === "imagem" ? (
                      <ImageIcon size={13} className="shrink-0" />
                    ) : (
                      <Film size={13} className="shrink-0" />
                    )}
                    {item.tipo === "imagem" ? "Foto" : "Vídeo"}
                    <span className="font-normal text-tinta-400">
                      {(item.bytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </p>

                  <input
                    value={legenda}
                    onChange={(e) => setLegenda(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") enviar();
                    }}
                    placeholder="Legenda (opcional)"
                    className="mt-1.5 h-[34px] w-full rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[13px]"
                  />
                </div>

                <button
                  type="button"
                  onClick={limpar}
                  disabled={fase === "enviando"}
                  aria-label="Cancelar o anexo"
                  className="shrink-0 text-tinta-300 hover:text-tinta-700 disabled:opacity-40"
                >
                  <X size={17} />
                </button>
              </div>

              <button
                type="button"
                onClick={enviar}
                disabled={fase === "enviando"}
                className="mt-2.5 flex h-[38px] w-full items-center justify-center gap-2 rounded-lg bg-tema text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {fase === "enviando" ? (
                  "Enviando…"
                ) : (
                  <>
                    <Send size={14} />
                    Enviar {item.tipo === "imagem" ? "a foto" : "o vídeo"}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
