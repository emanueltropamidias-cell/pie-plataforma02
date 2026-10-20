"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Building2, MapPin, Vote, Users } from "lucide-react";
import { Indicador, Cartao } from "@/components/ui/pagina";
import { BairrosSalvador } from "@/components/estrategia/bairros-salvador";
import { VOTOS_ZONA } from "@/lib/eleicao";

export function DetalheMunicipioEstrategia({
  municipio,
  uf,
  votosMunicipio,
  totalVotosCandidato,
  nomeCandidato,
  posicaoRanking,
  temLiderancas,
  onVoltarEstado,
}: {
  municipio: string;
  uf: string;
  votosMunicipio: number;
  totalVotosCandidato: number;
  nomeCandidato: string;
  posicaoRanking?: number;
  temLiderancas: boolean;
  onVoltarEstado: () => void;
}) {
  const isSalvador = municipio.toLowerCase().trim() === "salvador";
  const pctTotal = totalVotosCandidato > 0 ? (votosMunicipio / totalVotosCandidato) * 100 : 0;

  // Zonas de Salvador se existirem
  const zonasSalvador = useMemo(() => {
    if (!isSalvador || !VOTOS_ZONA[municipio]) return [];
    return Object.entries(VOTOS_ZONA[municipio]).map(([z, dados]) => ({
      zona: z,
      total: dados.secoes.reduce((s, x) => s + x.votos, 0),
      secoes: dados.secoes.length,
      locais: dados.locais.length,
    }));
  }, [isSalvador, municipio]);

  return (
    <div className="space-y-6">
      {/* ── BARRA SUPERIOR DE AÇÃO E NAVEGAÇÃO ───────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onVoltarEstado}
            className="flex items-center gap-2 rounded-xl border border-tinta-200 bg-tinta-50 px-3.5 py-2 text-[12.5px] font-bold text-tinta-700 transition hover:bg-tinta-100"
          >
            <ArrowLeft size={16} />
            Voltar para {uf}
          </button>
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-tema">
              Camada 3 · Detalhamento Municipal
            </span>
            <h2 className="text-xl font-extrabold text-tinta-900">
              {municipio} ({uf})
            </h2>
          </div>
        </div>

        <Link
          href={`/crm?nova=1&municipio=${encodeURIComponent(municipio)}`}
          className="flex items-center gap-2 rounded-xl bg-tema px-4 py-2 text-[12.5px] font-bold text-white shadow-sm transition hover:opacity-95"
        >
          <UserPlus size={15} />
          Cadastrar Liderança em {municipio}
        </Link>
      </div>

      {/* ── INDICADORES DO MUNICÍPIO ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador
          rotulo={`Votos em ${municipio}`}
          valor={votosMunicipio.toLocaleString("pt-BR")}
          contexto={`votos oficiais apurados para ${nomeCandidato}`}
          destaque
        />
        <Indicador
          rotulo="Peso na Votação"
          valor={`${pctTotal.toFixed(1)}%`}
          contexto="do total recebido pelo candidato"
        />
        <Indicador
          rotulo="Posição no Ranking"
          valor={posicaoRanking ? `${posicaoRanking}º lugar` : "—"}
          contexto="entre todas as cidades do estado"
        />
        <Indicador
          rotulo="Rede de Lideranças"
          valor={temLiderancas ? "Presente ✓" : "Sem Rede"}
          contexto={temLiderancas ? "Campanha possui contatos na cidade" : "Oportunidade para expansão"}
        />
      </div>

      {/* ── DETALHAMENTO DE BAIRROS DE SALVADOR OU CIDADE GERAL ──────── */}
      {isSalvador ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-tinta-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-bold text-tinta-900">Mapa Territorial de Bairros de Salvador</h3>
              <p className="text-[12px] text-tinta-500">
                Malha dos 163 bairros oficiais. Aproxime com o scroll ou botões para inspecionar redutos específicos.
              </p>
            </div>
            <BairrosSalvador />
          </div>

          {zonasSalvador.length > 0 && (
            <div className="rounded-2xl border border-tinta-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-tinta-900">Zonas Eleitorais de Salvador</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {zonasSalvador.map((z) => (
                  <div key={z.zona} className="rounded-xl border border-tinta-100 bg-tinta-50/50 p-3.5">
                    <span className="text-[11px] font-bold text-tema">Zona {z.zona}</span>
                    <p className="mt-1 text-lg font-extrabold text-tinta-900">
                      {z.total.toLocaleString("pt-BR")}{" "}
                      <span className="text-[11px] font-normal text-tinta-500">votos</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-tinta-400">
                      {z.secoes} seções eleitorais · {z.locais} locais
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-tinta-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-tema/10 text-tema">
              <Building2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-tinta-900">
                Inteligência Territorial de {municipio}
              </h3>
              <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-tinta-600">
                O candidato obteve <b>{votosMunicipio.toLocaleString("pt-BR")} votos</b> nominais em {municipio},
                representando <b>{pctTotal.toFixed(1)}%</b> de toda a sua votação em {uf}.
              </p>
              {!temLiderancas && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3.5 border border-amber-200 text-amber-900 text-[12px]">
                  <b>Atenção Estratégica:</b> Este município teve votação expressiva, porém ainda não possui lideranças cadastradas no sistema. Cadastre contatos ou indique lideranças locais para consolidar essa base eleitoral.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
