"use client";

import { useMemo, useState } from "react";
import { Medal, Search, TrendingUp, Trophy, Users } from "lucide-react";
import { Indicador } from "@/components/ui/pagina";
import { Input } from "@/components/ui/input";
import type { Entrada } from "@/lib/ranking";

// Emoji de medalha muda de desenho em cada sistema e some quando a fonte não
// tem o glifo. Metal como cor sólida é estável e continua dizendo a mesma coisa.
const METAL: Record<number, { fundo: string; texto: string; nome: string }> = {
  1: { fundo: "#F6C445", texto: "#7A5600", nome: "Ouro" },
  2: { fundo: "#C7CFDB", texto: "#48566B", nome: "Prata" },
  3: { fundo: "#E0A06A", texto: "#7A4718", nome: "Bronze" },
};

function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function RankingClient({ entradas, meuId }: { entradas: Entrada[]; meuId?: string | null }) {
  const [busca, setBusca] = useState("");
  const [municipio, setMunicipio] = useState("");

  const municipios = useMemo(
    () => [...new Set(entradas.map((e) => e.municipio).filter(Boolean))].sort() as string[],
    [entradas],
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return entradas.filter(
      (e) => (!municipio || e.municipio === municipio) && (!q || e.nome.toLowerCase().includes(q)),
    );
  }, [entradas, busca, municipio]);

  const totalPessoas = entradas.reduce((s, e) => s + e.pessoas, 0);
  const totalSemana = entradas.reduce((s, e) => s + e.novosSemana, 0);
  const ativas = entradas.filter((e) => e.pessoas > 0).length;

  // O pódio só faz sentido no placar cheio; com filtro, vira lista comum.
  const filtrando = !!(busca.trim() || municipio);
  const podio = filtrando ? [] : lista.slice(0, 3);
  const resto = filtrando ? lista : lista.slice(3);
  const eu = entradas.find((e) => e.id === meuId);

  if (entradas.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-tinta-300 bg-white p-10 text-center">
        <p className="text-sm text-tinta-500">Nenhuma liderança cadastrada ainda.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* Números do topo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Indicador
          rotulo="Pessoas trazidas"
          valor={totalPessoas.toLocaleString("pt-BR")}
          contexto="pessoas indicadas"
          destaque
        />
        <Indicador
          rotulo="Nesta semana"
          valor={`+${totalSemana.toLocaleString("pt-BR")}`}
          contexto="nos últimos 7 dias"
        />
        <Indicador
          rotulo="Lideranças ativas"
          valor={`${ativas} de ${entradas.length}`}
          contexto={
            ativas < entradas.length
              ? `${entradas.length - ativas} ainda não trouxeram ninguém`
              : "todas já trouxeram alguém"
          }
        />
      </div>

      {/* Pódio */}
      {podio.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {podio.map((e) => (
            <div
              key={e.id}
              className={`relative overflow-hidden rounded-xl border bg-white p-5 text-center shadow-[0_1px_2px_rgba(22,32,46,0.04)] ${
                e.id === meuId ? "border-tema ring-2 ring-tema/20" : "border-tinta-200"
              } ${e.posicao === 1 ? "sm:-mt-3 sm:shadow-md" : ""}`}
            >
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: METAL[e.posicao].fundo }}
              />
              <div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-[17px] font-extrabold"
                style={{ background: METAL[e.posicao].fundo, color: METAL[e.posicao].texto }}
              >
                {iniciais(e.nome)}
              </div>
              <p
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: METAL[e.posicao].texto }}
              >
                {e.posicao === 1 ? <Trophy size={11} /> : <Medal size={11} />}
                {METAL[e.posicao].nome}
              </p>
              <p className="mt-1.5 truncate text-[15px] font-bold text-tinta-900">{e.nome}</p>
              <p className="truncate text-[12px] text-tinta-500">{e.municipio ?? "—"}</p>
              <p className="tabular mt-3 text-4xl font-extrabold text-tinta-900">{e.pessoas}</p>
              <p className="text-[11px] text-tinta-400">{e.pessoas === 1 ? "pessoa" : "pessoas"}</p>
              {e.novosSemana > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  <TrendingUp size={12} /> +{e.novosSemana} nesta semana
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar liderança…"
            className="h-10 pl-9"
          />
        </div>
        <select
          value={municipio}
          onChange={(e) => setMunicipio(e.target.value)}
          className="h-10 rounded-md border border-input bg-white px-3 text-[13px] outline-none"
        >
          <option value="">Bahia inteira</option>
          {municipios.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Lista com barra proporcional ao 1º colocado */}
      <div className="overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
        {resto.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tinta-500">Nenhuma liderança neste recorte.</p>
        ) : (
          resto.map((e) => (
            <div
              key={e.id}
              className={`flex items-center gap-3 border-b border-tinta-100 px-4 py-3 last:border-0 ${
                e.id === meuId ? "bg-tema/[0.04]" : ""
              }`}
            >
              <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tinta-100 text-[12px] font-bold text-tinta-600">
                {e.posicao}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14.5px] font-semibold text-tinta-900">{e.nome}</p>
                  {e.novosSemana > 0 && (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      +{e.novosSemana}
                    </span>
                  )}
                </div>
                <p className="truncate text-[11.5px] text-tinta-500">{e.municipio ?? "—"}</p>
                {/* A barra mostra a distância para o líder sem precisar fazer conta */}
                <div className="mt-1.5 h-1.5 max-w-[300px] overflow-hidden rounded-full bg-tinta-100">
                  <div
                    className="h-full rounded-full bg-tema/70 transition-all"
                    style={{ width: `${e.proporcao}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="tabular text-lg font-extrabold text-tinta-900">{e.pessoas}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* O que conta como "pessoa" — evita interpretação torta do número */}
      <p className="flex items-center gap-2 px-1 text-[12px] text-tinta-500">
        <Users size={14} className="shrink-0" />
        Cada pessoa é um cadastro amarrado àquela liderança — quase todo vindo de ficha de campo.
        Contatos repetidos do mesmo aparelho contam uma vez só.
      </p>

      {eu && (
        <p className="px-1 text-[12px] text-tinta-500">
          Você está em <b className="text-tinta-800">{eu.posicao}º</b> de {entradas.length}, com{" "}
          <b className="text-tinta-800">{eu.pessoas}</b> {eu.pessoas === 1 ? "pessoa" : "pessoas"}.
        </p>
      )}
    </div>
  );
}
