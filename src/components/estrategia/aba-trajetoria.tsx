"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, History } from "lucide-react";
import { ondeDisputa } from "@/lib/eleicao";
import { FotoUrna } from "@/components/estrategia/seletor-candidatos";
import type { CandidatoBusca, RaioXCandidato } from "@/components/estrategia/painel-estrategia-eleitoral";
import { CAIXA, Carregando, SemDado, SeloResultado, Titulo, fmt, pct, useExtra } from "./comum";

// O mesmo político em 2022, 2024 e 2026.
//
// A ligação é pelo título de eleitor, que o TSE publica nos três anos (o CPF
// some em 2024). Nome igual não liga ninguém: há dezenas de "JOSÉ DA SILVA".
//
// Entre duas candidaturas no mesmo estado, a aba mostra onde ele cresceu e
// onde perdeu voto, município a município. Cargo municipal x cargo estadual só
// se compara na cidade em que os dois existiram — o resto do estado não votou
// nele para vereador.

type Candidato = CandidatoBusca & { total_votos: number };

export function AbaTrajetoria({ raioX, onEscolher }: { raioX: RaioXCandidato; onEscolher: (c: CandidatoBusca) => void }) {
  const c = raioX.candidato;
  const lista = useExtra<Candidato[]>(c.id, "trajetoria");
  // Uma linha por ano: o 2º turno entra como detalhe do 1º.
  const porAno = useMemo(() => (lista ?? []).filter((x) => x.turno === 1 || !(lista ?? []).some((y) => y.ano === x.ano && y.turno === 1 && y.cargo === x.cargo)), [lista]);
  const anterior = useMemo(() => [...porAno].reverse().find((x) => x.ano < c.ano) ?? null, [porAno, c.ano]);

  if (lista === undefined) return <div className={CAIXA}><Carregando linhas={4} /></div>;
  if (lista === null)
    return (
      <div className={CAIXA}>
        <SemDado>A ligação entre candidaturas de anos diferentes ainda não foi gerada para {c.ano} em {c.uf}.</SemDado>
      </div>
    );

  const maior = Math.max(...porAno.map((x) => x.total_votos), 1);

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className={`${CAIXA} xl:col-span-5`}>
        <Titulo
          icone={<History size={13} />}
          sobre="Trajetória"
          titulo={porAno.length > 1 ? `${porAno.length} eleições disputadas` : "Primeira eleição nos dados"}
          nota="Candidaturas de 2022, 2024 e 2026 ligadas pelo título de eleitor."
        />
        <ol className="relative space-y-2 border-l border-tinta-200 pl-4">
          {porAno.map((x) => (
            <li key={x.id} className="relative">
              <span className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full ${x.id === c.id ? "bg-tema" : "bg-tinta-300"}`} />
              <button
                onClick={() => onEscolher(x)}
                className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-2.5 text-left transition ${x.id === c.id ? "border-blue-300 bg-blue-50" : "border-tinta-200 hover:bg-tinta-50"}`}
              >
                <FotoUrna src={x.foto_url} nome={x.nome_urna} tamanho={44} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-tinta-500">{x.ano} · {x.cargo.toLowerCase()} · {ondeDisputa(x)}</span>
                  <span className="block truncate text-[12.5px] font-bold text-tinta-900">{x.nome_urna} <span className="font-medium text-tinta-500">({x.partido_sigla})</span></span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SeloResultado situacao={x.situacao} />
                    {lista.some((y) => y.ano === x.ano && y.turno === 2 && y.cargo === x.cargo) && (
                      <span className="text-[10.5px] font-semibold text-tinta-500">teve 2º turno</span>
                    )}
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-tinta-100">
                    <span className="block h-full rounded-full bg-tema" style={{ width: `${Math.max(2, (x.total_votos / maior) * 100)}%` }} />
                  </span>
                </span>
                <span className="tabular shrink-0 text-[13px] font-extrabold text-tinta-900">{fmt(x.total_votos)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="xl:col-span-7">
        {anterior ? (
          <Evolucao atual={raioX} anterior={anterior} />
        ) : (
          <div className={CAIXA}>
            <SemDado>
              {porAno.length > 1
                ? "Esta é a candidatura mais antiga nos dados. Abra uma das mais recentes para ver onde ganhou e perdeu voto desde aqui."
                : "Não há outra candidatura desta pessoa em 2022, 2024 ou 2026 para comparar."}
            </SemDado>
          </div>
        )}
      </div>
    </div>
  );
}

function Evolucao({ atual, anterior }: { atual: RaioXCandidato; anterior: Candidato }) {
  const [antes, setAntes] = useState<{ id: number; r: RaioXCandidato | null } | null>(null);
  const ufMapa = atual.candidato.uf === "BR" ? undefined : atual.candidato.uf;

  useEffect(() => {
    let vivo = true;
    const p = new URLSearchParams({ candidatoId: String(anterior.id) });
    if (ufMapa) p.set("uf", ufMapa);
    fetch(`/api/eleicao?${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => vivo && setAntes({ id: anterior.id, r: r?.candidato ? r : null }))
      .catch(() => vivo && setAntes({ id: anterior.id, r: null }));
    return () => {
      vivo = false;
    };
  }, [anterior.id, ufMapa]);

  const r = antes?.id === anterior.id ? antes.r : undefined;
  const linhas = useMemo(() => {
    if (!r) return [];
    const a = r.votos_por_municipio;
    const b = atual.votos_por_municipio;
    // Cargo municipal em um dos dois: só a cidade dele entra na conta.
    const municipal = (cargo: string) => cargo === "VEREADOR" || cargo === "PREFEITO";
    const nomes = municipal(atual.candidato.cargo)
      ? Object.keys(b)
      : municipal(r.candidato.cargo)
        ? Object.keys(a)
        : [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return nomes.map((m) => ({ municipio: m, antes: a[m] ?? 0, agora: b[m] ?? 0, delta: (b[m] ?? 0) - (a[m] ?? 0) }));
  }, [r, atual]);

  if (r === undefined) return <div className={CAIXA}><Carregando linhas={6} /></div>;
  if (!r) return <div className={CAIXA}><SemDado>Não consegui ler a votação de {anterior.ano}.</SemDado></div>;
  const outroEstado = (x: CandidatoBusca) => (x.uf === "BR" ? null : x.uf);
  if (outroEstado(r.candidato) && outroEstado(atual.candidato) && r.candidato.uf !== atual.candidato.uf)
    return (
      <div className={CAIXA}>
        <SemDado>
          Em {anterior.ano} a disputa foi em {r.candidato.uf}, e agora em {atual.candidato.uf}: os municípios não se
          comparam. Abra a candidatura de {anterior.ano} para ver o mapa dela.
        </SemDado>
      </div>
    );

  const ganhos = linhas.filter((l) => l.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, 8);
  const perdas = linhas.filter((l) => l.delta < 0).sort((x, y) => x.delta - y.delta).slice(0, 8);
  const novas = linhas.filter((l) => l.antes === 0 && l.agora > 0).length;
  const perdidas = linhas.filter((l) => l.antes > 0 && l.agora === 0).length;
  const totalAntes = linhas.reduce((s, l) => s + l.antes, 0);
  const totalAgora = linhas.reduce((s, l) => s + l.agora, 0);
  const variacao = totalAntes ? ((totalAgora - totalAntes) / totalAntes) * 100 : null;
  const estado = ufMapa ?? "o estado do mapa";

  return (
    <div className={CAIXA}>
      <Titulo
        sobre={`${anterior.ano} → ${atual.candidato.ano} · em ${estado}`}
        titulo={
          variacao === null
            ? `${fmt(totalAgora)} votos agora`
            : `${variacao >= 0 ? "+" : ""}${pct(variacao, 0)} de votos (${fmt(totalAntes)} → ${fmt(totalAgora)})`
        }
        nota={`${anterior.cargo.toLowerCase()} em ${anterior.ano} × ${atual.candidato.cargo.toLowerCase()} em ${atual.candidato.ano}. ${novas} cidades novas, ${perdidas} cidades onde zerou.`}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListaDelta titulo="Onde mais cresceu" linhas={ganhos} positivo />
        <ListaDelta titulo="Onde mais perdeu" linhas={perdas} />
      </div>
    </div>
  );
}

function ListaDelta({ titulo, linhas, positivo }: { titulo: string; linhas: { municipio: string; antes: number; agora: number; delta: number }[]; positivo?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider ${positivo ? "text-emerald-700" : "text-rose-700"}`}>
        {positivo ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
        {titulo}
      </p>
      {linhas.length === 0 && <p className="text-[12px] text-tinta-500">Nenhuma cidade.</p>}
      <div className="space-y-1.5">
        {linhas.map((l) => (
          <div key={l.municipio} className="flex min-w-0 items-center gap-2 text-[12px]">
            <span className="min-w-0 flex-1 truncate text-tinta-800">{l.municipio}</span>
            <span className="tabular shrink-0 text-tinta-500">{fmt(l.antes)} → {fmt(l.agora)}</span>
            <span className={`tabular w-16 shrink-0 text-right font-bold ${positivo ? "text-emerald-700" : "text-rose-700"}`}>
              {l.delta > 0 ? "+" : ""}
              {fmt(l.delta)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
