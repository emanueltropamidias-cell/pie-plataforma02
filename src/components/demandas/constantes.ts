export type Demanda = {
  id: string;
  municipe_id: string | null;
  municipe_nome: string | null;
  municipio: string | null;
  bairro: string | null;
  titulo: string;
  descricao: string | null;
  categoria: string;
  prioridade: string;
  status: string;
  prazo: string | null;
  resposta: string | null;
  resolvida_em: string | null;
  created_at: string;
};

// Emoji dá ar de recado de geladeira. Ícone traçado, dentro de um selo de cor
// própria, é o que separa ferramenta de trabalho de bloco de anotações.
export const CATEGORIAS = [
  { valor: "saude", rotulo: "Saúde", icone: "HeartPulse", cor: "#E14B63" },
  { valor: "educacao", rotulo: "Educação", icone: "GraduationCap", cor: "#8B5CF6" },
  { valor: "infraestrutura", rotulo: "Infraestrutura", icone: "TrafficCone", cor: "#E2701E" },
  { valor: "emprego", rotulo: "Emprego", icone: "Briefcase", cor: "#0525F7" },
  { valor: "assistencia", rotulo: "Assistência social", icone: "HandHeart", cor: "#46B78A" },
  { valor: "seguranca", rotulo: "Segurança", icone: "ShieldCheck", cor: "#0F766E" },
  { valor: "outros", rotulo: "Outros", icone: "Pin", cor: "#64748B" },
];

export const PRIORIDADES = [
  { valor: "baixa", rotulo: "Baixa", cor: "bg-tinta-100 text-tinta-600" },
  { valor: "normal", rotulo: "Normal", cor: "bg-tinta-100 text-tinta-600" },
  { valor: "alta", rotulo: "Alta", cor: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200" },
];

export const STATUS = [
  { valor: "aberta", rotulo: "Aberta", cor: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200" },
  { valor: "andamento", rotulo: "Em andamento", cor: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200" },
  { valor: "resolvida", rotulo: "Resolvida", cor: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" },
  { valor: "sem_solucao", rotulo: "Sem solução", cor: "bg-tinta-100 text-tinta-600 ring-1 ring-inset ring-tinta-200" },
];

export const rotulo = (lista: { valor: string; rotulo: string }[], v: string) =>
  lista.find((x) => x.valor === v)?.rotulo ?? v;

export const cor = (lista: { valor: string; cor?: string }[], v: string) =>
  lista.find((x) => x.valor === v)?.cor ?? "bg-zinc-100 text-zinc-600";

export const categoria = (v: string) => CATEGORIAS.find((c) => c.valor === v) ?? CATEGORIAS[6];

/**
 * Deixa legível o título digitado em CAIXA ALTA.
 *
 * A atendente registra correndo, no meio do atendimento, e muita coisa entra
 * gritando. Guardamos o texto como veio — corrigir o dado de alguém é decisão
 * dela, não nossa — e só arrumamos na hora de exibir. Siglas curtas ficam de
 * pé, senão "SUS" viraria "Sus".
 */
export function humanizar(texto: string) {
  const t = (texto ?? "").trim();
  if (!t) return "";
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, "").length;
  // Menos de 70% em caixa alta: já foi escrito normalmente.
  if (!letras.length || maiusculas / letras.length < 0.7) return t;

  const SIGLAS = new Set(["SUS", "PIX", "CRAS", "CREAS", "UPA", "IPTU", "CPF", "RG", "BPC", "INSS", "SAMU", "PM"]);
  const frase = t
    .split(/\s+/)
    .map((p) => {
      const limpa = p.replace(/[^A-Za-zÀ-ÿ]/g, "");
      if (SIGLAS.has(limpa.toUpperCase()) && limpa.length >= 2) return p.toUpperCase();
      return p.toLowerCase();
    })
    .join(" ");
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}
