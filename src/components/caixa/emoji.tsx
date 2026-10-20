"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Smile } from "lucide-react";
import { PainelDaBarra } from "@/components/caixa/painel";

// Os emojis.
//
// ── LISTA ESCOLHIDA A MÃO, E NÃO UMA BIBLIOTECA ─────────────────────────────
//
// As bibliotecas de emoji trazem os 1800 do padrão Unicode, com busca, abas e
// umas centenas de kilobytes. Quem atende lead de campanha usa trinta, e os
// mesmos trinta o dia inteiro: coração, mãozinha, oração, bandeira.
//
// Rolar 1800 para achar o coração azul é mais lento que digitar a frase. Aqui
// são poucos, agrupados pelo que a conversa pede, e os USADOS RECENTEMENTE
// sobem para a primeira linha — que é o que de fato reduz o gesto ao segundo
// dia de uso.

const GRUPOS: { nome: string; itens: string[] }[] = [
  {
    nome: "Campanha",
    // 💙 primeiro: é a cor da Talita, e é o que mais sai.
    //
    // 💚💛 logo atrás, e juntos: é o par que a equipe usa na saudação
    // ("Claro! 💚💛"), e separá-los faria procurar duas vezes.
    //
    // O grupo passa de dez para doze e a grade quebra numa segunda linha com
    // dois — é o desenho aceitando mais item, não item forçado no desenho.
    // Nada foi tirado para caber: emoji que alguém usa e some vira "sumiu o
    // coração", e ninguém avisa, só para de usar.
    itens: ["💙", "💚", "💛", "🙏", "🇧🇷", "✨", "🔵", "💪", "🤝", "❤️", "🫶", "⭐"],
  },
  {
    nome: "Simpatia",
    itens: ["😊", "😀", "😃", "🥰", "😍", "🤗", "😉", "😅", "🙂", "☺️"],
  },
  {
    nome: "Mãos",
    itens: ["👍", "👏", "🙌", "👋", "🤲", "✌️", "👌", "🫡", "🤞", "✊"],
  },
  {
    nome: "Conversa",
    itens: ["✅", "❌", "⚠️", "❗", "❓", "📌", "📎", "📅", "⏰", "🔔"],
  },
  {
    nome: "Assuntos",
    itens: ["🏥", "💊", "⚖️", "💼", "🎓", "🏠", "🚌", "💧", "🌾", "🛠️"],
  },
  {
    nome: "Sentimento",
    itens: ["😢", "😔", "😟", "🥺", "😡", "😴", "🤔", "😂", "🥳", "🎉"],
  },
];

// ── OS RECENTES MORAM FORA DO REACT ─────────────────────────────────────────
//
// Ler `localStorage` dentro de efeito e chamar setState causa render em
// cascata. `useSyncExternalStore` lê fonte externa sem efeito nenhum — é a
// mesma solução do som de aviso.
const CHAVE = "pie_emoji_recentes";
const ouvintes = new Set<() => void>();
const VAZIO: string[] = [];

// ── O RESULTADO PRECISA SER O MESMO OBJETO ──────────────────────────────────
//
// `useSyncExternalStore` chama esta função a CADA RENDER e compara o resultado
// com o anterior por IDENTIDADE. `JSON.parse` devolve um array novo toda vez —
// então "mudou" sempre, o React renderiza de novo, que chama de novo, que
// devolve outro array novo.
//
// Laço infinito, e a aba morre com "This page couldn't load". O React até avisa
// no console: "The result of getSnapshot should be cached to avoid an infinite
// loop" — mas o console não estava aberto, e o sintoma parecia página pesada.
//
// A saída é guardar o TEXTO CRU junto com o array já interpretado: enquanto o
// texto não muda, devolve-se exatamente o mesmo objeto.
let cruAnterior: string | null = null;
let listaAnterior: string[] = VAZIO;

function lerRecentes(): string[] {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) {
      cruAnterior = null;
      listaAnterior = VAZIO;
      return VAZIO;
    }
    if (cru === cruAnterior) return listaAnterior;
    const lista = JSON.parse(cru);
    cruAnterior = cru;
    listaAnterior = Array.isArray(lista) ? lista.slice(0, 10) : VAZIO;
    return listaAnterior;
  } catch {
    return VAZIO;
  }
}

function guardarRecente(e: string) {
  try {
    const antes = lerRecentes().filter((x) => x !== e);
    localStorage.setItem(CHAVE, JSON.stringify([e, ...antes].slice(0, 10)));
  } catch {}
  ouvintes.forEach((f) => f());
}

function assinar(cb: () => void) {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

export function Emojis({
  aoEscolher,
}: {
  /** Recebe o emoji. Quem chama decide onde enfiar — aqui não se sabe. */
  aoEscolher: (emoji: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const recentes = useSyncExternalStore(assinar, lerRecentes, () => VAZIO);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function escolher(e: string) {
    guardarRecente(e);
    aoEscolher(e);
    // NÃO FECHA. Quem manda "💙" costuma mandar "🙏" na sequência, e reabrir a
    // cada um transformaria dois toques em quatro.
  }

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Emojis"
        title="Emojis"
        className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg transition-colors ${
          aberto
            ? "bg-tema/10 text-tema"
            : "text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
        }`}
      >
        <Smile size={17} />
      </button>

      {aberto && (
        <PainelDaBarra
          titulo="Emojis"
          largura="19rem"
          aoFechar={() => setAberto(false)}
        >
          <div className="p-2">
            {recentes.length > 0 && (
              <Faixa
                nome="Usados agora há pouco"
                itens={recentes}
                onClica={escolher}
              />
            )}
            {GRUPOS.map((g) => (
              <Faixa
                key={g.nome}
                nome={g.nome}
                itens={g.itens}
                onClica={escolher}
              />
            ))}
          </div>
        </PainelDaBarra>
      )}
    </div>
  );
}

function Faixa({
  nome,
  itens,
  onClica,
}: {
  nome: string;
  itens: string[];
  onClica: (e: string) => void;
}) {
  return (
    <div className="mb-1.5 last:mb-0">
      <p className="px-1 pb-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-tinta-400">
        {nome}
      </p>
      <div className="grid grid-cols-10 gap-0.5">
        {itens.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            onClick={() => onClica(e)}
            // Alvo de 30px: menor que isso, o dedo erra no celular.
            className="flex h-[30px] w-full items-center justify-center rounded-md text-[19px] leading-none transition-colors hover:bg-tinta-100"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
