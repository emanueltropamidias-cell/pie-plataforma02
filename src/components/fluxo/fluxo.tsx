"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Power,
  FlaskConical,
  Radio,
  Plus,
  Trash2,
  Check,
  X,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// O roteiro que responde sozinho.
//
// ── ESTA TELA É PERIGOSA, E ELA DIZ ISSO ────────────────────────────────────
//
// O que se escreve aqui é enviado, em nome da campanha, para milhares de
// pessoas, no segundo em que elas escrevem. Não há como recolher.
//
// Por isso o desenho não esconde o estado: o modo fica no topo, grande, e o
// caminho para "no ar" passa obrigatoriamente por um teste com telefone de
// verdade. Um botão de ligar discreto ao lado de um formulário seria o mesmo
// que um interruptor sem etiqueta na sala de máquinas.

export type Passo = {
  id: number;
  ordem: number;
  titulo: string;
  mensagem: string | null;
  estagio: string;
  guarda_em: string | null;
};

export type Fluxo = {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  modo: string;
  telefones_teste: string[];
};

const GUARDA = [
  { v: "", label: "nada" },
  { v: "nome", label: "o nome" },
  { v: "municipio", label: "a cidade" },
  { v: "bairro", label: "o bairro" },
];

export function FluxoEditor({
  fluxo,
  passos,
  respondidasHoje,
}: {
  fluxo: Fluxo;
  passos: Passo[];
  /** Quantas conversas o robô já respondeu hoje. É a prova de que está vivo. */
  respondidasHoje: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);
  const [telefone, setTelefone] = useState("");

  const noAr = fluxo.ativo && fluxo.modo === "no-ar";
  const testando = fluxo.ativo && fluxo.modo === "rascunho";
  const semTeste = fluxo.telefones_teste.length === 0;

  async function mexer(campos: Partial<Fluxo>) {
    setErro(null);
    const { error } = await supabase
      .from("fluxos")
      .update(campos)
      .eq("id", fluxo.id);
    if (error) {
      setErro(error.message);
      return;
    }
    router.refresh();
  }

  async function salvarPasso(id: number, campos: Partial<Passo>) {
    setSalvando(id);
    const { error } = await supabase
      .from("fluxo_passos")
      .update(campos)
      .eq("id", id);
    setSalvando(null);
    if (error) {
      setErro(error.message);
      return;
    }
    router.refresh();
  }

  async function addTelefone() {
    const d = telefone.replace(/\D/g, "");
    if (d.length < 10) {
      setErro("Telefone incompleto. Use DDD + número.");
      return;
    }
    const com55 = d.startsWith("55") ? d : `55${d}`;
    await mexer({ telefones_teste: [...fluxo.telefones_teste, com55] });
    setTelefone("");
  }

  return (
    <div className="flex flex-col gap-5">
      {erro && (
        <p className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-3 py-2 text-[12.5px] text-[#c02020]">
          {erro}
        </p>
      )}

      {/* ── O ESTADO, GRANDE ────────────────────────────────────────────────
          Quem abre esta tela precisa saber em um relance se tem robô falando
          com eleitor agora. Enterrar isso num selo pequeno é como se descobre
          tarde demais. */}
      <div
        className={`rounded-xl border p-5 ${
          noAr
            ? "border-[#cbe3d4] bg-[#f1f8f3]"
            : testando
              ? "border-[#f0dcc0] bg-[#fdf6ea]"
              : "border-tinta-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className="flex items-center gap-2 text-[16px] font-bold"
              style={{
                color: noAr ? "#12703c" : testando ? "#a35a00" : "#52535c",
              }}
            >
              {noAr ? (
                <>
                  <Radio size={17} strokeWidth={2.3} />
                  No ar — respondendo todo mundo
                </>
              ) : testando ? (
                <>
                  <FlaskConical size={17} strokeWidth={2.3} />
                  Em teste — só os telefones da lista
                </>
              ) : (
                <>
                  <Power size={17} strokeWidth={2.3} />
                  Desligado
                </>
              )}
            </p>
            <p
              className="mt-1 text-[12.5px] leading-relaxed"
              style={{
                color: noAr ? "#12703c" : testando ? "#a35a00" : "#71727a",
              }}
            >
              {noAr
                ? `Cada lead novo recebe o roteiro no segundo em que escreve. ${respondidasHoje} conversas respondidas hoje.`
                : testando
                  ? `O robô só responde a ${fluxo.telefones_teste.length} ${fluxo.telefones_teste.length === 1 ? "telefone" : "telefones"}. Nenhum eleitor recebe nada.`
                  : "Ninguém recebe resposta automática. A fila espera a atendente."}
            </p>
          </div>

          {fluxo.ativo && (
            <button
              onClick={() => mexer({ ativo: false })}
              className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#c02020] px-4 text-[13px] font-bold text-white"
            >
              <Power size={15} strokeWidth={2.4} />
              Parar tudo
            </button>
          )}
        </div>

        {/* ── os dois caminhos de ligar ─────────────────────────────────── */}
        {!fluxo.ativo && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => mexer({ ativo: true, modo: "rascunho" })}
              disabled={semTeste}
              className="flex h-10 items-center gap-2 rounded-lg bg-tema px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              <FlaskConical size={15} />
              Ligar em teste
            </button>
            <button
              onClick={() => mexer({ ativo: true, modo: "no-ar" })}
              className="flex h-10 items-center gap-2 rounded-lg border border-tinta-300 px-4 text-[13px] font-semibold text-tinta-700 hover:border-tinta-400"
            >
              <Radio size={15} />
              Ligar para todo mundo
            </button>
          </div>
        )}

        {testando && (
          <button
            onClick={() => mexer({ modo: "no-ar" })}
            className="mt-4 flex h-10 items-center gap-2 rounded-lg bg-[#12703c] px-4 text-[13px] font-bold text-white"
          >
            <Radio size={15} />
            Funcionou — soltar para todo mundo
          </button>
        )}

        {semTeste && !fluxo.ativo && (
          <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-tinta-500">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            Adicione ao menos um telefone de teste abaixo para poder ligar em
            modo de teste.
          </p>
        )}
      </div>

      {/* ── telefones de teste ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-tinta-200 bg-white p-4">
        <h3 className="text-[13.5px] font-bold text-tinta-900">
          Telefones de teste
        </h3>
        <p className="mt-0.5 text-[12px] leading-relaxed text-tinta-500">
          Em modo de teste, o robô responde <b>só</b> a estes números. Use o seu
          e o de alguém da equipe — mande um &quot;oi&quot; do celular e veja o
          roteiro rodar com o tráfego ligado, sem eleitor nenhum receber nada.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {fluxo.telefones_teste.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1.5 rounded-md bg-tinta-100 py-1 pl-2.5 pr-1.5 text-[12px] font-semibold text-tinta-700"
            >
              {t}
              <button
                onClick={() =>
                  mexer({
                    telefones_teste: fluxo.telefones_teste.filter(
                      (x) => x !== t,
                    ),
                  })
                }
                aria-label={`Tirar ${t}`}
                className="text-tinta-400 hover:text-[#c02020]"
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {semTeste && (
            <span className="text-[12px] text-tinta-400">
              nenhum ainda
            </span>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTelefone()}
            placeholder="71 98888-1234"
            className="h-9 w-full max-w-[220px] rounded-md border border-tinta-200 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[13px]"
          />
          <button
            onClick={addTelefone}
            className="flex h-9 items-center gap-1.5 rounded-md border border-tinta-300 px-3 text-[13px] font-semibold text-tinta-700 hover:border-tema hover:text-tema"
          >
            <Plus size={14} />
            Adicionar
          </button>
        </div>
      </div>

      {/* ── os passos ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-tinta-900">O roteiro</h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-tinta-500">
            Uma mensagem por passo. A resposta da pessoa avança para o próximo —
            e o que ela responder pode ser guardado na ficha, como sugestão para
            a atendente confirmar.
          </p>
        </div>

        {passos.map((p) => (
          <PassoCartao
            key={p.id}
            passo={p}
            salvando={salvando === p.id}
            aoSalvar={(campos) => salvarPasso(p.id, campos)}
          />
        ))}
      </div>

      {/* ── o que o robô nunca faz ──────────────────────────────────────── */}
      <div className="rounded-xl border border-tinta-200 bg-tinta-50 p-4">
        <h3 className="text-[13px] font-bold text-tinta-900">
          O que o robô nunca faz
        </h3>
        <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-tinta-600">
          <li>
            <b>Não fala por cima da atendente.</b> Assim que uma pessoa da
            equipe escreve na conversa, o robô se cala ali para sempre.
          </li>
          <li>
            <b>Não começa conversa.</b> Só responde a quem escreveu primeiro —
            que é o que a lei eleitoral exige.
          </li>
          <li>
            <b>Não repete.</b> Duas mensagens no mesmo instante não viram duas
            respostas, e o roteiro só anda para frente.
          </li>
          <li>
            <b>Não escreve no cadastro.</b> O que a pessoa responde vira{" "}
            <i>sugestão</i> na ficha; quem confirma é a atendente.
          </li>
        </ul>
      </div>
    </div>
  );
}

function PassoCartao({
  passo,
  salvando,
  aoSalvar,
}: {
  passo: Passo;
  salvando: boolean;
  aoSalvar: (campos: Partial<Passo>) => void;
}) {
  const [mensagem, setMensagem] = useState(passo.mensagem ?? "");
  const [guarda, setGuarda] = useState(passo.guarda_em ?? "");
  const mudou = mensagem !== (passo.mensagem ?? "") || guarda !== (passo.guarda_em ?? "");

  return (
    <div className="rounded-xl border border-tinta-200 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-tema/10 text-[12px] font-bold text-tema">
          {passo.ordem}
        </span>
        <span className="text-[13.5px] font-bold text-tinta-900">
          {passo.titulo}
        </span>
      </div>

      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        rows={4}
        placeholder="Deixe vazio para o robô não falar neste passo."
        className="mt-3 w-full resize-y rounded-lg border border-tinta-200 px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-tema sm:text-[13.5px]"
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] text-tinta-400">
          <code className="rounded bg-tinta-100 px-1 py-px">{"{{nome}}"}</code>{" "}
          e{" "}
          <code className="rounded bg-tinta-100 px-1 py-px">
            {"{{municipio}}"}
          </code>{" "}
          são trocados pelo que a pessoa já disse.
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-tinta-500">
          <MessageSquare size={12} className="shrink-0" />
          Guardar a resposta em
          <select
            value={guarda}
            onChange={(e) => setGuarda(e.target.value)}
            className="h-7 rounded-md border border-tinta-200 bg-white px-1.5 text-[12px] font-semibold text-tinta-800 outline-none focus:border-tema"
          >
            {GUARDA.map((g) => (
              <option key={g.v} value={g.v}>
                {g.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      {mudou && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() =>
              aoSalvar({ mensagem, guarda_em: guarda || null })
            }
            disabled={salvando}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-tema px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            <Check size={13} />
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button
            onClick={() => {
              setMensagem(passo.mensagem ?? "");
              setGuarda(passo.guarda_em ?? "");
            }}
            className="h-8 rounded-lg px-2.5 text-[12.5px] text-tinta-500 hover:text-tinta-900"
          >
            Desfazer
          </button>
        </div>
      )}
    </div>
  );
}

export function SemFluxo() {
  return (
    <div className="rounded-xl border border-dashed border-tinta-300 bg-white/60 p-8 text-center">
      <Trash2 size={22} className="mx-auto text-tinta-300" />
      <p className="mt-2 text-[13.5px] font-semibold text-tinta-700">
        Nenhum roteiro criado
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-tinta-500">
        O roteiro de boas-vindas é escrito por candidato — a instalação não
        traz nenhum pronto, porque a mensagem é copy de campanha.
      </p>
    </div>
  );
}
