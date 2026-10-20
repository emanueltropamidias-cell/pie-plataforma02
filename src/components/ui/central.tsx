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

/** As cores dos quadradinhos de ícone. */
const TONS = {
  azul: { fundo: "rgba(37, 99, 235, 0.2)", tinta: "#38bdf8" },
  verde: { fundo: "rgba(16, 185, 129, 0.2)", tinta: "#34d399" },
  roxo: { fundo: "rgba(124, 58, 237, 0.2)", tinta: "#a78bfa" },
  ambar: { fundo: "rgba(245, 158, 11, 0.2)", tinta: "#fbbf24" },
  rosa: { fundo: "rgba(244, 63, 94, 0.2)", tinta: "#fb7185" },
  vermelho: { fundo: "rgba(239, 68, 68, 0.2)", tinta: "#f87171" },
  cinza: { fundo: "rgba(255, 255, 255, 0.08)", tinta: "#94a3b8" },
} as const;

export type Tom = keyof typeof TONS;

/** Os números do dia. Quem abre a área já sabe onde dói antes de clicar. */
export type Numero = {
  rotulo: string;
  valor: string | number;
  /** Só destaque o que exige ação. Tudo colorido é o mesmo que nada colorido. */
  tom?: "neutro" | "bom" | "atencao" | "ruim";
};

const NUMERO_TOM = {
  neutro: {
    borda: "rgba(255, 255, 255, 0.08)",
    fundo: "rgba(15, 20, 34, 0.75)",
    rotulo: "#94a3b8",
    valor: "#ffffff",
  },
  bom: {
    borda: "rgba(16, 185, 129, 0.28)",
    fundo: "rgba(16, 185, 129, 0.12)",
    rotulo: "#34d399",
    valor: "#34d399",
  },
  atencao: {
    borda: "rgba(245, 158, 11, 0.28)",
    fundo: "rgba(245, 158, 11, 0.12)",
    rotulo: "#fbbf24",
    valor: "#fbbf24",
  },
  ruim: {
    borda: "rgba(239, 68, 68, 0.28)",
    fundo: "rgba(239, 68, 68, 0.12)",
    rotulo: "#f87171",
    valor: "#f87171",
  },
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
            numeros.length === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4"
          }`}
        >
          {numeros.map((n) => {
            const t = NUMERO_TOM[n.tom ?? "neutro"];
            return (
              <div
                key={n.rotulo}
                className="rounded-2xl border px-4 py-3.5 backdrop-blur-xl shadow-[0_8px_25px_rgba(0,0,0,0.25)] transition-all hover:scale-[1.01]"
                style={{ borderColor: t.borda, background: t.fundo }}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: t.rotulo }}
                >
                  {n.rotulo}
                </span>
                <div
                  className="tabular mt-1 text-[28px] font-extrabold leading-none tracking-[-0.03em]"
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
          className={`rounded-2xl border px-5 py-4 backdrop-blur-xl ${
            aviso.urgente
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-white/[0.08] bg-[#0f1422]/75 text-zinc-300"
          }`}
        >
          <span
            className={`text-[13px] font-bold ${aviso.urgente ? "text-amber-400" : "text-white"}`}
          >
            O que precisa de você agora
          </span>
          <p
            className={`mt-1 text-[13px] leading-relaxed ${
              aviso.urgente ? "text-amber-200/90" : "text-zinc-400"
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
      <h2 className="text-[16px] font-bold tracking-[-0.02em] text-white">
        {titulo}
      </h2>
      {nota && <p className="mt-0.5 text-[12.5px] text-zinc-400">{nota}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

/** Um cartão-atalho com estilo glassmorphic Apple Spatial. */
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
  destaque?: boolean;
  emBreve?: boolean;
}) {
  const c = TONS[tom];
  const s = selo ? NUMERO_TOM[selo.tom] : null;

  const miolo = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-xl shadow-sm"
          style={{ background: c.fundo, color: c.tinta }}
        >
          <Icone size={14} strokeWidth={2.4} />
        </span>
        <h3
          className={`min-w-0 truncate text-[14px] font-bold tracking-tight ${
            emBreve ? "text-zinc-500" : "text-white"
          }`}
        >
          {titulo}
        </h3>
        {s && (
          <span
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold backdrop-blur-md"
            style={{
              borderColor: s.borda,
              background: s.fundo,
              color: s.valor,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shadow-[0_0_6px_currentColor]"
              style={{ background: s.valor }}
            />
            {selo!.texto}
          </span>
        )}
      </div>
      <p className="mt-1.5 pl-[34px] text-[12.5px] leading-relaxed text-zinc-400">
        {nota}
      </p>
    </>
  );

  if (emBreve) {
    return (
      <div className="min-w-0 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-3.5 opacity-60">
        {miolo}
      </div>
    );
  }

  return (
    <Link
      href={href}
      prefetch
      className={`group min-w-0 rounded-2xl border px-4 py-3.5 backdrop-blur-xl transition-all duration-200 ${
        destaque
          ? "border-cyan-500/40 bg-gradient-to-b from-blue-900/25 to-[#0f1422]/80 shadow-[0_0_24px_rgba(0,240,255,0.12)] hover:border-cyan-400 hover:shadow-[0_0_30px_rgba(0,240,255,0.22)]"
          : "border-white/[0.08] bg-[#0f1422]/70 shadow-[0_8px_25px_rgba(0,0,0,0.22)] hover:border-white/20 hover:bg-[#121829]/80 hover:shadow-[0_8px_30px_rgba(0,100,255,0.1)]"
      }`}
    >
      {miolo}
    </Link>
  );
}
