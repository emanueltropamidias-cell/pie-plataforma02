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

export type Modulo =
  | "dashboard"
  | "atendimento"
  | "trafego"
  | "base"
  | "estrategia"
  | "liderancas"
  | "gabinete";

/** As rotas de cada módulo. A primeira é a casa dele. */
export const ROTAS_DO_MODULO: Record<Modulo, string[]> = {
  dashboard: ["/dashboard"],
  atendimento: ["/atendimento"],
  trafego: ["/trafego", "/api/trafego"],
  base: ["/base", "/rede", "/leads", "/mapa", "/municipios"],
  estrategia: ["/estrategia"],
  // Separada da Estratégia em 20/10/2026, quando ganhou item próprio no menu —
  // dá para liberar o painel eleitoral sem liberar o cadastro de lideranças.
  liderancas: ["/liderancas", "/crm", "/ranking", "/metas", "/dobradinha"],
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

// ── AS ABAS DE CADA CONTA ───────────────────────────────────────────────────
//
// Além da instalação, cada conta pode ter as abas que usa (coluna
// `profiles.modulos`, migração 0060): o admin marca na hora de criar. null =
// todas, que é como tudo funcionava antes. Admin vê tudo sempre — quem
// administra contas não pode se trancar fora da tela de usuários.
//
// É trava de TELA. O dado continua com a trava de papel no banco.

/** As abas que se marcam na criação da conta, na ordem do menu. */
export const ABAS: { modulo: Modulo; rotulo: string; nota: string }[] = [
  { modulo: "dashboard", rotulo: "Dashboard", nota: "Números do dia" },
  { modulo: "atendimento", rotulo: "Atendimento", nota: "Caixa de entrada e fila" },
  { modulo: "trafego", rotulo: "Tráfego pago", nota: "Anúncios e leads" },
  { modulo: "base", rotulo: "Base", nota: "As pessoas cadastradas" },
  { modulo: "estrategia", rotulo: "Estratégia", nota: "Painel eleitoral do TSE" },
  { modulo: "liderancas", rotulo: "Lideranças", nota: "Cadastro, metas e dobradinhas" },
  { modulo: "gabinete", rotulo: "Gabinete", nota: "Demandas da população" },
];

export const TODOS_MODULOS = ABAS.map((a) => a.modulo);

/** Se a conta alcança a aba: instalação ligada E (admin, sem lista, ou na lista). */
export function contaVe(m: Modulo, conta: { role?: string | null; modulos?: string[] | null }): boolean {
  if (!moduloAtivo(m)) return false;
  if (conta.role === "admin" || !conta.modulos) return true;
  return conta.modulos.includes(m);
}

/** O caminho cabe nas abas da conta? Caminho fora de qualquer aba (config, perfil) passa. */
export function contaAlcanca(caminho: string, conta: { role?: string | null; modulos?: string[] | null }) {
  const m = moduloDoCaminho(caminho);
  return m === null || contaVe(m, conta);
}

/** Para onde mandar a conta quando ela cai fora das abas dela: a primeira que ela tem. */
export function casaDaConta(conta: { role?: string | null; modulos?: string[] | null }): string {
  const m = TODOS_MODULOS.find((x) => contaVe(x, conta));
  return m ? ROTAS_DO_MODULO[m][0] : "/config";
}
