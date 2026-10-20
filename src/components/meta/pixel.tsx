"use client";

import Script from "next/script";
import { useEffect } from "react";

import { CANDIDATO } from "@/lib/candidato";

// O Pixel da Meta.
//
// ── PARA QUE ELE SERVE AQUI, E NÃO É "MEDIR" ────────────────────────────────
//
// Medir é o efeito colateral. O que o pixel faz de útil numa campanha é
// ENSINAR O ANÚNCIO: quando ele avisa a Meta "esta pessoa entrou no grupo", o
// sistema passa a procurar gente parecida com ela. Sem isso, o anúncio otimiza
// por clique — e clique barato é gente que sai da página em dois segundos.
//
// Por isso o evento que importa não é o PageView: é o clique no grupo.
//
// ── OS TRÊS EVENTOS, E O QUE CADA UM SIGNIFICA ──────────────────────────────
//
//   PageView    chegou na página. Serve de base, não de meta.
//   VotoTreinado  terminou a urna, os dois cargos. É o sinal de INTENÇÃO:
//                 quem treina o voto inteiro não estava de passagem.
//   Lead        clicou para entrar no grupo. É o evento de conversão, o que
//               a campanha deve pedir à Meta para otimizar.
//
// `VotoTreinado` é evento personalizado (trackCustom) porque não existe
// equivalente no catálogo da Meta. `Lead` é padrão de propósito: evento padrão
// entra na otimização automática, personalizado precisa ser configurado à mão
// no Gerenciador — e o que precisa de configuração manual é o que fica sem.
//
// ── SEM ID, NADA CARREGA ────────────────────────────────────────────────────
//
// O ID vem de `CANDIDATO.pixelMeta`, junto com o resto da identidade da
// instalação, e pode ser desligado: em branco, o componente não renderiza
// nada. Não é detalhe de robustez — script de rastreamento com ID vazio manda
// evento para lugar nenhum e ainda cobra o tempo de rede de quem abriu a
// página. E instalação de outro candidato não pode treinar os anúncios da
// Talita com o tráfego pago dele.

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    _fbq?: unknown;
  }
}

const ID = CANDIDATO.pixelMeta;

/** Dispara um evento. Silencioso quando o pixel não está instalado. */
export function evento(nome: string, padrao = true) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq(padrao ? "track" : "trackCustom", nome);
}

export function Pixel() {
  useEffect(() => {
    if (!ID || typeof window === "undefined") return;
    // O PageView do primeiro carregamento sai no próprio script. Este aqui
    // cobre a navegação entre páginas, que no Next não recarrega nada.
    window.fbq?.("track", "PageView");
  }, []);

  if (!ID) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${ID}');
fbq('track', 'PageView');
        `}
      </Script>
      {/* Para quem bloqueia JavaScript. A Meta conta assim mesmo, e sem isto a
          página perde a medição de quem usa bloqueador — que não é pouca
          gente. */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
