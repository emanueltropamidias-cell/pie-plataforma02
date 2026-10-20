"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Play, Pause, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PainelDaBarra } from "@/components/caixa/painel";

// Os áudios da Talita, dentro da conversa.
//
// ── POR QUE ISTO NÃO É "MAIS UM ANEXO" ──────────────────────────────────────
//
// Um áudio na voz da candidata não é uma mensagem melhor — é outra categoria de
// mensagem. Quem recebe texto de campanha sabe que foi uma equipe. Quem recebe
// a voz sente que falou com ela.
//
// Por isso o gesto tem de ser curto: a menina está no meio de uma conversa, o
// lead acabou de perguntar de saúde, e ela precisa achar o áudio certo em
// segundos. Uma lista com título e "quando usar" resolve isso; uma pasta de
// arquivos com nome de gravação, não.
//
// ── OUVIR ANTES DE MANDAR ───────────────────────────────────────────────────
//
// O botão de ouvir existe porque áudio errado não se recolhe. Mandar o de
// agradecimento para quem acabou de reclamar do posto de saúde é pior do que
// não mandar nada — e o título sozinho não impede isso quando são doze áudios
// parecidos e a pessoa está com pressa.

type Audio = {
  id: number;
  titulo: string;
  quando: string | null;
  duracao_seg: number | null;
  vezes: number;
};

function tempo(s: number | null) {
  if (!s || s < 1) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function AudiosDaTalita({
  conversaId,
  podeEnviar,
  aoEnviar,
}: {
  conversaId: number;
  podeEnviar: boolean;
  aoEnviar: () => void;
}) {
  const supabase = createClient();
  const caixa = useRef<HTMLDivElement>(null);
  const tocador = useRef<HTMLAudioElement | null>(null);

  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Audio[] | null>(null);
  const [tocando, setTocando] = useState<number | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A lista só é buscada quando o menu abre, e uma vez só: ela muda uma vez por
  // semana e a caixa abre dezenas de vezes por hora.
  useEffect(() => {
    if (!aberto || lista) return;
    let vivo = true;
    supabase
      .from("materiais")
      .select("id, titulo, quando, duracao_seg, vezes")
      .eq("ativo", true)
      // ── SÓ ÁUDIO NESTA LISTA ────────────────────────────────────────────
      //
      // Faltava este filtro. A tabela `audios` virou `materiais` e passou a
      // guardar áudio, imagem, vídeo e texto no mesmo lugar — o botão continuou
      // pedindo a tabela inteira, e o santinho passou a aparecer na lista de
      // áudios.
      //
      // Não é só desarrumado: este botão manda por `enviarAudio`, que entrega
      // MENSAGEM DE VOZ. Clicar num santinho aqui tenta mandar uma imagem como
      // voz — o WhatsApp exige OGG/Opus, e o que sai é falha ou um áudio
      // quebrado na conversa do eleitor.
      //
      // Santinho tem lugar próprio: vai por Kit, ou por Anexo.
      .eq("tipo", "audio")
      .order("ordem")
      .order("titulo")
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setErro(
            error.code === "42P01" || error.code === "PGRST205"
              ? "Os áudios ainda não foram criados no banco."
              : error.message,
          );
          setLista([]);
          return;
        }
        setLista((data ?? []) as Audio[]);
      });
    return () => {
      vivo = false;
    };
  }, [aberto, lista, supabase]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) fechar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function fechar() {
    // Parar o áudio ao fechar não é detalhe: sem isso a voz da Talita continua
    // tocando no meio do escritório depois de a menina já ter voltado a
    // digitar.
    tocador.current?.pause();
    tocador.current = null;
    setTocando(null);
    setAberto(false);
    setErro(null);
  }

  async function ouvir(id: number) {
    if (tocando === id) {
      tocador.current?.pause();
      tocador.current = null;
      setTocando(null);
      return;
    }
    tocador.current?.pause();
    setErro(null);

    const r = await fetch(`/api/atendimento/audio/ouvir?a=${id}`);
    const j = await r.json();
    if (!r.ok || !j?.url) {
      setErro(j?.erro ?? "Não consegui carregar o áudio.");
      return;
    }

    const a = new window.Audio(j.url);
    a.onended = () => setTocando(null);
    a.onerror = () => {
      setErro("O arquivo não tocou. Ele pode estar corrompido.");
      setTocando(null);
    };
    tocador.current = a;
    setTocando(id);
    void a.play();
  }

  async function mandar(id: number) {
    setEnviando(id);
    setErro(null);
    try {
      // A ROTA É A GERAL, e não uma só de áudio.
      //
      // Havia `/api/atendimento/audio`, que só sabia mandar voz — e por isso o
      // santinho avulso não tinha caminho nenhum depois que a lista passou a
      // filtrar tipo. Duas rotas quase iguais seria a trava do teto corrigida
      // numa e esquecida na outra.
      const r = await fetch("/api/atendimento/material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId, materialId: id }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.erro ?? "Não consegui mandar.");
        return;
      }
      fechar();
      aoEnviar();
    } catch {
      setErro("Falha de rede.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        disabled={!podeEnviar}
        aria-label="Áudios da Talita"
        title="Áudios da Talita"
        className={`flex h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
          aberto
            ? "border-tema/30 bg-tema/10 text-tema"
            : "border-tinta-200 text-tinta-600 hover:border-tinta-300 hover:bg-tinta-100 hover:text-tinta-900"
        }`}
      >
        <Mic size={16} />
        Áudio
      </button>

      {aberto && (
        <PainelDaBarra
          titulo="Áudios da Talita"
          ancora="esquerda"
          aoFechar={fechar}
          rodape="Chega como mensagem de voz, igual a um áudio gravado na hora."
        >

          {erro && (
            <p className="mx-2 mt-2 rounded-md bg-[#fdf1f1] px-2.5 py-2 text-[11.5px] leading-relaxed text-[#c02020]">
              {erro}
            </p>
          )}

          <div className="p-1.5">
            {lista === null && (
              <p className="px-2 py-6 text-center text-[12px] text-tinta-400">
                carregando…
              </p>
            )}

            {lista?.length === 0 && !erro && (
              <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-tinta-400">
                Nenhum áudio ainda. A coordenação sobe em{" "}
                <b>Atendimento → Áudios da Talita</b>.
              </p>
            )}

            {lista?.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-tinta-50"
              >
                <button
                  onClick={() => ouvir(a.id)}
                  aria-label={tocando === a.id ? "Parar" : `Ouvir ${a.titulo}`}
                  className="mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tema/10 text-tema transition-colors hover:bg-tema/20"
                >
                  {tocando === a.id ? <Pause size={14} /> : <Play size={14} />}
                </button>

                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold leading-snug text-tinta-900">
                    {a.titulo}
                    {a.duracao_seg ? (
                      <span className="ml-1.5 font-normal text-tinta-400">
                        {tempo(a.duracao_seg)}
                      </span>
                    ) : null}
                  </p>
                  {a.quando && (
                    <p className="mt-0.5 text-[11px] leading-snug text-tinta-500">
                      {a.quando}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => mandar(a.id)}
                  disabled={enviando !== null}
                  className="mt-px flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-tema px-2.5 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  {enviando === a.id ? (
                    "…"
                  ) : (
                    <>
                      <Send size={12} />
                      Mandar
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

        </PainelDaBarra>
      )}
    </div>
  );
}
