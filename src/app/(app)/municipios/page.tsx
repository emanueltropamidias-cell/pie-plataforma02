import { createClient } from "@/lib/supabase/server";
import { lerTerritorio } from "@/lib/painel-territorio";
import { conferir, chave } from "@/lib/conferir-municipios";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import { ConferirClient } from "@/components/municipios/conferir-client";

// O agregado já traz cada grafia com quantas pessoas tem. Comparar com a lista
// oficial aqui é o suficiente — não precisa de nada novo no banco.
export default async function MunicipiosPage() {
  const supabase = await createClient();
  const territorio = await lerTerritorio(supabase);

  const oficiais = new Set(MUNICIPIOS_BA.map((n) => chave(n)));
  const reconhecidos = new Set(
    territorio.mapa.map((m) => chave(m.municipio)).filter((k) => oficiais.has(k)),
  ).size;

  const divergencias = conferir(
    territorio.mapa.map((m) => ({ municipio: m.municipio, qtd: m.qtd })),
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <ConferirClient divergencias={divergencias} reconhecidos={reconhecidos} />
    </div>
  );
}
