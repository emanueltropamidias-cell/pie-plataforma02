import { createClient } from "@supabase/supabase-js";
import { PainelEstrategiaClean } from "@/components/estrategia/painel-estrategia-clean";
import type { RaioXCandidato } from "@/components/estrategia/painel-estrategia-eleitoral";

export const dynamic = "force-dynamic";

export default async function DemoEstrategiaPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Busca o candidato 1022 (Talita) no banco
  const { data: candRows } = await supabase
    .from("eleicao_candidatos")
    .select("id")
    .eq("uf", "BA")
    .eq("numero", 1022)
    .order("ano", { ascending: false })
    .limit(1);

  const candidatoId = candRows?.[0]?.id || 1627;

  const { data: raioX } = await supabase.rpc("obter_raio_x_candidato", {
    p_candidato_id: candidatoId,
  });

  if (!raioX) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-500">
        Carregando dados da demonstração...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-6 sm:px-8 sm:py-8 font-sans antialiased">
      <div className="mx-auto max-w-7xl">
        
        {/* Banner discreto de modo pré-visualização */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200/60 bg-blue-50/50 px-4 py-2.5 text-[12px] text-blue-900">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-ping" />
            <span className="font-bold">Modo de Pré-visualização do Novo Design:</span>
            <span>Layout limpo, unificado e executivo (Split-screen Mapa + Inteligência).</span>
          </div>
          <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700 shadow-2xs">
            http://localhost:3000/demo-estrategia
          </span>
        </div>

        <PainelEstrategiaClean
          candidatoInicial={raioX as RaioXCandidato}
          cidadesComBase={["Salvador", "Feira de Santana", "Camaçari", "Lauro de Freitas"]}
        />
      </div>
    </div>
  );
}
