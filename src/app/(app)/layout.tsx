import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehPortaDaAtendente } from "@/lib/portas";
import { AppSidebar } from "@/components/app-sidebar";
import { ehSubdominioAtendimento } from "@/middleware";
import { caminhoOculto, casaDaConta, contaAlcanca, moduloAtivo } from "@/lib/modulos";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Toda a área logada é protegida.
  if (!user) redirect("/login");

  // Trava de aprovação: conta precisa estar "ativa".
  //
  // Só a ausência da TABELA libera a passagem — isso existe para não trancar
  // ninguém de fora enquanto a migração não rodou. Ausência da LINHA agora
  // bloqueia: antes ela passava direto, e quem entrasse por um caminho que não
  // cria perfil (login social, por exemplo) caía dentro da plataforma inteira
  // sem aprovação de ninguém e sem aparecer na lista de usuários do admin.
  //
  // Qualquer OUTRO erro tranca. Antes bastava a consulta falhar — RLS negando,
  // timeout, banco fora do ar — para a trava virar passe livre, porque um erro
  // qualquer zerava a condição inteira. Agora só o código de tabela inexistente
  // (42P01 / PGRST205) passa; o resto cai em /pendente.
  const { data: perfil, error: perfilErro } = await supabase
    .from("profiles")
    .select("status, role, modulos")
    .eq("id", user.id)
    .maybeSingle();

  const tabelaNaoExiste =
    perfilErro?.code === "42P01" || perfilErro?.code === "PGRST205";

  if (!tabelaNaoExiste && perfil?.status !== "ativo") redirect("/pendente");

  // A ÁREA INTERNA É DA EQUIPE. LIDERANÇA VAI PARA O PORTAL DELA.
  //
  // A trava acima conferia só o status, e liderança com login é conta aprovada
  // — então bastava digitar /atendimento na barra de endereço para entrar aqui.
  // Não era hipótese: são 43 contas de portal, todas com status ativo.
  //
  // O que elas alcançavam não é a lista de pessoas, que a RLS já separou: é a
  // conversa de WhatsApp inteira, as demandas de saúde e jurídico com nome, e
  // quanto a campanha gasta em tráfego. Nada disso é da liderança — o portal
  // dela mostra a rede dela, e é para lá que ela vai.
  if (perfil?.role === "lideranca") redirect("/portal");

  // ── MODO ATENDIMENTO: uma porta só ─────────────────────────────────────────
  //
  // Duas coisas independentes levam ao mesmo lugar:
  //
  //   o SUBDOMÍNIO   atendimento.… serve a mesma aplicação com uma porta só.
  //                  Enquadramento, para a ferramenta abrir no que a pessoa faz.
  //   o PAPEL        quem é `atendente` não alcança o resto NEM pelo domínio
  //                  principal. Esta é a trava de verdade, e ela existe também
  //                  no banco: `perfil_equipe()` é falso para ela, então nem
  //                  chamando a API direto a base de 29 mil aparece.
  //
  // O caminho vem do cabeçalho que o middleware carimba: o layout do servidor
  // não enxerga a rota sozinho, e é aqui que o PAPEL é conhecido.
  const cabecalhos = await headers();
  const noSubdominio = ehSubdominioAtendimento(cabecalhos.get("host"));
  const ehAtendente = perfil?.role === "atendente";
  const ehSupervisor = perfil?.role === "supervisor";
  const caminho = cabecalhos.get("x-caminho") ?? "";

  // ── AS DUAS PORTAS DA ATENDENTE ───────────────────────────────────────────
  //
  // Era uma só: a caixa. Fazia sentido enquanto todo atendimento acontecia
  // dentro do PIE.
  //
  // Os chips começaram a cair — a Lutiane perdeu o número inteiro, não só a
  // sessão — e a operação virou outra: elas atendem pelo WhatsApp no aparelho
  // e cadastram aqui. Sem esta segunda porta, o cadastro existia e nenhuma
  // delas conseguia chegar nele: clicava e voltava para a caixa.
  //
  // A trava de DADO continua inteira e é outra: `perfil_equipe()` é falso para
  // atendente, então a base de 29 mil não aparece nem chamando a API direto.
  // Isto aqui é enquadramento de tela, e enquadramento que impede o trabalho
  // deixa de ser enquadramento e vira defeito.
  if (ehAtendente && !ehPortaDaAtendente(caminho))
    redirect("/atendimento/caixa");

  // O SUPERVISOR MANDA NO ATENDIMENTO — E SÓ NELE.
  //
  // Ele é atendimento com poder de configurar: fluxo, etiquetas, escala,
  // conexão do número e o painel de métricas da equipe. Não é gabinete: a base
  // de 29 mil, o tráfego pago e as demandas nominais não são dele.
  //
  // A RLS já negava esses dados — `perfil_equipe()` é falso para supervisor.
  // Mas negar o dado e mostrar o caminho é o pior dos dois mundos: ele clicava
  // em Lideranças e via uma tela vazia, sem saber se estava quebrada ou
  // proibida. Agora a área inteira nem se oferece.
  if (ehSupervisor && !caminho.startsWith("/atendimento"))
    redirect("/atendimento");

  // ── ÁREA QUE ESTA INSTALAÇÃO NÃO USA ──────────────────────────────────────
  //
  // Fora do menu não basta: endereço digitado ou link antigo abriria a tela.
  // Volta para a casa da instalação. Ver src/lib/modulos.ts.
  if (caminhoOculto(caminho))
    redirect(moduloAtivo("dashboard") ? "/dashboard" : "/atendimento");

  // ── ABA QUE ESTA CONTA NÃO TEM ────────────────────────────────────────────
  //
  // O admin marca as abas de cada conta (profiles.modulos, migração 0060).
  // Fora delas, nem o endereço digitado abre: volta para a primeira aba que a
  // pessoa tem. Admin e conta sem lista veem tudo (ver contaVe).
  const conta = { role: perfil?.role, modulos: (perfil?.modulos as string[] | null | undefined) ?? null };
  if (!contaAlcanca(caminho, conta)) redirect(casaDaConta(conta));

  // ── A ALTURA MORA AQUI, E ISSO IMPORTA NO CELULAR ──────────────────────────
  //
  // `h-dvh` + `overflow-y-auto` no <main> faz duas coisas ao mesmo tempo:
  //
  //   · a tela nunca passa da altura do aparelho, então a página em si NÃO
  //     rola — quem rola é o conteúdo, por dentro;
  //   · e uma tela que se declara `h-full`, como a caixa de entrada, recebe
  //     exatamente o espaço que sobra.
  //
  // Antes era `min-h-dvh` com `pt-14`: a barra do celular empurrava 56px para
  // baixo e a caixa pedia a tela INTEIRA em cima disso. Dava tela + 56px, a
  // página inteira balançava, e o campo de escrever caía abaixo da dobra
  // justamente quando o teclado subia.
  // O SUBDOMÍNIO continua sem menu: `atendimento.…` é enquadramento
  // deliberado, uma tela só, para quem abre a ferramenta já dentro do trabalho.
  //
  // A ATENDENTE no domínio principal passa a ter o menu dela — duas portas,
  // fila e cadastro. Ver `app-sidebar.tsx` para por quê e para o que fica de
  // fora.
  if (noSubdominio) {
    return (
      <main className="area-app fundo-app h-dvh overflow-y-auto bg-tinta-50">{children}</main>
    );
  }

  return (
    <div className="area-app fundo-app flex h-dvh bg-tinta-50">
      <AppSidebar userEmail={user.email} papel={perfil?.role ?? undefined} modulos={conta.modulos} />
      <main className="h-dvh min-w-0 flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
