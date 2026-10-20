import { STATUS, DEMANDAS, type Status, type Demanda } from "@/lib/atendimento";

// O nome e a cor de um status (ou demanda) vêm da ETIQUETA, e não do código.
//
// ── O DEFEITO ───────────────────────────────────────────────────────────────
//
// A caixa pintava o status lendo `STATUS`, uma lista fixa em
// src/lib/atendimento.ts com sete valores. A equipe criou etiquetas de status
// novas pela tela de Etiquetas — "Não apoiador", "aguardando retorno do lead",
// "Em tratativa com outro(a) Atendente", "Pedido de PIX", "Nº Comercial" — e o
// gatilho `tag_alimenta_eixos` gravava certo em `conversas.status_lead`. Só que
// o código não conhecia esses valores, e a caixa mostrava "Sem classificação"
// em 2.532 conversas classificadas (15/09). Para a atendente, a etiqueta
// "não pegava".
//
// O mesmo fato escrito em dois lugares (a tabela `tags` e a constante) sempre
// desencontra. Agora manda a tabela: o que a coordenação cria aparece com o
// nome e a cor que ela escolheu. A constante fica de reserva para valor que
// não tenha etiqueta — os automáticos (`nao_atendido`, `nao_respondeu`).

export type EtiquetaCatalogo = {
  id: number;
  nome: string;
  cor: string;
  descricao: string | null;
  eixo?: string | null;
  valor?: string | null;
};

export type Rotulo = { rotulo: string; cor: string; regra: string | null };

export function rotuloStatus(valor: string | null | undefined, catalogo: EtiquetaCatalogo[]): Rotulo | null {
  if (!valor) return null;
  const t = catalogo.find((x) => x.eixo === "status" && x.valor === valor);
  if (t) return { rotulo: t.nome, cor: t.cor, regra: t.descricao };
  const s = STATUS[valor as Status];
  if (s) return { rotulo: s.rotulo, cor: s.cor, regra: s.regra };
  // Valor que nem a tabela nem o código conhecem (etiqueta desativada ou
  // apagada): mostra o valor cru. Ausente, a conversa pareceria sem status.
  return { rotulo: valor.replace(/_/g, " "), cor: "#52535c", regra: null };
}

export function rotuloDemanda(valor: string, catalogo: EtiquetaCatalogo[]): string {
  return (
    catalogo.find((x) => x.eixo === "demanda" && x.valor === valor)?.nome ??
    DEMANDAS[valor as Demanda]?.rotulo ??
    valor
  );
}
