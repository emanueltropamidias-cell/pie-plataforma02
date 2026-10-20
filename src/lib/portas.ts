// Onde a atendente pode entrar.
//
// ── POR QUE ISTO É UM ARQUIVO SÓ ────────────────────────────────────────────
//
// Havia DUAS travas com a lista escrita à mão, uma em cada arquivo:
//
//   src/middleware.ts        barra por SUBDOMÍNIO (atendimento.…)
//   src/app/(app)/layout.tsx barra por PAPEL (role = atendente)
//
// Abri o cadastro para as meninas na segunda e não na primeira. Resultado: no
// celular do Matheus, que usa o subdomínio, a tela de cadastro existia, o botão
// aparecia, e clicar devolvia para a fila. A função estava pronta havia horas e
// ninguém conseguia usar.
//
// O mesmo fato escrito em dois lugares sempre desencontra — é questão de tempo,
// não de cuidado. Agora é uma lista só. Uma terceira trava que apareça importa
// daqui e nasce certa.
//
// A trava de DADO é outra e continua inteira: `perfil_equipe()` é falso para
// atendente, então a base de 29 mil não aparece nem chamando a API direto. Isto
// aqui é enquadramento de tela.

/** As telas de trabalho da atendente. */
export const PORTAS_DA_ATENDENTE = [
  "/atendimento/caixa",
  "/atendimento/cadastro",
] as const;

/** Endereços de infraestrutura: sem eles nem dá para entrar ou sair. */
const INFRA = ["/login", "/auth", "/pendente", "/api"] as const;

export function ehPortaDaAtendente(caminho: string): boolean {
  return PORTAS_DA_ATENDENTE.some(
    (p) => caminho === p || caminho.startsWith(p + "/"),
  );
}

/** O que o subdomínio `atendimento.…` deixa abrir. */
export function ehPermitidoNoSubdominio(caminho: string): boolean {
  return (
    ehPortaDaAtendente(caminho) ||
    INFRA.some((p) => caminho === p || caminho.startsWith(p + "/"))
  );
}
