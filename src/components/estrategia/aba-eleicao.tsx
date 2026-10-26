"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, FlaskConical, Repeat, Scale, Trophy } from "lucide-react";
import { distribuirCadeiras } from "@/lib/quociente";
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
  candidatosPorAgremiacao: Record<string, number[]>;
};

export function AbaEleicao({
  raioX,
  onEscolher,
  ufMapa,
}: {
  raioX: RaioXCandidato;
  onEscolher: (c: CandidatoBusca) => void;
  /** Estado do mapa (para o presidente, cuja votação é do Brasil todo). */
  ufMapa: string;
}) {
  const c = raioX.candidato;
  return CARGOS_PROPORCIONAIS.has(c.cargo) ? (
    <Proporcional raioX={raioX} onEscolher={onEscolher} />
  ) : (
    <Majoritaria raioX={raioX} onEscolher={onEscolher} ufMapa={ufMapa} />
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
      <div className="xl:col-span-12">
        <Simulador q={q} />
      </div>
    </div>
  );
}

// ── SIMULADOR DE CHAPA ──────────────────────────────────────────────────────
//
// "E se estes partidos tivessem concorrido juntos (federação)?" Junta os
// votos e os candidatos das agremiações marcadas e redistribui as cadeiras
// pela regra oficial (src/lib/quociente.ts). Antes de qualquer "e se", a tela
// confere se a regra reproduz o resultado oficial sem mudança nenhuma — se não
// reproduz, avisa, porque a simulação partiria de uma base errada.

function Simulador({ q }: { q: Quociente }) {
  const [juntar, setJuntar] = useState<string[]>([]);

  const resultado = useMemo(() => {
    const original = q.agremiacoes.map((a) => ({ nome: a.nome, votos: a.votos, candidatos: q.candidatosPorAgremiacao[a.nome] ?? [] }));
    const base = distribuirCadeiras({ vagas: q.vagas, validos: q.validos, agremiacoes: original });
    const confere = q.agremiacoes.every((a) => (base.get(a.nome) ?? 0) === a.cadeiras);
    if (juntar.length < 2) return { confere, linhas: null };
    const nomeJunto = juntar.join(" + ");
    const agrupadas = [
      {
        nome: nomeJunto,
        votos: original.filter((a) => juntar.includes(a.nome)).reduce((s, a) => s + a.votos, 0),
        candidatos: original.filter((a) => juntar.includes(a.nome)).flatMap((a) => a.candidatos),
      },
      ...original.filter((a) => !juntar.includes(a.nome)),
    ];
    const sim = distribuirCadeiras({ vagas: q.vagas, validos: q.validos, agremiacoes: agrupadas });
    const oficial = (nome: string) =>
      nome === nomeJunto
        ? q.agremiacoes.filter((a) => juntar.includes(a.nome)).reduce((s, a) => s + a.cadeiras, 0)
        : (q.agremiacoes.find((a) => a.nome === nome)?.cadeiras ?? 0);
    const linhas = agrupadas
      .map((a) => ({ nome: a.nome, votos: a.votos, oficial: oficial(a.nome), simulado: sim.get(a.nome) ?? 0 }))
      .filter((l) => l.oficial || l.simulado)
      .sort((a, b) => b.simulado - a.simulado || b.votos - a.votos);
    return { confere, linhas };
  }, [q, juntar]);

  const alternar = (nome: string) => setJuntar((j) => (j.includes(nome) ? j.filter((x) => x !== nome) : [...j, nome]));

  return (
    <div className={CAIXA}>
      <Titulo
        icone={<FlaskConical size={13} />}
        sobre="Simulador de chapa"
        titulo="E se estes partidos tivessem concorrido juntos?"
        nota="Marque dois ou mais partidos ou federações. A soma dos votos e dos candidatos passa pela regra oficial de distribuição das cadeiras."
      />
      <p className={`mb-3 rounded-lg px-3 py-2 text-[11.5px] ${resultado.confere ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {resultado.confere
          ? "Conferência: sem juntar ninguém, a regra reproduz exatamente as cadeiras oficiais desta eleição."
          : "Atenção: sem juntar ninguém, a regra não reproduz as cadeiras oficiais desta eleição (empate ou decisão judicial). Use a simulação com cautela."}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {q.agremiacoes
          .filter((a) => a.votos > 0)
          .map((a) => {
            const marcado = juntar.includes(a.nome);
            return (
              <button
                key={a.nome}
                onClick={() => alternar(a.nome)}
                aria-pressed={marcado}
                className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition ${
                  marcado ? "border-blue-300 bg-blue-50 text-blue-700" : "border-tinta-200 text-tinta-700 hover:bg-tinta-50"
                }`}
              >
                {a.nome} <span className="font-normal text-tinta-500">({a.cadeiras})</span>
              </button>
            );
          })}
      </div>
      {resultado.linhas && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[460px] text-[12px]">
            <thead>
              <tr className="border-b border-tinta-100 text-left text-[10.5px] font-bold uppercase tracking-wider text-tinta-500">
                <th className="py-2 pr-2">Partido / federação</th>
                <th className="py-2 pr-2 text-right">Votos</th>
                <th className="py-2 pr-2 text-right">Cadeiras oficiais</th>
                <th className="py-2 pr-2 text-right">Simuladas</th>
                <th className="py-2 text-right">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((l) => {
                const dif = l.simulado - l.oficial;
                return (
                  <tr key={l.nome} className={`border-b border-tinta-100 ${l.nome.includes(" + ") ? "bg-blue-50" : ""}`}>
                    <td className="py-2 pr-2 font-semibold text-tinta-800">{l.nome}</td>
                    <td className="tabular py-2 pr-2 text-right text-tinta-600">{fmt(l.votos)}</td>
                    <td className="tabular py-2 pr-2 text-right text-tinta-700">{l.oficial}</td>
                    <td className="tabular py-2 pr-2 text-right font-bold text-tinta-900">{l.simulado}</td>
                    <td className={`tabular py-2 text-right font-bold ${dif > 0 ? "text-emerald-700" : dif < 0 ? "text-rose-700" : "text-tinta-400"}`}>
                      {dif > 0 ? `+${dif}` : dif || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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

function Majoritaria({ raioX, onEscolher, ufMapa }: { raioX: RaioXCandidato; onEscolher: (c: CandidatoBusca) => void; ufMapa: string }) {
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

  const finalistas = candidatos.filter((x) => x.segundo_turno);

  return (
    <div className="space-y-4">
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
                <SeloResultado situacao={x.situacao} segundo={x.segundo_turno} />
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
    {finalistas.length === 2 && <SegundoTurno finalistas={finalistas} ufMapa={ufMapa} presidente={c.cargo === "PRESIDENTE"} onEscolher={onEscolher} />}
    </div>
  );
}

// ── DO 1º PARA O 2º TURNO ───────────────────────────────────────────────────
//
// Os dois finalistas, cidade a cidade: quanto cada um ganhou entre as voltas.
// É de onde vieram os votos que decidiram a eleição — o eleitor de quem ficou
// pelo caminho no 1º turno escolhendo um lado.

type Volta = { municipio: string; t1: number; t2: number; ganho: number };

function SegundoTurno({
  finalistas,
  ufMapa,
  presidente,
  onEscolher,
}: {
  finalistas: Candidato[];
  ufMapa: string;
  presidente: boolean;
  onEscolher: (c: CandidatoBusca) => void;
}) {
  const ids = finalistas.flatMap((f) => [f.id, f.segundo_turno!.id]);
  const chave = `${ids.join(",")}|${ufMapa}`;
  const [dados, setDados] = useState<{ chave: string; r: (RaioXCandidato | null)[] } | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all(
      ids.map((id) =>
        fetch(`/api/eleicao?candidatoId=${id}${presidente ? `&uf=${ufMapa}` : ""}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((r) => vivo && setDados({ chave, r }));
    return () => {
      vivo = false;
    };
    // ids muda de identidade a cada render; a chave resume o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const r = dados?.chave === chave ? dados.r : null;
  if (!r) return <div className={CAIXA}><Carregando linhas={4} /></div>;

  const lados = finalistas.map((f, i) => {
    const t1 = r[i * 2]?.votos_por_municipio ?? {};
    const t2 = r[i * 2 + 1]?.votos_por_municipio ?? {};
    const cidades: Volta[] = [...new Set([...Object.keys(t1), ...Object.keys(t2)])].map((m) => ({
      municipio: m,
      t1: t1[m] ?? 0,
      t2: t2[m] ?? 0,
      ganho: (t2[m] ?? 0) - (t1[m] ?? 0),
    }));
    const soma = (k: "t1" | "t2") => cidades.reduce((s, x) => s + x[k], 0);
    return { f, cidades, total1: soma("t1"), total2: soma("t2") };
  });
  if (lados.some((l) => !l.cidades.length)) return null;

  // Cidades que mudaram de vencedor entre as voltas.
  const virou = lados[0].cidades
    .map((a) => {
      const b = lados[1].cidades.find((x) => x.municipio === a.municipio);
      if (!b) return null;
      const v1 = a.t1 === b.t1 ? null : a.t1 > b.t1 ? 0 : 1;
      const v2 = a.t2 === b.t2 ? null : a.t2 > b.t2 ? 0 : 1;
      return v1 !== null && v2 !== null && v1 !== v2 ? { municipio: a.municipio, para: v2 } : null;
    })
    .filter((x): x is { municipio: string; para: number } => !!x);

  return (
    <div className={CAIXA}>
      <Titulo
        icone={<Repeat size={13} />}
        sobre={`Do 1º para o 2º turno${presidente ? ` · em ${ufMapa}` : ""}`}
        titulo={`${lados[0].f.nome_urna} × ${lados[1].f.nome_urna}`}
        nota={`${virou.length} ${virou.length === 1 ? "cidade mudou" : "cidades mudaram"} de vencedor entre as voltas.`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {lados.map(({ f, cidades, total1, total2 }, i) => (
          <div key={f.id} className="min-w-0">
            <button onClick={() => onEscolher(f)} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl p-1.5 text-left hover:bg-tinta-50">
              <FotoUrna src={f.foto_url} nome={f.nome_urna} tamanho={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold text-tinta-900">{f.nome_urna}</span>
                <SeloResultado situacao={f.situacao} segundo={f.segundo_turno} />
              </span>
            </button>
            <p className="mt-2 text-[12.5px] text-tinta-700">
              <b className="tabular">{fmt(total1)}</b> → <b className="tabular">{fmt(total2)}</b> votos{" "}
              <span className={total2 >= total1 ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>
                ({total2 >= total1 ? "+" : ""}
                {fmt(total2 - total1)})
              </span>
            </p>
            <p className="mb-1.5 mt-3 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-tinta-500">
              <ArrowUpRight size={12} /> Onde mais ganhou
            </p>
            {[...cidades]
              .sort((a, b) => b.ganho - a.ganho)
              .slice(0, 8)
              .map((x) => (
                <div key={x.municipio} className="flex min-w-0 items-center gap-2 py-0.5 text-[12px]">
                  <span className="min-w-0 flex-1 truncate text-tinta-800">{x.municipio}</span>
                  <span className="tabular shrink-0 text-tinta-500">
                    {fmt(x.t1)} → {fmt(x.t2)}
                  </span>
                  <span className="tabular w-16 shrink-0 text-right font-bold text-emerald-700">+{fmt(x.ganho)}</span>
                </div>
              ))}
            {virou.filter((v) => v.para === i).length > 0 && (
              <p className="mt-2 text-[11.5px] text-tinta-600">
                Virou a seu favor:{" "}
                {virou
                  .filter((v) => v.para === i)
                  .slice(0, 6)
                  .map((v) => v.municipio)
                  .join(", ")}
                {virou.filter((v) => v.para === i).length > 6 ? "…" : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
