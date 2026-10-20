import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import { Links, type LinhaLink } from "@/components/links/links";
import { FaltaInstalar } from "@/components/falta-instalar";

// Os links de QR da campanha.
//
// Um QR impresso é definitivo — santinho, banner, adesivo de carro. Depois da
// gráfica, ninguém reimprime. Mas o destino muda: chip cai, página troca de
// endereço, a dobradinha ainda nem existe quando o material vai para impressão.
//
// Aqui se cria a PONTE. O papel aponta para o PIE, e o PIE aponta para onde a
// coordenação quiser, hoje e daqui a um mês.

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          Os links de QR são da coordenação — eles decidem para onde vai o
          material impresso da campanha.
        </p>
      </div>
    );
  }

  // ── A CONTAGEM É DO BANCO, E NÃO DAQUI ────────────────────────────────────
  //
  // Esta tela buscava TODAS as linhas de `link_leituras` e refazia a conta em
  // TypeScript. Dois problemas, e os dois mordiam:
  //
  //   O FUSO. "Hoje" saía de `setHours(0,0,0,0)`, que usa o fuso do SERVIDOR —
  //   e a Vercel roda em UTC. Depois das 21h da Bahia o UTC já virou o dia, e o
  //   cartão passava a contar só as últimas horas. Medido às 23h22: 50 leituras
  //   de verdade, 10 na janela que a tela chamava de hoje.
  //
  //   O TETO. Trazer a tabela inteira para contar funciona com 102 linhas. Com
  //   dez mil, o PostgREST corta na página e o número passa a mentir calado —
  //   que é o defeito mais silencioso desta base.
  //
  // `placar_qr()` faz as duas contas no banco, no fuso da Bahia, e devolve
  // pronto. Um lugar só: o mesmo fato escrito em dois sempre desencontra.
  const [{ data: links, error }, { data: placar }] = await Promise.all([
    supabase
      .from("links")
      .select("id, slug, nome, destino, ativo, arte, categoria, criado_em")
      .order("criado_em", { ascending: false }),
    supabase.rpc("placar_qr"),
  ]);

  const { data: lideres } = await supabase
    .from("link_lideres")
    .select("id, link_id, nome, codigo")
    .order("nome");

  type Placar = {
    link_id: number;
    aberturas: number;
    pessoas: number;
    hoje: number;
    lideres: Record<string, number>;
    /** Por qual botão a pessoa entrou. Só os links de site preenchem. */
    origens: Record<string, number>;
  };
  const porLink = new Map<number, Placar>(
    ((placar ?? []) as Placar[]).map((p) => [p.link_id, p]),
  );

  const linhas: LinhaLink[] = (links ?? []).map((l) => {
    const p = porLink.get(l.id);
    return {
      ...l,
      leituras: p?.aberturas ?? 0,
      leiturasHoje: p?.hoje ?? 0,
      pessoas: p?.pessoas ?? 0,
      lideres: (lideres ?? [])
        .filter((d) => d.link_id === l.id)
        .map((d) => ({ ...d, leituras: p?.lideres?.[String(d.id)] ?? 0 })),
      origens: p?.origens ?? {},
    };
  });

  const tabelaFalta = error?.code === "42P01" || error?.code === "PGRST205";

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo="Atendimento"
        titulo="Links e QR"
        descricao="O QR impresso aponta para cá, e daqui você manda para onde quiser — sem reimprimir nada."
        voltar="/atendimento"
      />
      {tabelaFalta ? (
        <FaltaInstalar oQue="A tabela de links" />
      ) : (
        <Links inicial={linhas} />
      )}
    </div>
  );
}
