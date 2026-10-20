import { UsersRound, Network, Map, Upload, Lock, Download, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SomatoriaBases, type Somatoria } from "@/components/base/somatoria";
import { Central, Faixa, Atalho } from "@/components/ui/central";

// A central da Base.
//
// ── POR QUE ELA NÃO ABRE MAIS COM "9.117 NA BASE" ───────────────────────────
//
// Era a central da "Rede", e o primeiro número dela contava LINHAS de cadastro.
// Em 15/09 o Emanuel notou que o 12.502 da aba Métricas e o 9.117 daqui não
// somavam, e não somavam porque nenhum dos dois contava pessoas: um conta
// conversas, o outro conta fichas — com 241 repetidas e 1.827 sem telefone
// dentro.
//
// Agora a base abre nos três tipos que ele definiu, uma pessoa por telefone,
// contados em `base_resumo()` (supabase/migrations/0022_base_por_tipo.sql):
//
//   1  nome, telefone e município
//   2  nome e telefone, sem município
//   3  só o número — conversou e não foi registrada
//
// Esta é a versão inicial, pedida para hoje. A aba Base está na lista de
// demandas do dia e vai ser aprimorada quando chegar a vez dela.
//
// E o nome "Rede" saiu: a campanha chama isto de base.

export const dynamic = "force-dynamic";

const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR");

function Exportar({
  href,
  titulo,
  quantidade,
  nota,
  destaque,
}: {
  href: string;
  titulo: string;
  quantidade: number;
  nota: string;
  destaque?: boolean;
}) {
  // ── DOIS LINKS IRMÃOS, E NÃO UM DENTRO DO OUTRO ─────────────────────────
  //
  // O cartão era um <a> só, cobrindo tudo. Pôr o "só nº" dentro dele seria
  // um link dentro de um link: HTML inválido, e o navegador decide sozinho
  // qual dos dois obedece — o que costuma dar o arquivo errado.
  //
  // Então a borda virou um <div> e os dois links são irmãos: o de sempre
  // ocupa o cartão inteiro, e o dos números fica à direita, estreito.
  return (
    <div
      className={`flex items-center rounded-lg border bg-white transition-colors hover:border-tema ${
        destaque ? "border-tema" : "border-tinta-200"
      }`}
    >
      <a href={href} download className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#eceafe] text-[#0525f7]">
          <Download size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-tinta-900">
            {titulo} <span className="tabular font-normal text-tinta-500">· {n(quantidade)}</span>
          </span>
          <span className="block truncate text-[12px] text-tinta-500">{nota}</span>
        </span>
      </a>

      {/* Só a contagem e o telefone com DDI, sem repetir ninguém. Para subir
          público na Meta ou carregar disparador — ver src/lib/base-tipos.ts. */}
      <a
        href={`${href}${href.includes("?") ? "&" : "?"}formato=numeros`}
        download
        title="Só os números: uma coluna com a contagem e outra com DDI + DDD + telefone, sem repetidos"
        className="shrink-0 self-stretch border-l border-tinta-200 px-3 text-[11px] font-semibold uppercase tracking-wide text-tinta-500 hover:bg-tinta-50 hover:text-tema flex items-center"
      >
        só nº
      </a>
    </div>
  );
}

export default async function CentralBase() {
  const supabase = await createClient();
  const [{ data }, { data: soma }] = await Promise.all([
    supabase.rpc("base_resumo"),
    supabase.rpc("bases_somatoria"),
  ]);
  const r = (data ?? {}) as Record<string, number>;
  const somatoria = soma as Somatoria | null;
  const externas = somatoria?.externas ?? [];

  // ── "COMPLETO" É MUNICÍPIO DA BAHIA, NÃO QUALQUER COISA ESCRITA ────────────
  //
  // Até a 0024, completo era ter algo no campo município: 4.369. Mas o Mapa de
  // cobertura mostrava 3.802, e o Emanuel perguntou por quê. 658 daqueles
  // "completos" tinham outro estado, "Bahia", "Chapada Diamantina" ou grafia
  // torta. Agora completo é um dos 417, e bate com o mapa.
  //
  // OUTRO ESTADO vem pelo município do cadastro, nunca pelo DDD — pedido
  // explícito, porque muita gente mora aqui com número de fora.
  const completos = r.completos ?? 0;
  const outroEstado = r.outro_estado ?? 0;
  const semMunicipio = r.sem_municipio ?? 0;
  const aCorrigir = r.a_corrigir ?? 0;
  const soNumero = r.so_numero ?? 0;
  const semTelefone = r.sem_telefone ?? 0;
  const pessoas = completos + outroEstado + semMunicipio + soNumero;
  const bruto = (data as { atualizado_em?: string } | null)?.atualizado_em;
  const atualizadoEm = bruto
    ? new Date(bruto).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Central
      sobretitulo="Base"
      titulo="Central da base"
      // O horário do cálculo à vista: a base recalcula no minuto seguinte a um
      // cadastro (0031), e quem acabou de cadastrar precisa saber se o número
      // já inclui a pessoa.
      descricao={`${n(pessoas)} pessoas que a campanha consegue alcançar — cada telefone contado uma vez.${
        atualizadoEm ? ` Atualizado às ${atualizadoEm}.` : ""
      }`}
      numeros={[
        { rotulo: "1 · Completos na Bahia", valor: n(completos), tom: "bom" },
        { rotulo: "2 · Sem município", valor: n(semMunicipio), tom: semMunicipio > 0 ? "atencao" : "neutro" },
        { rotulo: "3 · Só o número", valor: n(soNumero), tom: soNumero > 0 ? "atencao" : "neutro" },
        { rotulo: "Outro estado", valor: n(outroEstado), tom: "neutro" },
        // O total fecha a conta dos quatro na mesma linha — pedido do Emanuel em
        // 15/09: número solto na frase não se confere de relance.
        { rotulo: "= Total da base", valor: n(pessoas), tom: "neutro" },
      ]}
      aviso={
        soNumero > 0 || semTelefone > 0 || aCorrigir > 0
          ? {
              texto: (
                <>
                  {soNumero > 0 && (
                    <>
                      <b>{n(soNumero)}</b> pessoas conversaram com a campanha e nunca foram registradas.{" "}
                    </>
                  )}
                  {aCorrigir > 0 && (
                    <>
                      <b>{n(aCorrigir)}</b> das sem município têm algo escrito que não é cidade — &ldquo;Bahia&rdquo;,
                      &ldquo;Chapada Diamantina&rdquo;, grafia torta.{" "}
                    </>
                  )}
                  {semTelefone > 0 && (
                    <>
                      <b>{n(semTelefone)}</b> fichas não têm telefone — não recebem mensagem e ficam fora do total.
                    </>
                  )}
                </>
              ),
            }
          : undefined
      }
    >
      {/* A somatória só aparece quando existe outra base: sem ela, seria a
          mesma conta dos quatro números acima repetida. */}
      {somatoria && externas.length > 0 && <SomatoriaBases s={somatoria} />}

      <Faixa titulo="Consultar" nota="Achar gente e ver de onde ela veio.">
        <Atalho
          destaque
          href="/leads"
          icone={UsersRound}
          tom="azul"
          titulo="Pessoas"
          nota="Todo mundo na base, com filtro e planilha"
        />
        <Atalho
          href="/rede/indicacoes"
          icone={Network}
          tom="roxo"
          titulo="Rede de indicações"
          nota="Quem trouxe quem, em árvore"
        />
        <Atalho
          href="/mapa"
          icone={Map}
          tom="azul"
          titulo="Mapa de cobertura"
          nota="Onde a base é forte e onde é vazio"
        />
      </Faixa>

      {/* ── TUDO NUM ARQUIVO SÓ ───────────────────────────────────────────
          02/10, Emanuel: "quando eu estou baixando a base, de 81 mil está
          vindo somente 63k".

          Ele baixava pelo botão da tela de Outras bases, que lê SÓ as
          gavetas externas. O número dele estava certo e o botão é que
          mentia no nome: a base da campanha — quem conversou com os 19
          chips e quem está na rede — nunca entrava naquele arquivo.

          Este é o único lugar da plataforma onde os dois lados se juntam,
          por isso o botão mora aqui e não lá. O número ao lado dele é o
          MESMO `unicas` que a somatória mostra logo acima, de propósito:
          botão que promete um número e entrega outro foi o defeito.

          03/10, Emanuel, na instalação do Manassés: "puxou somente 10k".
          Lá este botão devolvia erro — a 0053 não tinha rodado no banco
          dele — e o único "Base completa" que funcionava era o da base da
          campanha, logo abaixo: 9.542, onde a tela mostra 46 mil. Dois
          botões com o mesmo nome e números diferentes é o defeito de ontem
          do outro lado. Por isso este subiu para ser o primeiro, e o de
          baixo passou a dizer que é só a campanha. */}
      {somatoria && (
        <Faixa
          titulo="Tudo numa planilha só"
          nota="A base da campanha MAIS todas as outras bases, cada pessoa uma vez. É o número do topo desta tela."
        >
          <Exportar
            href="/api/base/externas/exportar-tudo?tudo=1"
            titulo="Base completa, tudo junto"
            quantidade={somatoria.unicas}
            nota="Campanha + outras bases, sem repetir ninguém"
            destaque
          />
        </Faixa>
      )}

      {/* ── EXPORTAR ──────────────────────────────────────────────────────
          Um botão por tipo, com o tamanho dele à vista: quem vai mandar a
          lista para disparo sabe antes de baixar se são 4 mil ou 12 mil.
          `<a download>` e não o `Atalho` (que é Link do Next): Link faz
          prefetch ao passar o mouse, e cada passada baixaria 2,4 MB de base. */}
      <Faixa titulo="Exportar só a base da campanha" nota="Sem as outras bases. Planilha que abre no Excel, com a coluna do tipo. Cada exportação fica registrada.">
        <Exportar href="/api/base/exportar" titulo="Base da campanha" quantidade={pessoas} nota="Rede e conversas, todos com telefone" />
        <Exportar href="/api/base/exportar?tipo=completos" titulo="1 · Completos na Bahia" quantidade={completos} nota="Nome, telefone e município daqui" />
        <Exportar href="/api/base/exportar?tipo=sem_municipio" titulo="2 · Sem município" quantidade={semMunicipio} nota="Com coluna do que está a corrigir" />
        <Exportar href="/api/base/exportar?tipo=so_numero" titulo="3 · Só o número" quantidade={soNumero} nota="Conversou e não foi registrado" />
        <Exportar href="/api/base/exportar?tipo=outro_estado" titulo="Outro estado" quantidade={outroEstado} nota="Pela cidade do cadastro" />
        <Exportar href="/api/base/exportar?tipo=sem_telefone" titulo="Sem telefone" quantidade={semTelefone} nota="Fichas para completar" />
      </Faixa>

      {/* ── OUTRAS BASES ──────────────────────────────────────────────────
          A antiga de Talita, a de Manassés, as das dobradinhas. Ficam FORA de
          todos os números acima, de propósito (0029_bases_externas.sql). */}
      <Faixa titulo="Outras bases" nota="Bases de fora da campanha, cada uma separada. Não somam com os números acima.">
        <Atalho
          href="/base/externas"
          icone={Layers}
          tom="roxo"
          titulo="Outras bases"
          nota={
            externas.length
              ? `${externas.length} ${externas.length === 1 ? "base" : "bases"}: ${externas.map((b) => b.nome).join(", ")}`
              : "Base antiga, parceiros e dobradinhas"
          }
        />
      </Faixa>

      <Faixa titulo="Cuidar da base" nota="Só a coordenação enxerga esta parte.">
        <Atalho
          href="/municipios"
          icone={Upload}
          tom="cinza"
          titulo="Grafias de município"
          nota="Conferir nomes fora da lista oficial"
        />
        <Atalho
          href="/config"
          icone={Lock}
          tom="vermelho"
          titulo="Quem vê a base"
          nota="Conta do portal só enxerga a própria árvore"
        />
      </Faixa>
    </Central>
  );
}
