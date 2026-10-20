// Quais áreas do PIE esta instalação usa.
//
// ── POR QUE EXISTE ──────────────────────────────────────────────────────────
//
// As instalações rodam do MESMO código (INSTALAR.md). A do deputado Manassés
// usa uma parte do que a da Talita usa — "ele não usa 30% do que usamos" — e em
// 15/09 o Emanuel definiu: atendimento, cadastro de liderança e QR,
// estratégia/mapa e base. Gabinete e tráfego pago ficam de fora.
//
// Esconder por instalação, e não apagar do código: o que a Talita usa continua
// no mesmo repositório, e ligar de volta é mudar uma variável na Vercel.
//
// ── COMO LIGA E DESLIGA ─────────────────────────────────────────────────────
//
//   NEXT_PUBLIC_MODULOS_OCULTOS=gabinete,trafego
//
// Vazio (ou ausente) = tudo ligado. É o padrão de propósito: a instalação da
// Talita não configura nada e continua exatamente como está.
//
// A trava é de TELA (menu, atalhos, rota). Os dados já têm a trava deles no
// banco, que é outra instalação — o que está oculto aqui simplesmente não tem
// dado lá.

export type Modulo = "dashboard" | "atendimento" | "trafego" | "base" | "estrategia" | "gabinete";

/** As rotas de cada módulo. A primeira é a casa dele. */
export const ROTAS_DO_MODULO: Record<Modulo, string[]> = {
  dashboard: ["/dashboard"],
  atendimento: ["/atendimento"],
  trafego: ["/trafego", "/api/trafego"],
  base: ["/base", "/rede", "/leads", "/mapa", "/municipios"],
  estrategia: ["/estrategia", "/liderancas", "/crm", "/ranking", "/metas", "/dobradinha"],
  gabinete: ["/gabinete", "/demandas", "/conversas"],
};

const OCULTOS = new Set(
  (process.env.NEXT_PUBLIC_MODULOS_OCULTOS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function moduloAtivo(m: Modulo): boolean {
  return !OCULTOS.has(m);
}

const dentro = (caminho: string, base: string) => caminho === base || caminho.startsWith(`${base}/`);

/** O módulo a que um caminho pertence, ou nulo se não pertence a nenhum. */
export function moduloDoCaminho(caminho: string): Modulo | null {
  for (const [m, rotas] of Object.entries(ROTAS_DO_MODULO) as [Modulo, string[]][])
    if (rotas.some((r) => dentro(caminho, r))) return m;
  return null;
}

/** Caminho que pertence a módulo desligado nesta instalação. */
export function caminhoOculto(caminho: string): boolean {
  const m = moduloDoCaminho(caminho);
  return m !== null && !moduloAtivo(m);
}
