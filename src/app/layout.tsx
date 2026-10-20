import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { CANDIDATO, MARCA, estiloDaMarca } from "@/lib/candidato";

// UMA FONTE SÓ.
//
// Antes eram três: Poppins no corpo, Bebas Neue como display e Playfair
// Display em itálico. Bebas nunca chegou a ser usada em lugar nenhum, e
// Playfair aparecia numa assinatura só, na barra lateral.
//
// Poppins é geométrica arredondada — a fonte de material de divulgação, e é
// justamente isso que ela dizia numa ferramenta de trabalho. IBM Plex Sans foi
// desenhada para painel e leitura longa: humanista, dígitos de largura fixa de
// origem, e não chama atenção para si. Numa tela que a atendente encara oito
// horas, a fonte que some é a certa.
const plex = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(CANDIDATO.site),
  title: `${CANDIDATO.nome} · ${CANDIDATO.uf}`,
  description: "Plataforma de Inteligência",
  openGraph: {
    title: `${CANDIDATO.nome} · ${CANDIDATO.uf}`,
    description: `Plataforma de Inteligência · ${CANDIDATO.uf}`,
    images: [MARCA.capa],
    type: "website",
  },
  // ── O TRADUTOR DO CHROME NÃO ENTRA ─────────────────────────────────────────
  //
  // Em 15/09 a central apareceu como "Central de ouro", "Acompanhante",
  // "Material da temporada" e um "Ts" no lugar do nome. O código estava certo:
  // alguém aceitou a tradução automática uma vez, e o Chrome passou a "traduzir"
  // português para português em toda visita — o `lang="pt-BR"` sozinho não
  // impede quem já disse "sempre traduzir".
  //
  // A plataforma é interna e só em português. Tradução aqui não ajuda ninguém e
  // estraga a leitura de rótulo, que é justamente o que a equipe usa para saber
  // onde clicar. `notranslate` na meta e `translate="no"` no <html> são as duas
  // formas que o Google Tradutor respeita; vão as duas.
  other: { google: "notranslate" },
};

// Cor das barras do navegador no celular (topo/rodapé) = navy da marca,
// pra não ficar aquela faixa branca nas safe areas.
export const viewport: Viewport = {
  // A cor das barras do navegador no celular. Segue a marca da instalação: com
  // a paleta trocada e esta fixa, o topo do celular continuaria na cor do outro
  // candidato.
  themeColor: process.env.NEXT_PUBLIC_COR_BARRA_NAVEGADOR?.trim() || "#0a1430",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      translate="no"
      suppressHydrationWarning
      className={`${plex.variable} h-full antialiased`}
      style={estiloDaMarca()}
    >
      <head>
        {/* Aplica o tema guardado ANTES da primeira pintura. Sem isso a tela
            aparece no padrão e pisca para a escolha da pessoa. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var c=localStorage.getItem('pie_tema_cor');var b=localStorage.getItem('pie_tema_barra');if(c&&c!=='#4C8DF6')document.documentElement.style.setProperty('--tema',c);if(b==='escuro'||b==='claro')document.documentElement.setAttribute('data-barra',b)}catch(e){}`,
          }}
        />
      </head>
      <body suppressHydrationWarning className="flex min-h-full flex-col bg-barra font-sans">
        {children}
      </body>
    </html>
  );
}
