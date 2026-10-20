"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A urna eletrônica, para a pessoa treinar o voto antes do dia.
//
// ── POR QUE ELA É FIEL, E NÃO UM "DIGITE 1022" BONITO ───────────────────────
//
// Quem chega aqui vai votar numa urna de verdade em 4 de outubro, e o que
// trava no dia não é o número — é a sequência. Muita gente digita certo e não
// aperta CONFIRMA; muita gente erra e não sabe que existe CORRIGE.
//
// Então a simulação copia o que importa da urna real:
//
//   · o cargo aparece no alto, como lá
//   · os dígitos entram um a um, em quadrinhos separados
//   · a foto e o nome só surgem quando o número está completo
//   · nada acontece sem CONFIRMA
//   · CORRIGE limpa tudo, como lá
//   · o bipe toca a cada tecla, e o FIM tem o som longo
//
// O que NÃO é copiado: a tela de "VOTO NULO" com número inexistente. Aqui ela
// vira um empurrão gentil de volta — a página existe para ensinar 1022, não
// para simular o erro.

// ── DOIS CARGOS, NA ORDEM DA URNA DE VERDADE ────────────────────────────────
//
// 29/09: "tem que ter a votação de Flávio também, 22, na urna."
//
// A urna real pede os cargos numa ordem fixa, e treinar fora dela é treinar
// errado: deputado federal vem primeiro, presidente por último. Quem decorar
// "primeiro o 22" vai travar na seção quando a tela pedir quatro dígitos.
//
// Entre um cargo e outro a urna volta ao início — display limpo, número vazio.
// Por isso aqui existe uma ETAPA, e não uma tela só com dois campos.
const CARGOS = [
  {
    numero: "1022",
    digitos: 4,
    cargo: "DEPUTADA FEDERAL",
    nome: "TALITA OLIVEIRA",
    partido: "PL",
    // Do drive, arquivo "talita urna.jpeg", subido por ele em 29/09 já como
    // retrato individual — o Vision confirmou UM rosto, que é o que resolve a
    // dúvida de identidade que travou a tarde inteira.
    //
    // Recortada para 3x4 com o rosto a 38% do topo, que é a proporção de foto
    // de documento e a que a urna real usa.
    foto: "/talita-urna.jpg",
    temFoto: true,
  },
  {
    numero: "22",
    digitos: 2,
    cargo: "PRESIDENTE",
    nome: "FLÁVIO BOLSONARO",
    partido: "PL",
    // Do drive, arquivo "FLÁVIO URNA.jpeg". Veio já em 3x4 (418x528).
    foto: "/flavio-urna.jpg",
    temFoto: true,
  },
] as const;

type Fase = "digitando" | "conferindo" | "confirmado" | "branco";

export function Urna({ aoConfirmar }: { aoConfirmar?: () => void } = {}) {
  const [etapa, setEtapa] = useState(0);
  const [digitos, setDigitos] = useState("");
  const [fase, setFase] = useState<Fase>("digitando");
  const atual = CARGOS[etapa];
  const ultimo = etapa === CARGOS.length - 1;
  const audioRef = useRef<AudioContext | null>(null);

  // ── O SOM DA URNA ─────────────────────────────────────────────────────────
  //
  // 29/09, Emanuel: "por que o áudio da urna está assim no Facebook".
  //
  // A versão anterior sintetizava tudo com Web Audio. Funciona no Chrome e no
  // Safari abertos normalmente, e FALHA dentro do navegador do Facebook e do
  // Instagram — que é por onde a maioria vai chegar, já que os criativos são
  // de lá.
  //
  // O motivo é a sessão de áudio do iOS: Web Audio entra como "ambient", que a
  // chavinha de silencioso do aparelho corta. Arquivo tocado por <audio> entra
  // como "playback", que não é cortado. Os aplicativos ainda apertam mais isso
  // por definirem a própria sessão.
  //
  // Então agora são ARQUIVOS, gerados em `public/urna-*.wav`. Onda quadrada,
  // porque a urna usa buzzer piezoelétrico: som seco, sem harmônico suave.
  // Seno soaria como notificação de aplicativo e ninguém reconheceria.
  //
  // A síntese continua, como rede: se o arquivo não carregar, o Web Audio
  // assume e a pessoa nem percebe.
  const sons = useRef<Record<string, HTMLAudioElement>>({});
  useEffect(() => {
    const mapa: Record<string, string> = {
      tecla: "/urna-tecla.wav",
      corrige: "/urna-corrige.wav",
      fim: "/urna-fim.wav",
      recusa: "/urna-recusa.wav",
    };
    for (const [nome, url] of Object.entries(mapa)) {
      const a = new Audio(url);
      a.preload = "auto";
      // `playsInline` não existe em HTMLAudioElement no tipo, mas o atributo é
      // lido pelo WebKit e evita que o iOS tente abrir em tela cheia.
      a.setAttribute("playsinline", "");
      sons.current[nome] = a;
    }
  }, []);

  /** A rede: um tom sintetizado, para quando o arquivo não carregar. */
  const tom = useCallback((freq: number, dur: number) => {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t);
      vol.gain.setValueAtTime(0, t);
      vol.gain.linearRampToValueAtTime(0.07, t + 0.008);
      vol.gain.setValueAtTime(0.07, t + dur - 0.02);
      vol.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      /* sem som é melhor que erro na tela */
    }
  }, []);

  const RESERVA: Record<string, [number, number]> = {
    tecla: [1046, 0.06],
    corrige: [660, 0.11],
    fim: [1000, 1.15],
    recusa: [300, 0.18],
  };

  const tocar = useCallback(
    (qual: "tecla" | "corrige" | "fim" | "recusa") => {
      const a = sons.current[qual];
      if (a) {
        try {
          a.currentTime = 0;
          const p = a.play();
          if (p) p.catch(() => tom(...RESERVA[qual]));
          return;
        } catch {
          /* cai na reserva abaixo */
        }
      }
      tom(...RESERVA[qual]);
    },
    // `RESERVA` é constante literal e não muda entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tom],
  );

  const digitar = useCallback(
    (d: string) => {
      if (fase === "confirmado") return;
      if (fase === "branco") setFase("digitando");
      setDigitos((antes) => {
        if (antes.length >= atual.digitos) return antes;
        const novo = antes + d;
        setFase(novo.length === atual.digitos ? "conferindo" : "digitando");
        return novo;
      });
      tocar("tecla");
    },
    [fase, tocar, atual.digitos],
  );

  const corrigir = useCallback(() => {
    setDigitos("");
    setFase("digitando");
    // CORRIGE e BRANCO usam um tom mais grave que a tecla: na urna real eles
    // soam diferente, e é assim que a pessoa sabe que apertou o outro botão
    // sem tirar os olhos da tela.
    tocar("corrige");
  }, [tocar]);

  const confirmar = useCallback(() => {
    if (fase === "conferindo") {
      if (!ultimo) {
        // Entre um cargo e outro a urna real volta ao início: bipe de
        // confirmação curto, tela limpa, próximo cargo. O som longo do FIM é
        // do fim da votação inteira, e usá-lo aqui ensinaria errado.
        tocar("tecla");
        setEtapa((e) => e + 1);
        setDigitos("");
        setFase("digitando");
        return;
      }
      setFase("confirmado");
      tocar("fim");
      // Avisa a página. Ela usa isso para acender o botão do grupo — o
      // momento em que a pessoa acabou de confirmar o voto é o único em que
      // ela está com os números na mão e sem nada para fazer em seguida.
      aoConfirmar?.();
    } else if (fase === "branco") {
      // Branco não é o que a página ensina; volta ao início sem drama.
      corrigir();
    } else {
      // Confirmar sem número completo não faz nada na urna, e o som avisa:
      // grave e curto, o "não" da máquina.
      tocar("recusa");
    }
  }, [fase, tocar, corrigir, aoConfirmar, ultimo]);

  const recomecar = useCallback(() => {
    setEtapa(0);
    setDigitos("");
    setFase("digitando");
  }, []);

  const branco = useCallback(() => {
    if (fase === "confirmado") return;
    setDigitos("");
    setFase("branco");
    tocar("corrige");
  }, [fase, tocar]);

  // Teclado físico: quem está no computador digita, não clica. Sem isto a
  // urna parece travada para metade de quem abre no desktop.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) digitar(e.key);
      else if (e.key === "Enter") confirmar();
      else if (e.key === "Backspace" || e.key === "Delete") corrigir();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [digitar, confirmar, corrigir]);

  const certo = digitos === atual.numero;

  return (
    <div className="mx-auto w-full max-w-[860px]">
      {/* ── CELULAR PRIMEIRO ────────────────────────────────────────────
          Era `md:grid-cols-[1.35fr_1fr]` com `gap-4` e `p-4`: no celular o
          display empilhava em cima do teclado e a soma passava da altura da
          tela, obrigando a rolar entre digitar e ver o resultado — que é
          exatamente o que uma urna não pode ter.

          Agora o display encolhe no celular e o teclado cabe junto. */}
      <div className="grid gap-3 rounded-[20px] border border-[#2a2b31] bg-[#1b1c21] p-3 shadow-2xl sm:gap-4 sm:p-5 md:grid-cols-[1.35fr_1fr]">
        {/* ── DISPLAY ────────────────────────────────────────────────── */}
        <div className="min-h-[186px] rounded-xl bg-[#e9edd8] p-3.5 font-mono text-[#12140f] sm:min-h-[330px] sm:p-5">
          {fase === "confirmado" ? (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 text-center sm:min-h-[300px]">
              <p className="text-[40px] font-black leading-none tracking-[0.2em] sm:text-[62px]">FIM</p>
              <p className="text-[15px] font-bold uppercase tracking-wide">
                {certo ? "Voto registrado" : "Voto registrado"}
              </p>
              {certo ? (
                <p className="max-w-[300px] text-[13px] leading-relaxed">
                  <b>1022</b> e <b>22</b>. É exatamente assim no dia 4.
                </p>
              ) : (
                <p className="max-w-[300px] text-[13px] leading-relaxed">
                  Esse número não é o certo. Toque em CORRIGE e treine de novo.
                </p>
              )}
            </div>
          ) : fase === "branco" ? (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 text-center sm:min-h-[300px]">
              <p className="text-[28px] font-black tracking-[0.15em]">BRANCO</p>
              <p className="max-w-[300px] text-[13px] leading-relaxed">
                Voto em branco não elege ninguém. Toque em <b>CORRIGE</b> e digite{" "}
                <b>{atual.numero}</b>.
              </p>
            </div>
          ) : (
            <>
              <p className="flex items-center justify-between text-[13px] font-bold uppercase tracking-[0.18em]">
                <span>{atual.cargo}</span>
                {/* Quantos cargos faltam. A urna real mostra isso, e é o que
                    impede a pessoa achar que acabou no primeiro. */}
                <span className="text-[11px] font-normal tracking-normal opacity-60">
                  {etapa + 1} de {CARGOS.length}
                </span>
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[13px] font-bold uppercase tracking-wide">Número:</span>
                {Array.from({ length: atual.digitos }, (_, i) => i).map((i) => (
                  <span
                    key={i}
                    className={`grid h-11 w-9 place-items-center border-2 text-[24px] font-black tabular-nums ${
                      digitos[i] ? "border-[#12140f] bg-white" : "border-[#9aa088]"
                    }`}
                  >
                    {digitos[i] ?? ""}
                  </span>
                ))}
              </div>

              {fase === "conferindo" && (
                <div className="mt-3 flex gap-3 sm:mt-4 sm:gap-4">
                  <div className="min-w-0 flex-1 text-[12.5px] leading-[1.6] sm:text-[13px] sm:leading-[1.7]">
                    {certo ? (
                      <>
                        <p><b>Nome:</b> {atual.nome}</p>
                        <p><b>Partido:</b> {atual.partido}</p>
                        <p className="mt-3 font-bold uppercase">Aperte a tecla:</p>
                        <p>VERDE para CONFIRMAR</p>
                        <p>LARANJA para REDIGITAR</p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold uppercase">Número não encontrado</p>
                        <p className="mt-2">
                          O número {etapa === 0 ? "da Talita é" : "do Flávio é"}{" "}
                          <b>{atual.numero}</b>.
                        </p>
                        <p className="mt-3 font-bold uppercase">Aperte a tecla:</p>
                        <p>LARANJA para REDIGITAR</p>
                      </>
                    )}
                  </div>
                  {certo && atual.temFoto && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={atual.foto}
                      alt={atual.nome}
                      width={104}
                      height={132}
                      className="h-[104px] w-[82px] shrink-0 border-2 border-[#12140f] bg-white object-cover sm:h-[132px] sm:w-[104px]"
                    />
                  )}
                </div>
              )}

              {fase === "digitando" && (
                <p className="mt-5 text-[12.5px] leading-relaxed text-[#4a4d40]">
                  Digite o número {etapa === 0 ? "da candidata a deputada federal" : "do candidato a presidente"}.
                  <br />
                  {etapa === 0 ? "O da Talita é " : "O do Flávio é "}
                  <b>{atual.numero}</b>.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── TECLADO ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2">
            {["1","2","3","4","5","6","7","8","9"].map((d) => (
              <Tecla key={d} onClick={() => digitar(d)}>{d}</Tecla>
            ))}
            <div />
            <Tecla onClick={() => digitar("0")}>0</Tecla>
            <div />
          </div>
          <div className="grid gap-2">
            <Tecla cor="branco" onClick={branco}>BRANCO</Tecla>
            <div className="grid grid-cols-2 gap-2">
              <Tecla cor="laranja" onClick={corrigir}>CORRIGE</Tecla>
              <Tecla cor="verde" onClick={confirmar}>CONFIRMA</Tecla>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2.5 hidden text-center text-[12px] text-white/45 sm:block">
        No computador dá para usar o teclado: números, <b>Enter</b> confirma,{" "}
        <b>Backspace</b> corrige.
      </p>
    </div>
  );
}

function Tecla({
  children,
  onClick,
  cor = "cinza",
}: {
  children: React.ReactNode;
  onClick: () => void;
  cor?: "cinza" | "branco" | "laranja" | "verde";
}) {
  const tons = {
    cinza: "bg-[#33343b] text-white hover:bg-[#3e3f47] active:bg-[#4a4b54]",
    branco: "bg-[#e8e8ea] text-[#26272c] hover:bg-white active:bg-[#d4d4d8]",
    laranja: "bg-[#e08a1e] text-white hover:bg-[#ef9a2e] active:bg-[#c87814]",
    verde: "bg-[#2f9e44] text-white hover:bg-[#37b24d] active:bg-[#2b8a3e]",
  }[cor];
  return (
    <button
      type="button"
      onClick={onClick}
      /* `h-14` e não padding: tecla de urna tem altura igual, e no celular o
         alvo precisa dos 44px mínimos para o dedo não errar. */
      /* `h-12` no celular e `h-14` a partir de sm: doze teclas a 56px somam
         mais que a altura util de um iPhone SE depois do display. 48px ainda
         passa folgado do minimo de 44px para o dedo. */
      className={`h-12 rounded-lg text-[14px] font-bold tracking-wide transition-colors sm:h-14 sm:text-[15px] ${tons}`}
    >
      {children}
    </button>
  );
}
