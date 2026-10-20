"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, FileText, AlertCircle, Download } from "lucide-react";

// O áudio e a foto dentro da conversa.
//
// ── O LINK É PEDIDO SÓ QUANDO A MENSAGEM APARECE NA TELA ────────────────────
//
// Cada link é assinado e vale cinco minutos. Pedir todos ao abrir a conversa
// gastaria uma chamada por mídia — numa conversa com trinta áudios, trinta
// chamadas para tocar talvez um — e os links já teriam vencido quando a
// atendente rolasse até o fim.
//
// Então cada bolha pede o seu quando entra em cena, e só então.

type Comum = { id: number; mime: string | null; erro: string | null };

function useLink(id: number, visivel: boolean) {
  const [estado, setEstado] = useState<{
    de: number;
    url: string | null;
    erro: string | null;
  }>({
    de: 0,
    url: null,
    erro: null,
  });

  useEffect(() => {
    if (!visivel) return;
    let vivo = true;
    fetch(`/api/atendimento/midia?m=${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        setEstado({
          de: id,
          url: j?.url ?? null,
          erro: j?.url ? null : (j?.erro ?? "falhou"),
        });
      })
      .catch(
        () => vivo && setEstado({ de: id, url: null, erro: "falha de rede" }),
      );
    return () => {
      vivo = false;
    };
  }, [id, visivel]);

  return estado.de === id ? estado : { de: id, url: null, erro: null };
}

/** O aviso de quando o arquivo não veio. Sem ele fica um vazio que parece bug. */
function Quebrada({ motivo, o }: { motivo: string; o: string }) {
  return (
    <span className="flex items-center gap-2 rounded-lg bg-tinta-100 px-3 py-2 text-[11.5px] text-tinta-500">
      <AlertCircle size={13} className="shrink-0" />
      <span>
        {o} não pôde ser carregado{motivo ? ` — ${motivo}` : ""}.
      </span>
    </span>
  );
}

// ── ÁUDIO ───────────────────────────────────────────────────────────────────

/**
 * As "ondinhas" são desenhadas, não medidas.
 *
 * A onda real exige baixar e decodificar o áudio inteiro antes de mostrar
 * qualquer coisa — em cima de um link que vence em cinco minutos, e para um
 * áudio que a atendente vai ouvir uma vez. O desenho é estável para o mesmo
 * áudio (nasce do identificador da mensagem), então não fica piscando forma
 * diferente a cada abertura, e cumpre o papel que a onda cumpre de verdade:
 * mostrar onde a reprodução está.
 */
function ondas(id: number, quantas = 34): number[] {
  const barras: number[] = [];
  let x = id * 9301 + 49297;
  for (let i = 0; i < quantas; i++) {
    x = (x * 9301 + 49297) % 233280;
    barras.push(0.25 + (x / 233280) * 0.75);
  }
  return barras;
}

// ── A VELOCIDADE ────────────────────────────────────────────────────────────
//
// Áudio de eleitor não é conversa de amigo: é recado de dois, três minutos, e a
// menina ouve dezenas por dia. Em 2× o mesmo turno rende o dobro de fila, e o
// navegador mantém o tom da voz (`preservesPitch`), então ninguém fica com voz
// de desenho animado.
//
// ── POR QUE FICA GUARDADO ───────────────────────────────────────────────────
//
// Quem escolhe 2× quer 2× no PRÓXIMO áudio também. Sem guardar, ela clicaria
// duas vezes em cada um dos oitenta áudios do dia — e em duas horas volta a
// ouvir tudo em 1×, porque cansou de clicar.
//
// Fica no navegador dela, não no banco: é preferência de quem está ouvindo, não
// dado da campanha.
const VELOCIDADES = [1, 1.5, 2] as const;
const CHAVE_VELOCIDADE = "pie:velocidade-audio";

function lerVelocidade(): number {
  try {
    const v = Number(localStorage.getItem(CHAVE_VELOCIDADE));
    return (VELOCIDADES as readonly number[]).includes(v) ? v : 1;
  } catch {
    // Janela anônima e navegador com dados bloqueados jogam aqui. Perder a
    // preferência é aceitável; derrubar o player por causa dela, não.
    return 1;
  }
}

function guardarVelocidade(v: number) {
  try {
    localStorage.setItem(CHAVE_VELOCIDADE, String(v));
  } catch {}
}

function duracao(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function Audio({
  id,
  erro,
  segundos,
  minha,
}: Comum & { segundos: number | null; minha: boolean }) {
  const { url, erro: erroLink } = useLink(id, true);
  const ref = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [agora, setAgora] = useState(0);
  const [total, setTotal] = useState(segundos ?? 0);
  // Só lê o localStorage na primeira renderização — o valor inicial de
  // `useState` como função não roda de novo a cada mensagem da lista.
  const [velocidade, setVelocidade] = useState(lerVelocidade);

  // Vale para o áudio que já está tocando, e não só para o próximo: a menina
  // aperta 2× no meio do recado justamente porque ele está arrastado.
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.playbackRate = velocidade;
    // Sem isto, 2× vira voz de desenho animado em alguns navegadores.
    a.preservesPitch = true;
  }, [velocidade, url]);

  const barras = ondas(id);
  const andado = total > 0 ? agora / total : 0;

  if (erro) return <Quebrada motivo={erro} o="O áudio" />;
  if (erroLink) return <Quebrada motivo={erroLink} o="O áudio" />;

  return (
    <span className="flex min-w-[220px] items-center gap-2.5">
      <button
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          if (a.paused) {
            a.play();
            setTocando(true);
          } else {
            a.pause();
            setTocando(false);
          }
        }}
        disabled={!url}
        aria-label={tocando ? "Pausar" : "Ouvir"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40 ${
          minha ? "bg-white/25 text-white" : "bg-tema text-white"
        }`}
      >
        {tocando ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
      </button>

      {/* A onda é clicável: é assim que se volta cinco segundos para entender
          uma palavra que não deu para pegar. */}
      <span
        className="flex h-7 flex-1 cursor-pointer items-center gap-[2px]"
        onClick={(e) => {
          const a = ref.current;
          if (!a || !total) return;
          const cx = e.currentTarget.getBoundingClientRect();
          a.currentTime = ((e.clientX - cx.left) / cx.width) * total;
        }}
      >
        {barras.map((h, i) => {
          const passou = i / barras.length <= andado;
          return (
            <span
              key={i}
              className="w-[2px] shrink-0 rounded-full transition-colors"
              style={{
                height: `${h * 100}%`,
                background: minha
                  ? passou
                    ? "#ffffff"
                    : "rgba(255,255,255,.45)"
                  : passou
                    ? "var(--tema)"
                    : "#d2d2d7",
              }}
            />
          );
        })}
      </span>

      <span
        className={`tabular shrink-0 text-[11px] ${minha ? "text-white/70" : "text-tinta-400"}`}
      >
        {duracao(tocando || agora > 0 ? total - agora : total)}
      </span>

      {/* Um toque cicla 1× → 1,5× → 2×, que é o gesto que elas já fazem no
          WhatsApp. Botão que só aparece em 2× esconderia o caminho de volta. */}
      <button
        onClick={() => {
          const i = VELOCIDADES.indexOf(velocidade as (typeof VELOCIDADES)[number]);
          const nova = VELOCIDADES[(i + 1) % VELOCIDADES.length];
          setVelocidade(nova);
          guardarVelocidade(nova);
        }}
        disabled={!url}
        aria-label={`Velocidade ${velocidade}x, tocar para mudar`}
        title="Velocidade"
        className={`tabular shrink-0 rounded-full px-1.5 py-[3px] text-[10.5px] font-bold leading-none transition-opacity disabled:opacity-40 ${
          minha
            ? "bg-white/25 text-white"
            : velocidade === 1
              ? "bg-tinta-100 text-tinta-500"
              : "bg-tema text-white"
        }`}
      >
        {String(velocidade).replace(".", ",")}×
      </button>

      {url && (
        <audio
          ref={ref}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setTotal(d);
          }}
          onTimeUpdate={(e) => setAgora(e.currentTarget.currentTime)}
          onEnded={() => {
            setTocando(false);
            setAgora(0);
          }}
          className="hidden"
        />
      )}
    </span>
  );
}

// ── IMAGEM ──────────────────────────────────────────────────────────────────

export function Imagem({
  id,
  erro,
  legenda,
  previa,
  pronta,
}: Comum & {
  legenda: string | null;
  /** A miniatura em base64 que veio junto com a mensagem. */
  previa: string | null;
  /** O arquivo cheio já está guardado? Enquanto não, a miniatura segura. */
  pronta: boolean;
}) {
  const [aberta, setAberta] = useState(false);
  // O link só é pedido quando o arquivo existe. Pedir antes gastaria uma
  // chamada para receber "ainda não" — e a miniatura já está na tela.
  const { url, erro: erroLink } = useLink(id, pronta);

  if (erro) return <Quebrada motivo={erro} o="A imagem" />;
  if (erroLink && !previa) return <Quebrada motivo={erroLink} o="A imagem" />;

  const miniatura = previa ? `data:image/jpeg;base64,${previa}` : null;
  const mostrar = url ?? miniatura;
  // Enquanto é a miniatura, a imagem é pequena e ampliada — fica borrada. O
  // desfoque de leve assume isso em vez de fingir que está nítida, e some
  // sozinho quando a foto cheia chega.
  const carregando = !url && !!miniatura;

  return (
    <>
      <span className="block">
        {mostrar ? (
          // link assinado que vence em minutos: next/image não tem o que
          // otimizar e ainda tentaria cachear um endereço que morre.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mostrar}
            alt={legenda ?? "Imagem recebida"}
            onClick={() => url && setAberta(true)}
            className={`max-h-[260px] max-w-full rounded-lg object-cover transition-[filter] duration-300 ${
              carregando ? "cursor-default blur-[2px]" : "cursor-zoom-in blur-0"
            }`}
          />
        ) : (
          <span className="flex h-[140px] w-[200px] items-center justify-center rounded-lg bg-tinta-100 text-[11.5px] text-tinta-400">
            carregando…
          </span>
        )}
        {legenda && <span className="mt-1 block text-[12.5px]">{legenda}</span>}
      </span>

      {aberta && url && (
        <span
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setAberta(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={legenda ?? "Imagem"}
            className="max-h-full max-w-full rounded-lg"
          />
        </span>
      )}
    </>
  );
}

// ── VÍDEO ───────────────────────────────────────────────────────────────────

/**
 * A miniatura aparece na hora; o vídeo só é buscado no clique.
 *
 * Vídeo pesa 10 a 16 MB. Carregar sozinho, em toda conversa aberta, gastaria
 * banda de quem atende — muitas vezes num celular, no meio da rua — para tocar
 * um vídeo que talvez ninguém abra. A miniatura já diz do que se trata, e é o
 * suficiente para decidir se vale ver.
 */
export function Video({
  id,
  erro,
  legenda,
  previa,
  pronto,
}: Comum & { legenda: string | null; previa: string | null; pronto: boolean }) {
  const [querVer, setQuerVer] = useState(false);
  const { url, erro: erroLink } = useLink(id, querVer && pronto);

  if (erro) return <Quebrada motivo={erro} o="O vídeo" />;
  if (erroLink) return <Quebrada motivo={erroLink} o="O vídeo" />;

  const miniatura = previa ? `data:image/jpeg;base64,${previa}` : null;

  if (querVer && url) {
    return (
      <span className="block">
        <video
          src={url}
          controls
          autoPlay
          className="max-h-[320px] max-w-full rounded-lg"
        />
        {legenda && <span className="mt-1 block text-[12.5px]">{legenda}</span>}
      </span>
    );
  }

  return (
    <span className="block">
      <button
        onClick={() => setQuerVer(true)}
        disabled={!pronto}
        title={pronto ? "Ver o vídeo" : "Ainda baixando"}
        className="relative block overflow-hidden rounded-lg disabled:cursor-wait"
      >
        {miniatura ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={miniatura}
            alt={legenda ?? "Vídeo recebido"}
            className="max-h-[260px] max-w-full object-cover"
          />
        ) : (
          <span className="flex h-[150px] w-[220px] items-center justify-center bg-tinta-200" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-tinta-900">
            {querVer && !url ? (
              <span className="text-[10px] font-bold">···</span>
            ) : (
              <Play size={18} className="ml-0.5" />
            )}
          </span>
        </span>
        {!pronto && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            baixando…
          </span>
        )}
      </button>
      {legenda && <span className="mt-1 block text-[12.5px]">{legenda}</span>}
    </span>
  );
}

// ── DOCUMENTO ───────────────────────────────────────────────────────────────

export function Documento({ id, erro, nome }: Comum & { nome: string | null }) {
  const { url, erro: erroLink } = useLink(id, true);

  if (erro) return <Quebrada motivo={erro} o="O arquivo" />;
  if (erroLink) return <Quebrada motivo={erroLink} o="O arquivo" />;

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-lg bg-black/5 px-3 py-2 transition-opacity hover:opacity-80"
    >
      <FileText size={18} className="shrink-0 opacity-60" />
      <span className="min-w-0 flex-1 truncate text-[12.5px]">
        {nome ?? "Documento"}
      </span>
      <Download size={14} className="shrink-0 opacity-50" />
    </a>
  );
}
