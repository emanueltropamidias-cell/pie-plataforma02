# Padrão profissional na plataforma

Em 03/08/2026 Emanuel avisou que pessoas da equipe começaram a criar conta e a usar a
plataforma de verdade. A partir daí, **tudo que for construído precisa ter cara
profissional** — não é pedido de uma tela, é padrão para todas.

A referência visual que ele usa é o GabiFlow: barra lateral colorida com ícone em cada
item, bloco de usuário no topo, rótulos de seção, item ativo como bloco preenchido e botão
de recolher.

**Por que:** enquanto era só ele testando, acabamento tosco custava nada. Com terceiros
usando, a aparência da ferramenta é a aparência da campanha — e ele apresenta a plataforma
para outras pessoas.

**Como aplicar:** nunca entregar tela "funcional mas crua". Toda tela nova nasce com
hierarquia tipográfica, ícones onde ajudam a varrer e espaçamento consistente. Usar os
componentes `Cabecalho`, `Cartao` e `Indicador` em `src/components/ui/pagina.tsx` em vez de
remontar cada tela. Quando a mudança for visual e ampla, mostrar antes de publicar — ele já
reverteu mudança de cor feita sem prévia.

## Landing pages e páginas de captura

Seguir a estrutura da página do Instituto Rose (`src/app/instituto/`), aprovada em
02/08/2026: cabeçalho enxuto com âncoras · chamada curta ao lado do formulário · seção
"Sobre" com três cartões de atuação · bloco de dados institucionais (razão social, CNPJ,
endereço, telefone, e-mail) · rodapé repetindo esses dados + aviso de LGPD com canal de
exclusão. Formulário entrega no WhatsApp, sem banco.

O cliente aprovou esse padrão e pediu para repetir nas próximas. A estrutura também atende
de fábrica à verificação de negócio da Meta, que exige razão social, CNPJ, endereço e
telefone visíveis e idênticos ao contrato social — de preferência no rodapé.

Reaproveitar a estrutura e trocar só a identidade visual, que varia por iniciativa:

- **campanha** — navy `#0c1f3a`, verde-limão `#c0eb02`, azul `#0525f7`; fontes Poppins /
  Bebas Neue / Playfair Display
- **Instituto Rose** — preto e branco, por ser outra pessoa jurídica
- **Mulheres que Governam** — identidade própria, em desenho desde 02/08/2026

Dados institucionais devem ser puxados do registro público do CNPJ
(`brasilapi.com.br/api/cnpj/v1/<cnpj>`) em vez de digitados, para bater letra por letra com
a Receita.
