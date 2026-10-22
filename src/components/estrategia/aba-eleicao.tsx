"use client";

import { useEffect, useState } from "react";
import { Scale, Trophy } from "lucide-react";
import { CARGOS_PROPORCIONAIS, ondeDisputa } from "@/lib/eleicao";
import { FotoUrna } from "@/components/estrategia/seletor-candidatos";
import type { CandidatoBusca, RaioXCandidato } from "@/components/estrategia/painel-estrategia-eleitoral";
import { Barra, CAIXA, Carregando, SemDado, SeloResultado, Titulo, fmt, pct, useExtra } from "./comum";

// A eleição em que o candidato aberto disputou — não só ele.
//
// Cargo proporcional (deputado, vereador): o quociente eleitoral, quanto cada
// partido ou federação fez, quantas cadeiras levou, e onde o candidato ficou
// dentro da própria chapa. É a pergunta de todo pré-candidato: "quantos votos
// eu preciso?". A resposta honesta depende da chapa, e é isso que a aba mostra.
//
// Cargo majoritário (prefeito, governador, senador, presidente): o ranking da
// disputa com a fatia de cada um.

type Candidato = CandidatoBusca & { total_votos: number };

type Quociente = {
  ue: string;
  cargo: string;
  vagas: number;
  validos: number;
  qe: number;
  minimoQp: number;
  minimoSobras: number;
  agremiacoes: { nome: string; partidos: string[]; votos: number; legenda: number; pct: number; qp: number; cadeiras: number; disputaSobras: boolean }[];
  chapa: {
    nome: string;
    posicao: number;
    candidatos: number;
    eleitos: Candidato[];
    ultimoEleito: Candidato | null;
    primeiroSuplente: Candidato | null;
  };
  eleitos: Candidato[];
};

export function AbaEleicao({ raioX, onEscolher }: { raioX: RaioXCandidato; onEscolher: (c: CandidatoBusca) => void }) {
  const c = raioX.candidato;
  return CARGOS_PROPORCIONAIS.has(c.cargo) ? (
    <Proporcional raioX={raioX} onEscolher={onEscolher} />
  ) : (
    <Majoritaria raioX={raioX} onEscolher={onEscolher} />
  );
}

function LinhaCandidato({ c, onEscolher, extra }: { c: Candidato; onEscolher: (c: CandidatoBusca) => void; extra?: string }) {
  return (
    <button
      onClick={() => onEscolher(c)}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-tinta-50"
    >
      <FotoUrna src={c.foto_url} nome={c.nome_urna} tamanho={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold text-tinta-900">{c.nome_urna}</span>
        <span className="block truncate text-[11px] text-tinta-500">
          {c.partido_sigla} · {c.numero}
          {extra ? ` · ${extra}` : ""}
        </span>
      </span>
      <span className="tabular shrink-0 text-[12.5px] font-bold text-tinta-800">{fmt(c.total_votos)}</span>
    </button>
  );
}

function Proporcional({ raioX, onEscolher }: { raioX: RaioXCandidato; onEscolher: (c: CandidatoBusca) => void }) {
  const c = raioX.candidato;
  const q = useExtra<Quociente>(c.id, "quociente");
  if (q === undefined) return <div className={CAIXA}><Carregando linhas={5} /></div>;
  if (!q)
    return (
      <div className={CAIXA}>
        <SemDado>
          Os votos por partido e as vagas de {c.ano} em {ondeDisputa(c)} ainda não foram importados. Sem eles não dá
          para calcular o quociente — e a plataforma não estima.
        </SemDado>
      </div>
    );

  const votos = c.total_votos;
  const ultimo = q.chapa.ultimoEleito;
  const faltaUltimo = ultimo && ultimo.id !== c.id ? ultimo.total_votos - votos : null;
  const maiorAg = q.agremiacoes[0]?.votos ?? 1;

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className={`${CAIXA} xl:col-span-7`}>
        <Titulo
          icone={<Scale size={13} />}
          sobre={`Quociente eleitoral · ${q.ue} · ${c.ano}`}
          titulo={`${fmt(q.qe)} votos por cadeira`}
          nota={`${fmt(q.validos)} votos válidos ÷ ${q.vagas} vagas de ${q.cargo.toLowerCase()}. Partido ou federação abaixo de 80% do quociente (${fmt(q.qe * 0.8)}) não disputa as sobras.`}
        />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Mini rotulo="Vagas" valor={String(q.vagas)} />
          <Mini rotulo="Quociente" valor={fmt(q.qe)} />
          <Mini rotulo="Mínimo individual" valor={fmt(q.minimoQp)} nota="10% do QE, para vaga do QP" />
          <Mini rotulo="Mínimo nas sobras" valor={fmt(q.minimoSobras)} nota="20% do QE" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12px]">
            <thead>
              <tr className="border-b border-tinta-100 text-left text-[10.5px] font-bold uppercase tracking-wider text-tinta-500">
                <th className="py-2 pr-2">Partido / federação</th>
                <th className="py-2 pr-2 text-right">Votos</th>
                <th className="py-2 pr-2 text-right">% válidos</th>
                <th className="py-2 pr-2 text-right" title="Quociente partidário: votos ÷ QE">QP</th>
                <th className="py-2 text-right">Cadeiras</th>
              </tr>
            </thead>
            <tbody>
              {q.agremiacoes.map((a) => {
                const minha = a.nome === q.chapa.nome;
                return (
                  <tr key={a.nome} className={`border-b border-tinta-100 ${minha ? "bg-blue-50" : ""}`}>
                    <td className="py-2 pr-2">
                      <span className="block font-semibold text-tinta-800">{a.nome}</span>
                      {a.partidos.length > 1 && <span className="block text-[10.5px] text-tinta-500">{a.partidos.join(", ")}</span>}
                      <span className="mt-1 block w-32"><Barra valor={a.votos} maximo={maiorAg} /></span>
                    </td>
                    <td className="tabular py-2 pr-2 text-right font-semibold text-tinta-800">{fmt(a.votos)}</td>
                    <td className="tabular py-2 pr-2 text-right text-tinta-600">{pct(a.pct)}</td>
                    <td className="tabular py-2 pr-2 text-right text-tinta-600">
                      {a.qp}
                      {!a.disputaSobras && <span className="ml-1 text-[10px] text-tinta-400" title="Abaixo de 80% do QE">✕ sobras</span>}
                    </td>
                    <td className="tabular py-2 text-right font-bold text-tinta-900">{a.cadeiras}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-tinta-400">
          As cadeiras são as do resultado oficial do TSE (eleitos por quociente e por média), não uma simulação. QP é a
          parte inteira de votos ÷ quociente; a diferença entre QP e cadeiras são as vagas que vieram das sobras.
        </p>
      </div>

      <div className="space-y-4 xl:col-span-5">
        <div className={CAIXA}>
          <Titulo sobre="Dentro da chapa" titulo={`${c.nome_urna} em ${q.chapa.nome}`} />
          <div className="grid grid-cols-2 gap-2.5">
            <Mini rotulo="Posição na chapa" valor={`${q.chapa.posicao}º de ${q.chapa.candidatos}`} />
            <Mini rotulo="Cadeiras da chapa" valor={String(q.chapa.eleitos.length)} />
            <Mini
              rotulo="Do quociente"
              valor={q.qe ? pct((votos / q.qe) * 100, 0) : "—"}
              nota={votos >= q.minimoQp ? "passou do mínimo individual" : `faltaram ${fmt(q.minimoQp - votos)} para os 10%`}
            />
            <Mini
              rotulo={faltaUltimo !== null && faltaUltimo > 0 ? "Para o último eleito" : "Último eleito"}
              valor={faltaUltimo !== null && faltaUltimo > 0 ? `+${fmt(faltaUltimo)}` : ultimo ? fmt(ultimo.total_votos) : "—"}
              nota={ultimo ? `${ultimo.nome_urna} fechou a chapa` : "a chapa não elegeu ninguém"}
            />
          </div>
          {q.chapa.eleitos.length > 0 && (
            <div className="mt-3 space-y-0.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-tinta-500">Eleitos da chapa</p>
              {q.chapa.eleitos.map((e) => (
                <LinhaCandidato key={e.id} c={e} onEscolher={onEscolher} />
              ))}
            </div>
          )}
          {q.chapa.primeiroSuplente && (
            <div className="mt-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-tinta-500">1º suplente</p>
              <LinhaCandidato c={q.chapa.primeiroSuplente} onEscolher={onEscolher} />
            </div>
          )}
        </div>

        <div className={CAIXA}>
          <Titulo icone={<Trophy size={13} />} sobre="Todos os eleitos" titulo={`${q.eleitos.length} cadeiras de ${q.vagas}`} />
          <div className="max-h-[360px] space-y-0.5 overflow-y-auto pr-1">
            {q.eleitos.map((e) => (
              <LinhaCandidato key={e.id} c={e} onEscolher={onEscolher} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-tinta-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-tinta-500">{rotulo}</p>
      <p className="tabular mt-0.5 text-lg font-extrabold text-tinta-900">{valor}</p>
      {nota && <p className="text-[10.5px] leading-snug text-tinta-500">{nota}</p>}
    </div>
  );
}

function Majoritaria({ raioX, onEscolher }: { raioX: RaioXCandidato; onEscolher: (c: CandidatoBusca) => void }) {
  const c = raioX.candidato;
  const [lista, setLista] = useState<{ chave: string; candidatos: Candidato[] } | null>(null);
  const chave = `${c.ano}|${c.uf}|${c.cargo}|${c.nm_ue}`;

  useEffect(() => {
    let vivo = true;
    const p = new URLSearchParams({ lista: "1", ano: String(c.ano), uf: c.uf, cargo: c.cargo });
    const municipal = c.cargo === "PREFEITO";
    if (municipal && c.nm_ue) p.set("q", c.nm_ue);
    fetch(`/api/eleicao?${p}`)
      .then((r) => (r.ok ? r.json() : { candidatos: [] }))
      .then((j: { candidatos?: Candidato[] }) => {
        // A busca por cidade casa pedaço do nome ("SALVADOR" acha "SÃO
        // SALVADOR"): fica só quem disputou exatamente a mesma cidade.
        const todos = (j.candidatos ?? []).filter((x) => !municipal || x.nm_ue === c.nm_ue);
        if (vivo) setLista({ chave, candidatos: todos });
      })
      .catch(() => vivo && setLista({ chave, candidatos: [] }));
    return () => {
      vivo = false;
    };
  }, [chave, c.ano, c.uf, c.cargo, c.nm_ue]);

  const candidatos = lista?.chave === chave ? lista.candidatos : null;
  if (!candidatos) return <div className={CAIXA}><Carregando linhas={6} /></div>;

  // No majoritário não existe voto de legenda: os válidos do 1º turno são a
  // soma dos votos de todos os candidatos.
  const validos = candidatos.reduce((s, x) => s + x.total_votos, 0);
  const maior = candidatos[0]?.total_votos ?? 1;
  const segundoTurno = candidatos.some((x) => x.situacao === "2º TURNO");

  return (
    <div className={CAIXA}>
      <Titulo
        icone={<Trophy size={13} />}
        sobre={`${c.cargo.toLowerCase()} · ${ondeDisputa(c)} · ${c.ano} · 1º turno`}
        titulo={`${candidatos.length} candidatos · ${fmt(validos)} votos válidos`}
        nota={segundoTurno ? "A disputa foi ao 2º turno; o resultado final está no selo de cada candidato do 2º turno." : undefined}
      />
      <div className="space-y-1.5">
        {candidatos.map((x, i) => (
          <button
            key={x.id}
            onClick={() => onEscolher(x)}
            className={`flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition hover:bg-tinta-50 ${x.id === c.id ? "bg-blue-50" : ""}`}
          >
            <span className="tabular w-5 shrink-0 text-[11px] font-bold text-tinta-400">{i + 1}</span>
            <FotoUrna src={x.foto_url} nome={x.nome_urna} tamanho={40} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="truncate text-[12.5px] font-bold text-tinta-900">{x.nome_urna}</span>
                <SeloResultado situacao={x.situacao} />
              </span>
              <span className="mt-1 block"><Barra valor={x.total_votos} maximo={maior} /></span>
            </span>
            <span className="shrink-0 text-right">
              <span className="tabular block text-[12.5px] font-bold text-tinta-900">{validos ? pct((x.total_votos / validos) * 100) : "—"}</span>
              <span className="tabular block text-[11px] text-tinta-500">{fmt(x.total_votos)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
