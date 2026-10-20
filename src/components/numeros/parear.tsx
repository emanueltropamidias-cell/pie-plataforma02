"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, X, Check, RotateCw, Link2 } from "lucide-react";

// Ler o QR de um número, sem sair do PIE.
//
// ── POR QUE ISTO NÃO É SÓ CONVENIÊNCIA ──────────────────────────────────────
//
// O painel da Evolution pede a chave da API para entrar — e essa chave manda
// mensagem pelo WhatsApp da campanha. Entregá-la a alguém para um gesto de dez
// segundos é entregar a operação inteira.
//
// E lá o webhook é um segundo passo, separado da criação. Esquecer não dá erro:
// o número conecta, recebe mensagem, e os leads somem em silêncio. Aqui os dois
// vão juntos — não existe o passo para esquecer.
//
// ── O QR VENCE ──────────────────────────────────────────────────────────────
//
// Ele dura menos de um minuto. Por isso a tela conta o tempo e pede outro
// sozinha: sem isso a pessoa aponta o celular para uma imagem morta, o WhatsApp
// diz "código inválido", e a conclusão é que o sistema está quebrado.

/** O QR da Evolution vence perto de 60s. Pedimos outro antes disso. */
const VIDA_DO_QR = 50;

export function Parear({
  instancia,
  apelido,
  conectado,
}: {
  instancia: string;
  apelido: string;
  conectado: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [imagem, setImagem] = useState<string | null>(null);
  const [pareamento, setPareamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resta, setResta] = useState(VIDA_DO_QR);
  const [pronto, setPronto] = useState(false);
  const pedindo = useRef(false);

  async function pedirQR() {
    if (pedindo.current) return;
    pedindo.current = true;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/whatsapp/parear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "qr", instancia }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.erro ?? "Não consegui pedir o código.");
        setImagem(null);
      } else {
        setImagem(j.imagem ?? null);
        setPareamento(j.pareamento ?? null);
        setResta(VIDA_DO_QR);
      }
    } catch {
      setErro("Falha de rede.");
    } finally {
      setCarregando(false);
      pedindo.current = false;
    }
  }

  // ── o relógio do QR, e a checagem de "já conectou?" ──────────────────────
  //
  // Um intervalo só cuida das duas coisas. Dois relógios separados desalinham,
  // e o resultado é pedir QR novo no instante em que a pessoa acabou de ler.
  //
  // A CONTA MORA NUM `ref`, e não no estado. `setState` com efeito colateral
  // dentro do atualizador roda DUAS VEZES no modo estrito do React — pediria
  // dois QR por vencimento, e o segundo invalidaria o primeiro no exato momento
  // em que a pessoa aponta o celular.
  const segundos = useRef(VIDA_DO_QR);

  useEffect(() => {
    if (!aberto || pronto) return;
    segundos.current = VIDA_DO_QR;

    const t = setInterval(() => {
      segundos.current -= 1;

      if (segundos.current <= 0) {
        segundos.current = VIDA_DO_QR;
        void pedirQR();
      }
      // De três em três, pergunta se já entrou. Mais frequente que isso é
      // bater no servidor sem necessidade; menos, e a tela demora a comemorar.
      else if (segundos.current % 3 === 0) {
        void conferir();
      }

      setResta(segundos.current);
    }, 1000);

    return () => clearInterval(t);
    // `pedirQR` e `conferir` são estáveis o bastante — recriá-las a cada render
    // reiniciaria o relógio e o QR nunca venceria.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, pronto]);

  async function conferir() {
    try {
      const r = await fetch(
        `/api/whatsapp/parear?i=${encodeURIComponent(instancia)}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      if (j?.estado === "open") {
        setPronto(true);
        setImagem(null);
        // A lista do servidor precisa recarregar para o selo virar "no ar".
        router.refresh();
      }
    } catch {
      /* sem rede: o próximo tique tenta de novo */
    }
  }

  function abrir() {
    setAberto(true);
    setPronto(false);
    setImagem(null);
    void pedirQR();
  }

  function fechar() {
    setAberto(false);
    setImagem(null);
    setErro(null);
    setPronto(false);
    router.refresh();
  }

  async function corrigirWebhook() {
    setCarregando(true);
    const r = await fetch("/api/whatsapp/parear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "webhook", instancia }),
    });
    const j = await r.json();
    setCarregando(false);
    setErro(r.ok ? null : (j?.erro ?? "Falhou."));
    if (r.ok) setErro("Webhook apontado para o PIE.");
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={abrir}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 transition-colors hover:border-tema hover:text-tema"
        >
          <QrCode size={13} strokeWidth={2.2} />
          {conectado ? "Reconectar" : "Ler o QR"}
        </button>
        <button
          onClick={corrigirWebhook}
          title="Reapontar o webhook deste número para o PIE"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-tinta-200 text-tinta-400 transition-colors hover:border-tinta-300 hover:text-tinta-700"
        >
          <Link2 size={13} />
        </button>
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta-900/50 p-4">
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-tinta-900">
                  {apelido}
                </h3>
                <p className="mt-0.5 text-[12px] text-tinta-500">
                  <code>{instancia}</code>
                </p>
              </div>
              <button
                onClick={fechar}
                aria-label="Fechar"
                className="text-tinta-300 hover:text-tinta-700"
              >
                <X size={19} />
              </button>
            </div>

            {pronto ? (
              <div className="mt-5 rounded-xl border border-[#cbe3d4] bg-[#f1f8f3] px-4 py-6 text-center">
                <Check
                  size={30}
                  strokeWidth={2.6}
                  className="mx-auto text-[#12703c]"
                />
                <p className="mt-2 text-[14px] font-bold text-[#12703c]">
                  Número conectado
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#12703c]">
                  As mensagens deste número já entram na caixa do PIE.
                </p>
                <button
                  onClick={fechar}
                  className="mt-3 h-9 rounded-lg bg-[#12703c] px-5 text-[13px] font-semibold text-white"
                >
                  Pronto
                </button>
              </div>
            ) : (
              <>
                <div className="mt-4 flex aspect-square items-center justify-center rounded-xl border border-tinta-200 bg-tinta-50 p-3">
                  {carregando && !imagem ? (
                    <p className="text-[12.5px] text-tinta-400">
                      preparando o código…
                    </p>
                  ) : imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagem}
                      alt="Código QR para conectar o WhatsApp"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <p className="px-4 text-center text-[12.5px] leading-relaxed text-tinta-400">
                      Sem código no momento.
                    </p>
                  )}
                </div>

                {erro && (
                  <p className="mt-2.5 rounded-lg bg-[#fdf1f1] px-3 py-2 text-[11.5px] leading-relaxed text-[#c02020]">
                    {erro}
                  </p>
                )}

                {pareamento && (
                  <p className="mt-2.5 rounded-lg bg-tinta-50 px-3 py-2 text-center text-[12px] text-tinta-600">
                    Ou digite o código{" "}
                    <b className="tracking-[0.14em]">{pareamento}</b> no celular
                  </p>
                )}

                <ol className="mt-3 space-y-1 text-[11.5px] leading-relaxed text-tinta-500">
                  <li>
                    <b>1.</b> No celular <b>deste número</b>, abra o WhatsApp
                  </li>
                  <li>
                    <b>2.</b> Menu → <b>Aparelhos conectados</b>
                  </li>
                  <li>
                    <b>3.</b> <b>Conectar um aparelho</b> e aponte para o código
                  </li>
                </ol>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11.5px] text-tinta-400">
                    Novo código em {resta}s
                  </span>
                  <button
                    onClick={() => void pedirQR()}
                    disabled={carregando}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-tema disabled:opacity-40"
                  >
                    <RotateCw size={12} />
                    Gerar agora
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
