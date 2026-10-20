"use client";

import { useCallback, useEffect, useState } from "react";
import { Cabecalho, Cartao } from "@/components/ui/pagina";

// A conexão do WhatsApp, sem terminal.
//
// A sessão cai — queda de energia, atualização do aparelho, celular dias sem
// internet. Quando cair num sábado à noite, ninguém vai abrir SSH no servidor, e
// o atendimento fica parado até alguém abrir. Esta tela existe para o supervisor
// resolver sozinho, em dois cliques.

type Estado = {
  configurada: boolean;
  estado: string;
  instancia: string | null;
  erro?: string | null;
};

const COMO_ESTA: Record<
  string,
  { rotulo: string; nota: string; cor: string; fundo: string; borda: string }
> = {
  open: {
    rotulo: "Conectado",
    nota: "O WhatsApp está no ar. Mensagem que chegar entra na fila.",
    cor: "#12703c",
    fundo: "#f1f8f3",
    borda: "#cbe3d4",
  },
  connecting: {
    rotulo: "Esperando o QR",
    nota: "A instância está de pé e aguardando alguém parear o aparelho.",
    cor: "#a35a00",
    fundo: "#fdf6ea",
    borda: "#f0dcc0",
  },
  close: {
    rotulo: "Desconectado",
    nota: "Ninguém está recebendo mensagem. Gere o QR e leia com o celular do número.",
    cor: "#c02020",
    fundo: "#fdf1f1",
    borda: "#f3d3d3",
  },
  refused: {
    rotulo: "Recusado pelo WhatsApp",
    nota: "O WhatsApp recusou a conexão deste número. Não adianta gerar QR agora — fale com a coordenação antes de tentar de novo.",
    cor: "#c02020",
    fundo: "#fdf1f1",
    borda: "#f3d3d3",
  },
  "sem-configuracao": {
    rotulo: "Sem configuração",
    nota: "Faltam as variáveis da Evolution na Vercel. Enquanto isso, nada entra nem sai.",
    cor: "#52535c",
    fundo: "#f1f1f3",
    borda: "#d2d2d7",
  },
  erro: {
    rotulo: "Não consegui falar com o servidor",
    nota: "A Evolution não respondeu. Pode estar fora do ar, ou o endereço está errado.",
    cor: "#c02020",
    fundo: "#fdf1f1",
    borda: "#f3d3d3",
  },
};

export function Conexao({ inicial }: { inicial: Estado }) {
  const [estado, setEstado] = useState<Estado>(inicial);
  const [qr, setQr] = useState<string | null>(null);
  const [pareamento, setPareamento] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"qr" | "sair" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const ler = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/conexao", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.erro ?? "Sem permissão para ver a conexão.");
        return;
      }
      setEstado(j as Estado);
      // Conectou: o QR na tela vira lixo, e deixá-lo ali faz alguém tentar ler
      // um código que já não vale.
      if (j.estado === "open") setQr(null);
    } catch {
      setErro("Falha de rede.");
    }
  }, []);

  // O primeiro estado já veio do servidor; aqui só se mantém em dia. Enquanto o
  // QR está na tela a consulta é de perto — o pareamento acontece em segundos e
  // a pessoa precisa ver a confirmação sem recarregar.
  useEffect(() => {
    const t = setInterval(ler, qr ? 4000 : 20000);
    return () => clearInterval(t);
  }, [ler, qr]);

  async function acao(qual: "qr" | "desconectar") {
    setOcupado(qual === "qr" ? "qr" : "sair");
    setErro(null);
    try {
      const r = await fetch("/api/whatsapp/conexao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: qual }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.erro ?? "Não consegui.");
        return;
      }
      if (qual === "qr") {
        setQr(j.imagem ?? null);
        setPareamento(j.pareamento ?? null);
        if (!j.imagem && !j.pareamento) {
          setErro(
            "A Evolution não devolveu QR. Se o número já está conectado, desconecte antes.",
          );
        }
      } else {
        setQr(null);
        setPareamento(null);
      }
      await ler();
    } catch {
      setErro("Falha de rede.");
    } finally {
      setOcupado(null);
    }
  }

  const como = COMO_ESTA[estado.estado] ?? COMO_ESTA.erro;
  const conectado = estado.estado === "open";

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/atendimento"
        sobretitulo="Atendimento"
        titulo="Conexão do WhatsApp"
        descricao="O número que recebe e responde. Se ele cair, o atendimento para — e é aqui que se religa."
      />

      {erro && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {erro}
        </p>
      )}

      <div
        className="rounded-xl border px-5 py-4"
        style={{ background: como.fundo, borderColor: como.borda }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex items-center gap-2 text-[15px] font-bold"
            style={{ color: como.cor }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: como.cor }}
            />
            {como.rotulo}
          </span>
          {estado.instancia && (
            <span
              className="font-mono text-[11.5px]"
              style={{ color: como.cor, opacity: 0.75 }}
            >
              instância {estado.instancia}
            </span>
          )}
          <button
            onClick={ler}
            className="ml-auto text-[12px] font-semibold underline-offset-2 hover:underline"
            style={{ color: como.cor }}
          >
            atualizar
          </button>
        </div>
        <p
          className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed"
          style={{ color: como.cor }}
        >
          {como.nota}
        </p>
        {estado.erro && (
          <p
            className="mt-2 font-mono text-[11.5px]"
            style={{ color: como.cor, opacity: 0.8 }}
          >
            {estado.erro}
          </p>
        )}
      </div>

      {!conectado && estado.configurada && (
        <Cartao
          titulo="Parear o aparelho"
          descricao="Gere o código e leia com o celular do número da campanha."
        >
          <div className="flex flex-col items-center gap-4 px-5 py-6">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- é um data:
              // URI gerado na hora e trocado a cada poucos segundos; next/image
              // não tem o que otimizar e ainda atrasaria a troca.
              // O QR expira em segundos e a Evolution gera outro. Por isso o
              // botão continua ali embaixo: reler é o caminho normal, não erro.
              <img
                src={qr}
                alt="QR code para conectar o WhatsApp"
                className="h-[264px] w-[264px] rounded-xl border border-tinta-200 bg-white p-2"
              />
            ) : (
              <div className="flex h-[264px] w-[264px] items-center justify-center rounded-xl border border-dashed border-tinta-300 px-6 text-center text-[12.5px] leading-relaxed text-tinta-400">
                Clique em gerar para o código aparecer aqui
              </div>
            )}

            {pareamento && (
              <div className="text-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-tinta-400">
                  ou digite este código no celular
                </span>
                <p className="mt-1 font-mono text-[20px] font-bold tracking-[0.18em] text-tinta-900">
                  {pareamento}
                </p>
              </div>
            )}

            <button
              onClick={() => acao("qr")}
              disabled={ocupado !== null}
              className="h-10 rounded-[10px] bg-tema px-6 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
            >
              {ocupado === "qr"
                ? "Gerando…"
                : qr
                  ? "Gerar outro código"
                  : "Gerar QR code"}
            </button>

            <ol className="max-w-[46ch] list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-tinta-500">
              <li>Abra o WhatsApp no celular do número da campanha</li>
              <li>Toque em Configurações e depois em Aparelhos conectados</li>
              <li>Toque em Conectar um aparelho</li>
              <li>Aponte a câmera para o código acima</li>
            </ol>
          </div>
        </Cartao>
      )}

      {conectado && (
        <Cartao
          titulo="Desconectar"
          descricao="Só quando for trocar de número ou de aparelho."
        >
          <div className="flex flex-wrap items-center gap-4 px-5 py-4">
            <p className="min-w-[24ch] flex-1 text-[12.5px] leading-relaxed text-tinta-500">
              Desconectar{" "}
              <b className="text-tinta-800">para o atendimento na hora</b> —
              nenhuma mensagem entra ou sai até alguém ler o QR de novo. As
              conversas já gravadas continuam inteiras.
            </p>
            <button
              onClick={() => acao("desconectar")}
              disabled={ocupado !== null}
              className="h-9 rounded-[10px] border border-red-200 bg-red-50 px-4 text-[12.5px] font-semibold text-red-800 transition-opacity disabled:opacity-40"
            >
              {ocupado === "sair" ? "Desconectando…" : "Desconectar o número"}
            </button>
          </div>
        </Cartao>
      )}

      {!estado.configurada && (
        <Cartao
          titulo="O que falta"
          descricao="Estas quatro variáveis vivem no painel da Vercel."
        >
          <div className="px-5 py-4">
            <ul className="space-y-1.5 font-mono text-[12.5px] text-tinta-600">
              <li>EVOLUTION_URL</li>
              <li>EVOLUTION_API_KEY</li>
              <li>EVOLUTION_INSTANCIA</li>
              <li>EVOLUTION_WEBHOOK_SEGREDO</li>
            </ul>
            <p className="mt-3 max-w-[64ch] text-[12.5px] leading-relaxed text-tinta-500">
              Depois de criar, mande um redeploy: variável nova não entra em
              build que já existe.
            </p>
          </div>
        </Cartao>
      )}
    </div>
  );
}
