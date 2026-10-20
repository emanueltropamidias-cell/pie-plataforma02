import type { Metadata } from "next";
import { Pixel } from "@/components/meta/pixel";

// O `metadata` mora aqui porque a página virou client component quando ganhou
// o estado do voto — e componente de cliente não exporta metadata. O layout
// continua sendo servidor, então o compartilhamento no WhatsApp e no Facebook
// segue com título e imagem certos.
export const metadata: Metadata = {
  title: "Patriotas da Bahia · Talita 1022 e Flávio 22",
  description:
    "Se você é patriota, treine seu voto para 4 de outubro: Talita Oliveira 1022 e Flávio Bolsonaro 22.",
  openGraph: {
    title: "Se você é patriota, treine para 4 de outubro",
    description: "Talita Oliveira 1022 · Flávio Bolsonaro 22",
    images: ["/fundo-1.jpg"],
  },
};

// O Pixel entra no LAYOUT, e não na página.
//
// A página é client component e remonta a cada mudança de estado do voto; o
// layout monta uma vez. Script de rastreamento que remonta é script que pode
// contar a mesma visita duas vezes — e o número inflado é pior que número
// nenhum, porque ninguém desconfia dele.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Pixel />
      {children}
    </>
  );
}
