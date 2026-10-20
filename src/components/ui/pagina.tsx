import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// As peças que se repetem em toda tela. Antes cada página montava seu próprio
// cabeçalho e seu próprio cartão, com tamanhos parecidos mas nunca iguais — e
// é essa diferença de dois pixels, repetida dez vezes, que faz um sistema
// parecer montado às pressas.

/** Cabeçalho padrão: sobretítulo, título, uma linha de contexto e as ações. */
export function Cabecalho({
  sobretitulo,
  titulo,
  descricao,
  acoes,
  voltar,
}: {
  sobretitulo: string;
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
  /**
   * Para onde a seta volta — a central da área.
   *
   * Com as centrais, toda tela interna passou a ter uma casa, e o menu deixou
   * de listar essa tela. Sem a seta, o caminho de volta é o item da área no
   * menu, que recarrega a central inteira e não parece "voltar" — parece
   * começar de novo. O sobretítulo já nomeia a área; a seta é o que torna
   * aquele nome uma porta.
   */
  voltar?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {voltar && (
          <Link
            href={voltar}
            aria-label={`Voltar para ${sobretitulo}`}
            title={`Voltar para ${sobretitulo}`}
            // Alinhada com o sobretítulo, não com o título: é dele que a seta
            // fala, e é a primeira linha que a pessoa lê.
            className="mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-tinta-200 bg-white text-tinta-500 transition-colors hover:border-tinta-300 hover:text-tinta-900"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </Link>
        )}
        <div className="min-w-0">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-tema">
            {sobretitulo}
          </span>
          <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-tinta-900">
            {titulo}
          </h1>
          {descricao && (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta-500">
              {descricao}
            </p>
          )}
        </div>
      </div>
      {acoes && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {acoes}
        </div>
      )}
    </header>
  );
}

/** Superfície branca padrão. Borda discreta em vez de sombra pesada. */
export function Cartao({
  children,
  className = "",
  titulo,
  descricao,
  acoes,
}: {
  children: ReactNode;
  className?: string;
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
}) {
  return (
    // min-w-0: item de grid e de flex nasce com min-width auto, ou seja, se
    // recusa a ficar mais estreito que o conteúdo mais largo que tem dentro. Um
    // título de uma linha só empurrava o cartão para além da tela, e no celular
    // a página inteira andava de lado — o `truncate` lá dentro nunca chegava a
    // valer porque quem não podia encolher era o cartão.
    <section
      className={`min-w-0 rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)] ${className}`}
    >
      {(titulo || acoes) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-tinta-100 px-5 py-3.5">
          <div>
            {titulo && (
              <h2 className="text-[13.5px] font-bold text-tinta-800">
                {titulo}
              </h2>
            )}
            {descricao && (
              <p className="mt-0.5 text-[12px] text-tinta-500">{descricao}</p>
            )}
          </div>
          {acoes && <div className="flex items-center gap-2">{acoes}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Indicador numérico.
 *
 * O rótulo vem pequeno e espaçado, o número vem grande e com dígito de largura
 * fixa, e o contexto vem por último — nessa ordem porque é a ordem em que o
 * olho procura: o que é, quanto é, e só então o que isso significa.
 */
export function Indicador({
  rotulo,
  valor,
  contexto,
  destaque,
}: {
  rotulo: string;
  valor: string;
  contexto?: ReactNode;
  /** Marca o cartão com a cor da marca. Um por tela, no que mais importa. */
  destaque?: boolean;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-tinta-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
      {destaque && <span className="absolute inset-x-0 top-0 h-0.5 bg-tema" />}
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-500">
        {rotulo}
      </p>
      <p className="tabular mt-2 text-[30px] font-extrabold leading-none tracking-[-0.03em] text-tinta-900">
        {valor}
      </p>
      {contexto && (
        <p className="mt-2 text-[11.5px] leading-snug text-tinta-400">
          {contexto}
        </p>
      )}
    </div>
  );
}
