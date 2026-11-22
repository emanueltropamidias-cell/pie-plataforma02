// Instagram público de qualquer perfil profissional (comercial ou criador), pela
// API oficial da Meta: `business_discovery`.
//
// ── COMO FUNCIONA ───────────────────────────────────────────────────────────
//
// A Meta não deixa consultar um perfil "solto". A consulta é feita A PARTIR de
// uma conta profissional do Instagram nossa (a "consultora"), ligada a uma
// página do Facebook que o token enxerga:
//
//   GET /<id da consultora>?fields=business_discovery.username(<@>){...}
//
// O token é o mesmo do tráfego (META_ACCESS_TOKEN, pode ter vários). A
// consultora é achada sozinha em `/me/accounts`; para fixar uma, usar
// IG_CONSULTA_ID na Vercel.
//
// ── LIMITES QUE IMPORTAM ────────────────────────────────────────────────────
//
// - Perfil PESSOAL (não profissional) não aparece: a Meta devolve erro. Quase
//   todo político usa perfil profissional, mas o erro fica gravado no perfil.
// - Curtidas escondidas pelo dono vêm sem `like_count`: gravamos null, nunca 0.
// - Seguidores do PASSADO não existem na API. O histórico é o que
//   `redes_fotos` acumular a partir da primeira coleta.
// - Limite de chamadas por hora da conta consultora: a rota coleta em lotes.

import { API_VERSION, tokensDaMeta } from "@/lib/trafego/meta";

export type PostIG = {
  id: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp: string;
};

export type PerfilIG = {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  profile_picture_url?: string;
  media?: { data: PostIG[] };
};

export type Consultora = { igId: string; token: string; pagina: string };

async function pedir<T>(caminho: string, token: string): Promise<T> {
  const sep = caminho.includes("?") ? "&" : "?";
  const r = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${caminho}${sep}access_token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  const j = await r.json();
  if (!r.ok || j?.error) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
  return j as T;
}

/**
 * A conta profissional do Instagram que faz as consultas. Percorre os tokens
 * e as páginas de cada um; devolve também o que viu, para o diagnóstico dizer
 * exatamente o que falta quando não acha nenhuma.
 */
export async function acharConsultora(bruto: string | undefined | null): Promise<{
  consultora: Consultora | null;
  visto: string[];
}> {
  const tokens = tokensDaMeta(bruto);
  const visto: string[] = [];
  const fixo = process.env.IG_CONSULTA_ID?.trim();

  for (const [i, token] of tokens.entries()) {
    if (fixo) {
      try {
        await pedir(`${fixo}?fields=username`, token);
        return { consultora: { igId: fixo, token, pagina: "IG_CONSULTA_ID" }, visto };
      } catch (e) {
        visto.push(`token ${i + 1}: IG_CONSULTA_ID recusado (${(e as Error).message})`);
        continue;
      }
    }
    try {
      const r = await pedir<{ data?: { name: string; instagram_business_account?: { id: string } }[] }>(
        "me/accounts?fields=name,instagram_business_account&limit=100",
        token,
      );
      const paginas = r.data ?? [];
      if (!paginas.length) visto.push(`token ${i + 1}: nenhuma página do Facebook`);
      for (const p of paginas) {
        if (p.instagram_business_account?.id)
          return { consultora: { igId: p.instagram_business_account.id, token, pagina: p.name }, visto };
        visto.push(`token ${i + 1}: página "${p.name}" sem Instagram profissional ligado`);
      }
    } catch (e) {
      visto.push(`token ${i + 1}: ${(e as Error).message}`);
    }
  }
  return { consultora: null, visto };
}

const CAMPOS_POST =
  "id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp";

/** Um perfil e os últimos `posts` posts dele. */
export async function lerPerfil(c: Consultora, usuario: string, posts = 50): Promise<PerfilIG> {
  const campos =
    `business_discovery.username(${usuario}){id,username,name,biography,followers_count,` +
    `follows_count,media_count,profile_picture_url,media.limit(${posts}){${CAMPOS_POST}}}`;
  const r = await pedir<{ business_discovery: PerfilIG }>(`${c.igId}?fields=${encodeURIComponent(campos)}`, c.token);
  return r.business_discovery;
}
