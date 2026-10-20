"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Building2, MapPin, School } from "lucide-react";
import { Indicador } from "@/components/ui/pagina";
import { BairrosSalvador } from "@/components/estrategia/bairros-salvador";

// Camada 3 — o município, para o candidato que estiver aberto.
//
// Até aqui as zonas e os bairros vinham de `votos-zonas.ts` e `votos_bairro`,
// que só têm a Talita em 2022: abrir Salvador com o Capitão Alden mostrava os
// números dela, sem aviso. Agora tudo sai do banco por candidato
// (`obter_detalhe_municipio`):
//
//   zonas   toda cidade, todo candidato (votacao_candidato_munzona do TSE)
//   locais  só cidades-foco, com o bairro de cada local (votacao_secao +
//           cadastro de locais, scripts/importar-tse-locais.mjs)

type Detalhe = {
  zonas: { zona: number; votos: number }[];
  /** null = cidade sem detalhe por local importado. */
  locais: { zona: number; local: string; bairro: string | null; votos: number }[] | null;
  tem_detalhe: boolean;
};

export function DetalheMunicipioEstrategia({
  municipio,
  municipioNoBanco,
  candidatoId,
  ano,
  uf,
  votosMunicipio,
  totalVotosCandidato,
  nomeCandidato,
  posicaoRanking,
  temLiderancas,
  onVoltarEstado,
}: {
  municipio: string;
  /** O nome como o TSE grava ("SALVADOR"), que é a chave no banco. */
  municipioNoBanco: string | null;
  candidatoId: number;
  ano: number;
  uf: string;
  votosMunicipio: number;
  totalVotosCandidato: number;
  nomeCandidato: string;
  posicaoRanking?: number;
  temLiderancas: boolean;
  onVoltarEstado: () => void;
}) {
  const [detalhe, setDetalhe] = useState<{ chave: string; dados: Detalhe | null } | null>(null);
  const chaveAtual = `${candidatoId}_${municipioNoBanco}`;
  const carregando = detalhe?.chave !== chaveAtual;
  const dados = carregando ? null : detalhe?.dados;

  useEffect(() => {
    if (!municipioNoBanco) return;
    let vivo = true;
    const q = new URLSearchParams({ candidatoId: String(candidatoId), municipio: municipioNoBanco });
    fetch(`/api/eleicao?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Detalhe | null) => vivo && setDetalhe({ chave: chaveAtual, dados: d }))
      .catch(() => vivo && setDetalhe({ chave: chaveAtual, dados: null }));
    return () => {
      vivo = false;
    };
  }, [candidatoId, municipioNoBanco, chaveAtual]);

  const isSalvador = municipioNoBanco === "SALVADOR";
  const pctTotal = totalVotosCandidato > 0 ? (votosMunicipio / totalVotosCandidato) * 100 : 0;

  // Bairro = soma dos locais de votação que ficam nele.
  const bairros = useMemo(() => {
    if (!dados?.locais) return null;
    const soma = new Map<string, number>();
    for (const l of dados.locais) {
      if (!l.bairro) continue;
      soma.set(l.bairro, (soma.get(l.bairro) ?? 0) + l.votos);
    }
    return [...soma].map(([nome, votos]) => ({ nome, votos })).sort((a, b) => b.votos - a.votos);
  }, [dados]);

  const zonas = dados?.zonas ?? [];
  const maiorZona = zonas[0]?.votos || 1;
  const locais = dados?.locais?.slice(0, 15) ?? [];
  const maiorLocal = locais[0]?.votos || 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── BARRA SUPERIOR DE AÇÃO E NAVEGAÇÃO ───────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onVoltarEstado}
            aria-label={`Voltar para ${uf}`}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-tinta-200 bg-tinta-50 px-3 py-2 text-[12.5px] font-bold text-tinta-700 transition hover:bg-tinta-100 sm:px-3.5"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Voltar para {uf}</span>
            <span className="sm:hidden">{uf}</span>
          </button>
          <div className="min-w-0">
            <span className="block truncate text-[10.5px] font-bold uppercase tracking-wider text-tema">
              Camada 3 · {nomeCandidato} em {ano}
            </span>
            <h2 className="break-words text-lg font-extrabold text-tinta-900 sm:text-xl">
              {municipio} ({uf})
            </h2>
          </div>
        </div>

        <Link
          href={`/crm?nova=1&municipio=${encodeURIComponent(municipio)}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-tema px-4 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:opacity-95 sm:w-auto sm:py-2"
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
          contexto={`votos oficiais de ${nomeCandidato} em ${ano}`}
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
          contexto="entre as cidades onde teve voto"
        />
        <Indicador
          rotulo="Rede de Lideranças"
          valor={temLiderancas ? "Presente ✓" : "Sem Rede"}
          contexto={temLiderancas ? "Campanha possui contatos na cidade" : "Oportunidade para expansão"}
        />
      </div>

      {carregando && (
        <div className="rounded-2xl border border-tinta-200 bg-white p-6 text-[13px] text-tinta-400 shadow-sm">
          Carregando zonas e locais de votação…
        </div>
      )}

      {/* ── BAIRROS (SÓ ONDE HÁ MALHA E DETALHE POR LOCAL) ───────────── */}
      {!carregando && isSalvador && bairros && (
        <div className="min-w-0 rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-tinta-900">Votos por bairro em Salvador</h3>
            <p className="text-[12px] text-tinta-500">
              Soma dos locais de votação de cada bairro, pelo cadastro de locais do TSE. Aproxime com o
              scroll ou os botões.
            </p>
          </div>
          <BairrosSalvador bairros={bairros} ano={ano} />
        </div>
      )}

      {!carregando && (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {/* ── ZONAS ELEITORAIS ─────────────────────────────────────── */}
          <div className="min-w-0 rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-tinta-900">
              <MapPin size={15} className="text-tema" /> Zonas eleitorais
            </h3>
            {zonas.length ? (
              <div className="mt-3 space-y-1.5">
                {zonas.map((z) => (
                  <div key={z.zona} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-[11.5px] font-semibold text-tinta-600 sm:w-16">Zona {z.zona}</span>
                    <span className="h-3 flex-1 rounded bg-tinta-100">
                      <span
                        className="block h-full rounded bg-tema"
                        style={{ width: `${Math.max(2, (z.votos / maiorZona) * 100)}%` }}
                      />
                    </span>
                    <span className="tabular w-16 shrink-0 text-right text-[12px] font-bold text-tinta-900 sm:w-20">
                      {z.votos.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-tinta-500">Sem voto registrado nesta cidade.</p>
            )}
          </div>

          {/* ── LOCAIS DE VOTAÇÃO ────────────────────────────────────── */}
          <div className="min-w-0 rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-tinta-900">
              <School size={15} className="text-tema" /> Locais de votação mais fortes
            </h3>
            {dados?.locais === null || dados?.locais === undefined ? (
              <div className="mt-3 flex items-start gap-3 rounded-xl bg-tinta-50 p-3.5 text-[12px] text-tinta-600">
                <Building2 size={18} className="mt-0.5 shrink-0 text-tinta-400" />
                <span>
                  {dados?.tem_detalhe
                    ? "Este candidato não teve voto em nenhum local de votação desta cidade."
                    : "O detalhe por local de votação ainda não foi importado para esta cidade. Hoje ele existe para Salvador; as zonas ao lado valem para todas."}
                </span>
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {locais.map((l) => (
                  <div key={`${l.zona}_${l.local}`} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-tinta-700" title={l.local}>
                        {l.local}
                      </span>
                      <span className="block truncate text-[10.5px] text-tinta-400">
                        {l.bairro ?? "bairro não informado"} · zona {l.zona}
                      </span>
                    </span>
                    <span className="h-2.5 w-14 shrink-0 rounded bg-tinta-100 sm:w-24">
                      <span
                        className="block h-full rounded bg-tema"
                        style={{ width: `${Math.max(3, (l.votos / maiorLocal) * 100)}%` }}
                      />
                    </span>
                    <span className="tabular w-14 shrink-0 text-right text-[12px] font-bold text-tinta-900">
                      {l.votos.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!temLiderancas && votosMunicipio > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] text-amber-900">
          <b>Atenção Estratégica:</b> {nomeCandidato} teve voto em {municipio}, mas a campanha ainda não tem
          lideranças cadastradas na cidade.
        </div>
      )}
    </div>
  );
}
