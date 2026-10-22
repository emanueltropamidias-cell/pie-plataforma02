"use client";

import { useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import type { RaioXCandidato } from "@/components/estrategia/painel-estrategia-eleitoral";
import { CAIXA, Titulo } from "./comum";

// Perguntas em português sobre os dados (rota /api/eleicao/pergunta).
//
// A IA só cita número que uma consulta aos arquivos do TSE devolveu, e a tela
// mostra quais consultas ela fez — quem lê pode conferir de onde veio.

type Mensagem = { papel: "usuario" | "ia"; texto: string; consultas?: string[]; erro?: boolean };

export function AbaPerguntar({ raioX }: { raioX: RaioXCandidato }) {
  const c = raioX.candidato;
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const sugestoes = [
    `Em quais 5 cidades ${c.nome_urna} teve a maior fatia do eleitorado?`,
    c.cargo.startsWith("DEPUTADO") || c.cargo === "VEREADOR"
      ? `Quantos votos faltaram para ${c.nome_urna} se eleger?`
      : `Quem ficou em segundo nessa disputa e com quantos votos?`,
    `${c.nome_urna} já disputou outras eleições? Como foi?`,
    `Quanto ${c.nome_urna} gastou por voto?`,
  ];

  async function perguntar(p: string) {
    const pergunta = p.trim();
    if (!pergunta || pensando) return;
    const historico: Mensagem[] = [...mensagens.filter((m) => !m.erro), { papel: "usuario", texto: pergunta }];
    setMensagens([...mensagens, { papel: "usuario", texto: pergunta }]);
    setTexto("");
    setPensando(true);
    setTimeout(() => fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    try {
      const r = await fetch("/api/eleicao/pergunta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historico: historico.map(({ papel, texto }) => ({ papel, texto })),
          contexto: { id: c.id, nome: c.nome_urna, ano: c.ano, uf: c.uf, cargo: c.cargo },
        }),
      });
      const j = await r.json();
      setMensagens((m) => [
        ...m,
        r.ok ? { papel: "ia", texto: j.resposta, consultas: j.consultas } : { papel: "ia", texto: j.erro ?? "Não consegui responder agora.", erro: true },
      ]);
    } catch {
      setMensagens((m) => [...m, { papel: "ia", texto: "Falha de conexão. Tente de novo.", erro: true }]);
    } finally {
      setPensando(false);
      setTimeout(() => fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }

  return (
    <div className={CAIXA}>
      <Titulo
        icone={<Sparkles size={13} />}
        sobre="Perguntar aos dados"
        titulo="Pergunte em português"
        nota="A resposta usa só números calculados sobre os arquivos do TSE. Quando o dado não existe, ela diz que não tem."
      />

      {mensagens.length === 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {sugestoes.map((s) => (
            <button
              key={s}
              onClick={() => perguntar(s)}
              className="rounded-xl border border-tinta-200 p-3 text-left text-[12.5px] text-tinta-700 transition hover:border-tinta-300 hover:bg-tinta-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto">
        {mensagens.map((m, i) => (
          <div key={i} className={m.papel === "usuario" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                m.papel === "usuario"
                  ? "bg-tema text-white"
                  : m.erro
                    ? "bg-rose-50 text-rose-700"
                    : "bg-tinta-50 text-tinta-800"
              }`}
            >
              {m.texto}
              {!!m.consultas?.length && (
                <p className="mt-2 border-t border-tinta-200 pt-2 text-[11px] text-tinta-500">Consultou: {m.consultas.join(", ")}</p>
              )}
            </div>
          </div>
        ))}
        {pensando && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-tinta-50 px-4 py-3 text-[12.5px] text-tinta-500">
            <Sparkles size={14} className="animate-pulse text-tema" /> Consultando os dados…
          </div>
        )}
        <div ref={fim} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          perguntar(texto);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: Qual foi a abstenção em Feira de Santana em 2022?"
          className="h-11 min-w-0 flex-1 rounded-xl border border-tinta-200 bg-white px-3.5 text-[13px] outline-none focus:border-tema"
        />
        <button
          type="submit"
          disabled={pensando || !texto.trim()}
          aria-label="Enviar pergunta"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tema text-white transition disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
