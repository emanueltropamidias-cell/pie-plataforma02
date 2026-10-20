"use client";

import { useState, useMemo } from "react";
import { Search, Trophy, TrendingUp, Users, Award, ShieldAlert, BarChart3, Filter } from "lucide-react";

export type CandidatoTSE = {
  id: number;
  ano: number;
  cargo: string;
  municipio: string;
  uf: string;
  numero: string;
  nome_urna: string;
  nome_completo: string | null;
  partido: string;
  sigla_partido: string;
  coligacao: string | null;
  situacao: string;
  total_votos: number;
  percentual: number;
};

export type Projecao2026 = {
  id: number;
  cargo: string;
  uf: string;
  quociente_estimado: number;
  vagas_totais: number;
  partido_federacao: string;
  votos_estimados: number;
  cadeiras_provaveis: number;
  corte_partidario: number;
  analise_cenario: string;
};

export function PainelTSE({
  candidatos,
  projecoes,
}: {
  candidatos: CandidatoTSE[];
  projecoes: Projecao2026[];
}) {
  const [anoAtivo, setAnoAtivo] = useState<number>(2022);
  const [cargoAtivo, setCargoAtivo] = useState<string>("todos");
  const [termoBusca, setTermoBusca] = useState<string>("");

  // Lista de cargos disponíveis no ano selecionado
  const cargosDisponiveis = useMemo(() => {
    const conjunto = new Set<string>();
    candidatos
      .filter((c) => c.ano === anoAtivo)
      .forEach((c) => conjunto.add(c.cargo));
    return Array.from(conjunto);
  }, [candidatos, anoAtivo]);

  // Candidatos filtrados
  const filtrados = useMemo(() => {
    return candidatos.filter((c) => {
      if (c.ano !== anoAtivo) return false;
      if (cargoAtivo !== "todos" && c.cargo !== cargoAtivo) return false;
      if (!termoBusca) return true;
      const t = termoBusca.toLowerCase();
      return (
        c.nome_urna.toLowerCase().includes(t) ||
        (c.nome_completo && c.nome_completo.toLowerCase().includes(t)) ||
        c.sigla_partido.toLowerCase().includes(t) ||
        c.numero.includes(t) ||
        c.municipio.toLowerCase().includes(t)
      );
    });
  }, [candidatos, anoAtivo, cargoAtivo, termoBusca]);

  // Projeções filtradas para 2026
  const projecoesFiltradas = useMemo(() => {
    if (cargoAtivo === "todos") return projecoes;
    return projecoes.filter((p) => p.cargo === cargoAtivo);
  }, [projecoes, cargoAtivo]);

  // Estatísticas rápidas
  const totalVotosVisiveis = useMemo(() => {
    return filtrados.reduce((acc, cur) => acc + cur.total_votos, 0);
  }, [filtrados]);

  return (
    <div className="flex flex-col gap-6">
      {/* Controles de navegação do TSE (Estilo Apple Glass) */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-2xl shadow-2xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-5">
          {/* Seletor de Ano */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                Inteligência Eleitoral TSE
              </span>
              <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
                Histórico e Projeções das Eleições
              </h2>
            </div>

            {/* Pílulas de Seleção de Ano */}
            <div className="flex items-center rounded-2xl border border-white/10 bg-black/40 p-1.5 backdrop-blur-xl">
              {[2022, 2024, 2026].map((ano) => {
                const ativo = anoAtivo === ano;
                return (
                  <button
                    key={ano}
                    onClick={() => {
                      setAnoAtivo(ano);
                      setCargoAtivo("todos");
                    }}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                      ativo
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span>{ano}</span>
                    {ano === 2026 && (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-400">
                        Projeção
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtros de Cargo e Busca */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Cargos */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setCargoAtivo("todos")}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  cargoAtivo === "todos"
                    ? "border border-white/20 bg-white/10 text-white"
                    : "border border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Todos os cargos
              </button>
              {cargosDisponiveis.map((cargo) => (
                <button
                  key={cargo}
                  onClick={() => setCargoAtivo(cargo)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    cargoAtivo === cargo
                      ? "border border-blue-500/30 bg-blue-500/15 text-blue-300"
                      : "border border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {cargo}
                </button>
              ))}
            </div>

            {/* Input de Busca */}
            <div className="relative min-w-[260px]">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Buscar candidato, número ou cidade..."
                className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-4 text-xs font-medium text-white placeholder-zinc-500 backdrop-blur-md transition-all focus:border-blue-500/50 focus:bg-black/50 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Métricas em Destaque */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
          <span className="text-[11px] font-semibold text-zinc-400">Ano Analisado</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{anoAtivo}</span>
            <span className="text-xs text-blue-400">
              {anoAtivo === 2022 ? "Gerais" : anoAtivo === 2024 ? "Municipais" : "Projeção 2026"}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
          <span className="text-[11px] font-semibold text-zinc-400">Candidaturas / Cenários</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{filtrados.length}</span>
            <span className="text-xs text-zinc-500">listados</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
          <span className="text-[11px] font-semibold text-zinc-400">Votos Computados</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              {totalVotosVisiveis.toLocaleString("pt-BR")}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
          <span className="text-[11px] font-semibold text-zinc-400">
            {anoAtivo === 2026 ? "Quociente Federal BA" : "Eleitorado Estimado"}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">
              {anoAtivo === 2026 ? "205.000" : "11.4 M"}
            </span>
            <span className="text-xs text-zinc-500">votos/aptos</span>
          </div>
        </div>
      </div>

      {/* Seção de Projeções 2026 quando o ano for 2026 */}
      {anoAtivo === 2026 && projecoesFiltradas.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-400" />
            <h3 className="text-base font-bold text-white">
              Cenários Partidários e Vagas Estimadas para 2026
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projecoesFiltradas.map((proj) => (
              <div
                key={proj.id}
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-5 backdrop-blur-xl transition-all hover:border-blue-500/30"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/20">
                      {proj.cargo}
                    </span>
                    <span className="text-xs font-black text-emerald-400">
                      ~{proj.cadeiras_provaveis} Cadeiras
                    </span>
                  </div>

                  <h4 className="mt-3 text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
                    {proj.partido_federacao}
                  </h4>

                  <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                    {proj.analise_cenario}
                  </p>
                </div>

                <div className="mt-4 border-t border-white/5 pt-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Votos Estimados:</span>
                    <span className="font-bold text-zinc-200">
                      {proj.votos_estimados.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-zinc-500">Corte Mínimo:</span>
                    <span className="font-bold text-amber-400">
                      {proj.corte_partidario.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Resultados e Candidatos */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            <h3 className="text-base font-bold text-white">
              Resultados Oficiais do TSE — Eleição {anoAtivo}
            </h3>
          </div>
          <span className="text-xs text-zinc-400">
            {filtrados.length} candidatura(s)
          </span>
        </div>

        {filtrados.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center backdrop-blur-md">
            <p className="text-sm text-zinc-400">
              Nenhum resultado encontrado para os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtrados.map((cand) => {
              const ehEleito =
                cand.situacao.toLowerCase().includes("eleito") &&
                !cand.situacao.toLowerCase().includes("não");
              return (
                <div
                  key={cand.id}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-slate-900/60 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                        {cand.cargo} • {cand.municipio}
                      </span>
                      <h4 className="mt-1 text-sm font-extrabold text-white">
                        {cand.nome_urna}
                      </h4>
                      <span className="text-xs text-zinc-400">
                        {cand.partido} ({cand.sigla_partido}) • Nº {cand.numero}
                      </span>
                    </div>

                    <span
                      className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide border ${
                        ehEleito
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : cand.situacao === "Suplente"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-zinc-700 bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {cand.situacao}
                    </span>
                  </div>

                  <div className="mt-4 border-t border-white/5 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Total de votos:</span>
                      <span className="text-base font-black text-white">
                        {cand.total_votos.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {cand.percentual > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.min(cand.percentual * 2, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-zinc-400">
                          {cand.percentual}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
