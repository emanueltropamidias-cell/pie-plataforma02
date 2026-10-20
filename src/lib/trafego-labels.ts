// Traduções dos códigos da Meta para rótulos legíveis no painel.

const OBJETIVOS: Record<string, string> = {
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Vendas",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_APP_PROMOTION: "App",
  MESSAGES: "Mensagens",
  LINK_CLICKS: "Tráfego",
  LEAD_GENERATION: "Leads",
  POST_ENGAGEMENT: "Engajamento",
  PAGE_LIKES: "Curtidas",
  CONVERSIONS: "Conversões",
  REACH: "Alcance",
  BRAND_AWARENESS: "Reconhecimento",
  VIDEO_VIEWS: "Visualizações",
};

export function rotuloObjetivo(o: string | null | undefined): string {
  if (!o) return "-";
  return OBJETIVOS[o] ?? o.replace(/^OUTCOME_/, "").toLowerCase();
}

const RESULTADOS: Record<string, string> = {
  "onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas",
  "onsite_conversion.follow": "Seguidores",
  follow: "Seguidores",
  lead: "Cadastros",
  "onsite_conversion.lead_grouped": "Cadastros",
  leadgen_grouped: "Cadastros",
  link_click: "Cliques no link",
  landing_page_view: "Visitas à página",
  purchase: "Compras",
  omni_purchase: "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras (pixel)",
  post_engagement: "Engajamentos",
  page_engagement: "Engajamentos",
  post_reaction: "Reações",
  like: "Curtidas",
  reach: "Alcance",
  app_install: "Instalações",
};

export function rotuloResultado(a: string | null | undefined): string {
  if (!a) return "Resultados";
  return RESULTADOS[a] ?? "Resultados";
}

// Status da conta de anúncios (account_status da Meta)
const CONTA_STATUS: Record<number, string> = {
  1: "Ativa",
  2: "Desativada",
  3: "Saldo pendente",
  7: "Em análise de risco",
  8: "Pagamento pendente",
  9: "Período de carência",
  100: "Encerramento pendente",
  101: "Encerrada",
  201: "Ativa",
  202: "Encerrada",
};
export function rotuloContaStatus(s: number | null | undefined): string | null {
  if (s == null) return null;
  return CONTA_STATUS[s] ?? `Status ${s}`;
}
export function contaOk(s: number | null | undefined): boolean {
  return s === 1 || s === 201;
}

export function statusAtivo(s: string | null | undefined): boolean {
  return (s ?? "").toUpperCase() === "ACTIVE";
}
export function rotuloStatus(s: string | null | undefined): string {
  return statusAtivo(s) ? "Ativa" : "Pausada";
}
