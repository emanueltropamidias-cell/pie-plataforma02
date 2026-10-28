"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  ChevronLeft,
  Compass,
  LayoutDashboard,
  UserPlus,
  MessageSquare,
  Menu,
  Settings,
  Shield,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { SeletorTema } from "@/components/seletor-tema";
import { LogoManuFlow } from "@/components/marca/logo-manuflow";
import { contaVe, moduloDoCaminho } from "@/lib/modulos";

// Cada item tem ícone porque menu se varre, não se lê: o símbolo é reconhecido
// antes da palavra, e é ele que sustenta o menu recolhido.
// `abrange` são as telas que pertencem à área mas moram numa rota de raiz
// própria — /leads, /trafego e companhia. Sem essa lista o menu ficaria apagado
// justamente nas telas onde a pessoa mais passa tempo, e não haveria nada
// dizendo de onde ela veio nem para onde volta.
type Item = {
  href: string;
  label: string;
  icone: LucideIcon;
  abrange?: string[];
  pesado?: boolean;
};

// Um item de menu por ÁREA, não por tela.
//
// O menu tinha onze entradas e ganhava mais uma a cada funcionalidade — e menu
// que cresce por funcionalidade deixa de ser navegação e vira lista de
// arquivos. Agora são cinco: cada uma abre a central da sua área, e é lá que
// ficam os atalhos, agrupados por intenção e com o estado à vista.
//
// Nada sumiu. Caixa de entrada, Placar, Tráfego e o resto continuam nas mesmas
// telas — só deixaram de disputar a mesma coluna.
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "Principal",
    itens: [
      // ── POR SETOR, E NÃO POR TIPO DE TELA ──────────────────────────────────
      //
      // Até 15/09 eram Atendimento, Rede e Análise — e o Tráfego, que é de onde
      // vêm os leads que a caixa recebe, morava em Análise, ao lado das
      // demandas de saúde. O Emanuel pediu a divisão por setor: cada tela onde
      // o trabalho dela acontece.
      //
      //   Atendimento   do anúncio à conversa
      //   Base          as pessoas
      //   Estratégia    território, eleição e o cadastro de lideranças
      //   Gabinete      demandas e o arquivo do que veio antes
      { href: "/dashboard", label: "Dashboard", icone: LayoutDashboard },
      {
        href: "/atendimento",
        label: "Atendimento",
        icone: MessageSquare,
        abrange: ["/trafego"],
      },
      {
        href: "/base",
        label: "Base",
        icone: UsersRound,
        abrange: ["/rede", "/leads", "/mapa", "/municipios"],
      },
      { href: "/estrategia", label: "Estratégia", icone: Compass },
      // Saiu do topo da Estratégia em 20/10/2026: lá ficou só o painel
      // eleitoral, e os atalhos de liderança, metas e dobradinha vieram para cá.
      {
        href: "/liderancas",
        label: "Lideranças",
        icone: Shield,
        abrange: ["/crm", "/ranking", "/metas", "/dobradinha"],
      },
      {
        href: "/gabinete",
        label: "Gabinete",
        icone: Briefcase,
        abrange: ["/demandas", "/conversas"],
      },
    ],
  },
  {
    titulo: "Sistema",
    itens: [{ href: "/config", label: "Configurações", icone: Settings }],
  },
];

// O cargo embaixo do nome dizia "Administrador" para todo mundo. Com supervisor
// no time isso deixou de ser detalhe: é a linha que diz até onde a conta vai.
const CARGO: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisão",
  atendente: "Atendimento",
};

const CHAVE_RECOLHIDO = "pie_menu_recolhido";

function iniciais(texto: string) {
  const partes = (texto || "")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function Conteudo({
  pathname,
  nome,
  userEmail,
  papel,
  modulos,
  recolhido,
  onNav,
  onRecolher,
}: {
  pathname: string;
  nome: string;
  userEmail?: string;
  papel?: string;
  modulos?: string[] | null;
  recolhido: boolean;
  onNav?: () => void;
  onRecolher?: () => void;
}) {
  const router = useRouter();
  // Qual item foi clicado. Serve para o destaque mudar no clique, e não quando
  // o servidor responde: quem clica precisa ver que o clique valeu.
  const [indo, setIndo] = useState<string | null>(null);

  // O supervisor só tem uma área. Mostrar Rede e Análise para quem a RLS vai
  // negar não é transparência — é oferecer uma porta trancada.
  const soAtendimento = papel === "supervisor";

  // ── A ATENDENTE GANHOU MENU, COM DUAS PORTAS ──────────────────────────────
  //
  // Antes ela não tinha nenhum, e a razão era boa: ela não escolhe para onde
  // ir, ela atende. Uma porta só dispensa menu.
  //
  // Passaram a ser duas — os chips caem, então o atendimento é pelo WhatsApp no
  // aparelho e o cadastro é aqui. Com duas portas e nenhum menu, a segunda só
  // existe para quem souber o endereço de cor.
  //
  // O menu é DELA e não o da equipe: Dashboard, Rede, Análise e Configurações
  // ficam de fora. Não é só arrumação — é a base de 29 mil, e a regra da
  // campanha é que ela fica em off. A RLS já nega (`perfil_equipe()` é falso
  // para atendente), mas negar o dado e mostrar o caminho é o pior dos dois
  // mundos: ela clica, vê tela vazia, e não sabe se quebrou ou se é proibido.
  const ehAtendente = papel === "atendente";

  const visiveis = ehAtendente
    ? [
        {
          titulo: "Atendimento",
          itens: [
            { href: "/atendimento/caixa", label: "Fila", icone: MessageSquare },
            { href: "/atendimento/cadastro", label: "Cadastrar pessoa", icone: UserPlus },
          ] as Item[],
        },
      ]
    : soAtendimento
      ? [
          {
            titulo: "Principal",
            itens: GRUPOS[0].itens.filter((i) => i.href === "/atendimento"),
          },
        ]
      // Sem as áreas que esta instalação não usa e sem as abas que esta conta
      // não tem (src/lib/modulos.ts, profiles.modulos).
      : GRUPOS.map((g) => ({
          ...g,
          itens: g.itens.filter((i) => {
            const m = moduloDoCaminho(i.href);
            return m === null || contaVe(m, { role: papel, modulos });
          }),
        })).filter((g) => g.itens.length > 0);

  useEffect(() => {
    setIndo(null);
  }, [pathname]);

  return (
    <>
      <div
        className={`flex items-center gap-2 ${recolhido ? "justify-center" : "justify-between"}`}
      >
        {/* A marca do PRODUTO (pino + ManuFlow). A da campanha fica no login e
            nas páginas públicas — ver src/components/marca/logo-manuflow.tsx. */}
        <LogoManuFlow tamanho={recolhido ? 34 : 32} semNome={recolhido} className="text-barra-texto" />
        {onRecolher && (
          <button
            type="button"
            onClick={onRecolher}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-barra-fraca transition-colors hover:bg-barra-hover hover:text-barra-texto md:flex"
          >
            <ChevronLeft
              size={16}
              className={`transition-transform ${recolhido ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Era uma assinatura em Playfair itálico, a única serifada da plataforma
          inteira e a única razão para carregar aquela fonte. Vira uma linha de
          apoio: diz a mesma coisa e não pede holofote na barra de trabalho. */}
      {!recolhido && (
        <p className="mt-2 text-[11px] tracking-[0.01em] text-barra-fraca">
          Inteligência eleitoral
        </p>
      )}

      {/* Quem está usando, no alto. Em ferramenta compartilhada, saber com qual
          conta se está evita registrar demanda em nome de outra pessoa. */}
      <div
        className={`mt-5 flex items-center gap-2.5 rounded-lg border border-barra-traco bg-barra-hover ${
          recolhido ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-tema text-[11.5px] font-bold text-white">
          {iniciais(nome)}
        </span>
        {!recolhido && (
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-barra-texto">
              {nome}
            </span>
            <span className="block truncate text-[10.5px] text-barra-fraca">
              {CARGO[papel ?? ""] ?? "Equipe"}
            </span>
          </span>
        )}
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-5 overflow-y-auto">
        {visiveis.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-0.5">
            {!recolhido && (
              <span className="mb-1 px-2 text-[9.5px] font-bold uppercase tracking-[0.16em] text-barra-fraca">
                {grupo.titulo}
              </span>
            )}
            {grupo.itens.map((item) => {
              // Prefixo, e não igualdade: quem está na caixa de entrada continua
              // dentro de Atendimento, e o menu precisa dizer isso. A barra no
              // fim evita que /rede acenda estando em /redefinir-senha.
              const dentro = (base: string) =>
                pathname === base || pathname.startsWith(`${base}/`);
              const ativo =
                dentro(item.href) || (item.abrange ?? []).some(dentro);
              const indoPara = indo === item.href;
              const Icone = item.icone;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={recolhido ? item.label : undefined}
                  // Busca a página inteira antes do clique, não só o esqueleto.
                  // O padrão do Next traz apenas o esqueleto em tela que depende
                  // de sessão — que é justamente o branco que aparecia antes.
                  prefetch={item.pesado ? undefined : true}
                  // E de novo ao passar o mouse: aí o conteúdo já chegou quando
                  // o dedo desce, e a tela troca sem espera.
                  onMouseEnter={() => router.prefetch(item.href)}
                  onFocus={() => router.prefetch(item.href)}
                  onTouchStart={() => router.prefetch(item.href)}
                  onClick={() => {
                    setIndo(item.href);
                    onNav?.();
                  }}
                  className={`flex items-center gap-2.5 rounded-lg py-2 text-[13px] transition-colors ${
                    recolhido ? "justify-center px-0" : "px-2.5"
                  } ${
                    ativo || indoPara
                      ? "bg-barra-ativo font-semibold text-barra-texto"
                      : "font-medium text-barra-suave hover:bg-barra-hover hover:text-barra-texto"
                  }`}
                >
                  <Icone
                    size={16}
                    className="shrink-0"
                    strokeWidth={ativo || indoPara ? 2.4 : 1.9}
                  />
                  {!recolhido && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-barra-traco pt-3">
        <SeletorTema recolhido={recolhido} />
        <div className="mt-2">
          {!recolhido && userEmail && (
            <p className="mb-1.5 truncate px-2 text-[10.5px] text-barra-fraca">
              {userEmail}
            </p>
          )}
          <LogoutButton />
        </div>
      </div>
    </>
  );
}

export function AppSidebar({
  userEmail,
  papel,
  modulos,
}: {
  userEmail?: string;
  papel?: string;
  modulos?: string[] | null;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const nome = (userEmail || "").split("@")[0];

  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === "1");
    } catch {
      /* sem armazenamento: começa expandido */
    }
  }, []);

  function alternarRecolhido() {
    setRecolhido((v) => {
      const novo = !v;
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, novo ? "1" : "0");
      } catch {}
      return novo;
    });
  }

  return (
    <>
      {/* Barra superior (só no celular) */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-barra-traco bg-barra px-4 md:hidden">
        <LogoManuFlow tamanho={28} className="text-barra-texto" />
        <button
          onClick={() => setAberto(true)}
          className="text-barra-texto"
          aria-label="Abrir menu"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Gaveta (só no celular, quando aberta) */}
      {aberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setAberto(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-barra px-4 py-5 text-barra-texto">
            <button
              onClick={() => setAberto(false)}
              className="mb-2 self-end text-barra-suave hover:text-barra-texto"
              aria-label="Fechar menu"
            >
              <X size={22} />
            </button>
            <Conteudo
              pathname={pathname}
              nome={nome}
              userEmail={userEmail}
              papel={papel}
              modulos={modulos}
              recolhido={false}
              onNav={() => setAberto(false)}
            />
          </aside>
        </div>
      )}

      {/* Barra fixa (computador) */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-barra-traco bg-barra px-4 py-5 text-barra-texto transition-[width] duration-200 md:flex ${
          recolhido ? "w-[76px]" : "w-64"
        }`}
      >
        <Conteudo
          pathname={pathname}
          nome={nome}
          userEmail={userEmail}
          papel={papel}
          modulos={modulos}
          recolhido={recolhido}
          onRecolher={alternarRecolhido}
        />
      </aside>
    </>
  );
}
