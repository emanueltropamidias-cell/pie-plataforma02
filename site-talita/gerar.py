"""Monta o site da Talita. Roda com `python3 gerar.py`.

Site estático de propósito. Não tem WordPress, banco nem painel: é HTML que o
servidor entrega direto. Em campanha isso vale por três motivos — abre rápido no
celular da rua, não quebra sozinho no meio da eleição, e não tem porta de invasão.

O conteúdo vive em dados.py e o visual em estilo.py. Quem for atualizar agenda
ou notícia mexe só no primeiro.
"""

import html as _h
import pathlib
import re

import dados as D
from estilo import CSS

RAIZ = pathlib.Path(__file__).parent


def esc(t):
    return _h.escape(str(t), quote=True)


def falta(v):
    """Marca visualmente o que a equipe ainda não informou."""
    return v == D.FALTA


def marcar(v):
    return f'<span class="falta">{esc(v)}</span>' if falta(v) else esc(v)


# ── ícones ───────────────────────────────────────────────────────────────────
ICONES = {
    "escudo": '<path d="M12 2 4 5.5v6c0 5 3.4 9.3 8 10.5 4.6-1.2 8-5.5 8-10.5v-6L12 2Z"/>',
    "mulher": '<circle cx="12" cy="7" r="4"/><path d="M12 12v6m-3 0h6m-3-6-3 6m3-6 3 6"/>',
    "trabalho": '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
    "familia": '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20"/><path d="M15 14h1.6a3.4 3.4 0 0 1 3.4 3.4V20"/>',
    "saude": '<path d="M20.4 5.6a5.2 5.2 0 0 0-7.4 0L12 6.6l-1-1a5.2 5.2 0 1 0-7.4 7.4l8.4 8.4 8.4-8.4a5.2 5.2 0 0 0 0-7.4Z"/>',
    "educacao": '<path d="M2 8.5 12 4l10 4.5-10 4.5L2 8.5Z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
    "mapa": '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    "zap": '<path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.91-9.91a9.85 9.85 0 0 0-2.91-7.01Zm-7.01 15.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.22 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.39 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28Z"/>',
    "instagram": '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none"/>',
    "facebook": '<path d="M14 8.5V7c0-.8.4-1.3 1.4-1.3H17V3h-2.5C11.9 3 11 4.4 11 6.6v1.9H9V11h2v10h3V11h2.2l.4-2.5H14Z"/>',
    "tiktok": '<path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v11.9a2.5 2.5 0 1 1-1.8-2.5V9.2a5.6 5.6 0 1 0 4.9 5.6V8.9a7.3 7.3 0 0 0 4.3 1.4V7.2a4.3 4.3 0 0 1-3.2-1.4Z"/>',
    "kwai": '<path d="M9.4 7.6a.9.9 0 0 1 1.4-.8l6.1 3.5a.9.9 0 0 1 0 1.6l-6.1 3.5a.9.9 0 0 1-1.4-.8V7.6Z"/><rect x="2.6" y="2.6" width="18.8" height="18.8" rx="6"/>',
    "youtube": '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.6v4.8l4.2-2.4-4.2-2.4Z" fill="currentColor" stroke="none"/>',
    "x": '<path d="M4 4l16 16M20 4 4 20"/>',
    "foto": '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.4"/><path d="M8.5 6l1.2-2h4.6l1.2 2"/>',
    "baixar": '<path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
    "menu": '<path d="M3 6h18M3 12h18M3 18h18"/>',
    "fechar": '<path d="M6 6l12 12M18 6 6 18"/>',
}


def svg(nome, preenchido=False):
    corpo = ICONES.get(nome, "")
    est = 'fill="currentColor" stroke="none"' if preenchido else \
          'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"'
    return f'<svg viewBox="0 0 24 24" {est} aria-hidden="true">{corpo}</svg>'


# ── menu ─────────────────────────────────────────────────────────────────────
# Nove itens de menu viram ruído: ninguém lê nove, e a barra fica parecendo
# painel de prefeitura. Seis, e o "Faça parte" continua como botão à parte.
MENU = [
    ("Quem é Talita", "#quem"), ("Foto com Talita", "#moldura"),
    ("Bandeiras", "#bandeiras"), ("Atuação", "#atuacao"),
    (D.GALERIA_MENU, "#galeria"), ("Contato", "#contato"),
]


def link_zap():
    from urllib.parse import quote
    return f"https://api.whatsapp.com/send?phone={D.CONTATO['whatsapp']}&text={quote(D.MSG_WHATS)}"


def barra():
    itens = "".join(f'<a href="{u}">{esc(t)}</a>' for t, u in MENU)
    gav = "".join(f'<a href="{u}" data-fecha>{esc(t)}</a>' for t, u in MENU)
    return f"""
<header class="barra">
  <div class="env barra__int">
    <a class="barra__marca" href="#inicio" aria-label="Talita Oliveira, início">
      <img src="assets/images/marca/logo-preta.png" alt="Talita Oliveira" width="150" height="33">
      <span class="barra__num">{D.CANDIDATA['numero']}</span>
    </a>
    <nav class="menu" aria-label="Principal">{itens}
      <a class="bt bt--ambar" href="#participe" style="padding:10px 18px;font-size:13px">Faça parte</a>
    </nav>
    <button class="abrir" type="button" aria-expanded="false" aria-controls="gaveta" aria-label="Abrir menu">
      {svg('menu')}
    </button>
  </div>
</header>
<nav class="gaveta" id="gaveta" aria-label="Menu">{gav}
  <a class="bt bt--ambar" href="#participe" data-fecha>Faça parte</a>
</nav>"""


def topo():
    """Foto do Planalto sangrando na tela, como no primeiro protótipo — foi a
    versão que agradou. O que mudou é a cor do véu: era azul-marinho, e o azul
    não existe na comunicação da campanha. Agora é o verde-noite, mesma dramática
    e dentro da marca."""
    return f"""
<section class="topo" id="inicio">
  <div class="topo__fundo" style="background-image:url('assets/images/hero/planalto.jpg')"></div>
  <div class="topo__veu"></div>
  <div class="env topo__int">
   <div class="topo__texto">
    <h1>{esc(D.CANDIDATA['nome'])}</h1>
    <p class="topo__lema">{esc(D.CANDIDATA['lema_1'])}<span>{esc(D.CANDIDATA['lema_2'])}</span></p>
    <p class="topo__cargo">{esc(D.CANDIDATA['cargo'])} pela {esc(D.CANDIDATA['estado'])}</p>
    <div class="topo__num"><b>{D.CANDIDATA['numero']}</b><small>Deputada Federal</small></div>
    <div class="topo__bts">
      <a class="bt bt--ambar" href="#quem">Conheça Talita</a>
      <a class="bt bt--linha-clara" href="#participe">Faça parte</a>
      <a class="bt bt--verde" href="{link_zap()}" target="_blank" rel="noopener">
        {svg('zap', True)} WhatsApp</a>
    </div>
   </div>
  </div>
</section>"""


def pergunta():
    return f"""
<section class="secao pergunta">
  <div class="env">
    <p class="olho">Segurança</p>
    <h2>O que a violência tira das mulheres antes mesmo de tirar suas vidas?</h2>
    <p>Segurança não é apenas uma estatística. É o direito de trabalhar, estudar, empreender,
      criar os filhos, ir à igreja, andar pela cidade e voltar para casa sem precisar organizar a
      própria vida em função do medo.</p>
    <p>Talita acredita que proteger as mulheres, fortalecer as famílias e devolver segurança às
      pessoas é uma das responsabilidades mais importantes do poder público.</p>
    <a class="bt bt--verde" href="#bandeiras">Conheça nossas bandeiras</a>
  </div>
</section>"""


def quem():
    paras = [
        "Talita Oliveira é empresária, ex-deputada estadual da Bahia e uma mulher que construiu sua "
        "trajetória acreditando no trabalho, na liberdade e na capacidade das pessoas de transformarem "
        "suas próprias histórias.",
        "Nascida em Brasília e criada em Ilhéus desde a infância, Talita tem uma relação profunda com a "
        "Bahia. Mais tarde, mudou-se para Salvador, onde deu continuidade à sua formação e à sua "
        "trajetória profissional.",
        "Antes de entrar para a política, construiu sua história no empreendedorismo e passou a "
        "desenvolver iniciativas voltadas especialmente ao fortalecimento das mulheres. É idealizadora "
        "da <b>AFME — A Força da Mulher Empreendedora</b>, projeto criado com o objetivo de incentivar "
        "mulheres a empreender, desenvolver seus negócios e conquistar maior autonomia.",
        "Em 2018, Talita foi eleita deputada estadual da Bahia com <b>26.096 votos</b>. Na Assembleia "
        "Legislativa da Bahia, ocupou importantes funções, incluindo a <b>3ª Secretaria da Mesa "
        "Diretora</b>, além de participar de comissões e apresentar iniciativas relacionadas às "
        "mulheres, família, infância, empreendedorismo, liberdade econômica, infraestrutura e "
        "desenvolvimento dos municípios.",
        "Em 2022, disputou pela primeira vez uma vaga para Deputada Federal e recebeu "
        "<b>33.455 votos</b>. Agora, coloca novamente seu nome à disposição da Bahia com o objetivo de "
        "levar essa experiência para Brasília e representar os baianos na Câmara dos Deputados.",
        "Talita acredita que a política precisa voltar a cuidar das questões que interferem diretamente "
        "na vida das pessoas: segurança, proteção às mulheres, família, emprego, empreendedorismo, "
        "desenvolvimento e liberdade. Mais do que construir um projeto eleitoral, sua missão é construir "
        "uma caminhada ao lado das pessoas.",
    ]
    texto = "".join(f"<p>{p}</p>" for p in paras)
    return f"""
<section class="secao" id="quem">
  <div class="env">
    <p class="olho">Trajetória</p>
    <h2 class="tit">Quem é Talita Oliveira</h2>
    <div class="grade grade--2">
      <div class="sub">{texto}</div>
      <figure class="foto foto--alta" style="margin:0">
        <img src="assets/images/retratos/bandeiras-close.jpg" loading="lazy" decoding="async"
             width="1600" height="2133"
             alt="Talita Oliveira com as bandeiras do Brasil e da Bahia sobre os ombros">
      </figure>
    </div>
  </div>
</section>"""


def numeros():
    cards = "".join(
        f'<div class="num{" num--largo" if n.get("largo") else ""}">'
        f'<b>{esc(n["valor"])}</b><span>{esc(n["texto"])}</span></div>'
        for n in D.NUMEROS)
    return f"""
<section class="secao secao--nevoa">
  <div class="env">
    <p class="olho">Números da trajetória</p>
    <h2 class="tit">O que já foi construído</h2>
    <div class="grade grade--4" style="margin-top:28px">{cards}</div>
  </div>
</section>"""


def bandeiras():
    cards = "".join(f"""
      <article class="cartao band">
        <span class="band__n" aria-hidden="true">{b['n']}</span>
        <span class="band__ic">{svg(b['icone'])}</span>
        <h3>{esc(b['titulo'])}</h3>
        <p>{esc(b['texto'])}</p>
      </article>""" for b in D.BANDEIRAS)
    return f"""
<section class="secao secao--clara" id="bandeiras">
  <div class="env">
    <p class="olho">Bandeiras</p>
    <h2 class="tit">O que Talita defende</h2>
    <p class="sub">Sete compromissos que orientam a atuação e o mandato.</p>
    <div class="grade grade--3" style="margin-top:32px">{cards}</div>
  </div>
</section>"""


def atuacao():
    cards = "".join(
        f'<article class="cartao"><h3>{esc(a["titulo"])}</h3><p>{esc(a["texto"])}</p></article>'
        for a in D.ATUACAO)
    return f"""
<section class="secao" id="atuacao">
  <div class="env">
    <p class="olho">Atuação parlamentar</p>
    <h2 class="tit">Trabalho que já deixou marcas</h2>
    <p class="sub">Antes de pedir novamente a confiança dos baianos, Talita já teve a oportunidade de
      representar a população na Assembleia Legislativa da Bahia. Durante seu mandato, apresentou
      projetos, indicações e iniciativas voltadas a diferentes áreas.</p>
    <div class="grade grade--3" style="margin-top:32px">{cards}</div>
    <figure class="foto" style="margin:32px 0 0">
      <img src="assets/images/mandato/gabinete.jpg" loading="lazy" decoding="async"
           width="1600" height="1067"
           alt="Talita Oliveira trabalhando no gabinete, ao lado da bandeira do Brasil">
    </figure>
  </div>
</section>"""


def mulheres():
    return f"""
<section class="secao secao--verde" id="mulheres">
  <div class="env">
    <div class="grade grade--2">
      <div>
        <p class="olho">Mulheres</p>
        <h2 class="tit">Quando uma mulher consegue reconstruir sua vida, toda uma família pode recomeçar.</h2>
        <p class="sub">Talita acredita que uma política para mulheres não pode olhar apenas para um
          único momento da vida. É necessário construir uma jornada que envolva proteção, formação,
          desenvolvimento, independência financeira, empreendedorismo, tecnologia e oportunidades.</p>
        <p class="sub">Essa visão também inspira projetos de formação e desenvolvimento feminino que
          buscam criar comunidades capazes de conectar mulheres, conhecimento e novas possibilidades.</p>
        <a class="bt bt--escuro" href="#bandeiras" style="margin-top:8px">Conheça essa visão</a>
      </div>
      <figure class="foto" style="margin:0">
        <img src="assets/images/rua/sertao-senhora.jpg" loading="lazy" decoding="async"
             width="1600" height="2187"
             alt="Talita Oliveira abraçada a uma moradora, em comunidade do interior da Bahia">
      </figure>
    </div>
  </div>
</section>"""


def moldura():
    """A pessoa sobe a foto e baixa ela já dentro da moldura da campanha.

    TUDO ACONTECE NO NAVEGADOR DELA. A foto não sobe para servidor nenhum, não
    passa por aqui e não fica guardada em lugar algum — o <canvas> compõe e o
    próprio aparelho salva. Num site de campanha isso importa duas vezes: evita
    custo e evita responsabilidade sobre foto de terceiro, que sob a LGPD é dado
    pessoal. E funciona offline depois que a página carregou.

    A moldura é 1080x1920, formato de story, com o miolo transparente.
    """
    return f"""
<section class="secao secao--escura" id="moldura">
  <div class="env">
    <p class="olho">Faça a sua</p>
    <h2 class="tit">Tire uma foto com a Talita</h2>
    <p class="sub" style="margin-bottom:34px">Suba a sua foto e ela sai pronta com a moldura do
      <b>#TimeTôComTalita</b>, no tamanho certo para o story. É só publicar.</p>

    <div class="mold">
      <div class="mold__palco">
        <canvas class="mold__tela" id="mold-tela" width="1080" height="1920"
                aria-label="Prévia da sua foto com a moldura"></canvas>
      </div>
      <div>
        <ol class="mold__passos">
          <li>Escolha uma foto sua — de rosto funciona melhor.</li>
          <li>Ela é encaixada na moldura automaticamente.</li>
          <li>O download começa sozinho. Depois é só postar e marcar a Talita.</li>
        </ol>
        <div class="mold__bts">
          <label class="bt bt--ambar" for="mold-arq">{svg('foto')} Escolher a minha foto
            <input class="mold__arq" type="file" id="mold-arq" accept="image/*"></label>
          <button class="bt bt--linha-clara" type="button" id="mold-baixar" hidden>
            {svg('baixar')} Baixar de novo</button>
        </div>
        <p id="mold-aviso" style="font-size:13px;color:rgba(255,255,255,.62);margin-top:18px">
          A foto não sai do seu aparelho: o site monta a imagem aqui mesmo, no navegador, e não
          envia nada para lugar nenhum.</p>
      </div>
    </div>
  </div>
</section>"""


def agenda():
    if not D.AGENDA:
        corpo = """<div class="vazio"><b>Nenhum evento publicado ainda.</b><br>
          A agenda aparece aqui assim que a equipe cadastrar os compromissos em
          <code>dados.py</code>.</div>"""
    else:
        corpo = '<div class="grade grade--3">' + "".join(f"""
          <article class="cartao">
            <p class="olho" style="margin-bottom:8px">{esc(e['cidade'])}</p>
            <h3>{esc(e['titulo'])}</h3>
            <p><b>{esc(e['data_txt'])}</b> · {esc(e['hora'])}<br>{esc(e['local'])}</p>
            <p>{esc(e.get('descricao', ''))}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
              <a class="bt bt--linha-escura" href="{esc(e.get('mapa', '#'))}" target="_blank"
                 rel="noopener" style="padding:10px 16px;font-size:13px">Como chegar</a>
              <a class="bt bt--verde" href="{link_zap()}" target="_blank" rel="noopener"
                 style="padding:10px 16px;font-size:13px">Quero participar</a>
            </div>
          </article>""" for e in D.AGENDA) + "</div>"
    return f"""
<section class="secao secao--clara" id="agenda">
  <div class="env">
    <p class="olho">Agenda</p>
    <h2 class="tit">Talita pela Bahia</h2>
    <p class="sub" style="margin-bottom:28px">Onde a campanha vai estar. Venha, chame quem você conhece
      e traga a sua cidade para a caminhada.</p>
    {corpo}
  </div>
</section>"""


def galeria():
    filtros = "".join(
        f'<button class="filtro" type="button" data-filtro="{c}" '
        f'aria-pressed="{"true" if c == "todas" else "false"}">{esc(r)}</button>'
        for c, r in D.FILTROS)
    figs = "".join(f"""
      <figure data-cat="{esc(g['cat'])}">
        <img src="{esc(g['arq'])}" loading="lazy" decoding="async" alt="{esc(g['alt'])}"
             width="1600" height="1600">
      </figure>""" for g in D.GALERIA)
    return f"""
<section class="secao" id="galeria">
  <div class="env">
    <p class="olho">{esc(D.GALERIA_MENU)}</p>
    <h2 class="tit">{esc(D.GALERIA_TITULO)}</h2>
    <div class="filtros" role="group" aria-label="Filtrar fotos">{filtros}</div>
    <div class="galeria">{figs}</div>
    <p style="font-size:12.5px;color:var(--tinta-3);margin-top:18px">Todas as imagens desta galeria são
      registros fotográficos reais. Nenhuma foi gerada por inteligência artificial.</p>
  </div>
</section>"""


def noticias():
    if not D.NOTICIAS:
        corpo = """<div class="vazio"><b>Ainda não há notícias publicadas.</b><br>
          A estrutura está pronta: cada notícia recebe imagem, data, categoria, resumo e botões de
          compartilhamento.</div>"""
    else:
        corpo = '<div class="grade grade--3">' + "".join(f"""
          <article class="cartao" style="padding:0;overflow:hidden">
            <img src="{esc(n['imagem'])}" loading="lazy" alt="{esc(n['titulo'])}"
                 style="aspect-ratio:16/9;object-fit:cover;width:100%">
            <div style="padding:22px">
              <p class="olho" style="margin-bottom:8px">{esc(n['categoria'])} · {esc(n['data_txt'])}</p>
              <h3>{esc(n['titulo'])}</h3>
              <p>{esc(n['resumo'])}</p>
            </div>
          </article>""" for n in D.NOTICIAS) + "</div>"
    return f"""
<section class="secao secao--clara" id="noticias">
  <div class="env">
    <p class="olho">Notícias</p>
    <h2 class="tit">O que está acontecendo</h2>
    {corpo}
  </div>
</section>"""


def participe():
    opcoes = "".join(f'<option value="{esc(o)}">{esc(o)}</option>' for o in D.PARTICIPACAO)
    atalhos = "".join(
        f'<a class="bt bt--linha-escura" href="#form-participe" style="padding:11px 18px;font-size:13.5px">'
        f'{esc(o)}</a>' for o in D.PARTICIPACAO)
    return f"""
<section class="secao" id="participe">
  <div class="env">
    <p class="olho">Participe</p>
    <h2 class="tit">Essa caminhada também é sua.</h2>
    <p class="sub">Uma campanha não é construída apenas por uma candidata. É construída por pessoas que
      acreditam, participam, compartilham ideias e ajudam uma mensagem a chegar mais longe.
      Escolha como você quer participar.</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin:24px 0 34px">{atalhos}</div>

    <form class="form" id="form-participe" novalidate>
      <div class="campo"><label for="f-nome">Nome</label>
        <input id="f-nome" name="nome" type="text" autocomplete="name" required></div>
      <div class="campo"><label for="f-tel">Telefone / WhatsApp</label>
        <input id="f-tel" name="telefone" type="tel" autocomplete="tel" inputmode="tel" required></div>
      <div class="campo"><label for="f-cidade">Cidade</label>
        <input id="f-cidade" name="cidade" type="text" autocomplete="address-level2" required></div>
      <div class="campo"><label for="f-bairro">Bairro</label>
        <input id="f-bairro" name="bairro" type="text"></div>
      <div class="campo full"><label for="f-email">E-mail</label>
        <input id="f-email" name="email" type="email" autocomplete="email"></div>
      <div class="campo full"><label for="f-como">Como deseja participar?</label>
        <select id="f-como" name="como">{opcoes}</select></div>
      <div class="full">
        <label class="aceite"><input type="checkbox" id="f-ok" name="aceite" required>
          <span>Autorizo o tratamento dos meus dados conforme a
            <a href="politica-de-privacidade.html" style="color:var(--azul)">política de privacidade</a>.</span>
        </label>
      </div>
      <div class="full"><button class="bt bt--verde" type="submit">Enviar e falar no WhatsApp</button>
        <p style="font-size:12.5px;color:var(--tinta-3);margin-top:12px">O envio abre o WhatsApp da
          campanha com a sua mensagem já escrita. Nada é armazenado neste site.</p>
      </div>
    </form>
  </div>
</section>"""


def contato():
    redes = "".join(
        (f'<a href="{esc(r["url"])}" target="_blank" rel="noopener" aria-label="{esc(r["nome"])}">'
         f'{svg(r["nome"].lower())}</a>')
        for r in D.REDES if not falta(r["url"]))
    pendentes = [r["nome"] for r in D.REDES if falta(r["url"])]
    aviso = (f'<p style="font-size:12.5px;color:rgba(255,255,255,.6);margin-top:12px">'
             f'Aguardando link oficial: {esc(", ".join(pendentes))}.</p>') if pendentes else ""
    return f"""
<section class="secao secao--escura" id="contato">
  <div class="env">
    <p class="olho">Contato</p>
    <h2 class="tit">Fale com a nossa equipe</h2>
    <dl class="contato" style="margin-top:28px">
      <div><dt>WhatsApp</dt><dd><a href="{link_zap()}" target="_blank" rel="noopener"
        style="color:#fff">{esc(D.CONTATO['whatsapp_visivel'])}</a></dd>
        <dt>E-mail</dt><dd><a href="mailto:{esc(D.CONTATO['email'])}"
        style="color:#fff">{esc(D.CONTATO['email'])}</a></dd></div>
      <div><dt>Imprensa</dt><dd>{marcar(D.CONTATO['imprensa'])}</dd>
        <dt>Comitê</dt><dd>{esc(D.CONTATO['comite'])}</dd></div>
    </dl>
    <h3 style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--ambar);
      margin:20px 0 12px">Redes sociais</h3>
    <div class="redes">{redes}</div>{aviso}
  </div>
</section>"""


def rodape():
    links = "".join(f'<li><a href="{u}">{esc(t)}</a></li>' for t, u in MENU)
    redes = "".join(
        f'<a href="{esc(r["url"])}" target="_blank" rel="noopener" aria-label="{esc(r["nome"])}">'
        f'{svg(r["nome"].lower())}</a>'
        for r in D.REDES if not falta(r["url"]))
    L = D.LEGAL
    return f"""
<footer class="rodape">
  <div class="env rodape__grade">
    <div>
      <img src="assets/images/marca/logo-branca.png" alt="Talita Oliveira" width="150" height="33">
      <p style="margin:14px 0 0;font-size:13px;letter-spacing:.16em;text-transform:uppercase;
        color:rgba(255,255,255,.7);font-weight:700">Deputada Federal</p>
      <span class="rodape__num">{D.CANDIDATA['numero']}</span>
    </div>
    <div><h4>Navegue</h4><ul>{links}</ul></div>
    <div><h4>Acompanhe</h4><div class="redes">{redes}</div>
      <h4 style="margin-top:24px">Transparência</h4>
      <ul>
        <li><a href="politica-de-privacidade.html">Política de Privacidade</a></li>
        <li><a href="politica-de-privacidade.html#termos">Termos de Uso</a></li>
        <li><a href="politica-de-privacidade.html#cookies">Política de Cookies</a></li>
      </ul>
    </div>
  </div>

  <div class="env">
    <div class="legal">
      <b>{esc(L['entidade'])}</b>
      <p>CNPJ: {esc(L['cnpj'])}</p>
      <p>{esc(L['endereco'])}</p>
      <p style="margin-bottom:12px">{esc(L['email'])}</p>
      <p>Conteúdo de responsabilidade de {esc(L['entidade'])}.</p>
    </div>
  </div>
</footer>"""


# ── JS mínimo: menu, filtros e envio do formulário ───────────────────────────
JS = """
(function(){
  var b=document.querySelector('.abrir'), g=document.getElementById('gaveta');
  if(b&&g){
    b.addEventListener('click',function(){
      var a=g.hasAttribute('data-aberta');
      if(a){g.removeAttribute('data-aberta')}else{g.setAttribute('data-aberta','')}
      b.setAttribute('aria-expanded',String(!a));
      document.body.style.overflow=a?'':'hidden';
    });
    g.querySelectorAll('[data-fecha]').forEach(function(a){
      a.addEventListener('click',function(){
        g.removeAttribute('data-aberta');b.setAttribute('aria-expanded','false');
        document.body.style.overflow='';
      });
    });
  }
  document.querySelectorAll('.filtro').forEach(function(f){
    f.addEventListener('click',function(){
      var c=f.dataset.filtro;
      document.querySelectorAll('.filtro').forEach(function(o){o.setAttribute('aria-pressed',String(o===f))});
      document.querySelectorAll('.galeria figure').forEach(function(fig){
        fig.style.display=(c==='todas'||fig.dataset.cat===c)?'':'none';
      });
    });
  });

  // ── moldura ───────────────────────────────────────────────────────────────
  // Composicao no proprio navegador: a foto nao sobe para servidor nenhum.
  (function(){
    var tela = document.getElementById('mold-tela');
    if(!tela) return;
    var ctx = tela.getContext('2d'), arq = document.getElementById('mold-arq'),
        bt = document.getElementById('mold-baixar'), aviso = document.getElementById('mold-aviso'),
        L = tela.width, A = tela.height, quadro = new Image(), pronta = false;
    quadro.src = 'assets/images/marca/moldura.png';
    quadro.onload = function(){ pronta = true; desenhar(null); };

    function desenhar(img){
      ctx.clearRect(0,0,L,A);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,L,A);
      if(img){
        // "cover": preenche sem deformar, cortando o excedente.
        var e = Math.max(L/img.width, A/img.height),
            w = img.width*e, h = img.height*e;
        ctx.drawImage(img, (L-w)/2, (A-h)/2, w, h);
      }
      if(pronta) ctx.drawImage(quadro, 0, 0, L, A);
    }

    function baixar(){
      // Aberto como arquivo local (file://), o navegador trata a moldura como
      // origem diferente, "contamina" o canvas e toBlob lanca SecurityError.
      // Publicado no dominio isso nao acontece. Sem este aviso, quem testar
      // dando dois cliques no arquivo acha que a funcao esta quebrada.
      try{
        tela.toBlob(function(b){
          if(!b) return;
          var u = URL.createObjectURL(b), a = document.createElement('a');
          a.href = u; a.download = 'eu-com-talita-1022.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function(){ URL.revokeObjectURL(u); }, 4000);
        }, 'image/png');
      }catch(e){
        aviso.textContent = location.protocol === 'file:'
          ? 'Para baixar, abra o site pelo endereco (deputadatalitaoliveira.com). Aberto como arquivo no computador, o navegador bloqueia o download por seguranca.'
          : 'Nao consegui gerar o arquivo neste navegador. Tente pelo Chrome ou pelo Safari atualizado.';
      }
    }

    arq.addEventListener('change', function(){
      var f = arq.files && arq.files[0];
      if(!f) return;
      if(!/^image\//.test(f.type)){ aviso.textContent = 'Esse arquivo nao e uma imagem.'; return; }
      aviso.textContent = 'Montando a sua imagem...';
      // createImageBitmap respeita a orientacao EXIF; foto de celular deitada
      // apareceria de lado sem isso. Se o navegador nao tiver, cai no <img>.
      var seguir = function(img){
        desenhar(img); bt.hidden = false; baixar();
        aviso.textContent = 'Pronto! O download comecou. A foto nao saiu do seu aparelho.';
      };
      if(window.createImageBitmap){
        createImageBitmap(f, {imageOrientation:'from-image'}).then(seguir).catch(function(){ viaImg(f, seguir); });
      } else { viaImg(f, seguir); }
    });

    function viaImg(f, ok){
      var u = URL.createObjectURL(f), i = new Image();
      i.onload = function(){ ok(i); URL.revokeObjectURL(u); };
      i.onerror = function(){ aviso.textContent = 'Nao consegui abrir essa imagem. Tente outra.'; };
      i.src = u;
    }

    bt.addEventListener('click', baixar);
  })();

  // Sem servidor por trás: o formulario monta a mensagem e abre o WhatsApp da
  // campanha. Nada trafega para lugar nenhum, e por isso nada se perde no meio.
  var fm=document.getElementById('form-participe');
  if(fm) fm.addEventListener('submit',function(e){
    e.preventDefault();
    if(!document.getElementById('f-ok').checked){alert('Marque a autorização para continuar.');return}
    var v=function(id){return (document.getElementById(id)||{}).value||''};
    var t='Ola! Vim pelo site da Talita Oliveira.\\n\\n'+
      'Nome: '+v('f-nome')+'\\nTelefone: '+v('f-tel')+'\\nCidade: '+v('f-cidade')+
      '\\nBairro: '+v('f-bairro')+'\\nE-mail: '+v('f-email')+
      '\\nComo quero participar: '+v('f-como');
    window.open('https://api.whatsapp.com/send?phone=WHATS&text='+encodeURIComponent(t),'_blank');
  });
})();
"""


def analytics():
    """Nada é escrito enquanto não houver ID de verdade — ID fictício polui o
    relatório e some sem ninguém notar."""
    a = D.ANALYTICS
    if not any(a.values()):
        return ("\n<!-- MEDIÇÃO: sem IDs ainda. Preencha ANALYTICS em dados.py "
                "(ga4, gtm, meta_pixel) e rode gerar.py de novo. -->")
    return ""


def schema():
    L, S, C = D.LEGAL, D.SITE, D.CANDIDATA
    return f"""
<script type="application/ld+json">
{{"@context":"https://schema.org","@graph":[
 {{"@type":"Person","name":"Talita Oliveira","honorificPrefix":"Candidata a Deputada Federal",
   "jobTitle":"Candidata a Deputada Federal","url":"{S['dominio']}",
   "image":"{S['dominio']}/assets/images/retratos/retrato-estudio.jpg",
   "address":{{"@type":"PostalAddress","addressRegion":"BA","addressCountry":"BR",
     "addressLocality":"Salvador","streetAddress":"{L['endereco']}"}},
   "email":"{L['email']}"}},
 {{"@type":"WebSite","name":"{S['titulo']}","url":"{S['dominio']}",
   "inLanguage":"pt-BR","description":"{S['descricao']}"}},
 {{"@type":"Organization","name":"{L['entidade']}","taxID":"{L['cnpj']}",
   "url":"{S['dominio']}","email":"{L['email']}"}}
]}}
</script>"""


def montar():
    S = D.SITE
    og = f"{S['dominio']}/assets/images/retratos/retrato-estudio.jpg"
    js = JS.replace("WHATS", D.CONTATO["whatsapp"])
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(S['titulo'])}</title>
<meta name="description" content="{esc(S['descricao'])}">
<meta name="theme-color" content="#0c1f3a">
<link rel="canonical" href="{S['dominio']}/">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Talita Oliveira 1022">
<meta property="og:title" content="{esc(S['titulo'])}">
<meta property="og:description" content="{esc(S['descricao'])}">
<meta property="og:url" content="{S['dominio']}/">
<meta property="og:image" content="{og}">
<meta property="og:image:alt" content="Retrato oficial de Talita Oliveira">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(S['titulo'])}">
<meta name="twitter:description" content="{esc(S['descricao'])}">
<meta name="twitter:image" content="{og}">
<link rel="icon" href="assets/images/marca/logo-1022-branca.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="assets/images/hero/planalto.jpg" fetchpriority="high">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>{CSS}</style>{schema()}{analytics()}
</head>
<body>
<a class="pular" href="#quem">Pular para o conteúdo</a>
{barra()}
<main>
{topo()}
{pergunta()}
{quem()}
{moldura()}
{numeros()}
{bandeiras()}
{atuacao()}
{mulheres()}
{galeria()}
{participe()}
{contato()}
</main>
{rodape()}
<a class="zap" href="{link_zap()}" target="_blank" rel="noopener" aria-label="Falar no WhatsApp">
  {svg('zap', True)}</a>
<script>{js}</script>
</body>
</html>
"""


PRIVACIDADE = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de Privacidade | Talita Oliveira 1022</title>
<meta name="description" content="Como o site de Talita Oliveira trata os dados de quem entra em contato.">
<meta name="robots" content="index,follow">
<link rel="icon" href="assets/images/marca/logo-1022-branca.png">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>{CSS}
.doc{{max-width:760px;margin:0 auto;padding:40px 20px 60px}}
.doc h2{{font-size:22px;margin:34px 0 12px}}
.doc p,.doc li{{color:var(--tinta-2);font-size:15.5px}}
</style></head>
<body>
<header class="barra"><div class="env barra__int">
  <a class="barra__marca" href="index.html"><img src="assets/images/marca/logo-branca.png"
    alt="Talita Oliveira" width="120" height="26"><span class="barra__num">1022</span></a>
</div></header>
<main class="doc">
  <h1 style="font-size:30px;margin-bottom:8px">Política de Privacidade</h1>
  <p>Última atualização: agosto de 2026.</p>

  <h2>Quem trata os seus dados</h2>
  <p>Os dados informados neste site são tratados sob responsabilidade de
     <b>{D.LEGAL['entidade']}</b>, CNPJ {D.LEGAL['cnpj']}, com endereço em {D.LEGAL['endereco']}.
     Contato: {D.LEGAL['email']}.</p>

  <h2>O que este site coleta</h2>
  <p>Este site é estático e <b>não guarda os seus dados</b>. O formulário da seção “Participe” não envia
     nada para um servidor: ele monta uma mensagem com o que você escreveu e abre o WhatsApp da campanha,
     para que você mesmo decida enviá-la. Enquanto você não enviar, nada sai do seu aparelho.</p>
  <p>A partir do momento em que você envia a mensagem, os dados dela passam a ser tratados pela equipe
     da campanha para responder ao seu contato e organizar a participação — nome, telefone, cidade,
     bairro, e-mail e a forma de participação escolhida.</p>

  <h2>Para que usamos</h2>
  <ul>
    <li>Responder ao seu contato;</li>
    <li>Organizar a participação de voluntários e apoiadores;</li>
    <li>Enviar informações sobre a campanha, quando você pedir.</li>
  </ul>
  <p>Não vendemos, alugamos nem cedemos os seus dados a terceiros.</p>

  <h2>Seus direitos</h2>
  <p>A Lei Geral de Proteção de Dados garante que você peça, a qualquer momento, a confirmação do
     tratamento, o acesso, a correção ou a exclusão dos seus dados. Basta escrever para
     {D.LEGAL['email']}.</p>

  <h2 id="cookies">Cookies</h2>
  <p>Este site não usa cookies de rastreamento próprios. Ele carrega a fonte Poppins do Google Fonts,
     que é um serviço externo e pode registrar o seu endereço IP para entregar o arquivo da fonte.
     Caso a campanha passe a usar ferramentas de medição, esta política será atualizada antes.</p>

  <h2 id="termos">Termos de uso</h2>
  <p>O conteúdo deste site é de responsabilidade de {D.LEGAL['entidade']} e tem finalidade de
     divulgação da candidatura. Textos e imagens não podem ser usados para fins comerciais ou para
     alterar o sentido do que foi publicado.</p>

  <p style="margin-top:36px"><a class="bt bt--azul" href="index.html">Voltar ao site</a></p>
</main>
<footer class="rodape"><div class="env"><div class="legal">
  <b>{D.LEGAL['entidade']}</b>
  <p>CNPJ: {D.LEGAL['cnpj']}</p>
  <p>{D.LEGAL['endereco']}</p>
  <p style="margin-bottom:12px">{D.LEGAL['email']}</p>
  <p>Conteúdo de responsabilidade de {D.LEGAL['entidade']}.</p>
</div></div></footer>
</body></html>
"""

ROBOTS = f"""User-agent: *
Allow: /

Sitemap: {D.SITE['dominio']}/sitemap.xml
"""

SITEMAP = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>{D.SITE['dominio']}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>{D.SITE['dominio']}/politica-de-privacidade.html</loc>
    <changefreq>yearly</changefreq><priority>0.3</priority></url>
</urlset>
"""


def publicar():
    """Monta a pasta que vai para o servidor — TUDO PLANO, sem subpasta.

    O gerenciador de arquivos da Hostinger aceita arquivo solto e engasga com
    pasta: numa tentativa real subiu o index.html e mais nada, e o site foi ao ar
    sem uma única imagem. Em vez de exigir FTP de quem não usa FTP, o site passa
    a referenciar as imagens pelo nome puro e elas saem todas no mesmo nível.

    São 14 arquivos: selecionar tudo, arrastar, acabou. A pasta assets/ continua
    organizada aqui no projeto — quem se achata é só a cópia de publicação.
    """
    import re, shutil
    destino = RAIZ / "publicar"
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir()

    achatar = lambda t: re.sub(r"assets/images/[a-z0-9_-]+/", "", t)
    for nome in ("index.html", "politica-de-privacidade.html", "robots.txt", "sitemap.xml"):
        (destino / nome).write_text(achatar((RAIZ / nome).read_text(encoding="utf8")),
                                    encoding="utf8")

    usadas = set(re.findall(r"assets/images/[a-z0-9/_-]+\.(?:jpg|png)",
                            (RAIZ / "index.html").read_text(encoding="utf8")))
    for caminho in sorted(usadas):
        origem = RAIZ / caminho
        if origem.exists():
            shutil.copy2(origem, destino / origem.name)
    return destino, len(list(destino.iterdir()))


if __name__ == "__main__":
    (RAIZ / "index.html").write_text(montar(), encoding="utf8")
    (RAIZ / "politica-de-privacidade.html").write_text(PRIVACIDADE, encoding="utf8")
    (RAIZ / "robots.txt").write_text(ROBOTS, encoding="utf8")
    (RAIZ / "sitemap.xml").write_text(SITEMAP, encoding="utf8")
    tam = (RAIZ / "index.html").stat().st_size
    print(f"index.html ................ {tam / 1024:.0f} KB")
    print("politica-de-privacidade.html, robots.txt, sitemap.xml .... ok")
    pend = [r["nome"] for r in D.REDES if r["url"] == D.FALTA]
    if pend:
        print("aguardando link de:", ", ".join(pend))
    if D.CONTATO["imprensa"] == D.FALTA:
        print("aguardando: e-mail da assessoria de imprensa")
    if not D.AGENDA:
        print("agenda vazia (a tela avisa em vez de inventar data)")
    if not D.NOTICIAS:
        print("notícias vazias (idem)")
    pasta, quantos = publicar()
    print(f"\npublicar/ — {quantos} arquivos, tudo no mesmo nível, pronto para arrastar")
