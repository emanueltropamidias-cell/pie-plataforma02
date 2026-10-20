"use client";

import { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import { Search, Check } from "lucide-react";
import { Indicador, Cartao } from "@/components/ui/pagina";
import { MapaVotos } from "@/components/estrategia/mapa-votos";
import { chave } from "@/lib/eleicao";

export interface CandidatoBusca {
  id: number;
  ano: number;
  turno: number;
  uf: string;
  cargo: string;
  numero: number;
  nome_urna: string;
  nome_completo: string;
  partido_sigla: string;
  situacao: string;
  foto_url: string | null;
}

export interface RaioXCandidato {
  candidato: CandidatoBusca & {
    total_votos: number;
    municipios_com_voto: number;
  };
  votos_por_municipio: Record<string, number>;
  top_municipios: Array<{
    municipio: string;
    votos: number;
    codigo_tse: string;
  }>;
}

export function PainelEstrategiaEleitoral({
  candidatoInicial,
  cidadesComBase,
}: {
  candidatoInicial: RaioXCandidato;
  cidadesComBase: string[];
}) {
  const [raioX, setRaioX] = useState<RaioXCandidato>(candidatoInicial);
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState<CandidatoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [, startTransition] = useTransition();

  const cSet = new Set(cidadesComBase.map(chave));

  // Busca de candidatos na API conforme digita
  useEffect(() => {
    if (!busca || busca.trim().length < 2) {
      setSugestoes([]);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(
          `/api/eleicao?q=${encodeURIComponent(busca.trim())}&ano=${raioX.candidato.ano}&uf=${raioX.candidato.uf}`
        );
        const data = await res.json();
        setSugestoes(data.candidatos || []);
        setMenuAberto(true);
      } catch (err) {
        console.error("Erro ao buscar candidatos:", err);
      } finally {
        setBuscando(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [busca, raioX.candidato.ano, raioX.candidato.uf]);

  // Carrega o raio-x do candidato selecionado
  async function selecionarCandidato(cand: CandidatoBusca) {
    setMenuAberto(false);
    setBusca("");
    try {
      const res = await fetch(`/api/eleicao?candidatoId=${cand.id}`);
      const data: RaioXCandidato = await res.json();
      if (data && data.candidato) {
        startTransition(() => {
          setRaioX(data);
        });
      }
    } catch (err) {
      console.error("Erro ao carregar raio-x do candidato:", err);
    }
  }

  const totalVotos = raioX.candidato.total_votos || 0;
  const top10 = raioX.top_municipios.slice(0, 10);
  const votosTop10 = top10.reduce((s, m) => s + m.votos, 0);
  const concentracao = totalVotos > 0 ? (votosTop10 / totalVotos) * 100 : 0;
  const maiorVotoTopo = top10[0]?.votos || 1;

  // Cidades onde houve voto e não há liderança cadastrada
  const lacunas = Object.entries(raioX.votos_por_municipio)
    .filter(([mun, v]) => v > 0 && !cSet.has(chave(mun)))
    .map(([municipio, votos]) => ({ municipio, votos }))
    .sort((a, b) => b.votos - a.votos);

  const votosSemRede = lacunas.reduce((s, l) => s + l.votos, 0);

  return (
    <div className="space-y-6">
      {/* ── CARD DO CANDIDATO & BUSCA ─────────────────────────────────── */}
      <div className="rounded-2xl border border-tinta-200 bg-white p-5 shadow-[0_2px_8px_rgba(22,32,46,0.04)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-tema bg-tinta-100 shadow-sm">
              {raioX.candidato.foto_url ? (
                <Image
                  src={raioX.candidato.foto_url}
                  alt={raioX.candidato.nome_urna}
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-bold text-tinta-400">
                  {raioX.candidato.nome_urna.slice(0, 2)}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-tema/10 px-2 py-0.5 text-[11px] font-bold text-tema">
                  {raioX.candidato.partido_sigla} · {raioX.candidato.numero}
                </span>
                <span className="rounded bg-tinta-100 px-2 py-0.5 text-[11px] font-medium text-tinta-600">
                  {raioX.candidato.cargo}
                </span>
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  {raioX.candidato.situacao || "REGISTRADO"}
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-tinta-900">
                {raioX.candidato.nome_urna}
              </h2>
              <p className="text-[12px] text-tinta-500">
                Eleição {raioX.candidato.ano} ({raioX.candidato.uf}) · {totalVotos.toLocaleString("pt-BR")} votos válidos apurados
              </p>
            </div>
          </div>

          {/* Autocomplete de Pesquisa */}
          <div className="relative w-full md:w-80">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tinta-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onFocus={() => sugestoes.length > 0 && setMenuAberto(true)}
                placeholder="Pesquisar qualquer candidato (nome ou nº)..."
                className="h-10 w-full rounded-xl border border-tinta-200 bg-tinta-50/50 pl-10 pr-3 text-[13px] outline-none transition focus:border-tema focus:bg-white"
              />
            </div>

            {menuAberto && sugestoes.length > 0 && (
              <div className="absolute left-0 right-0 top-12 z-50 max-h-72 overflow-y-auto rounded-xl border border-tinta-200 bg-white p-1.5 shadow-xl">
                {sugestoes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selecionarCandidato(c)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-tinta-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-tinta-900 text-[13px]">{c.nome_urna}</span>
                        <span className="text-[11px] text-tinta-500">{c.partido_sigla} · {c.numero}</span>
                      </div>
                      <span className="block truncate text-[11px] text-tinta-400">{c.cargo}</span>
                    </div>
                    {c.id === raioX.candidato.id && (
                      <Check size={16} className="text-tema shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
            {buscando && (
              <span className="absolute right-3 top-2.5 text-[11px] text-tinta-400">Buscando...</span>
            )}
          </div>
        </div>
      </div>

      {/* ── CARDS DE INTELIGÊNCIA ELEITORAL ───────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo={`Votos em ${raioX.candidato.ano}`}
          valor={totalVotos.toLocaleString("pt-BR")}
          contexto={`em ${raioX.candidato.municipios_com_voto} cidades de ${raioX.candidato.uf}`}
          destaque
        />
        <Indicador
          rotulo="Nos 10 maiores redutos"
          valor={`${concentracao.toFixed(0)}%`}
          contexto={`${votosTop10.toLocaleString("pt-BR")} votos nos principais polos`}
        />
        <Indicador
          rotulo="Voto sem rede"
          valor={votosSemRede.toLocaleString("pt-BR")}
          contexto={`${lacunas.length} municípios com voto sem liderança`}
        />
        <Indicador
          rotulo="Presença Eleitoral"
          valor={`${((raioX.candidato.municipios_com_voto / 417) * 100).toFixed(0)}%`}
          contexto="cobertura do território baiano"
        />
      </div>

      {/* ── MAPA DE CALOR DA VOTAÇÃO ──────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-sm font-bold text-tinta-900">Mapa Geográfico de Calor</h3>
            <p className="text-[12px] text-tinta-500">
              Cores representam a densidade de votos de <b>{raioX.candidato.nome_urna}</b> em cada município.
            </p>
          </div>
        </div>

        <MapaVotos
          semRede={lacunas.map((l) => l.municipio)}
          votosPorMunicipio={raioX.votos_por_municipio}
        />
      </div>

      {/* ── DOIS CARTÕES DE ESTRATÉGIA PRÁTICA ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Maiores Votações */}
        <Cartao
          titulo="Maiores Redutos Eleitorais"
          descricao="Cidades com maior votação nominal para defender e ampliar"
        >
          <div className="space-y-2 px-5 py-4">
            {top10.map((m, i) => (
              <div key={m.municipio} className="flex items-center gap-3">
                <span className="tabular w-5 shrink-0 text-[11px] font-bold text-tinta-300">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-tinta-800">
                    {m.municipio}
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-tinta-100">
                    <span
                      className="block h-full rounded-full bg-tema"
                      style={{
                        width: `${Math.max(4, (m.votos / maiorVotoTopo) * 100)}%`,
                      }}
                    />
                  </span>
                </span>
                <span className="tabular w-16 shrink-0 text-right text-[12.5px] font-bold text-tinta-900">
                  {m.votos.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </Cartao>

        {/* Oportunidades: Voto sem Rede */}
        <Cartao
          titulo="Oportunidades: Votos Sem Rede"
          descricao="Municípios onde o candidato pontuou bem, mas a campanha não tem liderança ativa"
        >
          <div className="space-y-2 px-5 py-4">
            {lacunas.slice(0, 10).map((l, i) => (
              <div key={l.municipio} className="flex items-center gap-3">
                <span className="tabular w-5 shrink-0 text-[11px] font-bold text-amber-500">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-tinta-800">
                  {l.municipio}
                </span>
                <span className="tabular shrink-0 text-[12.5px] font-bold text-amber-600">
                  {l.votos.toLocaleString("pt-BR")}
                </span>
                <span className="shrink-0 text-[11px] text-tinta-400">votos</span>
              </div>
            ))}
            {lacunas.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-tinta-500">
                Todas as cidades com voto já possuem contatos ou lideranças cadastradas.
              </p>
            )}
          </div>
        </Cartao>
      </div>

      <div className="rounded-xl border border-tinta-200 bg-tinta-50/50 p-4 text-[11.5px] text-tinta-500">
        <p className="font-semibold text-tinta-700">Fonte Oficial:</p>
        <p className="mt-0.5">
          Dados: TSE (Tribunal Superior Eleitoral) – dadosabertos.tse.jus.br. Ingestão consolidada por município. Licença CC-BY.
        </p>
      </div>
    </div>
  );
}
