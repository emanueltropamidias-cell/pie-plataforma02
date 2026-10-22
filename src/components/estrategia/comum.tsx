"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { CLASSE_RESULTADO, resultadoDe } from "@/lib/eleicao";

// Peças repetidas pelas abas da Estratégia: o selo de resultado, o aviso de
// dado que ainda não foi importado e a leitura de um "extra" da API.

export { fmt, pct, reais } from "@/lib/formato";

/** Eleito, suplente, não eleito… com a cor certa. */
export function SeloResultado({ situacao, className = "" }: { situacao: string | null | undefined; className?: string }) {
  const r = resultadoDe(situacao);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${CLASSE_RESULTADO[r.tom]} ${className}`}
    >
      {r.rotulo}
    </span>
  );
}

/** Dado que a plataforma ainda não tem: dizer, em vez de mostrar zero. */
export function SemDado({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-tinta-50 p-4 text-[12.5px] leading-relaxed text-tinta-600">
      <Info size={16} className="mt-0.5 shrink-0 text-tinta-400" />
      <span>{children}</span>
    </div>
  );
}

export function Carregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-xl bg-tinta-100" />
      ))}
    </div>
  );
}

/** Barra horizontal simples (ranking). */
export function Barra({ valor, maximo, tom = "bg-tema" }: { valor: number; maximo: number; tom?: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-tinta-100">
      <span className={`block h-full rounded-full ${tom}`} style={{ width: `${maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0}%` }} />
    </span>
  );
}

/**
 * Lê `/api/eleicao?candidatoId=…&extra=…`. `undefined` = carregando,
 * `null` = o arquivo ainda não existe para aquele ano e estado.
 */
export function useExtra<T>(candidatoId: number, extra: string) {
  const [estado, setEstado] = useState<{ chave: string; dados: T | null } | null>(null);
  const chaveAtual = `${candidatoId}|${extra}`;
  useEffect(() => {
    let vivo = true;
    fetch(`/api/eleicao?candidatoId=${candidatoId}&extra=${extra}`)
      .then((r) => (r.ok ? r.json() : { dados: null }))
      .then((j) => vivo && setEstado({ chave: chaveAtual, dados: (j?.dados ?? null) as T | null }))
      .catch(() => vivo && setEstado({ chave: chaveAtual, dados: null }));
    return () => {
      vivo = false;
    };
  }, [candidatoId, extra, chaveAtual]);
  return estado?.chave === chaveAtual ? estado.dados : undefined;
}

export function Titulo({ icone, sobre, titulo, nota }: { icone?: ReactNode; sobre: string; titulo: string; nota?: ReactNode }) {
  return (
    <div className="mb-3 border-b border-tinta-100 pb-3">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-tema">
        {icone}
        {sobre}
      </span>
      <h2 className="text-[15px] font-extrabold text-tinta-900 sm:text-base">{titulo}</h2>
      {nota && <p className="mt-0.5 text-[12px] text-tinta-500">{nota}</p>}
    </div>
  );
}

export const CAIXA = "min-w-0 rounded-2xl border border-tinta-200 bg-white p-4 shadow-[0_1px_2px_rgba(22,32,46,0.04)] sm:p-5";
