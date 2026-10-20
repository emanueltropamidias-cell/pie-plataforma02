"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Gravar um recado de voz e mandar pelo WhatsApp.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// Metade do que chega na caixa é áudio: o eleitor manda voz porque é mais
// rápido que digitar, e porque muita gente escreve com dificuldade. A
// atendente respondia por escrito, e a conversa ficava torta — ele fala, ela
// escreve.
//
// A biblioteca de áudios já existia, mas é outra coisa: são as gravações da
// campanha, iguais para todo mundo. Aqui é a menina falando com aquela pessoa.
//
// ── MENSAGEM DE VOZ, E NÃO ARQUIVO ANEXADO ──────────────────────────────────
//
// A rota manda por `sendWhatsAppAudio`, que entrega a bolha com onda e play. O
// outro caminho da Evolution, `sendMedia`, entregaria um arquivo com nome e
// botão de baixar — que o eleitor não abre. A diferença não aparece no código
// daqui, mas aparece na tela de quem recebe.

/** Dois minutos. Recado de atendimento é curto; além disso vira monólogo. */
const TETO_SEG = 120;

type Fase = "parado" | "pedindo" | "gravando" | "revisando" | "enviando";

export function Gravar({
  conversaId,
  podeEnviar,
  aoEnviar,
}: {
  conversaId: number;
  /** Conversa encerrada ou sem dono não recebe áudio — mesma regra do texto. */
  podeEnviar: boolean;
  /** Deu certo: a lista de mensagens precisa recarregar. */
  aoEnviar: () => void;
}) {
  const supabase = createClient();
  const [fase, setFase] = useState<Fase>("parado");
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{ url: string; blob: Blob } | null>(null);

  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── SOLTAR O MICROFONE E O ENDEREÇO TEMPORÁRIO ────────────────────────────
  //
  // Sem parar as trilhas, a luzinha do microfone fica acesa depois de gravar —
  // e a atendente, com razão, acha que o PIE está ouvindo. Sem revogar a URL,
  // cada gravação descartada fica na memória do navegador até recarregar a
  // página.
  function soltar() {
    gravador.current?.stream.getTracks().forEach((t) => t.stop());
    gravador.current = null;
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
  }

  useEffect(() => {
    return () => {
      soltar();
      if (previa) URL.revokeObjectURL(previa.url);
    };
    // Só na saída do componente; `previa` entra pela referência do fecho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trocar de conversa no meio de uma gravação descarta — mandar para a pessoa
  // errada é pior que perder o recado.
  useEffect(() => {
    if (fase === "gravando" || fase === "revisando") descartar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId]);

  /**
   * O formato que ESTE navegador sabe gravar.
   *
   * Chrome no Android entrega `webm/opus`; Safari no iPhone só entrega `mp4`.
   * Pedir um formato que o aparelho não tem faz o `MediaRecorder` nascer mudo,
   * sem erro — grava zero byte e ninguém descobre por quê.
   */
  function formato(): string {
    for (const m of [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ]) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m))
        return m;
    }
    return "";
  }

  async function comecar() {
    setErro(null);
    setFase("pedindo");
    try {
      const trilha = await navigator.mediaDevices.getUserMedia({
        // O que o navegador tem de tratamento de voz. Recado gravado no meio da
        // rua, com o comício ao fundo, chega bem melhor com isso ligado.
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const tipo = formato();
      const g = new MediaRecorder(trilha, tipo ? { mimeType: tipo } : undefined);
      pedacos.current = [];
      g.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.current.push(e.data);
      };
      g.onstop = () => {
        const blob = new Blob(pedacos.current, {
          type: g.mimeType || "audio/webm",
        });
        soltar();
        if (blob.size === 0) {
          setErro("A gravação saiu vazia. Tente de novo.");
          setFase("parado");
          return;
        }
        setPrevia({ url: URL.createObjectURL(blob), blob });
        setFase("revisando");
      };
      gravador.current = g;
      g.start();
      setSegundos(0);
      setFase("gravando");
      relogio.current = setInterval(() => {
        setSegundos((s) => {
          // O teto para sozinho em vez de recusar depois de dois minutos
          // falando — descobrir o limite ao perder o recado é o pior jeito.
          if (s + 1 >= TETO_SEG) g.state === "recording" && g.stop();
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      soltar();
      setFase("parado");
      setErro(
        String(e).includes("NotAllowedError")
          ? "O navegador bloqueou o microfone. Libere o acesso e tente de novo."
          : "Não consegui abrir o microfone neste aparelho.",
      );
    }
  }

  function parar() {
    if (gravador.current?.state === "recording") gravador.current.stop();
  }

  function descartar() {
    soltar();
    if (previa) URL.revokeObjectURL(previa.url);
    setPrevia(null);
    setSegundos(0);
    setErro(null);
    setFase("parado");
  }

  async function enviar() {
    if (!previa) return;
    setFase("enviando");
    setErro(null);
    try {
      const mime = previa.blob.type.split(";")[0] || "audio/webm";

      // O arquivo sobe DIRETO do navegador para o balde, por endereço assinado
      // — o mesmo caminho do anexo. Passar o áudio pela rota gastaria o dobro
      // de rede e o tempo da função à toa.
      const r1 = await fetch("/api/atendimento/anexo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId,
          mime,
          bytes: previa.blob.size,
        }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.erro ?? "não consegui preparar o envio");

      const { error: erroSubida } = await supabase.storage
        .from("conversas")
        .uploadToSignedUrl(j1.caminho, j1.token, previa.blob, {
          contentType: mime,
        });
      if (erroSubida) throw new Error(erroSubida.message);

      const r2 = await fetch("/api/atendimento/enviar-midia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId,
          caminho: j1.caminho,
          tipo: "audio",
          mime,
        }),
      });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.erro ?? "o áudio não saiu");

      descartar();
      aoEnviar();
    } catch (e) {
      // A gravação NÃO é descartada quando o envio falha: refazer um recado de
      // dois minutos por causa de uma queda de rede é o tipo de coisa que faz a
      // atendente desistir da função.
      setFase("revisando");
      setErro(e instanceof Error ? e.message : "o áudio não saiu");
    }
  }

  const relogioTexto = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(
    segundos % 60,
  ).padStart(2, "0")}`;

  if (!podeEnviar) return null;

  return (
    <>
      {fase === "parado" && (
        <button
          type="button"
          onClick={comecar}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12.5px] font-semibold text-tinta-600 transition-colors hover:border-tema hover:text-tema"
        >
          <Mic size={15} />
          Gravar
        </button>
      )}

      {fase === "pedindo" && (
        <span className="flex h-9 items-center gap-1.5 px-2.5 text-[12.5px] text-tinta-500">
          <Loader2 size={15} className="animate-spin" />
          Abrindo o microfone…
        </span>
      )}

      {fase === "gravando" && (
        <div className="flex h-9 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-2.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-[12.5px] font-semibold text-red-700">
            {relogioTexto}
          </span>
          <button
            type="button"
            onClick={parar}
            className="flex items-center gap-1 text-[12.5px] font-semibold text-red-700 hover:text-red-900"
          >
            <Square size={13} />
            Parar
          </button>
        </div>
      )}

      {(fase === "revisando" || fase === "enviando") && previa && (
        <div className="flex h-9 items-center gap-2 rounded-lg border border-tema bg-white px-2">
          {/* OUVIR ANTES DE MANDAR. Recado de voz não tem como ser desfeito do
              outro lado, e gravação com barulho ou frase pela metade sai igual.
              O player nativo basta: é o que ela já conhece. */}
          <audio src={previa.url} controls className="h-7 max-w-[190px]" />
          <button
            type="button"
            onClick={enviar}
            disabled={fase === "enviando"}
            className="flex items-center gap-1 rounded-md bg-tema px-2 py-1 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {fase === "enviando" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            {fase === "enviando" ? "Enviando…" : "Enviar"}
          </button>
          <button
            type="button"
            onClick={descartar}
            disabled={fase === "enviando"}
            title="Descartar"
            className="text-tinta-400 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {erro && (
        <span className="text-[11.5px] font-medium text-red-600">{erro}</span>
      )}
    </>
  );
}
