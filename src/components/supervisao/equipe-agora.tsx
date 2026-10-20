"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { duracao, horasDesde } from "@/lib/conversa";

// A equipe agora — uma linha por atendente, contada no banco
// (`supervisao_equipe`, supabase/migrations/0032_supervisao_da_coordenadora.sql).
//
// É a tela da coordenadora. A pergunta dela não é "quantas conversas existem",
// é "quem está deixando gente esperando, e desde quando". Por isso a ordem é
// pelo que está parado, e a ação mora na própria linha: ver que a Fulana tem
// 90 sem resposta e ter de ir a outro lugar para resolver é o jeito de ninguém
// resolver.

export type MembroEquipe = {
  id: string;
  nome: string;
  papel: string | null;
  abertas: number;
  nao_atendidas: number;
  aguardando: number;
  espera_mais_antiga: string | null;
  chegaram_hoje: number;
  respondeu_hoje: number;
  enviadas_hoje: number;
  cadastros_hoje: number;
  classificou_hoje: number;
  ultima_atividade: string | null;
  chips: { apelido: string; conexao: string; caiu_em: string | null }[];
};

const n = (v: number) => v.toLocaleString("pt-BR");

/** Mandou mensagem na última hora = trabalhando agora. */
export const ativaAgora = (m: Pick<MembroEquipe, "ultima_atividade">) =>
  !!m.ultima_atividade && horasDesde(m.ultima_atividade) < 1;

function tomEspera(horas: number) {
  if (horas >= 24) return "text-[#c02020] font-bold";
  if (horas >= 4) return "text-[#a35a00] font-semibold";
  return "text-tinta-600";
}

export function EquipeAgora({ equipe }: { equipe: MembroEquipe[] }) {
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [soAtendentes, setSoAtendentes] = useState(true);

  // Quem não tem nada na mão e nada fez hoje (admin, conta de teste) só ocupa
  // linha. Fica atrás do "mostrar todos".
  const visiveis = equipe.filter(
    (m) => !soAtendentes || m.abertas > 0 || m.enviadas_hoje > 0 || m.chips.length > 0,
  );
  const ativas = equipe.filter(ativaAgora).length;

  return (
    <section className="min-w-0 rounded-xl border border-tinta-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tinta-100 px-4 py-2.5">
        <div>
          <h2 className="text-[14px] font-bold text-tinta-900">A equipe agora</h2>
          <p className="text-[11.5px] text-tinta-500">
            {n(ativas)} {ativas === 1 ? "pessoa mandou" : "pessoas mandaram"} mensagem na última hora. Números
            contados no banco; &ldquo;hoje&rdquo; é desde a meia-noite.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[11.5px] text-tinta-500">
          <input type="checkbox" checked={!soAtendentes} onChange={(e) => setSoAtendentes(!e.target.checked)} />
          mostrar quem não tem nada na mão
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="border-b border-tinta-100 text-[10px] font-bold uppercase tracking-[0.08em] text-tinta-400">
              <th className="px-4 py-2">Atendente</th>
              <th className="px-2 py-2 text-right" title="Conversas abertas com o nome dela">Na mão</th>
              <th className="px-2 py-2 text-right" title="Abertas em que ninguém respondeu nunca">Nunca respondidas</th>
              <th className="px-2 py-2 text-right" title="Abertas em que a pessoa falou por último">Aguardando retorno</th>
              <th className="px-2 py-2" title="Desde quando espera a pior delas">Espera mais antiga</th>
              <th className="px-2 py-2 text-right" title="Conversas em que ela mandou mensagem hoje">Atendeu hoje</th>
              <th className="px-2 py-2 text-right">Msgs hoje</th>
              <th className="px-2 py-2 text-right">Cadastros hoje</th>
              <th className="px-2 py-2 text-right" title="Conversas em que marcou status hoje">Classificou hoje</th>
              <th className="px-2 py-2">Última mensagem dela</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((m) => {
              const caido = m.chips.find((c) => c.conexao !== "open");
              const horasEspera = m.espera_mais_antiga ? horasDesde(m.espera_mais_antiga) : 0;
              return (
                <Fragment key={m.id}>
                  <tr className="border-b border-tinta-100 last:border-0 hover:bg-tinta-50">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          title={ativaAgora(m) ? "Mandou mensagem na última hora" : "Sem mensagem na última hora"}
                          style={{ background: ativaAgora(m) ? "#0f7a3d" : "#c8d0de" }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-tinta-900">{m.nome}</span>
                          {m.chips.length > 0 && (
                            <span className={`block truncate text-[10.5px] ${caido ? "font-semibold text-[#c02020]" : "text-tinta-400"}`}>
                              {caido
                                ? `chip ${caido.apelido} fora do ar${caido.caiu_em ? ` há ${duracao(horasDesde(caido.caiu_em))}` : ""}`
                                : `chip ${m.chips.map((c) => c.apelido).join(", ")}`}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="tabular px-2 py-2 text-right text-[13px] text-tinta-700">{n(m.abertas)}</td>
                    <td className={`tabular px-2 py-2 text-right text-[13px] ${m.nao_atendidas > 0 ? "font-bold text-[#c02020]" : "text-tinta-400"}`}>
                      {n(m.nao_atendidas)}
                    </td>
                    <td className={`tabular px-2 py-2 text-right text-[13px] ${m.aguardando > 0 ? "font-semibold text-[#a35a00]" : "text-tinta-400"}`}>
                      {n(m.aguardando)}
                    </td>
                    <td className={`tabular px-2 py-2 text-[12.5px] ${tomEspera(horasEspera)}`}>
                      {m.espera_mais_antiga ? duracao(horasEspera) : "—"}
                    </td>
                    <td className="tabular px-2 py-2 text-right text-[13px] text-tinta-700">{n(m.respondeu_hoje)}</td>
                    <td className="tabular px-2 py-2 text-right text-[13px] text-tinta-700">{n(m.enviadas_hoje)}</td>
                    <td className="tabular px-2 py-2 text-right text-[13px] text-tinta-700">{n(m.cadastros_hoje)}</td>
                    <td className="tabular px-2 py-2 text-right text-[13px] text-tinta-700">{n(m.classificou_hoje)}</td>
                    <td className="tabular px-2 py-2 text-[12px] text-tinta-500">
                      {m.ultima_atividade ? `há ${duracao(horasDesde(m.ultima_atividade))}` : "nunca"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {m.nao_atendidas + m.aguardando > 0 && (
                        <button
                          onClick={() => setAbrindo(abrindo === m.id ? null : m.id)}
                          className="rounded-md border border-tinta-200 px-2.5 py-1 text-[11.5px] font-semibold text-tinta-600 hover:border-tema hover:text-tema"
                        >
                          Redistribuir
                        </button>
                      )}
                    </td>
                  </tr>
                  {abrindo === m.id && (
                    <tr className="border-b border-tinta-100 bg-tinta-50">
                      <td colSpan={11} className="px-4 py-3">
                        <Redistribuir de={m} equipe={equipe} aoTerminar={() => setAbrindo(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const HORAS = [
  { v: 0, r: "todas" },
  { v: 4, r: "há mais de 4 h" },
  { v: 12, r: "há mais de 12 h" },
  { v: 24, r: "há mais de 24 h" },
  { v: 48, r: "há mais de 2 dias" },
];

/**
 * Tira da mão de uma atendente as conversas paradas — as nunca respondidas e as
 * em que a pessoa falou por último — e devolve para a fila ou passa para outra.
 *
 * Conversa que está andando (a atendente falou por último) não sai: o banco
 * aplica a mesma regra (`supervisao_esquecidas` + `p_so_sem_resposta`), então a
 * contagem mostrada é a que vai ser movida.
 */
function Redistribuir({
  de,
  equipe,
  aoTerminar,
}: {
  de: MembroEquipe;
  equipe: MembroEquipe[];
  aoTerminar: () => void;
}) {
  const router = useRouter();
  const [horas, setHoras] = useState(24);
  const [para, setPara] = useState("");
  const [ids, setIds] = useState<number[] | null>(null);
  const [contandoHoras, setContandoHoras] = useState<number | null>(null);
  const [movendo, setMovendo] = useState(false);
  const [resultado, setResultado] = useState("");
  const [erro, setErro] = useState("");

  async function contar(h: number) {
    setHoras(h);
    setContandoHoras(h);
    setIds(null);
    const { data, error } = await createClient().rpc("supervisao_esquecidas", { p_atendente: de.id, p_horas: h });
    setContandoHoras(null);
    if (error) return setErro(error.message);
    setIds((data ?? []) as number[]);
  }

  // Conta na primeira abertura, com as 24 h de partida.
  useEffect(() => {
    let vivo = true;
    createClient()
      .rpc("supervisao_esquecidas", { p_atendente: de.id, p_horas: 24 })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) setErro(error.message);
        else setIds((data ?? []) as number[]);
      });
    return () => {
      vivo = false;
    };
  }, [de.id]);

  async function mover() {
    if (!ids?.length) return;
    setMovendo(true);
    setErro("");
    const { data, error } = await createClient().rpc("supervisao_mover", {
      p_conversas: ids,
      p_para: para || null,
      p_so_sem_resposta: true,
    });
    setMovendo(false);
    if (error) return setErro(error.message);
    const r = data as { movidas: number; ficaram: number; para: string | null };
    setResultado(
      `${n(r.movidas)} ${r.movidas === 1 ? "conversa saiu" : "conversas saíram"} de ${de.nome} ${
        r.para ? `para ${r.para}` : "para a fila"
      }.${
        r.ficaram > 0
          ? ` ${n(r.ficaram)} já respondidas ficaram com ela: sem dona não aparecem em caixa nenhuma — passe essas para uma pessoa.`
          : ""
      }`,
    );
    router.refresh();
    if (!r.ficaram) setTimeout(aoTerminar, 2500);
  }

  if (resultado) return <p className="text-[12.5px] font-semibold text-[#12703c]">{resultado}</p>;

  const outras = equipe.filter((m) => m.id !== de.id);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-tinta-700">
      <span>Tirar de <b>{de.nome}</b> as paradas</span>
      <select
        value={horas}
        onChange={(e) => contar(Number(e.target.value))}
        className="h-8 rounded-md border border-tinta-200 bg-white px-2 text-[12.5px]"
      >
        {HORAS.map((h) => (
          <option key={h.v} value={h.v}>
            {h.r}
          </option>
        ))}
      </select>
      <span>e passar para</span>
      <select
        value={para}
        onChange={(e) => setPara(e.target.value)}
        className="h-8 rounded-md border border-tinta-200 bg-white px-2 text-[12.5px]"
      >
        <option value="">a fila (só as nunca respondidas)</option>
        {outras.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome} — {n(m.nao_atendidas + m.aguardando)} paradas
          </option>
        ))}
      </select>
      <button
        onClick={mover}
        disabled={movendo || !ids?.length}
        className="h-8 rounded-md bg-tema px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
      >
        {contandoHoras !== null
          ? "contando…"
          : movendo
            ? "movendo…"
            : ids?.length
              ? `Mover ${n(ids.length)}`
              : "Nenhuma nesse prazo"}
      </button>
      <button onClick={aoTerminar} className="text-[12px] text-tinta-400 underline underline-offset-2">
        cancelar
      </button>
      {erro && <span className="text-[12px] text-red-700">{erro}</span>}
      <p className="w-full text-[11px] text-tinta-400">
        Só saem as nunca respondidas e as em que a pessoa falou por último. Conversa andando fica com ela. Cada mudança
        fica registrada com o nome de quem fez.
      </p>
    </div>
  );
}
