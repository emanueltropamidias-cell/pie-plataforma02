import { createClient } from "@/lib/supabase/server";
import { lerTerritorio } from "@/lib/painel-territorio";
import { CANDIDATO } from "@/lib/candidato";
import { candidaturaDaCasa, cobertura as lerCobertura, raioX as raioXDoArquivo } from "@/lib/eleicao-arquivos";
import { PainelEstrategiaEleitoral } from "@/components/estrategia/painel-estrategia-eleitoral";

// Central de Estratégia e Inteligência Eleitoral.
//
// O painel eleitoral do TSE (2022, 2024, 2026, Brasil inteiro) ocupa a aba
// inteira. Os atalhos de lideranças, metas e dobradinhas que ficavam no topo
// foram para a central de Lideranças (/liderancas) em 20/10/2026.

export const dynamic = "force-dynamic";

export default async function CentralEstrategia({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const territorio = await lerTerritorio(supabase);

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
      {/* ── PAINEL VISUAL DE DADOS ELEITORAIS E MAPA DE CALOR ──────── */}
      <div>
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
