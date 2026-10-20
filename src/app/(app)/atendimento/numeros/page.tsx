import { createClient } from "@/lib/supabase/server";
import { configurada, todasAsInstancias } from "@/lib/evolution";
import { Cabecalho } from "@/components/ui/pagina";
import { Numeros, Vazio, type Linha } from "@/components/numeros/numeros";

// Os números da campanha, e a saúde de cada um.
//
// O estado de conexão vem numa chamada só ao servidor da Evolution, e não uma
// por número: com sete, seriam sete idas de rede a cada abertura da tela, e a
// mais lenta seguraria todas.
//
// Se a Evolution não responder, a tela NÃO cai — o estado vira "sem resposta" e
// os números do banco continuam aparecendo. Saber quantos leads entraram é útil
// mesmo com o servidor fora do ar; na verdade é quando mais importa.

export const dynamic = "force-dynamic";

export default async function NumerosPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          Os números da campanha são da coordenação. Fale com um supervisor.
        </p>
      </div>
    );
  }

  const [{ data: painel, error }, { data: equipe }, instancias] =
    await Promise.all([
      supabase
        .from("numeros_painel")
        .select(
          "id, apelido, telefone, instancia, provedor, cor, ativo, ordem, atendente_id, atendente, abertas, aguardando, leads_24h, leads_hoje, ultima_atividade",
        )
        .order("ordem")
        .order("apelido"),
      supabase.from("atendentes").select("id, nome").order("nome"),
      configurada() ? todasAsInstancias().catch(() => null) : null,
    ]);

  const tabelaFalta =
    error?.code === "42P01" || error?.code === "PGRST205";

  // O estado de cada instância, por nome, para cruzar com o cadastro.
  const vivas = new Map<string, { estado: string; motivo: number | null }>();
  if (instancias?.ok) {
    for (const i of instancias.dados ?? []) {
      if (i.name)
        vivas.set(i.name, {
          estado: i.connectionStatus ?? "close",
          motivo: i.disconnectionReasonCode ?? null,
        });
    }
  }

  const linhas: Linha[] = (painel ?? []).map((n) => {
    const v = vivas.get(n.instancia);
    return {
      ...n,
      abertas: Number(n.abertas ?? 0),
      aguardando: Number(n.aguardando ?? 0),
      leads_24h: Number(n.leads_24h ?? 0),
      leads_hoje: Number(n.leads_hoje ?? 0),
      estado: v?.estado ?? null,
      motivo: v?.motivo ?? null,
    };
  });

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo="Atendimento"
        titulo="Números da campanha"
        descricao="Cada número recebe seu tráfego. Dentro do PIE, a caixa é uma só."
        voltar="/atendimento"
      />

      {/* ── LISTA VAZIA NÃO PODE ESCONDER O CADASTRO ──────────────────────
          Antes, zero número desenhava só o aviso "nenhum número cadastrado" —
          e o botão "Novo número" mora DENTRO de <Numeros/>. Resultado: numa
          instalação nova não havia como cadastrar o primeiro chip. O ovo e a
          galinha.

          A instalação da Talita nunca esbarrou nisso porque sempre teve
          número; a do Manassés nasceu vazia e travou na primeira tela.

          `tabelaFalta` continua caindo no aviso, porque aí o problema é outro:
          a tabela não existe, e cadastrar não é o que resolve. */}
      {tabelaFalta ? (
        <Vazio />
      ) : (
        <Numeros linhas={linhas} equipe={equipe ?? []} />
      )}
    </div>
  );
}
