"""Todo o conteúdo do site, num lugar só.

Separado do gerador de propósito: quem for atualizar agenda, notícia ou bandeira
mexe aqui e roda `python3 gerar.py`. Não precisa entender HTML nem CSS.

REGRA QUE NÃO SE QUEBRA: nada aqui é inventado. O que não foi informado fica em
FALTA, com o marcador aparecendo na tela como aviso da equipe — placeholder
visível é honesto; número de telefone chutado é dano.
"""

# ── quem é, e o que a lei exige que apareça ───────────────────────────────────
CANDIDATA = {
    "nome": "Talita Oliveira",
    "numero": "1022",
    "cargo": "Candidata a Deputada Federal",
    "estado": "Bahia",
    "lema_1": "Coragem não se copia.",
    "lema_2": "Coragem para mudar o Brasil e a Bahia.",
    # A frase virou o lema do topo. Deixar a mesma linha repetida dentro de
    # "Quem é Talita" enfraqueceria as duas, então lá ela saiu.
    "frase": None,
}

# Exigência do TSE e da Meta. O rótulo de anúncio da Meta foi reprovado uma vez
# por falta disto — tem de estar no HTML servido, sem JavaScript, sem clique.
LEGAL = {
    "entidade": "ELEIÇÃO 2026 TALITA SANTOS DE OLIVEIRA PEIXOTO DEPUTADO FEDERAL",
    "cnpj": "68.237.041/0001-30",
    "endereco": "Alameda Salvador, 1057, Caminho das Árvores, Salvador, BA",
    "email": "deputada@talitaoliveiraoficial.com",
}

# ── contato ──────────────────────────────────────────────────────────────────
FALTA = "[A EQUIPE PRECISA INFORMAR]"

CONTATO = {
    "whatsapp": "5571992330000",          # o mesmo dos cards e do linktree
    "whatsapp_visivel": "(71) 99233-0000",
    "email": "deputada@talitaoliveiraoficial.com",
    "imprensa": FALTA,
    "comite": "Alameda Salvador, 1057, Caminho das Árvores, Salvador, BA",
}

MSG_WHATS = "Olá! Vim pelo site da Talita Oliveira e quero saber como posso participar."

REDES = [
    {"nome": "Instagram", "url": FALTA, "handle": "@talitaoliveiraoficial"},
    {"nome": "Facebook", "url": "https://www.facebook.com/deputadatalitaoliveira", "handle": "/deputadatalitaoliveira"},
    {"nome": "TikTok", "url": "https://www.tiktok.com/@talitaoliveira.oficial", "handle": "@talitaoliveira.oficial"},
    {"nome": "Kwai", "url": "https://k.kwai.com/u/@Theuzwh/pK3C5ARw", "handle": "Kwai"},
    {"nome": "YouTube", "url": FALTA, "handle": FALTA},
    {"nome": "X", "url": FALTA, "handle": FALTA},
]

# ── números da trajetória ────────────────────────────────────────────────────
# Seis cartões em vez de quatro: com quatro a seção parecia magra. Os dois que
# entraram saem da própria comunicação oficial — a bio e o perfil do Instagram
# @talitaoliveiraoficial —, não de estimativa.
NUMEROS = [
    {"valor": "26.096", "texto": "Votos na eleição para Deputada Estadual, em 2018."},
    {"valor": "33.455", "texto": "Votos na eleição para Deputada Federal, em 2022."},
    {"valor": "2019 — 2023", "texto": "Mandato completo como Deputada Estadual da Bahia."},
    {"valor": "3ª Secretária", "texto": "Da Mesa Diretora da Assembleia Legislativa da Bahia."},
    {"valor": "149 mil", "texto": "Pessoas acompanhando no Instagram."},
    {"valor": "1ª mulher de direita", "texto": "Eleita deputada estadual na Bahia.", "largo": True},
]

# Prontos, mas FORA DO AR até a equipe validar — foi pedido assim, e é o certo:
# número errado em site de campanha vira material de adversário.
NUMEROS_AGUARDANDO = [
    {"valor": "+300", "texto": "proposições apresentadas"},
    {"valor": "414 de 417", "texto": "municípios baianos visitados"},
    {"valor": FALTA, "texto": "seguidores nas redes sociais"},
]

# ── bandeiras ────────────────────────────────────────────────────────────────
BANDEIRAS = [
    {
        "n": "01",
        "icone": "escudo",
        "titulo": "Segurança para viver sem medo",
        "texto": "Segurança pública não pode ser apenas uma estatística. Para Talita, segurança "
                 "significa garantir que uma mulher possa trabalhar, estudar, empreender, levar seus "
                 "filhos à escola, frequentar sua igreja e voltar para casa sem precisar organizar sua "
                 "vida em função do medo. Talita defende mais inteligência, tecnologia, integração das "
                 "forças de segurança, prevenção à violência e uma legislação capaz de enfrentar com "
                 "firmeza a criminalidade.",
    },
    {
        "n": "02",
        "icone": "mulher",
        "titulo": "Proteção e autonomia para as mulheres",
        "texto": "Combater a violência contra a mulher não termina no momento da denúncia. Uma mulher "
                 "precisa encontrar proteção, acolhimento e condições para reconstruir sua vida. Talita "
                 "defende políticas que conectem segurança, qualificação profissional, empreendedorismo, "
                 "educação financeira e geração de oportunidades. Proteção também significa garantir "
                 "autonomia.",
    },
    {
        "n": "03",
        "icone": "trabalho",
        "titulo": "Empreendedorismo, emprego e liberdade econômica",
        "texto": "Quem trabalha e empreende precisa encontrar oportunidades, não obstáculos. Talita "
                 "defende menos burocracia, incentivo aos pequenos negócios, qualificação profissional, "
                 "educação financeira e políticas capazes de estimular emprego, renda e desenvolvimento. "
                 "Sua própria trajetória no empreendedorismo e na construção de projetos voltados às "
                 "mulheres faz dessa uma das pautas centrais de sua atuação.",
    },
    {
        "n": "04",
        "icone": "familia",
        "titulo": "Infância protegida e família respeitada",
        "texto": "Toda criança merece crescer protegida. Talita defende o fortalecimento das políticas "
                 "de prevenção e combate à violência, abuso e exploração sexual de crianças e "
                 "adolescentes. Também defende maior proteção no ambiente digital e o respeito ao papel "
                 "das famílias na formação e educação dos seus filhos.",
    },
    {
        "n": "05",
        "icone": "saude",
        "titulo": "Saúde da mulher com respeito e dignidade",
        "texto": "Toda mulher merece atendimento digno, humano e acessível. Durante sua atuação "
                 "parlamentar, Talita apresentou iniciativas relacionadas à proteção das gestantes, "
                 "combate à violência obstétrica e acessibilidade durante o pré-natal e o parto. Na "
                 "Câmara Federal, pretende ampliar o debate sobre prevenção, diagnóstico e cuidado "
                 "integral com a saúde das mulheres.",
    },
    {
        "n": "06",
        "icone": "educacao",
        "titulo": "Educação que prepara para a vida",
        "texto": "Educação precisa abrir portas. Talita defende a valorização do ensino básico, educação "
                 "profissional, tecnologia, empreendedorismo e educação financeira. A escola também "
                 "precisa preparar os jovens para o mercado de trabalho, para as novas profissões e para "
                 "os desafios da vida adulta.",
    },
    {
        "n": "07",
        "icone": "mapa",
        "titulo": "Desenvolvimento para todo o estado",
        "texto": "A Bahia não termina em Salvador. Talita defende investimentos em infraestrutura, "
                 "rodovias, logística, conectividade, geração de emprego e desenvolvimento econômico no "
                 "interior. O objetivo é aproximar os municípios das oportunidades e garantir que os "
                 "investimentos cheguem também às cidades que historicamente recebem menos atenção.",
    },
]

# ── atuação ──────────────────────────────────────────────────────────────────
ATUACAO = [
    {"titulo": "Proteção às crianças",
     "texto": "Iniciativas voltadas ao combate à erotização e à exploração sexual de crianças e adolescentes."},
    {"titulo": "Acessibilidade para as mulheres",
     "texto": "Proposta para garantir intérprete de Libras durante consultas de pré-natal e no trabalho de "
              "parto para gestantes com deficiência auditiva."},
    {"titulo": "Proteção à gestante",
     "texto": "Atuação em iniciativas relacionadas à prevenção e combate à violência obstétrica."},
    {"titulo": "Empreendedorismo feminino",
     "texto": "Defesa de políticas capazes de ampliar oportunidades para mulheres que empreendem ou "
              "desejam conquistar independência financeira."},
    {"titulo": "Trabalho pelos municípios",
     "texto": "Demandas de infraestrutura levadas ao poder público estadual, incluindo recuperação e "
              "melhoria de rodovias e trechos importantes para municípios baianos."},
    {"titulo": "Responsabilidade e liderança",
     "texto": "Logo no primeiro mandato, foi escolhida para ocupar a função de 3ª Secretária da Mesa "
              "Diretora da Assembleia Legislativa da Bahia."},
]

# ── galeria ──────────────────────────────────────────────────────────────────
# `cat` casa com os filtros. Só entra fotografia real de acontecimento: material
# gerado por IA não pode ser apresentado como registro.
GALERIA = [
    # SÓ TALITA COM GENTE. Retrato de estúdio saiu daqui: esta aba é para
    # encontro, rua, palestra e evento — foto de fundo cinza não conta história
    # nenhuma e diluía as que contam. Os estúdios seguem no site, no topo e no
    # "Quem é Talita", que é onde eles servem.
    #
    # Para acrescentar: rode ./adicionar-fotos.sh com as fotos novas em
    # fotos-novas/, e copie as linhas que ele imprime para cá.
    {"arq": "assets/images/galeria/carreata-camisa-brasil.jpg", "cat": "eventos",
     "alt": "Talita Oliveira em cima do trio, de camisa da seleção, durante ato de rua"},
    {"arq": "assets/images/galeria/palestra-salao.jpg", "cat": "palestra",
     "alt": "Talita Oliveira grava vídeo com o público durante encontro em salão comunitário"},
    {"arq": "assets/images/galeria/menino-bandeira.jpg", "cat": "povo",
     "alt": "Talita Oliveira caminha de mãos no ombro de um menino enrolado na bandeira do Brasil"},
    {"arq": "assets/images/galeria/menina-colo-comunidade.jpg", "cat": "povo",
     "alt": "Talita Oliveira com uma menina no colo, em comunidade do interior da Bahia"},
    {"arq": "assets/images/galeria/criancas-picole.jpg", "cat": "povo",
     "alt": "Talita Oliveira entrega picolé a um grupo de crianças em frente a uma casa"},
    {"arq": "assets/images/galeria/menina-colo-obra.jpg", "cat": "povo",
     "alt": "Talita Oliveira com uma menina no colo, cercada de crianças, ao lado de casas em construção"},
    {"arq": "assets/images/galeria/apoiadora-orla.jpg", "cat": "eventos",
     "alt": "Talita Oliveira ao lado de uma apoiadora durante ato na orla de Salvador"},
    {"arq": "assets/images/galeria/selfie-estrada-rural.jpg", "cat": "povo",
     "alt": "Talita Oliveira faz uma selfie com um morador em estrada de terra na zona rural"},
    {"arq": "assets/images/galeria/abraco-encontro-rural.jpg", "cat": "eventos",
     "alt": "Talita Oliveira abraça uma participante durante encontro de mulheres do campo"},
    {"arq": "assets/images/galeria/ato-farol-da-barra.jpg", "cat": "eventos",
     "alt": "Talita Oliveira entre apoiadoras durante manifestação no Farol da Barra, em Salvador"},
    {"arq": "assets/images/rua/sertao-senhora.jpg", "cat": "povo",
     "alt": "Talita Oliveira abraçada a uma moradora, em comunidade do interior da Bahia"},
    {"arq": "assets/images/rua/criancas-praca.jpg", "cat": "povo",
     "alt": "Talita Oliveira com crianças no colo, durante atividade de rua"},
    {"arq": "assets/images/mandato/planalto.jpg", "cat": "mandato",
     "alt": "Talita Oliveira em frente ao Congresso Nacional, em Brasília"},
    {"arq": "assets/images/mandato/gabinete.jpg", "cat": "mandato",
     "alt": "Talita Oliveira trabalhando no gabinete, ao lado da bandeira do Brasil"},
]

FILTROS = [
    ("todas", "Todas"), ("povo", "Com o povo"), ("palestra", "Palestras"),
    ("eventos", "Eventos"), ("bahia", "Pela Bahia"), ("mandato", "Mandato"),
]

GALERIA_TITULO = "Talita com a gente"
GALERIA_MENU = "Momentos"

# ── agenda e notícias ────────────────────────────────────────────────────────
# Vazias de propósito. A estrutura está pronta; a tela avisa que não há evento
# publicado em vez de mostrar data inventada.
# FORA DA PÁGINA por ora, a pedido: sem evento marcado, uma agenda vazia only
# mostra que não há agenda. A seção volta assim que houver o primeiro
# compromisso — basta preencher aqui e religar em gerar.py.
MOSTRAR_AGENDA = False
MOSTRAR_NOTICIAS = False

AGENDA = [
    # {"cidade": "Salvador", "titulo": "...", "data": "2026-08-20", "data_txt": "20 de agosto",
    #  "hora": "19h", "local": "...", "descricao": "...", "mapa": "https://maps.google.com/?q=..."},
]

NOTICIAS = [
    # {"slug": "...", "titulo": "...", "data": "2026-08-20", "data_txt": "20 de agosto de 2026",
    #  "categoria": "Campanha", "resumo": "...", "imagem": "assets/images/...", "conteudo": "<p>...</p>"},
]

CATEGORIAS = ["Campanha", "Pela Bahia", "Segurança", "Mulheres", "Empreendedorismo", "Opinião", "Agenda"]

# ── participe ────────────────────────────────────────────────────────────────
PARTICIPACAO = [
    "Quero ser voluntário",
    "Quero receber material",
    "Quero Talita na minha cidade",
    "Quero organizar um encontro",
    "Quero entrar para um grupo",
]

# ── medição ──────────────────────────────────────────────────────────────────
# Sem ID fictício: enquanto for None, nenhuma tag é escrita no HTML.
ANALYTICS = {"ga4": None, "gtm": None, "meta_pixel": None}

SITE = {
    # TROCAR AO COMPRAR O DOMÍNIO NOVO. Este endereço alimenta o canonical, o
    # og:url que o WhatsApp e o Facebook leem ao compartilhar, o sitemap e o
    # schema. Se o site subir num domínio e apontar para outro aqui, quem clica
    # no link compartilhado vai para o lugar errado, e o Google indexa o errado.
    # Hoje aponta para o site da plataforma, que roda na Vercel, não aqui.
    "dominio": "https://talitasantosdeoliveirapeixoto.com",
    "titulo": "Talita Oliveira 1022 | Deputada Federal pela Bahia",
    "descricao": "Conheça Talita Oliveira, sua trajetória, atuação, propostas e agenda pela Bahia. "
                 "Talita Oliveira, candidata a Deputada Federal, 1022.",
}
