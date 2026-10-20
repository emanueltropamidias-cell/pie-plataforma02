import type { Metadata } from "next";
import { INSTITUTO, enderecoCompleto } from "./dados";
import { Formulario } from "./formulario";

// Página pública do Instituto. Serve a dois propósitos ao mesmo tempo:
// captar quem quer participar e servir de site oficial na verificação do
// negócio na Meta — que exige razão social, CNPJ, endereço e telefone
// visíveis e idênticos aos documentos enviados.

export const metadata: Metadata = {
  title: `${INSTITUTO.nomeFantasia} · Bahia`,
  description:
    "Instituto social dedicado a formar, acolher e fortalecer mulheres e famílias na Bahia.",
};

const ACOES = [
  {
    titulo: "Formação e capacitação",
    texto:
      "Cursos, oficinas e rodas de conversa que preparam mulheres para o mercado de trabalho e para o empreendedorismo.",
  },
  {
    titulo: "Acolhimento",
    texto:
      "Escuta qualificada e encaminhamento para a rede de apoio: assistência social, saúde e orientação jurídica.",
  },
  {
    titulo: "Ação comunitária",
    texto:
      "Mutirões, campanhas e projetos nos bairros, feitos junto com lideranças locais que conhecem a realidade de cada território.",
  },
];

export default function InstitutoPage() {
  return (
    <main className="min-h-dvh bg-white text-zinc-900">
      {/* Cabeçalho */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="text-[15px] font-extrabold tracking-tight">{INSTITUTO.nomeFantasia}</span>
        <nav className="flex items-center gap-5 text-[13px] font-medium text-zinc-500">
          <a href="#sobre" className="hover:text-zinc-900">
            Sobre o Instituto
          </a>
          <a href="#participar" className="hover:text-zinc-900">
            Participar
          </a>
        </nav>
      </header>

      {/* Chamada + formulário */}
      <section id="participar" className="border-b border-zinc-100 bg-zinc-50/60">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:py-20">
          <div className="flex flex-col justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              Bahia
            </span>
            <h1 className="mt-2 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Transformar realidades
              <br />
              começa com gente perto.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-zinc-600">
              O {INSTITUTO.nomeFantasia} atua na formação, no acolhimento e na ação comunitária,
              ao lado de quem já faz a diferença no próprio bairro.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-[15px] font-bold">Faça parte</p>
            <p className="mb-4 mt-1 text-[13px] text-zinc-500">
              Deixe seus dados e a nossa equipe entra em contato.
            </p>
            <Formulario />
          </div>
        </div>
      </section>

      {/* Sobre o Instituto */}
      <section id="sobre" className="mx-auto max-w-5xl px-5 py-14 sm:px-8 lg:py-20">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Sobre o Instituto</h2>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-zinc-600">
          O {INSTITUTO.nomeFantasia} é uma organização sem fins lucrativos sediada na Bahia,
          dedicada a promover dignidade, autonomia e oportunidade para mulheres e famílias em
          situação de vulnerabilidade. Trabalhamos em rede com lideranças comunitárias,
          voluntários e parceiros institucionais, levando formação e acolhimento a quem mais
          precisa.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {ACOES.map((a) => (
            <div key={a.titulo} className="rounded-2xl border border-zinc-200 p-6">
              <h3 className="text-[15px] font-bold">{a.titulo}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-600">{a.texto}</p>
            </div>
          ))}
        </div>

        {/* Bloco institucional: é o que a Meta procura na verificação */}
        <div className="mt-12 rounded-2xl bg-zinc-50 p-6 sm:p-8">
          <h3 className="text-[13px] font-semibold uppercase tracking-widest text-zinc-400">
            Dados institucionais
          </h3>
          <dl className="mt-4 grid gap-x-10 gap-y-3 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Razão social</dt>
              <dd className="font-medium">{INSTITUTO.razaoSocial}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">CNPJ</dt>
              <dd className="font-medium">{INSTITUTO.cnpj}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Endereço</dt>
              <dd className="font-medium">{enderecoCompleto()}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Telefone</dt>
              <dd className="font-medium">{INSTITUTO.telefone}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">E-mail</dt>
              <dd className="font-medium">{INSTITUTO.email}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Rodapé — a Meta prefere encontrar os dados aqui */}
      <footer className="border-t border-zinc-100 bg-white">
        <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
          <p className="text-[15px] font-extrabold">{INSTITUTO.nomeFantasia}</p>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-zinc-500">
            {INSTITUTO.razaoSocial} · CNPJ {INSTITUTO.cnpj}
            <br />
            {enderecoCompleto()}
            <br />
            Telefone {INSTITUTO.telefone} · {INSTITUTO.email}
          </p>

          <p className="mt-6 max-w-3xl text-[12px] leading-relaxed text-zinc-400">
            Os dados informados neste site são usados exclusivamente para contato sobre as ações do
            instituto, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Não
            compartilhamos informações com terceiros para fins comerciais. Para solicitar exclusão
            dos seus dados, escreva para {INSTITUTO.email}.
          </p>

          <p className="mt-6 text-[12px] text-zinc-400">
            © {new Date().getFullYear()} {INSTITUTO.nomeFantasia}. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </main>
  );
}
