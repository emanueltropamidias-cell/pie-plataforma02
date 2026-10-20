import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Cabecalho } from "@/components/ui/pagina";

// A central de uma área.
//
// O menu tinha onze entradas e crescia a cada tela nova — e menu que cresce por
// funcionalidade vira lista de arquivos, não navegação. Agora são cinco áreas, e
// cada área tem uma casa: números do dia no topo, atalhos agrupados por
// intenção, e uma tarja dizendo o que precisa de atenção agora.
//
// Todas as centrais montam com estas mesmas peças de propósito. Enquanto cada
// tela desenhava o próprio cabeçalho, a diferença de dois pixels repetida cinco
// vezes é o que fazia o sistema parecer remendado.

/** As cores dos quadradinhos de ícone. Nome em vez de hexadecimal solto. */
// As cores moram em variáveis (globals.css, "tons das centrais") para o modo
// escuro trocá-las por versões translúcidas — hexadecimal aqui ficaria claro
// em cima do fundo escuro.
const tom = (n: string) => ({ fundo: `var(--tom-${n}-fundo)`, tinta: `var(--tom-${n}-tinta)` });
const TONS = {
  azul: tom("azul"),
  verde: tom("verde"),
  roxo: tom("roxo"),
  ambar: tom("ambar"),
  rosa: tom("rosa"),
  vermelho: tom("vermelho"),
  cinza: tom("cinza"),
} as const;

export type Tom = keyof typeof TONS;

/** Os números do dia. Quem abre a área já sabe onde dói antes de clicar. */
export type Numero = {
  rotulo: string;
  valor: string | number;
  /** Só destaque o que exige ação. Tudo colorido é o mesmo que nada colorido. */
  tom?: "neutro" | "bom" | "atencao" | "ruim";
};

const numeroTom = (n: string) => ({
  borda: `var(--num-${n}-borda)`,
  fundo: `var(--num-${n}-fundo)`,
  rotulo: `var(--num-${n}-rotulo)`,
  valor: `var(--num-${n}-valor)`,
});
const NUMERO_TOM = {
  neutro: numeroTom("neutro"),
  bom: numeroTom("bom"),
  atencao: numeroTom("atencao"),
  ruim: numeroTom("ruim"),
} as const;

export function Central({
  sobretitulo,
  titulo,
  descricao,
  numeros,
  children,
  aviso,
  acoes,
}: {
  sobretitulo: string;
  titulo: string;
  descricao?: string;
  numeros?: Numero[];
  children: ReactNode;
  aviso?: { texto: ReactNode; urgente?: boolean };
  /**
   * O canto direito do cabeçalho.
   *
   * Existe pelo menu de conta: no subdomínio de atendimento NÃO HÁ barra
   * lateral, então quem cai numa central — a supervisora — ficava sem lugar
   * nenhum para trocar a senha ou sair.
   */
  acoes?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-7 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo={sobretitulo}
        titulo={titulo}
        descricao={descricao}
        acoes={acoes}
      />

      {numeros && numeros.length > 0 && (
        <div
          className={`grid grid-cols-2 gap-3 ${
            // Cinco = quatro partes e o total que fecha a conta (Central da base).
            numeros.length === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4"
          }`}
        >
          {numeros.map((n) => {
            const t = NUMERO_TOM[n.tom ?? "neutro"];
            return (
              <div
                key={n.rotulo}
                className="rounded-lg border px-4 py-3.5"
                style={{ borderColor: t.borda, background: t.fundo }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: t.rotulo }}
                >
                  {n.rotulo}
                </span>
                <div
                  className="tabular mt-1 text-[27px] font-extrabold leading-none tracking-[-0.02em]"
                  style={{ color: t.valor }}
                >
                  {n.valor}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-6">{children}</div>

      {aviso && (
        <div
          className={`rounded-lg border px-4 py-3.5 ${
            aviso.urgente
              ? "border-amber-200 bg-amber-50"
              : "border-tinta-200 bg-white "
          }`}
        >
          <span
            className={`text-[12.5px] font-bold ${aviso.urgente ? "text-amber-800" : "text-tinta-800"}`}
          >
            O que precisa de você agora
          </span>
          <p
            className={`mt-1 text-[12.5px] leading-relaxed ${
              aviso.urgente ? "text-amber-700" : "text-tinta-500"
            }`}
          >
            {aviso.texto}
          </p>
        </div>
      )}
    </div>
  );
}

/** Um grupo de atalhos. O título diz o que a pessoa quer FAZER, não onde fica. */
export function Faixa({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[15px] font-bold tracking-[-0.01em] text-tinta-900">
        {titulo}
      </h2>
      {nota && <p className="mt-0.5 text-[12.5px] text-tinta-500">{nota}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

/** Um cartão-atalho. `selo` é para estado que não pode esperar o clique. */
export function Atalho({
  href,
  icone: Icone,
  tom = "cinza",
  titulo,
  nota,
  selo,
  destaque,
  emBreve,
}: {
  href: string;
  icone: LucideIcon;
  tom?: Tom;
  titulo: string;
  nota: string;
  selo?: { texto: string; tom: "bom" | "ruim" | "atencao" };
  /** O atalho principal da área — o que a pessoa abre nove em cada dez vezes. */
  destaque?: boolean;
  emBreve?: boolean;
}) {
  const c = TONS[tom];
  const s = selo ? NUMERO_TOM[selo.tom] : null;

  const miolo = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md"
          style={{ background: c.fundo, color: c.tinta }}
        >
          <Icone size={13} strokeWidth={2.2} />
        </span>
        <h3
          className={`min-w-0 truncate text-[13.5px] font-bold ${
            emBreve ? "text-tinta-400" : "text-tinta-900"
          }`}
        >
          {titulo}
        </h3>
        {s && (
          <span
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold"
            style={{
              borderColor: s.borda,
              background: s.fundo,
              color: s.valor,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: s.valor }}
            />
            {selo!.texto}
          </span>
        )}
      </div>
      <p className="mt-1 pl-[32px] text-[12px] leading-relaxed text-tinta-500">
        {nota}
      </p>
    </>
  );

  // Atalho que ainda não existe não vira link morto: fica visível, apagado e sem
  // clique, porque a lista completa da área também informa.
  if (emBreve) {
    return (
      <div className="min-w-0 rounded-lg border border-dashed border-tinta-200 px-4 py-3.5">
        {miolo}
      </div>
    );
  }

  return (
    <Link
      href={href}
      prefetch
      className={`min-w-0 rounded-lg border bg-white px-4 py-3.5  transition-colors hover:border-tema ${
        destaque
          ? "border-tema shadow-[0_0_0_3px_color-mix(in_srgb,var(--tema)_14%,transparent)]"
          : "border-tinta-200"
      }`}
    >
      {miolo}
    </Link>
  );
}
