// O formato que as funções `base_externa_*` devolvem
// (supabase/migrations/0029_bases_externas.sql).

export type BaseExterna = {
  id: string;
  nome: string;
  categoria: string;
  descricao: string | null;
  arquivo: string | null;
  situacao: "subindo" | "pronta";
  linhas_arquivo: number;
  criada_em: string;
  criada_por: string | null;
  pessoas: number;
  completos: number;
  sem_municipio: number;
  a_corrigir: number;
  so_numero: number;
  /** Quantos têm DDD da Bahia. Fato diferente de `completos`, que é cidade
   *  DECLARADA — base vinda de agenda não tem cidade nenhuma e só sabe isto. */
  ddd_bahia?: number;
  ddd_fora?: number;
  outro_estado: number;
  sem_telefone: number;
};

export type BaseExternaResumo = BaseExterna & {
  extras: string[];
  municipios: { nome: string; qtd: number }[];
  a_corrigir_lista: { nome: string; qtd: number }[];
};

export const CATEGORIA_BASE: Record<string, string> = {
  mandato: "Mandato / base antiga",
  dobradinha: "Dobradinha",
  parceiro: "Parceiro / apoiador",
  outra: "Outra",
};
