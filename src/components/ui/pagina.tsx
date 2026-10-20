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
            className="mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-zinc-300 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </Link>
        )}
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
            {sobretitulo}
          </span>
          <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-white">
            {titulo}
          </h1>
          {descricao && (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-400">
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

/** Superfície glassmorphic padrão. Vidro translúcido com borda suave e blur. */
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
    <section
      className={`min-w-0 rounded-2xl border border-white/[0.08] bg-[#0f1422]/75 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.28)] transition-all hover:border-white/[0.12] ${className}`}
    >
      {(titulo || acoes) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <div>
            {titulo && (
              <h2 className="text-[14px] font-bold tracking-tight text-white">
                {titulo}
              </h2>
            )}
            {descricao && (
              <p className="mt-0.5 text-[12px] text-zinc-400">{descricao}</p>
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
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1422]/75 px-5 py-4 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.28)] transition-all hover:border-white/[0.14] hover:shadow-[0_8px_30px_rgba(0,100,255,0.08)]">
      {destaque && (
        <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 shadow-[0_0_12px_#38bdf8]" />
      )}
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-cyan-400/90">
        {rotulo}
      </p>
      <p className="tabular mt-2 text-[32px] font-extrabold leading-none tracking-[-0.03em] text-white">
        {valor}
      </p>
      {contexto && (
        <p className="mt-2 text-[12px] leading-snug text-zinc-400">
          {contexto}
        </p>
      )}
    </div>
  );
}
