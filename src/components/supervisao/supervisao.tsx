"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, AlarmClock, ExternalLink, X } from "lucide-react";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversa } from "@/components/caixa/caixa-client";
import { Audio, Imagem, Video, Documento } from "@/components/caixa/midia";
import {
  duracao,
  espera,
  hora,
  horasDesde,
  iniciais,
  telefoneBonito,
} from "@/lib/conversa";
import { Cabecalho } from "@/components/ui/pagina";
import { EquipeAgora, ativaAgora, type MembroEquipe } from "@/components/supervisao/equipe-agora";

// A mesa de comando da supervisão.
//
// TRÊS DECISÕES SUSTENTAM ESTA TELA.
//
// 1. A FAIXA DE ESPERA VEM ANTES DOS FILTROS. Quem abre isto às sete da manhã
//    precisa ver em três segundos quem está esperando há mais tempo, sem
//    escolher nada. Filtro é para investigar depois; a faixa é o alarme.
//
// 2. O FILTRO POR ATENDENTE MOSTRA A CONTAGEM DE CADA UMA. É a distribuição da
//    carga sem precisar de gráfico: se uma tem 300 e outra tem 40 na mesma
//    escala, isso salta do próprio filtro.
//
// 3. NENHUMA MÉDIA. A média esconde exatamente o caso que importa — dez
//    conversas respondidas em dois minutos e uma esquecida há dezoito horas
//    dão uma média excelente. Aqui se conta o pior caso, não o típico.

type Atendente = {
  id: string;
  nome: string;
  disponivel: boolean;
  capacidade?: number | null;
  demandas?: string[] | null;
};

type PorStatus = "todas" | "esperando" | "andando" | "encerradas" | "sem-dono";

const STATUS_ROTULO: Record<PorStatus, string> = {
  todas: "Todas",
  esperando: "Esperando resposta",
  andando: "Em atendimento",
  encerradas: "Encerradas",
  "sem-dono": "Sem dono",
};

/** Vermelho passadas 4 h, laranja passada 1 h. Abaixo disso é operação normal. */
function tomDaEspera(horas: number) {
  if (horas >= 4)
    return { texto: "#c02020", fundo: "#fdf1f1", borda: "#f3d3d3" };
  if (horas >= 1)
    return { texto: "#a35a00", fundo: "#fdf6ea", borda: "#f0dcc0" };
  return { texto: "#52535c", fundo: "#f1f1f3", borda: "#d2d2d7" };
}

export function Supervisao({
  conversas,
  totalDaJanela,
  corte,
  atendentes,
  janelas,
  janela,
  totais,
  caidos,
  equipe,
}: {
  conversas: Conversa[];
  /**
   * Quantas conversas a janela tem DE VERDADE, contadas no banco.
   *
   * A lista vem cortada em 500 e ordenada pela mensagem mais recente, então
   * quem falou há mais tempo cai fora primeiro — some justamente o que a
   * supervisão existe para achar. Sem este número, 500 linhas cheias parecem a
   * lista inteira.
   */
  totalDaJanela: number;
  /** O mesmo recorte de tempo que a página usou, para a página 2 pedir igual. */
  corte: { de: string | null; ate: string | null };
  atendentes: Atendente[];
  /**
   * O que ACONTECEU em cada janela. Vêm as sete inteiras, para trocar de
   * período sem ir ao servidor.
   */
  janelas: {
    id: string;
    rotulo: string;
    recebidas: number;
    enviadas: number;
    chegaram: number;
    respondidas: number;
    encerradas: number;
  }[];
  /** Qual janela está escolhida. Vem do servidor, porque ela recorta a lista. */
  janela: string;
  /**
   * O ESTADO DE AGORA, contado no banco e fora da janela.
   *
   * "Quantas estão abertas nos últimos 7 dias" não quer dizer nada: ou está
   * aberta agora, ou não está. Estes três não mudam com o período escolhido, e
   * é por isso que ficam separados dos outros na tela.
   */
  totais: {
    abertas: number;
    semDono: number;
    naoAtendidas: number;
  };
  /** Números ativos que não estão conectados. Vazio é o caso bom. */
  caidos: {
    apelido: string;
    instancia: string;
    conexao: string;
    caiu_em: string | null;
  }[];
  /** Uma linha por atendente, contada no banco (`supervisao_equipe`). */
  equipe: MembroEquipe[];
}) {
  const [status, setStatus] = useState<PorStatus>("todas");
  const [quem, setQuem] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  // A PRÉVIA: ler a conversa sem sair daqui.
  //
  // Abrir na caixa de entrada tira a supervisora do lugar onde ela está
  // trabalhando — ela perde os filtros, a posição da lista, e precisa voltar.
  // Para "o que está sendo tratado aqui?" isso é caro demais.
  const [espiando, setEspiando] = useState<Conversa | null>(null);

  // ── A SUPERVISÃO ERA UMA FOTOGRAFIA ───────────────────────────────────────
  //
  // Ela carregava a lista uma vez, no servidor, e nunca mais mudava. Quem
  // encerrasse uma conversa noutra aba veria a Supervisão continuar dizendo que
  // ela está aberta — e concluiria, com razão, que a tela está errada.
  //
  // Pior que estar desatualizada: quem supervisiona toma DECISÃO a partir dela.
  // "Ninguém pegou esse lead há duas horas" precisa ser verdade agora, não
  // verdade de quando a aba foi aberta.
  const [linhas, setLinhas] = useState<Conversa[]>(conversas);
  const [buscandoMais, setBuscandoMais] = useState(false);

  // Trocar de janela troca a lista inteira: sem isto, a página 2 da janela
  // anterior ficaria pendurada embaixo da página 1 da nova.
  useEffect(() => {
    setLinhas(conversas);
  }, [conversas]);

  /**
   * Traz a próxima página, continuando de onde a lista parou.
   *
   * `p_pulo` usa o tamanho da lista atual, e não um contador de páginas: se o
   * Realtime tiver acrescentado uma conversa nova no topo, contar páginas
   * pularia uma linha. O tamanho da lista é sempre a verdade do que já se tem.
   */
  async function carregarMais() {
    if (buscandoMais) return;
    setBuscandoMais(true);
    try {
      const { data, error } = await supabase.rpc("supervisao_lista", {
        p_de: corte.de,
        p_ate: corte.ate,
        p_limite: 500,
        p_pulo: linhas.length,
      });
      if (error) return;
      const novas = (data ?? []) as unknown as Conversa[];
      // Sem o filtro de repetidas, uma conversa que subiu no ranking entre as
      // duas buscas apareceria duas vezes na tela.
      setLinhas((antes) => {
        const vistas = new Set(antes.map((c) => c.id));
        return [...antes, ...novas.filter((c) => !vistas.has(c.id))];
      });
    } finally {
      setBuscandoMais(false);
    }
  }
  const supabase = createClient();

  useEffect(() => {
    const canal = supabase
      // Nome único: sair e voltar para a tela recriaria "supervisao" enquanto o
      // canal anterior ainda fecha, e o cliente devolveria o velho (ver a nota
      // dos dois canais em caixa-client.tsx).
      .channel(`supervisao-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversas" },
        (payload) => {
          const nova = payload.new as Conversa | null;
          if (!nova?.id) return;
          setLinhas((antes) => {
            const i = antes.findIndex((c) => c.id === nova.id);
            if (i === -1) return [nova, ...antes];
            const copia = [...antes];
            copia[i] = nova;
            return copia;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase]);

  const nomeDe = useMemo(() => {
    const m = new Map(atendentes.map((a) => [a.id, a.nome]));
    return (id: string | null) => (id ? (m.get(id) ?? "—") : null);
  }, [atendentes]);

  // Uma passada só sobre a lista: com 500 conversas e três filtros, calcular a
  // espera de novo dentro de cada filtro seria repetir o mesmo trabalho.
  const comEspera = useMemo(
    () => linhas.map((c) => ({ c, e: espera(c) })),
    [linhas],
  );

  // Os quatro cartões vêm CONTADOS DO BANCO.
  //
  // Antes eram somados percorrendo as conversas carregadas, e a consulta traz
  // no máximo 500: o teto virava o número. "Abertas" pararia em 500 para sempre
  // e a supervisão não veria diferença entre uma fila crescendo e uma parada.
  //
  // A lista abaixo continua limitada de propósito — é tela de acompanhamento
  // do agora, e o rodapé diz quantas está mostrando. Limitar é decisão; deixar
  // o limite virar métrica é o defeito.
  const numeros = totais;

  // ── A JANELA DE ATRIBUIÇÃO ────────────────────────────────────────────────
  //
  // A tela só sabia responder HOJE. Agora responde qualquer uma das sete, e a
  // troca é local: os números das sete já vieram na primeira carga. Procurar o
  // dia em que a fila estourou tem de ser instantâneo, senão ninguém procura.
  // A janela mora na URL porque RECORTA A LISTA, e a lista vem do banco. Só
  // trocar por estado local deixaria os números certos e a lista errada — que
  // é pior que não ter janela nenhuma.
  const router = useRouter();
  const [trocando, iniciarTroca] = useTransition();
  const atual = janelas.find((j) => j.id === janela) ?? janelas[0] ?? null;

  // As que ninguém respondeu, a mais antiga primeiro. É a faixa do topo.
  const alarme = useMemo(
    () =>
      comEspera
        .filter(({ e }) => e.estado === "nao_atendido")
        .sort((a, b) => b.e.horas - a.e.horas)
        .slice(0, 12),
    [comEspera],
  );

  // A contagem por atendente saiu dos chips: era feita sobre as 500 conversas
  // carregadas e contradizia a tabela "A equipe agora", que conta no banco.
  const equipePorId = useMemo(() => new Map(equipe.map((m) => [m.id, m])), [equipe]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    return comEspera
      .filter(({ c, e }) => {
        if (
          status === "esperando" &&
          e.estado !== "nao_atendido" &&
          e.estado !== "aguardando"
        )
          return false;
        if (status === "andando" && (c.encerrada_em || !c.atendente_id))
          return false;
        if (status === "encerradas" && !c.encerrada_em) return false;
        if (status === "sem-dono" && (c.atendente_id || c.encerrada_em))
          return false;
        if (
          quem === "sem-dono"
            ? c.atendente_id
            : quem !== "todos" && c.atendente_id !== quem
        )
          return false;
        if (!termo) return true;
        // Busca por nome OU por telefone. Quem digita número quer o número, e
        // comparar só dígitos evita o parêntese e o traço atrapalharem.
        if ((c.nome ?? "").toLowerCase().includes(termo)) return true;
        if (digitos.length >= 4 && c.telefone.includes(digitos)) return true;
        return false;
      })
      .sort((a, b) => {
        // Quem espera há mais tempo vem primeiro, sempre. Ordenar por última
        // mensagem afundaria justamente a conversa em que ninguém tocou.
        const pa =
          a.e.estado === "nao_atendido"
            ? 2
            : a.e.estado === "aguardando"
              ? 1
              : 0;
        const pb =
          b.e.estado === "nao_atendido"
            ? 2
            : b.e.estado === "aguardando"
              ? 1
              : 0;
        if (pa !== pb) return pb - pa;
        if (pa > 0) return b.e.horas - a.e.horas;
        // Instante, e não texto — mesmo motivo da caixa: o carimbo do Postgres
        // vem com e sem fração de segundo, e `localeCompare` é colação de
        // idioma. Aqui a ordem por SLA continua mandando, porque a pergunta da
        // supervisão É quem está esperando; só o desempate mudou.
        const ta = a.c.ultima_msg_at ? Date.parse(a.c.ultima_msg_at) : 0;
        const tb = b.c.ultima_msg_at ? Date.parse(b.c.ultima_msg_at) : 0;
        return tb - ta;
      });
  }, [comEspera, status, quem, busca]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/atendimento"
        sobretitulo="Atendimento"
        titulo="Supervisão"
        descricao="Todas as conversas da equipe, e quem está esperando há mais tempo."
      />

      {/* ── AGORA ────────────────────────────────────────────────────────
          Estado deste instante, e por isso NÃO muda com a janela escolhida:
          ou a conversa está aberta agora, ou não está. */}
      <div className="grid grid-cols-3 gap-3">
        <Numero rotulo="Abertas agora" valor={numeros.abertas} />
        <Numero
          rotulo="Ninguém respondeu"
          valor={numeros.naoAtendidas}
          tom={numeros.naoAtendidas > 0 ? "ruim" : "neutro"}
        />
        <Numero
          rotulo="Sem dono"
          valor={numeros.semDono}
          tom={numeros.semDono > 0 ? "atencao" : "neutro"}
        />
      </div>

      {/* ── A EQUIPE ─────────────────────────────────────────────────────
          Logo abaixo do estado de agora: é onde a coordenadora descobre QUEM
          está deixando gente esperando, e redistribui ali mesmo. */}
      {equipe.length > 0 && <EquipeAgora equipe={equipe} />}

      {/* ── O QUE ACONTECEU NA JANELA ────────────────────────────────────── */}
      {atual && (
        <div className="rounded-xl border border-tinta-200 bg-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-tinta-100 px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tinta-400">
              No período
            </span>
            {/* A lista embaixo é recarregada junto: sem este aviso, o clique
                parece não ter feito nada enquanto o banco responde. */}
            {trocando && (
              <span className="text-[11px] text-tinta-400">carregando…</span>
            )}
            <div className="flex flex-wrap gap-1">
              {janelas.map((j) => (
                <button
                  key={j.id}
                  onClick={() =>
                    iniciarTroca(() =>
                      router.push(
                        `/atendimento/supervisao${j.id === "tudo" ? "" : `?janela=${j.id}`}`,
                      ),
                    )
                  }
                  className={`rounded-md px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
                    janela === j.id
                      ? "bg-tema font-semibold text-white"
                      : "text-tinta-600 hover:bg-tinta-50"
                  }`}
                >
                  {j.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-tinta-100 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { r: "Chegaram", v: atual.chegaram },
              { r: "Respondidas", v: atual.respondidas },
              { r: "Encerradas", v: atual.encerradas },
              { r: "Recebidas", v: atual.recebidas },
              { r: "Enviadas", v: atual.enviadas },
            ].map((n) => (
              <div key={n.r} className="bg-white px-4 py-3">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-tinta-400">
                  {n.r}
                </p>
                <p className="tabular mt-1 text-[21px] font-extrabold leading-none tracking-[-0.03em] text-tinta-900">
                  {n.v.toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
          {/* "Respondidas" não é o mesmo que "chegaram": a pessoa pode ter
              escrito ontem e sido respondida hoje, e é justamente esse atraso
              que a supervisão precisa enxergar.

              E "Chegaram" NÃO é quem escreveu, embora dissesse isso aqui até
              14/09. A conta é `coalesce(primeira_msg_at, criado_em)`: conversa
              que a campanha abriu e ninguém respondeu entra pela data de
              criação. Em 14/09 eram 24 das 1.155 do dia — 21 disparos sem
              resposta e 3 leads.

              Corrigiu-se a FRASE, não a conta, e por decisão do Emanuel: com os
              chips caindo, muita gente fala com a campanha por fora e não vira
              cadastro, e ele não quer que o número encolha por isso. O texto
              passa a dizer o que ele de fato mede. */}
          <p className="border-t border-tinta-100 px-4 py-2 text-[11px] leading-relaxed text-tinta-400">
            <b>Chegaram</b> é toda conversa aberta no período — inclusive
            disparo que ninguém respondeu ainda. <b>Respondidas</b> é quem
            recebeu a primeira resposta no período: pode ter chegado antes, e a
            diferença entre os dois é o atraso da fila.
          </p>
        </div>
      )}

      {/* ── NÚMERO FORA DO AR ──────────────────────────────────────────────
          Acima do alarme de espera porque é mais grave: enquanto um número
          está caído, a fila dele PARA DE CRESCER na tela e tudo parece calmo.
          O silêncio é o sintoma, e sem esta faixa ele passa por normalidade —
          foi o que aconteceu por sete horas no número da Maiana. */}
      {caidos.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <span className="flex items-center gap-2 text-[12.5px] font-bold text-red-700">
            <AlarmClock size={14} strokeWidth={2.4} />
            {caidos.length === 1
              ? "1 número fora do ar"
              : `${caidos.length} números fora do ar`}
          </span>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-red-700/90">
            {caidos.map((n, i) => (
              <span key={n.instancia}>
                {i > 0 && " · "}
                <b>{n.apelido}</b>
                {n.conexao === "connecting" ? " (conectando)" : ""}
                {n.caiu_em ? ` há ${duracao(horasDesde(n.caiu_em))}` : ""}
              </span>
            ))}
          </p>
          {/* ── O TRÁFEGO É A PARTE CARA ────────────────────────────────────
              Quando o WhatsApp trava um chip, o bloqueio dura horas e não há o
              que fazer além de esperar. Mas o anúncio CONTINUA rodando, e cada
              lead que chega nessa janela entra sem telefone quando a sessão
              voltar — foi assim que se perderam 371 leads pagos.

              O que dá para salvar não é a sessão: é a verba. Por isso a
              primeira instrução é pausar a campanha, não ler o QR. */}
          <p className="mt-1.5 text-[11.5px] font-semibold leading-relaxed text-red-700">
            Pause a campanha desses números agora. O anúncio continua gastando,
            e o lead que chegar enquanto está assim entra sem telefone.
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-red-700/90">
            Quem atender por eles pelo celular fica invisível aqui: não conta na
            métrica.{" "}
            <Link href="/atendimento/numeros" className="font-bold underline">
              Ler o QR
            </Link>{" "}
            — se o WhatsApp tiver bloqueado o pareamento, a trava costuma soltar
            em algumas horas e não há o que fazer antes disso.
          </p>
        </div>
      )}

      {/* O alarme. Fica acima dos filtros porque não depende de escolha. */}
      {alarme.length > 0 && (
        <div className="rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-4 py-3">
          <span className="flex items-center gap-2 text-[12.5px] font-bold text-[#a35a00]">
            <AlarmClock size={14} strokeWidth={2.4} />
            Esperando a primeira resposta
            {/* O total, não `alarme.length` — aquilo é a lista de atalhos,
                cortada em 12 para caber na faixa. Mostrar o corte como se
                fosse a conta é o mesmo defeito das abas da caixa. */}
            <span className="rounded-full bg-[#a35a00] px-1.5 text-[10.5px] font-bold text-white">
              {numeros.naoAtendidas}
            </span>
          </span>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {alarme.map(({ c, e }) => {
              const t = tomDaEspera(e.horas);
              return (
                <Link
                  key={c.id}
                  href={`/atendimento/caixa?c=${c.id}`}
                  className="flex shrink-0 items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 transition-opacity hover:opacity-80"
                  style={{ borderColor: t.borda }}
                >
                  <span
                    className="tabular text-[12px] font-bold"
                    style={{ color: t.texto }}
                  >
                    {duracao(e.horas)}
                  </span>
                  <span className="max-w-[13ch] truncate text-[12px] text-tinta-700">
                    {c.nome ?? telefoneBonito(c.telefone)}
                  </span>
                  <span className="text-[11px] text-tinta-400">
                    {nomeDe(c.atendente_id) ?? "sem dono"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* filtros */}
      <div className="flex flex-col gap-2.5">
        <Linha rotulo="Status">
          {(Object.keys(STATUS_ROTULO) as PorStatus[]).map((k) => (
            <Chip key={k} ativo={status === k} onClick={() => setStatus(k)}>
              {STATUS_ROTULO[k]}
            </Chip>
          ))}
        </Linha>

        <Linha rotulo="Atendente">
          <Chip ativo={quem === "todos"} onClick={() => setQuem("todos")}>
            Todas
          </Chip>
          <Chip ativo={quem === "sem-dono"} onClick={() => setQuem("sem-dono")}>
            Sem dono <Contagem n={numeros.semDono} />
          </Chip>
          {atendentes.map((a) => (
            <Chip
              key={a.id}
              ativo={quem === a.id}
              onClick={() => setQuem(a.id)}
            >
              {/* O ponto diz se ela mandou mensagem na última hora. Era o
                  "plantão" (`disponivel`), mas o plantão saiu da tela de
                  Atendentes e o campo ficou sempre verdadeiro. */}
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: equipePorId.has(a.id) && ativaAgora(equipePorId.get(a.id)!) ? "#0f7a3d" : "#c8d0de" }}
              />
              {a.nome}
            </Chip>
          ))}
        </Linha>

        <div className="relative max-w-[380px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400"
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="h-9 w-full rounded-[10px] border border-tinta-200 bg-white pl-8 pr-3 text-[13px] text-tinta-800 outline-none placeholder:text-tinta-400 focus:border-tema"
          />
        </div>
      </div>

      {/* a lista */}
      <div className="overflow-x-auto rounded-lg border border-tinta-200 bg-white ">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-tinta-100 text-[10px] font-bold uppercase tracking-[0.1em] text-tinta-400">
              <th className="px-4 py-2.5">Contato</th>
              <th className="px-3 py-2.5">Atendente</th>
              <th className="px-3 py-2.5">Situação</th>
              <th className="px-3 py-2.5 text-right">Msgs</th>
              <th className="px-3 py-2.5">Última mensagem</th>
              <th className="px-3 py-2.5 text-right">Quando</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {lista.map(({ c, e }) => {
              const t = tomDaEspera(e.horas);
              return (
                <tr
                  key={c.id}
                  className="border-b border-tinta-100 last:border-0 hover:bg-tinta-50"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tinta-100 text-[10.5px] font-bold text-tinta-600">
                        {iniciais(c.nome, c.telefone)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-tinta-900">
                          {c.nome ?? "Sem nome"}
                        </span>
                        <span className="tabular block text-[11px] text-tinta-400">
                          {telefoneBonito(c.telefone)}
                          {c.municipio ? ` · ${c.municipio}` : ""}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-tinta-600">
                    {nomeDe(c.atendente_id) ?? (
                      <span className="font-semibold text-[#a35a00]">
                        sem dono
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.encerrada_em ? (
                      <span className="text-[12px] text-tinta-400">
                        encerrada
                      </span>
                    ) : e.estado === "ok" ? (
                      <span className="text-[12px] text-tinta-500">em dia</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold"
                        style={{
                          borderColor: t.borda,
                          background: t.fundo,
                          color: t.texto,
                        }}
                      >
                        {e.estado === "nao_atendido"
                          ? "sem resposta"
                          : "aguardando"}
                        <span className="tabular">{duracao(e.horas)}</span>
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-[12.5px] text-tinta-500">
                    {c.total_mensagens}
                  </td>
                  {/* DUAS LINHAS, não uma. Cortar em uma linha mostra "Boa
                      tarde, eu gostaria de saber s…" — o começo educado de toda
                      mensagem, e nunca o assunto. Com duas, dá para saber do
                      que se trata sem abrir. */}
                  <td className="w-[38%] min-w-[240px] px-3 py-2.5">
                    <span className="flex items-start gap-1.5">
                      <span className="mt-[3px] shrink-0 text-tinta-300">
                        {c.ultima_direcao === "inbound" ? "←" : "→"}
                      </span>
                      <span className="line-clamp-2 text-[12.5px] leading-snug text-tinta-600">
                        {c.ultima_msg ?? "—"}
                      </span>
                    </span>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-[11.5px] text-tinta-400">
                    {hora(c.ultima_msg_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-0.5">
                      <button
                        onClick={() => setEspiando(c)}
                        title="Ler a conversa sem sair daqui"
                        className="rounded-md px-2 py-1 text-[11.5px] font-semibold text-tinta-500 transition-colors hover:bg-tinta-100 hover:text-tinta-900"
                      >
                        ler
                      </button>
                      <Link
                        href={`/atendimento/caixa?c=${c.id}`}
                        title="Abrir na caixa de entrada"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-tinta-400 transition-colors hover:bg-tinta-100 hover:text-tema"
                      >
                        <ExternalLink size={14} />
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {lista.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] text-tinta-400">
            Nenhuma conversa com esses filtros.
          </p>
        )}
      </div>

      {espiando && (
        <Espiar conversa={espiando} equipe={equipe} aoFechar={() => setEspiando(null)} />
      )}

      {/* O rodapé tem de dizer as DUAS coisas: o recorte de tempo e o teto. Sem
          o teto escrito, 500 vira "é tudo que existe" — que é o defeito que os
          contadores de cima já resolveram uma vez. */}
      <div className="flex flex-col items-start gap-2">
        <p className="text-[11.5px] text-tinta-400">
          Mostrando <b className="text-tinta-600">{linhas.length.toLocaleString("pt-BR")}</b> de{" "}
          <b className="text-tinta-600">{totalDaJanela.toLocaleString("pt-BR")}</b> conversas
          {atual && janela !== "tudo"
            ? ` que se mexeram em ${atual.rotulo.toLowerCase()}`
            : ""}
          .
          {linhas.length < totalDaJanela &&
            " As mais antigas ficam por último — carregue mais para chegar nelas."}
        </p>

        {linhas.length < totalDaJanela && (
          <button
            type="button"
            onClick={carregarMais}
            disabled={buscandoMais}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-tinta-200 bg-white px-4 text-[12.5px] font-semibold text-tinta-700 transition-colors hover:border-tema hover:text-tema disabled:opacity-40"
          >
            {buscandoMais
              ? "Carregando…"
              : `Carregar mais ${Math.min(500, totalDaJanela - linhas.length).toLocaleString("pt-BR")}`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── ler sem sair ────────────────────────────────────────────────────────────

/**
 * A gaveta de leitura.
 *
 * SÓ LÊ. Não tem campo de resposta de propósito: quem supervisiona que responde
 * pela atendente cria a conversa com dois donos — a pessoa recebe duas
 * respostas e a atendente descobre depois que alguém falou por ela.
 *
 * Para responder existe o "abrir na caixa", ao lado, que assume a conversa de
 * verdade e deixa registro.
 */
function Espiar({
  conversa,
  equipe,
  aoFechar,
}: {
  conversa: Conversa;
  equipe: MembroEquipe[];
  aoFechar: () => void;
}) {
  const supabase = createClient();
  const [msgs, setMsgs] = useState<{
    de: number;
    itens: {
      id: number;
      wa_id: string | null;
      responde_wa_id: string | null;
      direcao: string;
      tipo: string;
      texto: string | null;
      momento: string;
      midia_arquivo: string | null;
      midia_previa: string | null;
      midia_mime: string | null;
      midia_erro: string | null;
      duracao_seg: number | null;
      texto_original: string | null;
      editada_em: string | null;
    }[];
  } | null>(null);

  useEffect(() => {
    let vivo = true;
    supabase
      .from("mensagens")
      // AS COLUNAS DE MÍDIA VÊM JUNTO.
      //
      // Faltavam aqui, e por isso a supervisão mostrava "🎤 Áudio" em itálico
      // no lugar do player: sem `midia_arquivo` a bolha não tinha como saber
      // que existe arquivo guardado. O defeito era do `select`, não da bolha.
      //
      // Quem supervisiona precisa OUVIR o áudio — é onde mora a reclamação, a
      // promessa que a atendente fez e o motivo de a pessoa ter sumido. Ler
      // "Áudio" não supervisiona nada.
      .select(
        "id, wa_id, responde_wa_id, direcao, tipo, texto, momento, midia_arquivo, midia_previa, midia_mime, midia_erro, duracao_seg, texto_original, editada_em",
      )
      .eq("conversa_id", conversa.id)
      .order("momento", { ascending: false })
      // As 30 ÚLTIMAS, e não as 30 primeiras: o assunto de agora está no fim
      // da conversa, não no "boa tarde" de três dias atrás.
      .limit(30)
      .then(({ data }) => {
        if (vivo) setMsgs({ de: conversa.id, itens: (data ?? []).reverse() });
      });
    return () => {
      vivo = false;
    };
  }, [conversa.id, supabase]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  const carregando = msgs?.de !== conversa.id;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={aoFechar} />

      <div className="relative flex h-dvh w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-tinta-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold text-tinta-900">
              {conversa.nome ?? telefoneBonito(conversa.telefone)}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-tinta-500">
              {telefoneBonito(conversa.telefone)}
              {conversa.municipio ? ` · ${conversa.municipio}` : ""} ·{" "}
              {conversa.total_mensagens} mensagens
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href={`/atendimento/caixa?c=${conversa.id}`}
              title="Abrir na caixa para responder"
              className="rounded-md border border-tinta-200 px-2.5 py-1 text-[11.5px] font-semibold text-tinta-600 hover:border-tinta-300 hover:text-tinta-900"
            >
              responder
            </Link>
            <button
              onClick={aoFechar}
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-tinta-400 hover:bg-tinta-100 hover:text-tinta-900"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-tinta-50 px-4 py-4">
          {carregando && (
            <p className="self-center text-[11.5px] text-tinta-400">
              carregando…
            </p>
          )}
          {!carregando && msgs?.itens.length === 0 && (
            <p className="self-center text-[12px] text-tinta-400">
              Nenhuma mensagem gravada nesta conversa.
            </p>
          )}
          {!carregando &&
            msgs?.itens.map((m) => {
              const nossa = m.direcao === "outbound";
              return (
                <div
                  key={m.id}
                  className={`max-w-[84%] ${nossa ? "self-end" : "self-start"}`}
                >
                  <div
                    className={`px-3 py-2 text-[12.5px] leading-relaxed ${
                      nossa
                        ? "rounded-[12px_12px_3px_12px] bg-tema text-white"
                        : "rounded-[12px_12px_12px_3px] border border-tinta-200 bg-white text-tinta-800"
                    }`}
                  >
                    {/* A CITAÇÃO TAMBÉM APARECE AQUI. Sem ela, a supervisão
                        lê a resposta solta e não sabe a que pergunta a
                        atendente respondeu — que é justamente o que a citação
                        existe para resolver do outro lado. */}
                    {(() => {
                      const citada = m.responde_wa_id
                        ? msgs?.itens.find((x) => x.wa_id === m.responde_wa_id)
                        : null;
                      if (!citada) return null;
                      return (
                        <div
                          className={`mb-1.5 rounded-md border-l-[3px] px-2 py-1 text-[11px] leading-snug ${
                            nossa
                              ? "border-white/70 bg-white/15 text-white/85"
                              : "border-tema/60 bg-tinta-50 text-tinta-600"
                          }`}
                        >
                          <span className="block font-semibold">
                            {citada.direcao === "outbound" ? "Equipe" : "Ela"}
                          </span>
                          <span className="line-clamp-2">
                            {citada.texto?.trim() || "anexo"}
                          </span>
                        </div>
                      );
                    })()}

                    {/* OS MESMOS COMPONENTES DA CAIXA, e não uma segunda
                        versão: mídia que toca em um lugar e não no outro é o
                        defeito voltando pela porta dos fundos na próxima vez
                        que alguém mexer só num dos dois. */}
                    {m.tipo === "audio" &&
                    (m.midia_arquivo || m.midia_erro) ? (
                      <Audio
                        id={m.id}
                        mime={m.midia_mime}
                        erro={m.midia_arquivo ? null : m.midia_erro}
                        segundos={m.duracao_seg}
                        minha={nossa}
                      />
                    ) : m.tipo === "imagem" &&
                      (m.midia_arquivo || m.midia_previa || m.midia_erro) ? (
                      <Imagem
                        id={m.id}
                        mime={m.midia_mime}
                        erro={m.midia_arquivo ? null : m.midia_erro}
                        previa={m.midia_previa}
                        pronta={!!m.midia_arquivo}
                        legenda={m.texto}
                      />
                    ) : m.tipo === "video" &&
                      (m.midia_arquivo || m.midia_previa || m.midia_erro) ? (
                      <Video
                        id={m.id}
                        mime={m.midia_mime}
                        erro={m.midia_arquivo ? null : m.midia_erro}
                        previa={m.midia_previa}
                        pronto={!!m.midia_arquivo}
                        legenda={m.texto}
                      />
                    ) : m.tipo === "documento" &&
                      (m.midia_arquivo || m.midia_erro) ? (
                      <Documento
                        id={m.id}
                        mime={m.midia_mime}
                        erro={m.midia_arquivo ? null : m.midia_erro}
                        nome={m.texto}
                      />
                    ) : (
                      <>
                        {/* ── O QUE FOI DITO ANTES ──────────────────────────
                            A supervisão precisa ver a versão original, não só
                            a corrigida. Do lado do eleitor a mensagem antiga
                            EXISTIU — ele leu, pode ter printado. Mostrar só o
                            texto arrumado cega justamente quem coordena.
                            Riscado e acima, na ordem em que aconteceu. */}
                        {m.texto_original &&
                          m.texto_original !== m.texto && (
                            <span className="mb-1 block text-[11.5px] leading-snug line-through opacity-60">
                              {m.texto_original}
                            </span>
                          )}
                        {m.texto ?? (
                          <span className="italic opacity-80">
                          {m.tipo === "audio"
                            ? "🎤 Áudio — ainda baixando"
                            : m.tipo === "imagem"
                              ? "📷 Imagem — ainda baixando"
                              : m.tipo === "video"
                                ? "🎬 Vídeo — ainda baixando"
                                : m.tipo === "documento"
                                  ? "📎 Documento"
                                  : "Mensagem"}
                          </span>
                        )}
                        {m.editada_em && (
                          <span className="mt-0.5 block text-[10px] opacity-70">
                            editada às {hora(m.editada_em)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <span
                    className={`mt-0.5 block text-[10px] text-tinta-400 ${nossa ? "text-right" : ""}`}
                  >
                    {hora(m.momento)}
                  </span>
                </div>
              );
            })}
        </div>

        <footer className="flex flex-col gap-2 border-t border-tinta-200 px-5 py-3">
          {!conversa.encerrada_em && <MoverUma conversa={conversa} equipe={equipe} />}
          <p className="text-[11px] leading-relaxed text-tinta-400">
            Para responder, use{" "}
            <b className="text-tinta-600">responder</b> — a conversa passa a ser
            sua e fica registrado quem falou.
          </p>
        </footer>
      </div>
    </div>
  );
}

// ── passar uma conversa ─────────────────────────────────────────────────────

/**
 * Passar ESTA conversa para outra atendente, ou devolver para a fila.
 *
 * Na gaveta, e não na tabela: a coordenadora decide depois de ler. Vai por
 * `supervisao_mover` sem o filtro de paradas — aqui ela escolheu a conversa de
 * propósito, inclusive uma que está andando.
 */
function MoverUma({ conversa, equipe }: { conversa: Conversa; equipe: MembroEquipe[] }) {
  const [para, setPara] = useState("");
  const [estado, setEstado] = useState("");

  async function mover() {
    setEstado("movendo");
    const { data, error } = await createClient().rpc("supervisao_mover", {
      p_conversas: [conversa.id],
      p_para: para === "fila" ? null : para,
      p_so_sem_resposta: false,
    });
    if (error) return setEstado(`Não moveu: ${error.message}`);
    const r = data as { movidas: number; ficaram?: number; para: string | null };
    setEstado(
      r.movidas
        ? r.para
          ? `Passada para ${r.para}.`
          : "Devolvida para a fila."
        : r.ficaram
          ? "Já foi respondida: sem dona não aparece em caixa nenhuma. Escolha uma pessoa."
          : "Já estava assim.",
    );
  }

  const opcoes = equipe.filter((m) => m.id !== conversa.atendente_id);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-tinta-600">
      <span className="font-semibold">Passar para</span>
      <select
        value={para}
        onChange={(e) => {
          setPara(e.target.value);
          setEstado("");
        }}
        className="h-8 min-w-0 rounded-md border border-tinta-200 bg-white px-2 text-[12px]"
      >
        <option value="">escolher…</option>
        {conversa.atendente_id && !conversa.primeira_resp_at && <option value="fila">a fila (sem dona)</option>}
        {opcoes.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </select>
      <button
        onClick={mover}
        disabled={!para || estado === "movendo"}
        className="h-8 rounded-md bg-tema px-3 text-[12px] font-semibold text-white disabled:opacity-40"
      >
        {estado === "movendo" ? "movendo…" : "Mover"}
      </button>
      {estado && estado !== "movendo" && <span className="text-[12px] font-semibold text-tinta-700">{estado}</span>}
    </div>
  );
}

// ── peças ───────────────────────────────────────────────────────────────────

const TOM = {
  neutro: {
    borda: "#e6e6e9",
    fundo: "#ffffff",
    rotulo: "#9b9ca4",
    valor: "#101114",
  },
  atencao: {
    borda: "#f0dcc0",
    fundo: "#fdf6ea",
    rotulo: "#a35a00",
    valor: "#a35a00",
  },
  ruim: {
    borda: "#f3d3d3",
    fundo: "#fdf1f1",
    rotulo: "#c02020",
    valor: "#c02020",
  },
} as const;

function Numero({
  rotulo,
  valor,
  tom = "neutro",
}: {
  rotulo: string;
  valor: number;
  tom?: keyof typeof TOM;
}) {
  const t = TOM[tom];
  return (
    <div
      className="rounded-lg border px-3.5 py-3"
      style={{ borderColor: t.borda, background: t.fundo }}
    >
      <span
        className="block truncate text-[9.5px] font-bold uppercase tracking-[0.1em]"
        style={{ color: t.rotulo }}
      >
        {rotulo}
      </span>
      <span
        className="tabular mt-1 block text-[22px] font-extrabold leading-none tracking-[-0.02em]"
        style={{ color: t.valor }}
      >
        {valor}
      </span>
    </div>
  );
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[68px] shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-tinta-400">
        {rotulo}
      </span>
      <div className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5">
        {children}
      </div>
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
        ativo
          ? "border-tema bg-tema/10 font-semibold text-tema"
          : "border-tinta-200 bg-white text-tinta-600 hover:border-tinta-300"
      }`}
    >
      {children}
    </button>
  );
}

function Contagem({ n }: { n: number }) {
  return <span className="tabular text-[11px] text-tinta-400">{n}</span>;
}
