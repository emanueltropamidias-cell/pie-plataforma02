import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { WA_NUMERO } from "@/lib/whatsapp";
import { MARCA } from "@/lib/candidato";

// Política de privacidade.
//
// Existe por duas razões, e a segunda é a que importa: a Meta exige uma URL
// pública para publicar o app, e a LGPD exige aviso porque as demandas que
// chegam pela plataforma contêm pedido de consulta, remédio e tratamento —
// dado de saúde, que é dado sensível.
//
// Escrita para ser lida por quem mandou mensagem no WhatsApp, não por advogado.
// Frase curta, sem "outrossim", e dizendo o que de fato acontece no sistema.

export const metadata: Metadata = {
  title: "Política de Privacidade · Talita Oliveira",
  description:
    "Como a plataforma da Talita Oliveira coleta, usa e protege os dados de quem entra em contato.",
};

const ATUALIZADO = "29 de setembro de 2026";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-tinta-900">{titulo}</h2>
      <div className="mt-2.5 space-y-3 text-[14px] leading-relaxed text-tinta-600">{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  const whats = `https://api.whatsapp.com/send?phone=${WA_NUMERO}&text=${encodeURIComponent(
    "Olá! Quero falar sobre os meus dados pessoais.",
  )}`;

  return (
    <main className="min-h-dvh bg-white">
      <header className="border-b border-tinta-200 px-5 py-4 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-3">
          <Image
            src={MARCA.cor}
            alt="Talita Oliveira"
            width={110}
            height={28}
            className="h-6 w-auto"
          />
        </Link>
      </header>

      <article className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-tema">
          Privacidade
        </p>
        <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-tinta-900">
          Política de Privacidade
        </h1>
        <p className="mt-2.5 text-[13px] text-tinta-500">Última atualização: {ATUALIZADO}</p>

        <p className="mt-7 text-[14px] leading-relaxed text-tinta-600">
          Esta página explica quais dados pessoais a nossa plataforma coleta, por que coleta, com
          quem compartilha e o que você pode exigir a respeito. Vale para quem fala com a gente pelo
          WhatsApp, para quem entra por um QR code ou link de indicação e para quem usa a
          plataforma como equipe ou liderança.
        </p>

        <Secao titulo="Quem é o responsável">
          <p>
            Os dados são tratados sob responsabilidade de <b>Talita Oliveira</b>, e usados
            exclusivamente na relação política e de atendimento ao cidadão descrita aqui.
          </p>
          <p>
            Canal de contato para qualquer assunto ligado aos seus dados:{" "}
            <a href={whats} className="font-semibold text-tema hover:underline">
              WhatsApp da equipe
            </a>
            .
          </p>
        </Secao>

        <Secao titulo="Quais dados coletamos">
          <p>Depende de como você chega até nós.</p>
          <p>
            <b>Se você fala conosco pelo WhatsApp:</b> o seu número de telefone, o nome que aparece
            no seu perfil do WhatsApp e o conteúdo das mensagens que você envia. Quando você escreve
            o seu município ou bairro na conversa, guardamos essa informação junto ao seu cadastro.
          </p>
          <p>
            <b>Se você entra por um QR code ou link de indicação:</b> registramos que houve um acesso
            por aquele convite e de qual liderança ele veio. Nesse momento não recebemos o seu
            telefone — ele só chega se você enviar a mensagem.
          </p>
          <p>
            <b>Se alguém da equipe cadastra você:</b> nome, telefone, município, bairro e quem
            indicou. Em alguns casos, a equipe fotografa uma lista de presença ou ficha preenchida
            para transcrever os nomes.
          </p>
          <p>
            <b>Se você registra uma demanda ou pedido:</b> o texto que você escreveu e os dados de
            contato para retornar. <b>Atenção:</b> pedidos de ajuda costumam mencionar saúde —
            consulta, exame, remédio, tratamento. Isso é dado pessoal sensível. Só chega até nós
            aquilo que você escolher contar, e usamos apenas para tentar encaminhar o seu pedido.
          </p>
          <p>
            <b>Se você tem acesso à plataforma</b> (equipe ou liderança): nome, e-mail e senha. A
            senha é guardada criptografada e ninguém da equipe consegue lê-la.
          </p>
        </Secao>

        <Secao titulo="Para que usamos">
          <p>
            Para responder você, encaminhar demandas, organizar a rede de apoio por município e
            bairro, e entender onde há mais gente disposta a participar. Também usamos os números
            agregados para decisões internas de trabalho — quantas pessoas em cada cidade, quantas
            demandas em aberto.
          </p>
          <p>
            <b>Não vendemos, alugamos nem cedemos os seus dados</b> para terceiros usarem por conta
            própria, em nenhuma hipótese.
          </p>
        </Secao>

        <Secao titulo="Com base em quê">
          <p>
            Quando você nos manda mensagem ou preenche um cadastro, há <b>consentimento</b>: você
            procurou o contato sabendo do que se trata. Para o encaminhamento de demandas e a
            organização do atendimento, atuamos com base no <b>legítimo interesse</b> de manter a
            relação que você mesmo iniciou.
          </p>
          <p>
            Você pode retirar o consentimento a qualquer momento, e isso não te prejudica em nada
            no que já foi feito.
          </p>
        </Secao>

        <Secao titulo="Quem mais tem acesso">
          <p>
            Empresas que operam a infraestrutura. Com uma exceção, marcada abaixo, elas não podem
            usar os seus dados para finalidade própria:
          </p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <b>Meta (WhatsApp)</b> — transporta as mensagens trocadas com você.
            </li>
            <li>
              <b>Meta (anúncios)</b> — recebe da página de campanha a informação de que alguém a
              visitou, treinou o voto ou clicou para entrar no grupo, para medirmos os anúncios.
              Aqui ela usa o dado também para finalidade própria, diferente dos demais desta lista.
              O que é enviado, e como recusar, está em{" "}
              <a href="#cookies" className="font-bold text-marca-azul underline">
                Cookies e armazenamento no navegador
              </a>
              .
            </li>
            <li>
              <b>Supabase</b> — banco de dados onde os cadastros ficam guardados, em servidores no
              Brasil (São Paulo).
            </li>
            <li>
              <b>Vercel</b> — hospedagem da plataforma.
            </li>
            <li>
              <b>Anthropic</b> — inteligência artificial usada para transcrever fotos de listas e
              organizar textos. As imagens enviadas para essa transcrição <b>não são armazenadas</b>{" "}
              por nós nem pela Anthropic depois do processamento.
            </li>
          </ul>
          <p>
            Também podemos fornecer dados quando houver ordem judicial ou obrigação legal — nesse
            caso, não temos escolha.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo guardamos">
          <p>
            Enquanto durar a relação e pelo período em que houver interesse legítimo ou obrigação
            legal de manter o registro. Se você pedir a exclusão, apagamos o seu cadastro, salvo o
            mínimo que a lei nos obrigue a preservar.
          </p>
        </Secao>

        <Secao titulo="Os seus direitos">
          <p>A LGPD te garante, e nós cumprimos:</p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>saber se temos dados seus e quais são;</li>
            <li>corrigir o que estiver errado ou incompleto;</li>
            <li>pedir a exclusão dos seus dados;</li>
            <li>saber com quem compartilhamos;</li>
            <li>retirar o consentimento e deixar de receber contato nosso.</li>
          </ul>
          <p>
            Para exercer qualquer um deles, é só{" "}
            <a href={whats} className="font-semibold text-tema hover:underline">
              falar com a gente no WhatsApp
            </a>
            . Respondemos em até 15 dias.
          </p>
          <p>
            Se quiser apenas parar de receber mensagens, escreva <b>SAIR</b> na conversa. A gente
            marca o seu cadastro e não te procura mais.
          </p>
        </Secao>

        <Secao titulo="Segurança">
          <p>
            O acesso à plataforma exige conta e senha, e cada conta nova precisa ser liberada por um
            administrador antes do primeiro acesso. As lideranças enxergam apenas a própria rede.
            Nenhum sistema é infalível — se acontecer um incidente que te coloque em risco, nós
            avisamos você e a autoridade competente.
          </p>
        </Secao>

        <Secao titulo="Cookies e armazenamento no navegador">
          <p>
            Na plataforma de atendimento, guardamos no seu navegador apenas o necessário para o
            funcionamento: a sua sessão, quando você tem acesso, e uma marca que evita contar duas
            vezes o mesmo clique num QR code. Aí não há publicidade nem rastreamento de terceiros.
          </p>
          <p>
            <b>Na página de campanha há, e é bom que você saiba exatamente o quê.</b> A página onde
            você treina o voto na urna (<span className="whitespace-nowrap">/1022</span>) carrega o
            Pixel da Meta — a mesma empresa do Facebook, do Instagram e do WhatsApp. Ele registra
            que alguém abriu a página, que terminou de treinar o voto e que clicou para entrar no
            grupo, e envia isso à Meta junto com o seu endereço de internet e o tipo de aparelho.
          </p>
          <p>
            Serve para medir se os nossos anúncios estão alcançando quem se interessa de verdade, e
            para não continuarmos pagando para mostrar o anúncio a quem já entrou no grupo.{" "}
            <b>Não enviamos o seu nome, o seu telefone nem nada que você tenha escrito para a
            gente.</b>{" "}
            A página é aberta: não é preciso se identificar para treinar o voto.
          </p>
          <p>
            Para não ser acompanhado, você pode bloquear cookies de terceiros no seu navegador, usar
            uma janela anônima, ou ajustar o que a Meta usa para escolher anúncios em{" "}
            <a
              href="https://accountscenter.meta.com/ads"
              target="_blank"
              rel="noopener"
              className="font-bold text-marca-azul underline"
            >
              accountscenter.meta.com/ads
            </a>
            . A página funciona igual — o treino da urna não depende disso.
          </p>
        </Secao>

        <Secao titulo="Mudanças nesta política">
          <p>
            Se algo mudar de forma relevante, atualizamos esta página e a data no topo. Vale sempre
            a versão publicada aqui.
          </p>
        </Secao>

        <div className="mt-12 rounded-xl border border-tinta-200 bg-tinta-50 px-5 py-4">
          <p className="text-[13.5px] font-bold text-tinta-900">Ficou com dúvida?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-tinta-600">
            Fale com a gente no WhatsApp. Pergunta sobre dado pessoal não é incômodo — é direito
            seu.
          </p>
          <a
            href={whats}
            className="mt-3 inline-flex items-center rounded-lg bg-tema px-4 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Falar no WhatsApp
          </a>
        </div>
      </article>
    </main>
  );
}
