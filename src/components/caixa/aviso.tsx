"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Bell, BellOff } from "lucide-react";

// O aviso de mensagem nova.
//
// ── POR QUE O SOM SOZINHO NÃO RESOLVE ───────────────────────────────────────
//
// A atendente vai passar o dia com a aba do PIE atrás do WhatsApp, do navegador
// pessoal, de uma planilha. O som avisa quem está por perto; quem saiu para o
// café volta e não sabe que perdeu três leads.
//
// Por isso são DUAS coisas:
//
//   · o SOM, para quem está na frente;
//   · o TÍTULO DA ABA, que passa a contar as não vistas — "(3) Atendimento".
//     Ele fica lá até a pessoa voltar, e é o que ela vê ao olhar a barra de
//     abas depois de meia hora fora.
//
// ── O SOM É SINTETIZADO, NÃO É ARQUIVO ──────────────────────────────────────
//
// Nenhum .mp3 para baixar, nenhum pedido a mais, nada que falhe se a rede
// oscilar. São duas notas curtas geradas na hora — sobem, o que o ouvido lê
// como "chegou" em vez de "deu erro".

const CHAVE = "pie_aviso_som";

// ── A PREFERÊNCIA MORA FORA DO REACT ────────────────────────────────────────
//
// Ler `localStorage` dentro de um efeito e chamar setState causa render em
// cascata — e o compilador do React reclama, com razão. `useSyncExternalStore`
// existe exatamente para isto: ler uma fonte que não é do React, sem efeito.
//
// De quebra, o servidor devolve "ligado" e o navegador corrige na hidratação,
// sem o susto de o botão piscar de estado.
const ouvintes = new Set<() => void>();

function lerSom(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== "0";
  } catch {
    return true; // navegador sem armazenamento: fica ligado
  }
}

function gravarSom(v: boolean) {
  try {
    localStorage.setItem(CHAVE, v ? "1" : "0");
  } catch {}
  ouvintes.forEach((f) => f());
}

function assinar(cb: () => void) {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

export function useAviso() {
  const ligado = useSyncExternalStore(assinar, lerSom, () => true);
  const [naoVistas, setNaoVistas] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const liberado = useRef(false);

  // O NAVEGADOR SÓ DEIXA TOCAR DEPOIS DE UM CLIQUE.
  //
  // É regra de todos eles, contra site que grita sozinho. Se a gente não
  // preparar o som no primeiro toque da pessoa, o primeiro aviso do dia é
  // engolido em silêncio — e ela conclui que o recurso não funciona.
  useEffect(() => {
    function liberar() {
      if (liberado.current) return;
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioRef.current = new Ctx();
        audioRef.current.resume();
        liberado.current = true;
      } catch {
        /* sem áudio: o título da aba continua avisando */
      }
    }
    document.addEventListener("pointerdown", liberar);
    document.addEventListener("keydown", liberar);
    return () => {
      document.removeEventListener("pointerdown", liberar);
      document.removeEventListener("keydown", liberar);
    };
  }, []);

  const tocar = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    // Duas notas subindo. Curtas de propósito: um som que dura vira incômodo
    // quando toca quarenta vezes por hora.
    [880, 1174].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      const t = ctx.currentTime + i * 0.11;
      // Sobe e desce em rampa: corte seco estala no alto-falante.
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }, []);

  /** Chamar quando algo novo chega e não foi esta conta que causou. */
  const avisar = useCallback(() => {
    if (ligado) tocar();
    // Só conta se a aba não está à vista. Com a pessoa olhando, a mensagem já
    // apareceu na tela — somar ao título seria pedir atenção para o que ela
    // acabou de ver.
    if (document.hidden) setNaoVistas((n) => n + 1);
  }, [ligado, tocar]);

  // Voltou para a aba: o contador zera.
  useEffect(() => {
    function aoVoltar() {
      if (!document.hidden) setNaoVistas(0);
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);

  // O título da aba é o aviso que sobrevive à pessoa sair da mesa.
  useEffect(() => {
    const original = "Atendimento · PIE";
    document.title = naoVistas > 0 ? `(${naoVistas}) ${original}` : original;
    return () => {
      document.title = original;
    };
  }, [naoVistas]);

  const alternar = useCallback(() => {
    const novo = !lerSom();
    gravarSom(novo);
    // Toca ao LIGAR, para a pessoa ouvir o que acabou de escolher — e descobrir
    // agora, não no meio do plantão, se o volume do computador está mudo.
    if (novo) setTimeout(tocar, 60);
  }, [tocar]);

  return { ligado, alternar, avisar, naoVistas };
}

export function BotaoSom({
  ligado,
  alternar,
}: {
  ligado: boolean;
  alternar: () => void;
}) {
  return (
    <button
      onClick={alternar}
      title={
        ligado
          ? "Desligar o som de mensagem nova"
          : "Ligar o som de mensagem nova"
      }
      aria-label={ligado ? "Desligar o som" : "Ligar o som"}
      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg transition-colors ${
        ligado
          ? "text-tema hover:bg-tema/10"
          : "text-tinta-300 hover:bg-tinta-100 hover:text-tinta-500"
      }`}
    >
      {ligado ? <Bell size={15} /> : <BellOff size={15} />}
    </button>
  );
}
