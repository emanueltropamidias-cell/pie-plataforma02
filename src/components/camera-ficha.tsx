"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DadosFicha = {
  nome: string;
  telefone: string;
  municipio: string;
  bairro: string;
  confianca: string;
  observacao: string;
};

// Abre a câmera do aparelho, captura um quadro e manda para a IA ler.
// A imagem não é salva em lugar nenhum: vira texto e é descartada.
export function CameraFicha({
  aberto,
  onFechar,
  onLido,
  continuar = false,
}: {
  aberto: boolean;
  onFechar: () => void;
  onLido: (dados: DadosFicha) => void;
  /** true = segue com a câmera aberta para ler a próxima ficha */
  continuar?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [lidas, setLidas] = useState(0);

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;

    (async () => {
      setErro("");
      setLidas(0);
      try {
        // facingMode "environment" = câmera traseira no celular.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        const nome = (e as { name?: string })?.name ?? "";
        setErro(
          nome === "NotAllowedError"
            ? "Permissão de câmera negada. Autorize no navegador e tente de novo."
            : nome === "NotFoundError"
              ? "Nenhuma câmera encontrada neste aparelho."
              : "Não foi possível abrir a câmera.",
        );
      }
    })();

    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [aberto]);

  async function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setErro("");
    setLendo(true);

    // Reduz para 1600px: acima disso não melhora a leitura e só encarece.
    const MAX = 1600;
    const escala = Math.min(1, MAX / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setLendo(false);
      return setErro("Navegador não conseguiu processar a imagem.");
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";

    try {
      const resp = await fetch("/api/leads/ler-foto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imagem: base64, tipo: "image/jpeg" }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        setErro(j?.erro ?? "Não foi possível ler a ficha.");
      } else if (!j.nome && !j.telefone) {
        setErro("Não consegui ler nada. Aproxime a ficha e evite sombra.");
      } else {
        onLido(j as DadosFicha);
        setLidas((n) => n + 1);
        if (!continuar) onFechar();
      }
    } catch {
      setErro("Falha de rede ao ler a ficha.");
    }
    setLendo(false);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-[13px] font-semibold">
          Aponte para a ficha
          {continuar && lidas > 0 && <span className="ml-2 text-white/60">· {lidas} lida(s)</span>}
        </span>
        <button onClick={onFechar} aria-label="Fechar" className="rounded-full p-1.5 hover:bg-white/10">
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* Moldura: ajuda a pessoa a enquadrar a ficha inteira */}
        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/50" />
      </div>

      {erro && (
        <p className="bg-red-600/90 px-4 py-2 text-center text-[13px] font-medium text-white">{erro}</p>
      )}

      <div className="flex items-center justify-center gap-3 bg-black px-4 py-5">
        <Button
          onClick={capturar}
          disabled={lendo}
          className="h-14 rounded-full px-8 text-[15px] font-bold"
        >
          <Camera size={18} /> {lendo ? "Lendo…" : "Capturar e ler"}
        </Button>
        {continuar && lidas > 0 && (
          <Button variant="outline" onClick={onFechar} className="h-14 rounded-full px-6">
            Concluir
          </Button>
        )}
      </div>
    </div>
  );
}
