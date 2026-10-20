import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { PortalShare } from "@/components/portal/portal-share";
import { SeletorCor } from "@/components/seletor-cor";
import { Cartao } from "@/components/ui/pagina";
import type { No } from "@/components/rede/arvore";
import { Organograma } from "@/components/rede/organograma";
import { montarRanking, type LiderancaNo, type ContatoNo } from "@/lib/ranking";
import { paginar } from "@/lib/paginar";
import { MARCA } from "@/lib/candidato";

// Painel da liderança.
//
// Quem abre isto está na rua, no celular, entre uma conversa e outra. A tela
// responde três perguntas nessa ordem: como eu convido mais gente, como eu estou
// indo, e quem já veio por mim.
//
// A versão anterior empilhava seis cartões de peso parecido e a pessoa tinha que
// varrer a tela para achar o que importava. Aqui o topo carrega o número, a
// posição e o botão de convidar num bloco só — o resto desce de tamanho.

type Node = No & {
  votos_comprometidos: number | null;
  created_at?: string | null;
};

const TITULOS = new Set([
  "deputada", "deputado", "dep", "dr", "dra", "sr", "sra",
  "prof", "profa", "vereador", "vereadora", "pastor", "pastora", "cb", "sgt",
]);

/**
 * Primeiro nome de verdade.
 *
 * `split(" ")[0]` puro dizia "Faltam 7 para passar Deputada" — o cargo vem
 * grudado no nome cadastrado e virava o apelido da pessoa no placar.
 */
function primeiroNome(nome: string) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  for (const p of partes) {
    const limpo = p.replace(/\./g, "").toLowerCase();
    if (!TITULOS.has(limpo) && limpo.length > 1) return p;
  }
  return partes[0] ?? "";
}

/** "há 2 dias" em vez de uma data — ninguém guarda em que dia do mês foi. */
function quando(iso?: string | null) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const dias = Math.floor((Date.now() - t) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 14) return "semana passada";
  if (dias < 60) return `há ${Math.floor(dias / 7)} semanas`;
  return `há ${Math.floor(dias / 30)} meses`;
}

function iniciais(nome: string) {
  return (
    (nome || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default async function PortalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("liderancas")
    .select("id, nome, link_code, telefone, municipio, votos_comprometidos, mensagem_qr")
    .eq("auth_uid", user.id)
    .maybeSingle();

  const prim = primeiroNome(me?.nome || (user.email || "").split("@")[0]);

  // Conta logada mas sem liderança vinculada
  if (!me) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-tinta-50 px-6 text-center">
        <h1 className="text-2xl font-extrabold text-tinta-900">Olá, {prim}!</h1>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-tinta-500">
          Sua conta ainda não está vinculada a uma liderança. Fale com a equipe pra receber o seu
          código de vínculo.
        </p>
        <LogoutButton className="text-sm font-medium text-tinta-500 hover:text-tinta-900" />
      </main>
    );
  }

  // Toda a rede pra montar a subárvore dela. Paginado: o Supabase corta em
  // 1000 linhas sem avisar, e aí a rede aparece menor do que é.
  const todos = await paginar<Node>((de, ate) =>
    supabase
      .from("liderancas")
      .select("id, nome, municipio, parent_id, tipo, votos_comprometidos, created_at")
      .range(de, ate),
  );

  const filhosPor = new Map<string, Node[]>();
  for (const n of todos) {
    if (n.parent_id) {
      const arr = filhosPor.get(n.parent_id) ?? [];
      arr.push(n);
      filhosPor.set(n.parent_id, arr);
    }
  }
  function descendentes(id: string): Node[] {
    const out: Node[] = [];
    const stack = [...(filhosPor.get(id) ?? [])];
    while (stack.length) {
      const c = stack.pop();
      if (!c) continue;
      out.push(c);
      stack.push(...(filhosPor.get(c.id) ?? []));
    }
    return out;
  }

  const ranking = montarRanking(
    todos.filter((n) => (n.tipo ?? "lideranca") === "lideranca") as LiderancaNo[],
    todos.filter((n) => n.tipo === "contato") as ContatoNo[],
  );
  const minhaPos = ranking.find((r) => r.id === me.id);
  const acima = minhaPos && minhaPos.posicao > 1 ? ranking[minhaPos.posicao - 2] : null;

  // Vizinhança do placar: duas acima, eu, duas abaixo. "Faltam 7 para passar
  // fulana" não mostra que existe alguém colado atrás — e é isso que faz mandar
  // mais um convite hoje em vez de semana que vem.
  const vizinhos = minhaPos
    ? ranking.slice(Math.max(0, minhaPos.posicao - 3), minhaPos.posicao + 2)
    : [];

  const desc = descendentes(me.id);
  const diretos = filhosPor.get(me.id) ?? [];
  // Contagens que fecham entre si: o total é o que se vê na árvore, e as duas
  // parcelas somam o total. Antes "total na rede" não contava quem chegou pelo
  // QR — dava 0 embaixo de um placar que dizia 29, e parecia defeito.
  const total = desc.length;
  const indiretos = total - diretos.length;
  const votos =
    desc.reduce((s, d) => s + (d.votos_comprometidos || 0), 0) + (me.votos_comprometidos || 0);

  const recentes = [...desc]
    .filter((d) => d.created_at)
    .sort((a, b) => Date.parse(b.created_at!) - Date.parse(a.created_at!))
    .slice(0, 4);

  const minhaArvore: No[] = [
    { id: me.id, nome: me.nome, municipio: me.municipio, parent_id: null, tipo: "lideranca" },
    ...desc.map((d) => ({
      id: d.id,
      nome: d.nome,
      municipio: d.municipio,
      parent_id: d.parent_id,
      tipo: d.tipo,
    })),
  ];

  const medalha =
    minhaPos?.posicao === 1 ? "🥇" : minhaPos?.posicao === 2 ? "🥈" : minhaPos?.posicao === 3 ? "🥉" : null;

  return (
    <main className="min-h-dvh bg-tinta-50">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-tinta-200 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src={MARCA.cor}
            alt="Talita Oliveira"
            width={110}
            height={28}
            className="h-6 w-auto"
          />
          <span className="hidden text-[12.5px] font-semibold text-tinta-500 sm:inline">
            Painel da Liderança
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SeletorCor />
          <LogoutButton className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-tinta-500 transition-colors hover:bg-tinta-100 hover:text-tinta-900" />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {/* O bloco que carrega tudo: quem é, quanto já fez, e o que fazer agora.
            Era três cartões disputando atenção; virou um só, e o resto desce. */}
        <section
          className="overflow-hidden rounded-2xl p-6 text-white shadow-[0_12px_32px_rgba(10,20,48,0.20)] sm:p-7"
          style={{
            background:
              "linear-gradient(145deg, var(--tema) 0%, color-mix(in srgb, var(--tema) 52%, #060c1a) 100%)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-[14px] font-extrabold">
              {iniciais(me.nome)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-extrabold leading-tight">Olá, {prim}!</p>
              <p className="truncate text-[11.5px] text-white/60">{me.municipio || "Bahia"}</p>
            </div>
            {minhaPos && (
              <span className="ml-auto shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-bold">
                {medalha ?? `${minhaPos.posicao}º`}
                <span className="ml-1 font-medium text-white/60">de {ranking.length}</span>
              </span>
            )}
          </div>

          <div className="mt-6 flex items-end gap-3">
            <span className="tabular text-[54px] font-extrabold leading-none tracking-[-0.04em]">
              {total.toLocaleString("pt-BR")}
            </span>
            <span className="pb-1.5 text-[13px] leading-snug text-white/75">
              {total === 1 ? "pessoa na" : "pessoas na"}
              <br />
              sua rede
            </span>
            {minhaPos && minhaPos.novosSemana > 0 && (
              <span className="mb-1.5 ml-auto rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold">
                +{minhaPos.novosSemana} nesta semana
              </span>
            )}
          </div>

          <div className="mt-6">
            <PortalShare
              linkCode={me.link_code ?? ""}
              nome={me.nome}
              mensagemQr={me.mensagem_qr}
            />
          </div>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-white/60">
            Quem entrar pelo seu convite fica ligado ao seu nome.
          </p>
        </section>

        {/* Três parcelas do número de cima, em peso menor. Uma linha só: elas
            explicam o total, não competem com ele. */}
        <div className="mt-3 grid grid-cols-3 divide-x divide-tinta-200 overflow-hidden rounded-xl border border-tinta-200 bg-white">
          {[
            { r: "Direto por você", v: diretos.length },
            { r: "Trazidos por eles", v: indiretos },
            { r: "Votos", v: votos },
          ].map((s) => (
            <div key={s.r} className="px-3 py-3.5 text-center">
              <p className="tabular text-[21px] font-extrabold leading-none text-tinta-900">
                {s.v.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1.5 text-[10.5px] leading-tight text-tinta-500">{s.r}</p>
            </div>
          ))}
        </div>

        {minhaPos && vizinhos.length > 1 && (
          <Cartao
            className="mt-3"
            titulo="Placar das lideranças"
            descricao={
              acima
                ? `Faltam ${acima.pessoas - minhaPos.pessoas + 1} para passar ${primeiroNome(acima.nome)}`
                : "Você está na frente. Segure a liderança!"
            }
          >
            <div className="divide-y divide-tinta-100">
              {vizinhos.map((v) => {
                const eu = v.id === me.id;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center gap-3 px-5 py-2.5 ${eu ? "bg-tema/[0.07]" : ""}`}
                  >
                    <span
                      className={`tabular w-7 shrink-0 text-[12px] font-bold ${eu ? "text-tema" : "text-tinta-400"}`}
                    >
                      {v.posicao}º
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[12.5px] ${eu ? "font-bold text-tinta-900" : "text-tinta-600"}`}
                    >
                      {eu ? "Você" : v.nome}
                    </span>
                    <span
                      className={`tabular shrink-0 text-[12.5px] font-bold ${eu ? "text-tema" : "text-tinta-500"}`}
                    >
                      {v.pessoas}
                    </span>
                  </div>
                );
              })}
            </div>
          </Cartao>
        )}

        {recentes.length > 0 && (
          <Cartao className="mt-3" titulo="Quem chegou por último">
            <div className="divide-y divide-tinta-100">
              {recentes.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tinta-100 text-[10.5px] font-bold text-tinta-500">
                    {iniciais(r.nome)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-tinta-800">
                      {r.nome}
                    </span>
                    {r.municipio && (
                      <span className="block truncate text-[11px] text-tinta-400">
                        {r.municipio}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-tinta-400">{quando(r.created_at)}</span>
                </div>
              ))}
            </div>
          </Cartao>
        )}

        {total === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-tinta-300 bg-white/60 px-5 py-10 text-center">
            <p className="text-[13.5px] font-bold text-tinta-800">Sua rede está começando. 🌱</p>
            <p className="mt-1.5 text-[12.5px] text-tinta-500">
              Compartilhe o seu convite aí em cima — quem entrar aparece aqui.
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <Organograma nos={minhaArvore} />
          </div>
        )}
      </div>
    </main>
  );
}
