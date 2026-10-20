"""Monta o linktree da Talita num arquivo HTML só.

Por que arquivo único: quem sobe é uma pessoa, num painel da Hostinger, por
navegador. Pasta de imagem é onde isso quebra — sobe o HTML, esquece a foto, e a
página abre sem fundo. Com a foto e a logo embutidas em base64 não existe caminho
para errar: um arquivo, um upload, acabou. O preço são ~145 KB, que carrega em
qualquer 3G.

A identidade não foi imitada de olho: os valores saíram do próprio login da
plataforma (src/app/login/page.tsx) — mesma foto, mesmo degradê, mesmo azul,
mesmo raio de canto, mesma sombra, mesma Poppins.

A LOGO É LIDA DO DISCO A CADA GERAÇÃO, de propósito. A marca trocou no dia 9 e a
primeira versão desta página saiu com a logo antiga embutida, porque o base64 já
estava dentro do HTML e ninguém percebe olhando o código. Lendo o arquivo toda
vez, trocar a logo em public/ e rodar de novo basta.

E o que a página NÃO diz: não há "1022" nem "Deputada Federal" em lugar nenhum.
Até o dia 16 a marca vai sem os dois, por regra de campanha antecipada — e esta
página é pública, então é ela quem mais precisa respeitar isso. O selo diz
apenas "Bahia".
"""

import base64, pathlib

RAIZ = pathlib.Path("/Users/talitasantosdeoliveira/PIEPLATAFORMA")


def embutir(caminho, mime):
    dados = base64.b64encode((RAIZ / caminho).read_bytes()).decode()
    return f"data:{mime};base64,{dados}"


CAPA = embutir("public/capa-talita.jpg", "image/jpeg")

# A FAIXA do alto do cartão — a foto do ato de rua, recortada larga.
#
# O original é print de Instagram e trazia a setinha do carrossel na borda e as
# bolinhas no rodapé. O recorte tira as duas: enfeite de rede social dentro do
# cartão faz a página parecer captura de tela, não canal oficial.
FAIXA = embutir("linktree/ativos/faixa.jpg", "image/jpeg")

# ── A PRÉVIA DO LINK NÃO PODE SER EMBUTIDA ──────────────────────────────────
#
# `og:image` não aceita base64: WhatsApp e Facebook buscam a imagem por HTTP, de
# fora, antes de qualquer pessoa abrir a página. Então esta é a única imagem que
# precisa ser subida À PARTE, ao lado do index.html.
#
# Sem ela o link chega como retângulo cinza — e link sem prévia num grupo de
# WhatsApp parece link suspeito, que é o oposto do que a página quer.
SITE = "https://deputadatalitaoliveira.com"
PREVIA = f"{SITE}/previa.jpg"
# A foto de perfil vem reduzida a 380px e em JPEG: 230 KB viraram 36 KB. Numa
# pagina que abre no 4G da rua, isso e a diferenca entre carregar e desistir.
RETRATO = embutir("linktree/ativos/retrato.jpg", "image/jpeg")
LOGO = embutir("public/logo-talita-branca.png", "image/png")

# Cada canal: rótulo, linha de apoio, cor do selo, o glifo e o link.
# Os links entram aqui, num lugar só.
CANAIS = [
    {
        "nome": "WhatsApp",
        "apoio": "(71) 99233-0000",
        "cor": "#25D366",
        "url": "https://api.whatsapp.com/send?phone=5571992330000",
        "destaque": True,
        "glifo": '<path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.91-9.91a9.85 9.85 0 0 0-2.91-7.01Zm-7.01 15.24h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.22 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.39 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28Z"/>',
    },
    {
        "nome": "TikTok",
        "apoio": "@talitaoliveira.oficial",
        "cor": "#010101",
        "url": "https://www.tiktok.com/@talitaoliveira.oficial",
        "glifo": '<path d="M16.6 5.82a4.28 4.28 0 0 1-1.06-2.82h-3.1v11.9a2.53 2.53 0 0 1-2.53 2.42 2.53 2.53 0 1 1 .74-4.95V9.2a5.6 5.6 0 0 0-.74-.05 5.63 5.63 0 1 0 5.63 5.63V8.9a7.3 7.3 0 0 0 4.28 1.37V7.17a4.3 4.3 0 0 1-3.22-1.35Z"/>',
    },
    {
        "nome": "Kwai",
        "apoio": "Vídeos curtos",
        "cor": "#FF5000",
        "url": "https://k.kwai.com/u/@Theuzwh/pK3C5ARw",
        "glifo": '<path d="M9.4 7.55a.9.9 0 0 1 1.36-.78l6.1 3.52a.9.9 0 0 1 0 1.56l-6.1 3.52a.9.9 0 0 1-1.36-.78V7.55Z"/><path d="M12 2.4c-3.02 0-4.6.32-5.9 1.02A6.2 6.2 0 0 0 3.42 6.1C2.72 7.4 2.4 8.98 2.4 12s.32 4.6 1.02 5.9a6.2 6.2 0 0 0 2.68 2.68c1.3.7 2.88 1.02 5.9 1.02s4.6-.32 5.9-1.02a6.2 6.2 0 0 0 2.68-2.68c.7-1.3 1.02-2.88 1.02-5.9s-.32-4.6-1.02-5.9a6.2 6.2 0 0 0-2.68-2.68C16.6 2.72 15.02 2.4 12 2.4Zm0 1.8c2.82 0 4.05.3 4.99.8.79.42 1.39 1.02 1.81 1.81.5.94.8 2.17.8 4.99s-.3 4.05-.8 4.99a4.4 4.4 0 0 1-1.81 1.81c-.94.5-2.17.8-4.99.8s-4.05-.3-4.99-.8a4.4 4.4 0 0 1-1.81-1.81c-.5-.94-.8-2.17-.8-4.99s.3-4.05.8-4.99A4.4 4.4 0 0 1 7.01 5c.94-.5 2.17-.8 4.99-.8Z"/>',
    },
    {
        "nome": "Facebook",
        "apoio": "Página oficial",
        "cor": "#1877F2",
        "url": "https://www.facebook.com/deputadatalitaoliveira",
        "glifo": '<path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z"/>',
    },
    {
        # Vai direto para a seção da moldura, não para o topo do site. Quem
        # clica aqui veio para tirar a foto — obrigar a rolar a página inteira
        # perde gente no caminho.
        "nome": "Foto com Talita",
        "apoio": "Monte a sua em segundos",
        "cor": "#f8b000",
        "url": "https://talitasantosdeoliveirapeixoto.com/#moldura",
        "glifo": '<path d="M20 5h-3.17l-1.24-1.35A2 2 0 0 0 14.12 3H9.88a2 2 0 0 0-1.47.65L7.17 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 13H4V7h4.05l1.83-2h4.24l1.83 2H20v11Z"/><path d="M12 8.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 7.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z"/>',
    },
    {
        # Fica DEPOIS da foto com moldura: os dois são "leve algo daqui", e a
        # moldura converte mais porque a pessoa aparece nela.
        "nome": "Figurinhas da Talita",
        "apoio": "Baixe e mande nos grupos",
        "cor": "#7a3ff2",
        "url": "https://drive.google.com/drive/folders/1pzNQMbKf_FMX5nYD1RxrP7CSiXKHio65",
        "glifo": '<path d="M12 2a10 10 0 1 0 10 10h-4.5A5.5 5.5 0 0 1 12 17.5 5.5 5.5 0 0 1 6.5 12 5.5 5.5 0 0 1 12 6.5V2Z"/><path d="M14 2.26V8a2 2 0 0 0 2 2h5.74A10.02 10.02 0 0 0 14 2.26Z"/>',
    },
    {
        "nome": "Site oficial",
        "apoio": "talitasantosdeoliveirapeixoto.com",
        "cor": "#2a7100",
        "url": "https://talitasantosdeoliveirapeixoto.com",
        "glifo": '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.92 6h-2.95a15.6 15.6 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8ZM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96ZM4.26 14a8.09 8.09 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26Zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A8.03 8.03 0 0 1 5.08 16Zm2.95-8H5.08a8.03 8.03 0 0 1 4.33-3.56A15.6 15.6 0 0 0 8.03 8ZM12 19.96A13.6 13.6 0 0 1 10.09 16h3.82A13.6 13.6 0 0 1 12 19.96ZM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4Zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56ZM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.09 8.09 0 0 1 0 4h-3.38Z"/>',
    },
]


def botao(c):
    aviso = ""
    if c["url"].startswith("COLE-AQUI"):
        aviso = f'\n      <!-- TROQUE a linha de baixo pelo link do {c["nome"]} -->'
    return f"""{aviso}
      <a class="canal{' destaque' if c.get('destaque') else ''}" href="{c['url']}" target="_blank" rel="noopener">
        <span class="selo" style="background:{c['cor']}">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{c['glifo']}</svg>
        </span>
        <span class="txt">
          <b>{c['nome']}</b>
          <small>{c['apoio']}</small>
        </span>
        <span class="seta" aria-hidden="true">→</span>
      </a>"""


HTML = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Talita Oliveira · Canais oficiais</title>
<meta name="description" content="Canais oficiais de Talita Oliveira, candidata a Deputada Federal 1022 pela Bahia.">
<meta name="theme-color" content="#0c1f3a">
<meta property="og:title" content="Talita Oliveira · Canais oficiais">
<meta property="og:description" content="Todos os canais oficiais num lugar só.">
<meta property="og:type" content="website">
<meta property="og:url" content="{SITE}">
<meta property="og:image" content="{PREVIA}">
<meta property="og:image:width" content="859">
<meta property="og:image:height" content="450">
<meta property="og:image:alt" content="Talita Oliveira abraçando um apoiador em ato de rua">
<!-- `summary_large_image` é o que faz a prévia aparecer GRANDE em vez de um
     quadradinho ao lado do texto. Sem esta linha, a foto vira miniatura. -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{PREVIA}">
<link rel="icon" href="{LOGO}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; }}

  body {{
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px;
    background: #0c1f3a;
    font-family: Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    color: #16202e;
    -webkit-font-smoothing: antialiased;
  }}

  /* A foto e o degradê são os mesmos da plataforma. Fixos no fundo para a
     rolagem no celular não arrastar a imagem junto. */
  .fundo, .veu {{ position: fixed; inset: 0; }}
  .fundo {{
    background-image: url("{CAPA}");
    background-size: cover;
    background-position: center;
  }}
  .veu {{ background: linear-gradient(155deg, rgba(74,182,8,.30) 0%, rgba(10,24,44,.80) 45%, rgba(6,16,30,.92) 100%); }}

  .pilha {{ position: relative; z-index: 1; width: 100%; max-width: 640px; margin: auto 0; }}

  .cartao {{
    position: relative;
    z-index: 1;
    margin: 0 auto;
    width: 100%;
    max-width: 420px;
    background: #fff;
    border-radius: 22px;
    overflow: hidden;
    text-align: center;
    box-shadow: 0 24px 64px rgba(0,0,0,.40);
  }}

  /* Bloco verde no alto: e ele que carrega a identidade. A marca vai na versao
     branca porque sobre o verde da marca o branco tem 4,1:1 em desenho cheio —
     e porque a marca azul brigaria com verde e amarelo lado a lado. */
  /* A FAIXA, e por que o retrato sobe por cima dela.
     Faixa e retrato separados, com o redondo cavalgando a divisa, é o desenho
     que todo mundo já leu mil vezes em perfil de rede social — a pessoa
     reconhece antes de ler. Encostados um no outro, sem sobreposição, os dois
     viram duas fotos empilhadas e o cartão fica alto sem ganhar nada. */
  .faixa {{ line-height: 0; background: #4ab608; }}
  .faixa img {{
    display: block;
    width: 100%;
    height: 132px;
    /* O rosto dela está acima do meio da foto; sem deslocar, o corte pega
       ombro. */
    object-fit: cover;
    object-position: center 34%;
  }}

  /* `flow-root` não é enfeite: sem ele o padding-top zero deixa a margem
     negativa do retrato COLAPSAR com a do bloco, e aí quem sobe é o verde
     inteiro — comendo 56px da faixa em vez de o retrato subir sobre ela.
     `position/z-index` garante que o retrato seja pintado POR CIMA da foto. */
  .topo {{
    background: #4ab608;
    padding: 0 22px 22px;
    display: flow-root;
  }}
  .corpo {{ padding: 20px 22px 24px; }}

  .retrato {{
    display: block;
    width: 104px;
    height: 104px;
    border-radius: 50%;
    object-fit: cover;
    /* Sobe metade de si sobre a faixa. O negativo é o que cria a divisa. */
    margin: -56px auto 14px;
    position: relative;
    z-index: 2;
    background: #fff;
    border: 3px solid rgba(255,255,255,.9);
    box-shadow: 0 6px 18px rgba(0,0,0,.20);
  }}

  .logo {{ display: block; height: 44px; width: auto; margin: 0 auto 12px; }}

  /* O NUMERO E O QUE A PESSOA PRECISA LEVAR DA PAGINA. Antes ele era uma etiqueta
     do mesmo tamanho do rotulo ao lado, e os dois se anulavam. Agora o rotulo
     encolhe e recua para o marinho, e o numero sobe para 40px em linha propria.
     A etiqueta ambar continua sendo etiqueta, e nao texto solto, por conta de
     contraste: ambar chapado sobre o verde da 1,51:1 e desaparece; marinho
     dentro do ambar da 9,45:1. */
  .cargo {{
    margin: 0 0 8px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: rgba(12,31,58,.72);
  }}
  .numero {{
    display: inline-block;
    margin: 0 0 14px;
    padding: 4px 22px 6px;
    border-radius: 14px;
    background: #ffb700;
    color: #0c1f3a;
    font-size: 40px;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: .03em;
    box-shadow: 0 6px 16px rgba(12,31,58,.18);
  }}

  .selo-topo {{
    display: inline-block;
    margin-bottom: 14px;
    border: 1px solid rgba(255,255,255,.5);
    background: #fff;
    color: #2a7100;
    border-radius: 999px;
    padding: 6px 16px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .15em;
    text-transform: uppercase;
  }}

  .frase {{ margin: 0 0 18px; font-size: 14px; line-height: 1.5; color: #6a7789; }}

  .canais {{ display: flex; flex-direction: column; gap: 10px; }}

  .canal {{
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 12px 14px;
    border: 1px solid #e8ecf2;
    border-radius: 14px;
    background: #fff;
    text-decoration: none;
    color: inherit;
    text-align: left;
    transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
  }}
  .canal:hover {{
    transform: translateY(-2px);
    border-color: rgba(74,182,8,.55);
    box-shadow: 0 8px 20px rgba(10,20,48,.10);
  }}
  .canal:active {{ transform: translateY(0); }}

  .selo {{
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    color: #fff;
  }}
  .selo svg {{ width: 21px; height: 21px; display: block; }}

  .txt {{ flex: 1 1 auto; min-width: 0; }}
  .txt b {{ display: block; font-size: 14.5px; font-weight: 700; }}
  .txt small {{ display: block; margin-top: 1px; font-size: 11.5px; color: #93a0b6; }}
  .seta {{ flex: 0 0 auto; color: #c8d0de; font-size: 17px; font-weight: 700; }}
  .canal:hover .seta {{ color: #2a7100; }}

  /* O WhatsApp é o canal que atende de verdade, então ele veste o verde do
     botão principal da plataforma em vez de mais uma linha branca. */
  .canal.destaque {{
    border: none;
    background: #4ab608;
    color: #0c1f3a;
    box-shadow: 0 8px 20px rgba(74,182,8,.32);
  }}
  .canal.destaque .selo {{ background: rgba(12,31,58,.14) !important; color: #0c1f3a; }}
  .canal.destaque .txt small {{ color: rgba(12,31,58,.62); }}
  .canal.destaque .seta {{ color: rgba(12,31,58,.55); }}
  .canal.destaque:hover {{ border-color: transparent; }}
  .canal.destaque:hover .seta {{ color: #0c1f3a; }}

  .rodape {{ margin-top: 22px; font-size: 11px; color: #93a0b6; }}
  .rodape a {{ color: #93a0b6; }}

  @media (max-width: 380px) {{
    .cartao {{ padding: 28px 18px 24px; }}
    .txt b {{ font-size: 13.5px; }}
  }}
</style>
</head>
<body>
  <div class="fundo"></div>
  <div class="veu"></div>

  <div class="pilha">
  <main class="cartao">
    <div class="faixa">
      <img src="{FAIXA}" alt="Talita Oliveira abraçando um apoiador em ato de rua"
           width="900" height="314">
    </div>
    <div class="topo">
      <img class="retrato" src="{RETRATO}" alt="Talita Oliveira" width="104" height="104">
      <img class="logo" src="{LOGO}" alt="Talita Oliveira">
      <span class="selo-topo">Bahia</span>
      <p class="cargo">Candidata a Deputada Federal</p>
      <span class="numero">1022</span>
    </div>

    <div class="corpo">
    <p class="frase">Todos os canais oficiais num lugar só.</p>

    <nav class="canais">
{chr(10).join(botao(c) for c in CANAIS)}
    </nav>

    <p class="rodape">© Talita Oliveira</p>
    </div>
  </main>

<footer style="max-width:640px;margin:48px auto 32px;padding:24px 20px;
  font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.7;
  color:#8a8f98;text-align:center;border-top:1px solid rgba(255,255,255,.12)">
  <p style="margin:0 0 10px;font-weight:600;color:#c9ced6">
    ELEIÇÃO 2026 TALITA SANTOS DE OLIVEIRA PEIXOTO DEPUTADO FEDERAL
  </p>
  <p style="margin:0 0 4px">CNPJ: 68.237.041/0001-30</p>
  <p style="margin:0 0 4px">Alameda Salvador, 1057, Caminho das Árvores, Salvador, BA</p>
  <p style="margin:0 0 12px">deputada@talitaoliveiraoficial.com</p>
  <p style="margin:0">
    Conteúdo de responsabilidade de ELEIÇÃO 2026 TALITA SANTOS DE OLIVEIRA PEIXOTO DEPUTADO FEDERAL.
  </p>
</footer>
  </div>
</body>
</html>
"""

if __name__ == "__main__":
    destino = RAIZ / "linktree" / "index.html"
    destino.write_text(HTML, encoding="utf8")
    faltam = [c["nome"] for c in CANAIS if c["url"].startswith("COLE-AQUI")]
    print(f"index.html gerado — {destino.stat().st_size / 1024:.0f} KB")
    if faltam:
        print("falta o link de:", ", ".join(faltam))
