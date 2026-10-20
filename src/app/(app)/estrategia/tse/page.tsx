import { createClient } from "@/lib/supabase/server";
import { PainelTSE, type CandidatoTSE, type Projecao2026 } from "@/components/estrategia/painel-tse";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PaginaTSE() {
  const supabase = await createClient();

  const [{ data: candidatos }, { data: projecoes }] = await Promise.all([
    supabase
      .from("tse_candidatos")
      .select("*")
      .order("total_votos", { ascending: false }),
    supabase
      .from("tse_projecoes_2026")
      .select("*")
      .order("votos_estimados", { ascending: false }),
  ]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-6 md:px-8">
      {/* Voltar para a Central de Estratégia */}
      <div>
        <Link
          href="/estrategia"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={16} />
          <span>Voltar para Central de Estratégia</span>
        </Link>
      </div>

      <PainelTSE
        candidatos={(candidatos as CandidatoTSE[]) ?? []}
        projecoes={(projecoes as Projecao2026[]) ?? []}
      />
    </div>
  );
}
