"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// As etiquetas de uma conversa.
//
// ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────────
//
// A ficha mostrava o CATÁLOGO de etiquetas como texto decorativo: a lista
// inteira, sempre igual, sem dizer quais estavam nesta conversa e sem aceitar
// clique. Não era etiqueta — era legenda.
//
// ── ETIQUETA NÃO É DEMANDA NEM STATUS ───────────────────────────────────────
//
//   STATUS    em que pé a pessoa está — apoiador, hater. UMA por pessoa.
//   DEMANDA   o que ela pediu — saúde, material. Zero ou várias.
//   ETIQUETA  o que a EQUIPE precisa lembrar — "ligar depois", "número errado".
//
// A diferença prática: status e demanda descrevem a PESSOA e alimentam o
// relatório da campanha. Etiqueta descreve o TRABALHO e serve para a equipe se
// organizar. Misturar os três faz o relatório de intenção de voto contar
// "número errado" como categoria política.

export type Tag = {
  id: number;
  nome: string;
  cor: string;
  descricao: string | null;
  /** 'status' (um só por conversa), 'demanda' (várias) ou nulo (etiqueta da equipe). */
  eixo?: string | null;
  valor?: string | null;
};

// A ordem dos grupos é a da pergunta que a atendente faz: em que pé a pessoa
// está, o que ela pediu, e o que a equipe precisa lembrar.
const GRUPOS = [
  { eixo: "status", titulo: "Status", nota: "um só — marcar outro troca" },
  // PERFIL É OUTRA PERGUNTA, E POR ISSO NÃO DISPUTA COM O STATUS.
  //
  // Status é a POSIÇÃO da pessoa (está com a gente, é contra, está em dúvida).
  // Perfil é o PAPEL dela (traz outras pessoas). Enquanto multiplicador morou
  // no status, marcar um apagava o outro — e a campanha perdia a informação
  // mais valiosa que tinha, porque quem multiplica é sempre apoiador.
  { eixo: "perfil", titulo: "Perfil", nota: "vale junto com o status" },
  { eixo: "demanda", titulo: "Demanda", nota: "quantas precisar" },
  { eixo: null, titulo: "Etiquetas da equipe", nota: "não entram na métrica" },
] as const;

const CORES = [
  "#0525f7",
  "#12703c",
  "#8a6009",
  "#5b34c9",
  "#c2185b",
  "#0e7490",
  "#c02020",
  "#52535c",
];

export function Etiquetas({
  conversaId,
  catalogo,
  aoMudarCatalogo,
  aoMarcar,
  euId,
  sinal,
}: {
  conversaId: number;
  catalogo: Tag[];
  /** A etiqueta nova precisa aparecer nas outras conversas sem recarregar. */
  aoMudarCatalogo: (t: Tag) => void;
  /**
   * Avisa a fila que a marcação mudou.
   *
   * Sem isto, a aba de etiqueta no topo só aparecia quando a QUANTIDADE de
   * conversas mudava — marcar "Apoiador" não mexe no tamanho da lista, então a
   * contagem lá em cima ficava parada e a aba nunca surgia.
   */
  aoMarcar: (conversaId: number, tagId: number, marcada: boolean) => void;
  /** Quem está marcando. Vai para `conversa_tags.marcada_por`. */
  euId: string;
  /**
   * Muda quando o status ou as demandas da conversa mudam no banco (chega pelo
   * tempo real da conversa). É o aviso para reler as marcações.
   *
   * Sem ele, etiqueta posta pelo celular (etiqueta do WhatsApp), por outra
   * pessoa, ou tirada pelo próprio banco ao trocar de status, só aparecia
   * depois de trocar de conversa e voltar.
   */
  sinal?: string;
}) {
  const supabase = createClient();
  // As etiquetas guardadas JUNTO com a conversa de que vieram.
  //
  // Guardar as duas coisas separadas obrigava a zerar a lista dentro do efeito
  // ao trocar de conversa — e "zerar dentro do efeito" é exatamente o padrão
  // que causa render em cascata. Com o par, "carregando" é conclusão, não
  // estado: se o par é de outra conversa, ainda não chegou.
  const [caixa, setCaixa] = useState<{ de: number; ids: number[] } | null>(
    null,
  );
  const postas = caixa?.de === conversaId ? caixa.ids : null;
  const [abrindo, setAbrindo] = useState(false);
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [erro, setErro] = useState<string | null>(null);

  // Recarrega ao trocar de conversa. Sem isso a etiqueta da conversa anterior
  // apareceria na próxima por um instante — e num painel de marcação, um
  // instante basta para alguém acreditar.
  // Gravações em andamento. Enquanto houver uma, a releitura pelo `sinal` é
  // ignorada: ela poderia chegar ANTES do insert e apagar da tela a marcação
  // que a atendente acabou de fazer. Ao terminar, a própria gravação relê.
  const pendentes = useRef(0);

  const reler = useCallback(
    (vivo: () => boolean = () => true) =>
      supabase
        .from("conversa_tags")
        .select("tag_id")
        .eq("conversa_id", conversaId)
        .then(({ data, error }) => {
          if (vivo() && !error && pendentes.current === 0)
            setCaixa({ de: conversaId, ids: (data ?? []).map((r) => r.tag_id) });
        }),
    [conversaId, supabase],
  );

  useEffect(() => {
    let vivo = true;
    reler(() => vivo);
    return () => {
      vivo = false;
    };
  }, [reler, sinal]);

  async function alternar(tag: Tag) {
    if (!postas) return;
    const tem = postas.includes(tag.id);
    // ── STATUS É UM SÓ, TAMBÉM NA TELA ─────────────────────────────────────
    //
    // O banco (`tag_alimenta_eixos`) tira o status anterior quando entra um
    // novo. A tela não sabia: marcar "Apoiador" em quem era "Indeciso" deixava
    // as DUAS acesas até recarregar, e a atendente não tinha como saber qual
    // valeu. Agora a tela faz a mesma troca que o banco.
    const saem =
      !tem && tag.eixo === "status"
        ? catalogo.filter((t) => t.eixo === "status" && t.id !== tag.id && postas.includes(t.id)).map((t) => t.id)
        : [];
    // Muda na tela primeiro. Marcar etiqueta é gesto rápido e repetido; esperar
    // o banco a cada clique faz a atendente clicar duas vezes achando que falhou.
    const otimista = tem
      ? postas.filter((x) => x !== tag.id)
      : [...postas.filter((x) => !saem.includes(x)), tag.id];
    setCaixa({ de: conversaId, ids: otimista });
    // ── AVISAR A CAIXA TAMBÉM, E NÃO SÓ ESTE PAINEL ─────────────────────────
    //
    // `setCaixa` é o estado LOCAL — pinta o botão aqui dentro. Quem conta as
    // etiquetas na fila é `porEtiqueta`, na caixa, e ela só sabe pelo `aoMarcar`.
    //
    // O `aoMarcar` existia, mas só era chamado DENTRO do `if (error)` lá
    // embaixo — ou seja, apenas quando a marcação FALHAVA. No caminho de
    // sucesso ninguém avisava ninguém: a etiqueta ia para o banco, o botão
    // acendia, e o contador ao lado ("Apoiador · 1") continuava no número
    // antigo até alguém recarregar a página.
    //
    // Era por isso que marcar dois apoiadores mostrava um.
    for (const id of saem) aoMarcar(conversaId, id, false);
    aoMarcar(conversaId, tag.id, !tem);
    setErro(null);

    pendentes.current++;
    const { error } = tem
      ? await supabase
          .from("conversa_tags")
          .delete()
          .eq("conversa_id", conversaId)
          .eq("tag_id", tag.id)
      : await supabase
          // ── QUEM MARCOU VAI GRAVADO ──────────────────────────────────────
          //
          // `marcada_por` existe em `conversa_tags` desde o começo e NINGUÉM
          // escrevia nele: as marcações da base inteira estão com esse campo
          // nulo. Sem ele não há como responder "quem classificou esta pessoa
          // como apoiador?" — e é a pergunta que separa o trabalho de uma
          // atendente do de outra.
          //
          // O banco não podia adivinhar. A coluna estava lá, e o insert
          // simplesmente não a mencionava.
          .from("conversa_tags")
          .insert({
            conversa_id: conversaId,
            tag_id: tag.id,
            marcada_por: euId,
          });
    pendentes.current--;

    if (error) {
      // Desfaz NOS DOIS, pelo mesmo motivo de avisar nos dois: a tela não pode
      // ficar mostrando uma marcação que o banco recusou, nem o contador da
      // fila somando uma etiqueta que não existe.
      setCaixa({ de: conversaId, ids: postas });
      aoMarcar(conversaId, tag.id, tem);
      for (const id of saem) aoMarcar(conversaId, id, true);
      setErro(error.message);
      return;
    }
    // Relê o que o banco guardou — é ele quem decide o que ficou (o gatilho
    // tira o status anterior). Vale mais que o palpite otimista.
    reler();
  }

  async function criar() {
    const nome = nova.trim();
    if (!nome) return;
    setErro(null);
    const { data, error } = await supabase
      .from("tags")
      .insert({ nome, cor })
      .select("id, nome, cor, descricao")
      .single();
    if (error) {
      setErro(
        error.code === "23505"
          ? "Já existe uma etiqueta com esse nome."
          : error.code === "42501"
            ? "Sua conta não tem permissão para criar etiqueta."
            : error.message,
      );
      return;
    }
    const t = data as Tag;
    aoMudarCatalogo(t);
    setNova("");
    setCriando(false);
    // Criou no meio do atendimento: quase sempre é para usar agora.
    await supabase
      .from("conversa_tags")
      .insert({ conversa_id: conversaId, tag_id: t.id, marcada_por: euId });
    setCaixa({ de: conversaId, ids: [...(postas ?? []), t.id] });
    aoMarcar(conversaId, t.id, true);
  }

  const marcadas = catalogo.filter((t) => postas?.includes(t.id));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {marcadas.map((t) => (
          <button
            key={t.id}
            onClick={() => alternar(t)}
            title={`${t.descricao ?? t.nome} — clique para tirar`}
            className="group flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold"
            style={{ background: `${t.cor}1a`, color: t.cor }}
          >
            {t.nome}
            <X
              size={10}
              strokeWidth={3}
              className="opacity-40 group-hover:opacity-100"
            />
          </button>
        ))}

        <button
          onClick={() => setAbrindo((v) => !v)}
          className="flex items-center gap-1 rounded-lg border border-dashed border-tinta-300 px-2.5 py-1 text-[11.5px] font-semibold text-tinta-500 transition-colors hover:border-tema hover:text-tema"
        >
          <Plus size={11} strokeWidth={3} />
          etiqueta
        </button>
      </div>

      {!caixa || caixa.de !== conversaId ? (
        <p className="mt-1.5 text-[11px] text-tinta-400">carregando…</p>
      ) : null}

      {erro && (
        <p className="mt-1.5 rounded-md bg-[#fdf1f1] px-2 py-1 text-[11px] text-[#c02020]">
          {erro}
        </p>
      )}

      {abrindo && (
        <div className="mt-2 rounded-lg border border-tinta-200 bg-white p-2">
          <div className="flex flex-col gap-0.5">
            {GRUPOS.map((g) => {
              const doGrupo = catalogo.filter((t) => (t.eixo ?? null) === g.eixo);
              if (doGrupo.length === 0) return null;
              return (
                <div key={g.titulo} className="flex flex-col gap-0.5 border-b border-tinta-100 pb-1.5 last:border-0">
                  <span className="px-2 pt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-tinta-400">
                    {g.titulo} <span className="font-normal normal-case tracking-normal">· {g.nota}</span>
                  </span>
            {doGrupo.map((t) => {
              const tem = postas?.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => alternar(t)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-tinta-50"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                      // Status é escolha única: bolinha, como botão de rádio.
                      t.eixo === "status" ? "rounded-full" : "rounded"
                    } ${
                      tem ? "border-transparent" : "border-tinta-300"
                    }`}
                    style={tem ? { background: t.cor } : undefined}
                  >
                    {tem && (
                      <Check size={11} strokeWidth={3} className="text-white" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-tinta-800">
                      {t.nome}
                    </span>
                    {t.descricao && (
                      <span className="block text-[10.5px] leading-snug text-tinta-400">
                        {t.descricao}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
                </div>
              );
            })}
            {catalogo.length === 0 && (
              <p className="px-2 py-2 text-[11.5px] text-tinta-400">
                Nenhuma etiqueta ainda. Crie a primeira abaixo.
              </p>
            )}
          </div>

          <div className="mt-2 border-t border-tinta-100 pt-2">
            {criando ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={nova}
                  onChange={(e) => setNova(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") criar();
                    if (e.key === "Escape") setCriando(false);
                  }}
                  placeholder="Nome da etiqueta"
                  className="h-8 w-full rounded-md border border-tinta-200 px-2 text-[12.5px] outline-none focus:border-tema"
                />
                <div className="flex gap-1">
                  {CORES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCor(c)}
                      aria-label={`Cor ${c}`}
                      className={`h-5 w-5 rounded ring-1 ring-inset ring-black/10 ${
                        cor === c
                          ? "outline outline-2 outline-offset-1 outline-tinta-900"
                          : ""
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={criar}
                    disabled={!nova.trim()}
                    className="h-7 rounded-md bg-tema px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    Criar e aplicar
                  </button>
                  <button
                    onClick={() => setCriando(false)}
                    className="h-7 px-2 text-[12px] text-tinta-500 hover:text-tinta-900"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCriando(true)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold text-tema hover:bg-tema/5"
              >
                <Plus size={12} strokeWidth={3} />
                Nova etiqueta
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
