"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Building2, MapPin, School } from "lucide-react";
import { Indicador } from "@/components/ui/pagina";
import { BairrosSalvador } from "@/components/estrategia/bairros-salvador";
import { Barra, pct } from "@/components/estrategia/comum";

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

//
// Desde 22/10/2026 a cidade traz também o eleitorado (aptos, comparecimento,
// abstenção, brancos e nulos do cargo) e o perfil de quem vota ali — e as
// zonas mostram a fatia dos eleitores de cada uma, não só o voto absoluto.
// Lideranças e o botão de cadastro só aparecem para quem tem campanha.

type Cidade = {
  apuracao: {
    aptos: number;
    cargos: { cargo: string; turno: number; comparecimento: number; validos: number; brancos: number; nulos: number }[];
  } | null;
  perfil: {
    total: number;
    genero: Record<string, number>;
    idade: { rotulo: string; n: number }[];
    escolaridade: { rotulo: string; n: number }[];
  } | null;
};

type Detalhe = {
  zonas: { zona: number; votos: number; aptos: number | null }[];
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
  campanha,
  cargo,
  turno,
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
  /** A conta tem base cadastrada: mostra lideranças e o botão de cadastro. */
  campanha: boolean;
  cargo: string;
  turno: number;
  onVoltarEstado: () => void;
}) {
  const [detalhe, setDetalhe] = useState<{ chave: string; dados: Detalhe | null } | null>(null);
  const chaveAtual = `${candidatoId}_${municipioNoBanco}`;
  const carregando = detalhe?.chave !== chaveAtual;
  const dados = carregando ? null : detalhe?.dados;

  useEffect(() => {
    if (!municipioNoBanco) return;
    let vivo = true;
    const q = new URLSearchParams({ candidatoId: String(candidatoId), municipio: municipioNoBanco, uf });
    fetch(`/api/eleicao?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Detalhe | null) => vivo && setDetalhe({ chave: chaveAtual, dados: d }))
      .catch(() => vivo && setDetalhe({ chave: chaveAtual, dados: null }));
    return () => {
      vivo = false;
    };
  }, [candidatoId, municipioNoBanco, chaveAtual, uf]);

  const [cidade, setCidade] = useState<{ chave: string; dados: Cidade | null } | null>(null);
  const chaveCidade = `${ano}|${uf}|${municipioNoBanco}`;
  useEffect(() => {
    if (!municipioNoBanco) return;
    let vivo = true;
    fetch(`/api/eleicao?${new URLSearchParams({ cidade: municipioNoBanco, ano: String(ano), uf })}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Cidade | null) => vivo && setCidade({ chave: chaveCidade, dados: d }))
      .catch(() => vivo && setCidade({ chave: chaveCidade, dados: null }));
    return () => {
      vivo = false;
    };
  }, [municipioNoBanco, ano, uf, chaveCidade]);
  const dadosCidade = cidade?.chave === chaveCidade ? cidade.dados : null;
  const ap = dadosCidade?.apuracao ?? null;
  const doCargo = ap?.cargos.find((x) => x.cargo === cargo && x.turno === turno) ?? null;
  const perfil = dadosCidade?.perfil ?? null;

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

        {campanha && (
        <Link
          href={`/crm?nova=1&municipio=${encodeURIComponent(municipio)}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-tema px-4 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:opacity-95 sm:w-auto sm:py-2"
        >
          <UserPlus size={15} />
          Cadastrar Liderança em {municipio}
        </Link>
        )}
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
        {campanha ? (
          <Indicador
            rotulo="Rede de Lideranças"
            valor={temLiderancas ? "Presente ✓" : "Sem Rede"}
            contexto={temLiderancas ? "Sua campanha tem contatos na cidade" : "Oportunidade para expansão"}
          />
        ) : (
          <Indicador
            rotulo="Do eleitorado"
            valor={ap?.aptos ? pct((votosMunicipio / ap.aptos) * 100, 2) : "—"}
            contexto={ap?.aptos ? `${ap.aptos.toLocaleString("pt-BR")} eleitores aptos` : "eleitorado ainda não importado"}
          />
        )}
      </div>

      {/* ── O ELEITORADO DA CIDADE ──────────────────────────────────── */}
      {(ap || perfil) && (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="text-sm font-bold text-tinta-900">Eleitorado e comparecimento</h3>
            <p className="text-[12px] text-tinta-500">
              {cargo.toLowerCase()} · {turno}º turno · {ano}
            </p>
            {ap ? (
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <MiniDado rotulo="Eleitores aptos" valor={ap.aptos.toLocaleString("pt-BR")} />
                <MiniDado
                  rotulo="Comparecimento"
                  valor={doCargo ? pct((doCargo.comparecimento / ap.aptos) * 100) : "—"}
                  nota={doCargo ? `${doCargo.comparecimento.toLocaleString("pt-BR")} eleitores` : undefined}
                />
                <MiniDado
                  rotulo="Abstenção"
                  valor={doCargo ? pct(((ap.aptos - doCargo.comparecimento) / ap.aptos) * 100) : "—"}
                  nota={doCargo ? `${(ap.aptos - doCargo.comparecimento).toLocaleString("pt-BR")} não votaram` : undefined}
                />
                <MiniDado
                  rotulo={`Fatia de ${nomeCandidato.split(" ")[0]}`}
                  valor={doCargo?.validos ? pct((votosMunicipio / doCargo.validos) * 100) : "—"}
                  nota="dos votos válidos do cargo"
                />
                {doCargo && (
                  <p className="col-span-2 text-[11px] text-tinta-500">
                    Brancos {doCargo.brancos.toLocaleString("pt-BR")} · nulos {doCargo.nulos.toLocaleString("pt-BR")} · válidos{" "}
                    {doCargo.validos.toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-tinta-500">Comparecimento desta eleição ainda não importado.</p>
            )}
          </div>

          <div className="min-w-0 rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="text-sm font-bold text-tinta-900">Quem vota em {municipio}</h3>
            <p className="text-[12px] text-tinta-500">Perfil do eleitorado no cadastro do TSE ({ano})</p>
            {perfil ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-3 text-[12px] text-tinta-700">
                  {Object.entries(perfil.genero)
                    .sort((a, b) => b[1] - a[1])
                    .map(([g, n]) => (
                      <span key={g}>
                        <b className="tabular">{pct((n / perfil.total) * 100, 0)}</b> {g.toLowerCase()}
                      </span>
                    ))}
                </div>
                <Distribuicao titulo="Idade" itens={perfil.idade} total={perfil.total} />
                <Distribuicao titulo="Escolaridade" itens={perfil.escolaridade} total={perfil.total} />
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-tinta-500">Perfil do eleitorado ainda não importado.</p>
            )}
          </div>
        </div>
      )}

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
                      {z.aptos ? (
                        <span className="block text-[10.5px] font-medium text-tinta-500">{pct((z.votos / z.aptos) * 100, 2)} dos eleitores</span>
                      ) : null}
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

      {campanha && !temLiderancas && votosMunicipio > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] text-amber-900">
          <b>Atenção Estratégica:</b> {nomeCandidato} teve voto em {municipio}, mas a campanha ainda não tem
          lideranças cadastradas na cidade.
        </div>
      )}
    </div>
  );
}

function MiniDado({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-tinta-200 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-tinta-500">{rotulo}</p>
      <p className="tabular mt-0.5 text-lg font-extrabold text-tinta-900">{valor}</p>
      {nota && <p className="text-[10.5px] text-tinta-500">{nota}</p>}
    </div>
  );
}

function Distribuicao({ titulo, itens, total }: { titulo: string; itens: { rotulo: string; n: number }[]; total: number }) {
  const maior = Math.max(...itens.map((i) => i.n), 1);
  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-tinta-500">{titulo}</p>
      <div className="space-y-1">
        {itens.map((i) => (
          <div key={i.rotulo} className="flex items-center gap-2 text-[11.5px]">
            <span className="w-24 shrink-0 text-tinta-600">{i.rotulo}</span>
            <span className="flex-1"><Barra valor={i.n} maximo={maior} /></span>
            <span className="tabular w-12 shrink-0 text-right font-semibold text-tinta-800">{total ? pct((i.n / total) * 100, 0) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
