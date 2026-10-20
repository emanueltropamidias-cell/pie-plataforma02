"use client";

import { useState } from "react";
import { Anton } from "next/font/google";
import Image from "next/image";
import { Urna } from "@/components/urna/urna";
import { Compartilhar } from "@/components/urna/compartilhar";
import { ChamadaGrupo } from "@/components/urna/chamada-grupo";
import { evento } from "@/components/meta/pixel";
import { contarCliqueNoGrupo } from "@/components/urna/contar-clique";

// ── POR QUE ESTA PÁGINA FOI REFEITA ─────────────────────────────────────────
//
// 29/09, Emanuel: "o site está horrível, está a cara da IA".
//
// Ele tinha razão, e o diagnóstico é preciso. A versão anterior era o pacote
// que qualquer gerador entrega: fundo escuro liso, tudo centralizado, fotos
// pequenas em cartões `rounded-xl`, números em grade de quatro. Nada ali
// parecia campanha — parecia painel.
//
// Cartaz de campanha é outra coisa, e tem regras próprias:
//
//   1. A FOTO É O FUNDO, e ocupa a tela. Foto em cartão é catálogo; foto
//      atrás do texto é cartaz.
//   2. TIPOGRAFIA CONDENSADA E PESADA. Anton é a face de cartaz político
//      brasileiro — ela sozinha desfaz a cara de template, mais que
//      qualquer cor.
//   3. NADA CENTRALIZADO. Cartaz alinha à esquerda e deixa o texto bater na
//      margem. Centralizado é slide.
//   4. O NÚMERO ENORME. Em campanha o número é o produto; ele não pode
//      caber numa linha de texto.

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-cartaz" });

// Os fatos saem de site-talita/dados.py, já validados pela equipe. "+300
// proposições" e "414 de 417 municípios" continuam de fora: estão marcados
// como AGUARDANDO VALIDAÇÃO lá, e número errado em campanha vira material de
// adversário.
const NUMEROS = [
  { n: "33.455", t: "votos em 2022" },
  { n: "2019—2023", t: "mandato completo" },
  { n: "149 mil", t: "no Instagram" },
];

// ── A FAIXA DE MOMENTOS ─────────────────────────────────────────────────────
//
// Saíram quatro que estavam aqui. O OCR da Apple leu o que havia DENTRO delas:
//
//   ig-3  "QUEM AÍ JÁ DECOROU O NÚMERO DA NOSSA DEPUTADA?"
//   ig-4  "TALITA 1022"
//   ig-5  "E O ROSTO VIRA GENTE"
//   ig-6  "VIRA ROSTO... 22"
//
// São ARTES DE INSTAGRAM, não fotos: já vêm com texto gravado, moldura e
// chamada. Numa página que já tem tipografia própria isso vira texto sobre
// texto, e é o que faz um site parecer feito às pressas.
//
// Ficaram as três sem texto nenhum. Três fotos verdadeiras valem mais que
// sete, das quais quatro são post reaproveitado.
const MOMENTOS = ["/momento-wa1.jpg", "/momento-wa2.jpg", "/momento-wa4.jpg"];

// O endereço do grupo CHEGA DE FORA, do `page.tsx`, que o lê do banco.
// Escrito aqui dentro ele ia quebrar sozinho: grupo de WhatsApp trava em 1.024
// pessoas, e o link do grupo cheio para de aceitar entrada sem avisar quem
// clicou. Ver a migração 0051.
export function Pagina1022({ grupo: GRUPO }: { grupo: string }) {
  // A chamada do grupo só existe depois do voto. Ver ChamadaGrupo.
  const [votou, setVotou] = useState(false);

  return (
    <div className={`${anton.variable} bg-[#0a0d0b] text-white`}>
      {/* ── CARTAZ ──────────────────────────────────────────────────────
          Foto de tela inteira com a tipografia por cima, alinhada à esquerda
          e colada na base. O degradê não é enfeite: sem ele o texto branco
          some em qualquer foto clara, e foto de campanha é clara. */}
      <section className="relative flex min-h-[86vh] flex-col justify-end overflow-hidden">
        <Image
          src="/fundo-1.jpg"
          alt="Talita Oliveira com Jair Bolsonaro"
          fill
          priority
          sizes="100vw"
          /* O enquadramento puxa para o alto: o texto do cartaz ocupa a base da
             tela, e rosto no meio da foto fica coberto por ele. */
          className="object-cover object-[center_16%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d0b] via-[#0a0d0b]/70 to-[#0a0d0b]/10" />
        {/* A faixa da bandeira na base do bloco, fina. Um traço diz de que
            lado a página está sem precisar de bandeira desenhada. */}
        <div className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-[#009C3B] via-[#FFDF00] to-[#009C3B]" />

        <div className="relative px-5 pb-9 sm:px-8 sm:pb-12">
          {/* ── A PROVOCAÇÃO VEM PRIMEIRO ──────────────────────────────
              29/09: "se você é patriota treine para o dia 4 de outubro".

              A frase abre com uma CONDIÇÃO, e é isso que a faz funcionar:
              quem se reconhece nela já entrou. Chamada que começa com o
              produto ("treine seu voto") pede permissão; esta afirma de
              que lado está e convida quem é do mesmo. */}
          <p className="cartaz text-[26px] uppercase leading-[0.95] tracking-tight sm:text-[40px]">
            Se você é patriota,
            <br />
            <span className="text-[#FFDF00]">treine para 4 de outubro.</span>
          </p>

          {/* Os dois números lado a lado, com o mesmo peso. Em dobradinha o
              eleitor decora os dois JUNTOS ou esquece um — separá-los em
              blocos diferentes é o que faz o de baixo sumir. */}
          {/* Sem régua horizontal aqui. Ela era enfeite: sobre foto, uma
              linha atravessada no meio da tela parece defeito, e não separava
              nada que o espaço já não separasse. */}
          <div className="mt-7 flex flex-wrap items-end gap-x-8 gap-y-5">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/65">
                Deputada Federal
              </p>
              <p className="cartaz mt-0.5 text-[56px] leading-[0.82] tracking-tighter text-[#FFDF00] sm:text-[80px]">
                1022
              </p>
              <p className="cartaz text-[19px] uppercase leading-none tracking-tight sm:text-[24px]">
                Talita Oliveira
              </p>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/65">
                Presidente
              </p>
              <p className="cartaz mt-0.5 text-[56px] leading-[0.82] tracking-tighter text-[#FFDF00] sm:text-[80px]">
                22
              </p>
              <p className="cartaz text-[19px] uppercase leading-none tracking-tight sm:text-[24px]">
                Flávio Bolsonaro
              </p>
            </div>
          </div>

          <p className="mt-5 max-w-[400px] text-[15px] leading-snug text-white/80 sm:text-[16.5px]">
            Treine os dois na urna abaixo. <b className="text-white">Leva dez segundos</b> — e
            no dia sua mão já sabe o caminho.
          </p>
        </div>
      </section>

      {/* ── A URNA ──────────────────────────────────────────────────────
          Bloco sólido, sem foto atrás. A urna é ferramenta: precisa de
          contraste para ser usada, e foto embaixo de teclado é ruído. */}
      <section className="bg-[#0a0d0b] px-3 py-9 sm:px-5 sm:py-12">
        <p className="mx-auto mb-5 max-w-[860px] cartaz text-[26px] uppercase leading-none tracking-tight sm:text-[38px]">
          Treine agora. <span className="text-[#FFDF00]">É 1022.</span>
        </p>
        <Urna
          aoConfirmar={() => {
            setVotou(true);
            // Terminou a urna inteira, os dois cargos. Evento personalizado
            // porque o catálogo da Meta não tem nada parecido — e é o sinal
            // de intenção da página: quem treina o voto não estava passando.
            evento("VotoTreinado", false);
          }}
        />
      </section>

      {/* ── A FRASE, SOBRE FOTO ─────────────────────────────────────────
          O fato mais forte que a equipe validou, em tamanho de cartaz e
          sobre imagem. Numa grade com os outros números ele virava mais um
          e perdia o peso. */}
      <section className="relative overflow-hidden">
        <Image
          src="/fundo-2.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-[center_14%]"
        />
        <div className="absolute inset-0 bg-[#04180d]/82" />
        <div className="relative px-5 py-12 sm:px-8 sm:py-16">
          <p className="cartaz text-[30px] uppercase leading-[0.95] tracking-tight sm:text-[46px]">
            A primeira mulher
            <br />
            de direita eleita
            <br />
            <span className="text-[#FFDF00]">deputada na Bahia.</span>
          </p>
          <p className="mt-4 max-w-[420px] text-[15px] leading-relaxed text-white/75">
            Num estado onde diziam que não dava. Ela fez — e cumpriu o mandato
            inteiro.
          </p>

          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
            {NUMEROS.map((x) => (
              <div key={x.n}>
                <p className="cartaz text-[30px] leading-none text-[#FFDF00] sm:text-[38px]">
                  {x.n}
                </p>
                <p className="mt-1 text-[12.5px] uppercase tracking-wide text-white/60">{x.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COM O PRESIDENTE ────────────────────────────────────────────
          29/09, Emanuel: "aqui não é na rua com o povo, é com o Presidente
          Bolsonaro". Dizia "Na rua, com o povo" sobre três fotos com o
          Bolsonaro — o título entregava menos do que a foto, e era ele o
          gatilho de autoridade inteiro desta faixa.

          Fila que sangra até a borda e rola com o dedo. Grade de fotos
          quadradinhas é catálogo; fila cortada na margem é álbum de
          campanha, e diz que há mais do que cabe na tela.

          O CENTRO NO DESKTOP: a fila é desenhada para o celular, onde ela
          enche a tela. Em monitor largo três fotos ocupavam o terço
          esquerdo e deixavam um vazio que parecia defeito. `w-fit mx-auto`
          centraliza quando cabe e não faz nada quando não cabe — ao
          contrário de `justify-center`, que em contêiner rolável esconde o
          começo da fila atrás da borda, sem jeito de chegar nele. */}
      <section className="bg-[#0a0d0b] py-10 sm:py-12">
        <p className="mx-auto max-w-[1180px] px-5 cartaz text-[24px] uppercase leading-none tracking-tight sm:px-8 sm:text-[34px]">
          Com o <span className="text-[#FFDF00]">Presidente Bolsonaro</span>
        </p>
        <div className="mt-5 overflow-x-auto px-5 pb-2 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto flex w-fit snap-x snap-mandatory gap-2.5">
            {MOMENTOS.map((m, i) => (
              <Image
                key={m}
                src={m}
                alt="Talita Oliveira com o presidente Jair Bolsonaro"
                width={560}
                height={700}
                loading={i < 2 ? "eager" : "lazy"}
                className="h-[250px] w-auto shrink-0 snap-start object-cover sm:h-[330px] lg:h-[400px]"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── CONFIRMAR O APOIO ───────────────────────────────────────────
          Bloco amarelo cheio, o único da página. O objetivo inteiro do site
          termina aqui, e ele não pode parecer com o resto.

          O texto de pertencimento vem COLADO no botão: emoção não pode
          esfriar entre ler e clicar. */}
      <section className="bg-[#FFDF00] px-5 py-12 text-[#0a0d0b] sm:px-8 sm:py-14">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.22em] text-[#0a0d0b]/70">
          Você não está sozinho
        </p>
        <p className="mt-3 max-w-[520px] text-[16px] font-semibold leading-snug sm:text-[18px]">
          Todo mundo aqui já ouviu que era voto perdido. Que na Bahia não
          adiantava. Que era melhor ficar quieto.{" "}
          <span className="underline decoration-[3px] underline-offset-4">
            E mesmo assim a gente continuou.
          </span>
        </p>
        <p className="mt-6 cartaz text-[32px] uppercase leading-[0.95] tracking-tight sm:text-[48px]">
          Confirme seu apoio
        </p>
        <p className="mt-2 max-w-[460px] text-[14.5px] leading-relaxed text-[#0a0d0b]/75">
          Entre no grupo da campanha: é onde combinamos as ações, mandamos os
          materiais para você compartilhar e avisamos quando a Talita está perto
          de você.
        </p>

        <a
          href={GRUPO}
          target="_blank"
          rel="noopener"
          // O evento de CONVERSÃO da página. É por ele que a campanha pede à
          // Meta para otimizar — não pelo PageView, que só diz que o anúncio
          // foi clicado.
          onClick={() => {
            evento("Lead");
            contarCliqueNoGrupo("botao");
          }}
          className="mt-6 flex h-16 w-full max-w-[460px] items-center justify-center gap-3 bg-[#0a0d0b] cartaz text-[20px] uppercase tracking-wide text-[#FFDF00] transition-transform active:scale-[0.99] sm:text-[23px]"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 0 0-8.7 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-1-.3-1.6-.6-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.8s.7-2 .9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.5.1.3.7 1.1 1.5 1.8 1 .9 1.8 1.1 2 1.2.3.1.4.1.6-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.7-.1 1.2Z"
            />
          </svg>
          Estou com a Talita
        </a>
        <p className="mt-2.5 text-[12.5px] text-[#0a0d0b]/60">
          Abre o WhatsApp no grupo oficial. Você sai quando quiser.
        </p>
      </section>

      <Compartilhar />

      <ChamadaGrupo href={GRUPO} visivel={votou} />

      {/* Espaço para a barra fixa não cobrir o rodapé. */}
      {votou && <div className="h-[96px]" aria-hidden />}

      <footer className="border-t border-white/10 px-5 pb-10 pt-7 text-[11.5px] leading-relaxed text-white/40 sm:px-8">
        <p className="cartaz text-[17px] uppercase tracking-wide text-white/75">
          Talita Oliveira · <span className="text-[#FFDF00]">1022</span> · Deputada Federal
        </p>
        <p className="mt-2 max-w-[520px]">
          A urna desta página é uma simulação para treino. A oficial fica na sua
          seção eleitoral, no dia 4 de outubro de 2026.
        </p>
      </footer>
    </div>
  );
}
