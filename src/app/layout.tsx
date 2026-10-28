import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { CANDIDATO, MARCA, estiloDaMarca } from "@/lib/candidato";

// DUAS FONTES, CADA UMA NO SEU PAPEL (identidade ManuFlow, 20/10/2026).
//
// Inter no corpo: feita para tela, legível em 12px, com dígitos de largura
// fixa para as colunas de votos alinharem. Sora nos títulos e nos números
// grandes: geométrica, dá a cara de produto que a plataforma passou a ter
// quando deixou de ser de uma campanha só. Antes era IBM Plex em tudo.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const sora = Sora({
  variable: "--fonte-titulo",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(CANDIDATO.site),
  title: "ManuFlow",
  description: "Inteligência eleitoral",
  openGraph: {
    title: "ManuFlow",
    description: "Inteligência eleitoral",
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
      className={`${inter.variable} ${sora.variable} h-full antialiased`}
      style={estiloDaMarca()}
    >
      <head>
        {/* Aplica o tema guardado ANTES da primeira pintura. Sem isso a tela
            aparece no padrão e pisca para a escolha da pessoa. */}
        <script
          dangerouslySetInnerHTML={{
            // Modo escuro é o padrão; "claro" só se a pessoa escolheu.
            __html: `try{var d=document.documentElement;var m=localStorage.getItem('pie_tema_modo');d.setAttribute('data-tema',m==='claro'?'claro':'escuro');var c=localStorage.getItem('pie_tema_cor');if(c)d.style.setProperty('--tema',c)}catch(e){document.documentElement.setAttribute('data-tema','escuro')}`,
          }}
        />
      </head>
      <body suppressHydrationWarning className="flex min-h-full flex-col bg-background font-sans">
        {children}
      </body>
    </html>
  );
}
