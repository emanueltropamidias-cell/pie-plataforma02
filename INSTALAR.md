# Instalar o PIE para um candidato novo

Mesmo código, instalação separada: banco próprio, deploy próprio, servidor de
WhatsApp próprio. A equipe do Emanuel opera todas.

**Por que separado, e não uma coluna de "dono" no mesmo banco:** são candidatos
que negociam dobradinha entre si. Uma política de segurança errada num banco
compartilhado expõe a base de um para o outro, e política de RLS errada não
avisa — a tela abre igual. Separado, o erro que vaza teria de ser um erro de
credencial, que é bem mais difícil de cometer sem perceber.

E a chave da Evolution é **global do servidor**: com ela, o deploy de um
candidato lista, controla e pede o QR dos chips do outro. Por isso servidor
próprio, e não só instância própria.

---

## Parte 1 — o que só você consegue fazer

Nada aqui eu consigo pelo terminal: são contas e painéis.

### 1.1 Projeto no Supabase

Novo projeto, **região São Paulo (sa-east-1)** — a mesma da Talita, para a
latência não mudar.

Anote na hora da criação (a senha do banco não aparece de novo):

| onde | o que |
|---|---|
| na tela de criação | **senha do banco** |
| Settings → API | **Project URL** |
| Settings → API | **anon public** |
| Settings → API | **service_role** |

> **Não cola essas chaves no chat.** Chave em conversa fica gravada no histórico
> e passa pela API. Salve num arquivo e me diga que salvou:
>
> ```bash
> # a service_role fica FORA do repositório, como a da Talita
> touch ~/.pie-manasses.env && chmod 600 ~/.pie-manasses.env
> ```

### 1.2 Servidor Evolution

Um VPS separado, com a Evolution instalada, e uma
`AUTHENTICATION_API_KEY` **diferente** da do servidor da Talita.

Se usar o mesmo servidor com outra instância, a separação é de mentira: quem
tiver a chave do deploy dele alcança os chips dela.

### 1.3 Chips

Os números que o Manassés vai usar. Cada um passa pelo aquecimento no celular
antes de entrar no PIE — como sempre.

### 1.4 Projeto na Vercel

Novo projeto apontando para **este mesmo repositório**. As variáveis vão na
parte 2.

### 1.5 Domínio

Dois endereços, como no da Talita: o site público (base dos links de QR) e o
`atendimento.` por onde a equipe entra.

---

## Parte 2 — o que eu faço

Assim que você me passar o nome do projeto Supabase e me disser que as chaves
estão no arquivo:

### 2.1 Levantar o banco

Cada instalação tem o seu arquivo de ambiente, e cada arquivo se identifica na
primeira linha:

```bash
# .env.manasses.local
PIE_CANDIDATO=manasses
```

Daí em diante, todo script pede o nome — e anuncia em quem vai mexer antes de
mexer:

```bash
node scripts/rodar-sql.mjs --candidato=manasses supabase/migrations/0000_base.sql --confirmo=manasses
node scripts/rodar-sql.mjs --candidato=manasses supabase/seed.sql
```

> **Por que a chatice do nome duas vezes.** Migração rodada na base do candidato
> errado **não dá erro nenhum** — o SQL é o mesmo, as tabelas são as mesmas. Um
> `update` de correção escrito para uma base, rodado na outra, conserta o que
> não estava quebrado e estraga o que estava certo; só se descobre pelo número
> que mudou sem motivo, dias depois. Sem o nome, apontar para a base errada era
> o caminho padrão: bastava rodar o comando de sempre na pasta de sempre.

Sobem 36 tabelas, 7 views, 77 funções, 22 gatilhos, 124 índices, 21 sequências,
91 políticas, 2 baldes de arquivo e 3 políticas de arquivo. A semente traz os
417 municípios da Bahia, as 18 etiquetas e os 2 setores.

**Zero conversa, zero liderança, zero atendente.** Começa vazio.

### 2.2 A conta de administrador

O gatilho `profiles_nasce_pendente` faz toda conta nova nascer **pendente** —
inclusive a primeira. Então a primeira é promovida à mão, uma vez só:

```sql
update public.profiles
   set role = 'admin', status = 'ativo'
 where id = '<uuid do usuário criado no painel de Auth>';
```

Daí em diante as contas da equipe saem pela tela de Configurações.

### 2.3 As variáveis na Vercel

As da identidade são as que mudam. Sem `NEXT_PUBLIC_WA_NUMERO` o build quebra
de propósito — ver o porquê em `src/lib/candidato.ts`.

```
NEXT_PUBLIC_WA_NUMERO=              # chip principal do Manassés, só dígitos
NEXT_PUBLIC_CANDIDATO_NOME=         # ex.: Manassés Silva
NEXT_PUBLIC_CANDIDATO_PRIMEIRO_NOME=
NEXT_PUBLIC_CANDIDATO_CARGO=        # ex.: Deputado Federal
NEXT_PUBLIC_CANDIDATO_URNA=         # o número de urna DELE
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_APP_URL=
```

A lista completa das 28 está no [README](README.md).

### 2.4 A arte

As imagens ainda têm o nome dela no arquivo (`talita-logo-*.png`,
`capa-talita.jpg`) e são referidas em 10 lugares. Trocar a arte hoje obriga a
editar código. Vou renomear para `logo-claro.png`, `logo-escuro.png` e
`capa.jpg` para que trocar vire só substituir o arquivo.

---

### 2.5 As áreas que ele usa

Decisão de 15/09: Atendimento, Base, Estratégia (lideranças, QR, mapa) e
Dashboard. **Gabinete e Tráfego pago ficam ocultos**, na Vercel dele:

```
NEXT_PUBLIC_MODULOS_OCULTOS=gabinete,trafego
```

Some do menu, dos atalhos e das rotas; o cron do tráfego responde "ignorado".
Ver `src/lib/modulos.ts`.

### 2.6 As migrações que vieram depois da base

`0000_base.sql` é a foto do banco da Talita num dia. Tudo o que entrou depois
(`0001` em diante) tem de rodar na dele também, em ordem — senão a tela chama
função que não existe (Base, Outras bases, Supervisão da coordenadora, a trava
de status):

```bash
node scripts/rodar-sql.mjs --candidato=manasses supabase/migrations/<arquivo> --confirmo=manasses
```

Um arquivo por vez, do `0001` ao último. **Ler cada um antes**: algumas trazem
correção de dado escrita para a base da Talita (ex.: a limpeza da `0033`), que
na dele não acha nada — mas é para confirmar, não para supor.

**Conferir depois de toda migração nova**, e não só na instalação:

```bash
node scripts/comparar-instalacoes.mjs --candidato=manasses
```

Só lê. Lista o que falta e o que está em versão antiga no banco dele. O código
chega sozinho aos dois sites; o banco não — em 03/10 havia 16 funções para trás
lá, e o botão de baixar a base completa devolvia erro.

### 2.7 Levar um QR da Talita para ele

O QR impresso não muda de endereço. O script copia o link e as leituras para a
base dele e faz o da Talita só repassar (sem contar duas vezes):

```bash
node scripts/transferir-link.mjs --slug=talitaemanasses --para=manasses --seco
node scripts/transferir-link.mjs --slug=talitaemanasses --para=manasses
```

---

## Parte 3 — conferir que funciona

Instalação que sobe não é instalação que funciona. Os cinco testes:

1. **Ponta a ponta.** Parear um chip, mandar mensagem de um telefone de fora,
   ver a conversa entrar, responder pelo PIE, e a resposta chegar.
2. **Arquivo.** Subir um áudio na biblioteca e mandar por kit. Se os baldes
   faltarem, o upload falha com "bucket not found" — que não diz a ninguém que
   faltou instalar.
3. **QR.** Ler um QR e ver a leitura contar.
4. **Isolamento.** Com as credenciais do Manassés, tentar ler a base da Talita —
   pelo PostgREST e pela Evolution. **As duas têm de recusar.** É o teste que
   importa mais, e o único que prova a decisão de separar.
5. **O número certo.** Ler o QR do Manassés e conferir que abre o WhatsApp
   **dele**. Este é o erro que não dá erro: se `NEXT_PUBLIC_WA_NUMERO` estiver
   errada, o link funciona e leva ao telefone errado.

---

## O que a instalação nova NÃO terá

Não é esquecimento — é decisão, e cada uma tem motivo:

**Fluxo automático.** A semente não traz nenhum, porque `fluxo_passos.mensagem`
é copy de campanha e `fluxos.telefones_teste` guarda telefone real. Semear
entregaria ao Manassés um disparo pronto e funcionando escrito para a Talita, e
o eleitor dele receberia.

> Hoje **não existe tela para criar roteiro de fluxo** — ele sempre veio de SQL.
> Enquanto isso, a instalação dele fica sem fluxo e sem como criar um. É a
> lacuna que mais pesa nesta lista.

**Kits e materiais.** Apontam para arquivos no Storage do projeto dela. Ele sobe
os dele pela tela.

**Dados de dobradinha.** Os votos e parceiros são da campanha dela.

**Papel de leitura.** Os papéis que existem são `admin`, `usuario` e
`atendente`, e os três mexem. Se o Manassés for entrar pessoalmente para
acompanhar sem poder alterar, esse papel precisa ser criado antes — não existe
hoje.
