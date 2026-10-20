import Link from "next/link";
import { UserPlus, Shield, Target, Handshake } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { lerTerritorio } from "@/lib/painel-territorio";
import { Cabecalho } from "@/components/ui/pagina";
import { CANDIDATO } from "@/lib/candidato";
import { candidaturaDaCasa, cobertura as lerCobertura, raioX as raioXDoArquivo } from "@/lib/eleicao-arquivos";
import { PainelEstrategiaEleitoral } from "@/components/estrategia/painel-estrategia-eleitoral";

// Central de Estratégia e Inteligência Eleitoral.
//
// Une o mapa de calor e dados consolidados do TSE (2022, 2024, 2026)
// diretamente na tela principal de Estratégia, com atalhos rápidos
// para Lideranças, Metas e Dobradinhas.

export const dynamic = "force-dynamic";

export default async function CentralEstrategia({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const territorio = await lerTerritorio(supabase);

  // Contador de lideranças ativas
  const { count: totalLiderancas } = await supabase
    .from("liderancas")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "lideranca");

  // Candidato pedido na URL ou a candidatura da casa — a mais recente com
  // aquele número no estado. Os votos vêm dos arquivos do TSE no Storage
  // (src/lib/eleicao-arquivos.ts), que cobrem o Brasil inteiro.
  // Link antigo (`?c=1627`, código do banco) não acha ninguém nos arquivos:
  // cai na candidatura da casa em vez de abrir a tela vazia.
  const pedido = params.c ? Number(params.c) : NaN;
  const daCasa = () => candidaturaDaCasa(CANDIDATO.uf, parseInt(CANDIDATO.numeroUrna, 10));
  let raioX = Number.isFinite(pedido) ? await raioXDoArquivo(pedido) : null;
  if (!raioX) {
    const id = await daCasa();
    raioX = id ? await raioXDoArquivo(id) : null;
  }

  const cidadesComBase = territorio.mapa.map((m) => m.municipio);

  // O que existe, por ano e estado (manifesto de cada eleição): a tela só
  // oferece isso.
  //
  // Falha aqui NÃO é "nada importado". Em 20/10/2026 a leitura falhou e a
  // tela marcou 2022, 2024 e 2026 como "sem dados", com tudo guardado. A
  // falha chega como `null`, e o painel avisa em vez de esconder.
  const cobertura = await lerCobertura().catch((e) => {
    console.error("cobertura eleitoral falhou:", e);
    return null;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <Cabecalho
        sobretitulo="Estratégia"
        titulo="Central de Estratégia & Território"
        descricao="Inteligência eleitoral oficial do TSE. Analise redutos, pesquise qualquer candidato e cruze votos com lideranças."
      />

      {/* ── ATALHOS RÁPIDOS DA OPERAÇÃO ──────────────────────────────── */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Link
          href="/crm?nova=1"
          className="flex items-center gap-3 rounded-xl border border-tema/30 bg-tema/[0.04] p-3 transition hover:bg-tema/[0.08]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tema text-white shadow-sm">
            <UserPlus size={16} />
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-tema">Ação Rápida</span>
            <span className="block truncate text-[12.5px] font-bold text-tinta-900">Cadastrar Liderança</span>
          </div>
        </Link>

        <Link
          href="/crm"
          className="flex items-center gap-3 rounded-xl border border-tinta-200 bg-white p-3 transition hover:border-tema"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Shield size={16} />
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-tinta-400">
              {totalLiderancas ?? 0} Cadastradas
            </span>
            <span className="block truncate text-[12.5px] font-bold text-tinta-900">Ver Lideranças</span>
          </div>
        </Link>

        <Link
          href="/metas"
          className="flex items-center gap-3 rounded-xl border border-tinta-200 bg-white p-3 transition hover:border-tema"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Target size={16} />
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-tinta-400">Objetivos</span>
            <span className="block truncate text-[12.5px] font-bold text-tinta-900">Metas por Cidade</span>
          </div>
        </Link>

        <Link
          href="/dobradinha"
          className="flex items-center gap-3 rounded-xl border border-tinta-200 bg-white p-3 transition hover:border-tema"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
            <Handshake size={16} />
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-tinta-400">Parcerias</span>
            <span className="block truncate text-[12.5px] font-bold text-tinta-900">Dobradinhas</span>
          </div>
        </Link>
      </div>

      {/* ── PAINEL VISUAL DE DADOS ELEITORAIS E MAPA DE CALOR ──────── */}
      <div className="mt-7">
        {raioX ? (
          <PainelEstrategiaEleitoral
            candidatoInicial={raioX}
            cidadesComBase={cidadesComBase}
            cobertura={cobertura && cobertura.length ? cobertura : null}
          />
        ) : (
          <div className="rounded-2xl border border-tinta-200 bg-white p-8 text-center text-tinta-500">
            Carregando dados eleitorais...
          </div>
        )}
      </div>
    </div>
  );
}
