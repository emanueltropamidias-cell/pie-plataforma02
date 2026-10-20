# Ligar o WhatsApp oficial (Cloud API da Meta)

Escrito em 26/08/2026, depois de o número não-oficial ser banido às 15:01 com
34.855 mensagens em dez horas.

## Antes de começar

- [x] **Conta de negócio verificada na Meta** — já feito.
- [ ] **Um número de telefone** que:
  - você controle e possa receber SMS ou ligação;
  - **não esteja ativo no WhatsApp comum nem no WhatsApp Business (app)**. Se
    estiver, apague a conta dentro do app antes — *Configurações → Conta →
    Apagar minha conta*. Sem isso o registro falha;
  - **não esteja banido.** O número que caiu hoje só serve se o recurso for
    aceito, e não dá para contar com isso.

> O número novo pode ser um chip pré-pago comum. O que ele **não** pode é já ter
> WhatsApp instalado.

---

## 1. O aplicativo

1. <https://developers.facebook.com/apps> → **Criar aplicativo**
2. Tipo: **Empresa** (Business), vinculado ao seu portfólio verificado
3. Dentro do app: **Adicionar produto → WhatsApp**

Isso cria uma **WABA** (conta do WhatsApp Business) automaticamente.

## 2. O número

Em **WhatsApp → Configuração da API**:

1. **Adicionar número de telefone**
2. Informe o nome de exibição (aparece para o eleitor — use *Talita Oliveira*)
3. Verifique por SMS ou ligação
4. Anote o **Identificação do número de telefone** — é um número comprido, do
   tipo `123456789012345`. **Não é o telefone.** Esse valor é o `META_WA_PHONE_ID`.

## 3. O token permanente

O token que aparece na tela de configuração **vence em 24 horas**. Não use.

Em **Configurações do negócio → Usuários → Usuários do sistema**:

1. **Adicionar** → nome `pie-whatsapp` → papel **Administrador**
2. **Adicionar ativos** → escolha o **aplicativo** e a **WABA**, com controle total
3. **Gerar novo token** → escolha o aplicativo → marque:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Vencimento: **Nunca**
5. Copie. **Ele aparece uma vez só.** É o `META_WA_TOKEN`.

## 4. O segredo do aplicativo

**Configurações do app → Básico → Chave secreta do aplicativo → Mostrar**.

É o `META_WA_APP_SECRET`. Sem ele o webhook aceita qualquer chamada de qualquer
um que descubra o endereço — o código grita no log quando falta, mas não trava.

## 5. As variáveis na Vercel

```
META_WA_TOKEN=<o token permanente do passo 3>
META_WA_PHONE_ID=<o id do número, passo 2>
META_WA_APP_SECRET=<passo 4>
META_WA_VERIFY_TOKEN=<invente uma frase longa, só sua>
WA_PROVEDOR=meta
```

`WA_PROVEDOR` é a chave de virada. Com `meta`, tudo sai pela Cloud API. Com
`evolution`, volta para o não-oficial — serve de contingência.

Depois de salvar: **redeploy**, senão as variáveis não entram.

## 6. O webhook

Em **WhatsApp → Configuração → Webhooks → Editar**:

- **URL de retorno**: `https://SEU-DOMINIO/api/whatsapp/meta`
- **Verificar token**: o mesmo `META_WA_VERIFY_TOKEN`
- **Verificar e salvar**

Depois, em **Gerenciar**, assine o campo **`messages`**. É o único necessário —
ele traz mensagens recebidas e confirmações de entrega.

### Conferir que subiu

```
curl https://SEU-DOMINIO/api/whatsapp/meta
```

Deve responder `{"ok":true,"provedor":"meta","configurado":true,"confereAssinatura":true}`.

Se `confereAssinatura` vier `false`, falta o `META_WA_APP_SECRET`.

---

## O que muda no dia a dia

### A janela de 24 horas

Esta é a mudança que a equipe vai sentir.

A campanha só escreve texto livre **dentro de 24 horas contadas da última
mensagem que a PESSOA mandou**. Resposta da campanha não reabre o relógio; só a
pessoa reabre.

Passou de 24 horas, a Meta recusa qualquer texto. O único jeito de retomar é um
**template aprovado antes**, e cada um custa.

Por que a regra existe: é ela que impede a plataforma de virar canal de disparo.
E é o mesmo acordo que torna a resposta ao lead do anúncio **gratuita e sem teto
de volume**.

### O que custa

| Situação | Custo |
|---|---|
| Lead do anúncio fala primeiro, a menina responde em até 24h | **R$ 0,00, ilimitado** |
| Retomar conversa parada (template utilidade) | ~R$ 0,04 |
| Template de marketing | ~R$ 0,38 |

### Os limites de tier não valem para o atendimento

O tier (250/dia no começo, subindo para 1.000, 10.000…) limita **conversas que a
campanha inicia**. Responder quem falou com você é ilimitado desde o primeiro
dia. Os 4.000 leads/dia não esbarram em nada.

### O que melhora sozinho

- **Origem da campanha** passa a ser preenchida: a Meta diz de qual anúncio o
  lead veio (`referral`). O filtro nas métricas deixa de ser caixa vazia.
- **Entregue / lido** viram carimbo de verdade em `mensagens.status`.
- **Mídia fica 14 dias** guardada na Meta — dá para tentar baixar de novo. Na
  Evolution, o que não baixou na hora podia sumir.

---

## Templates (para depois)

Só serão necessários quando a campanha quiser retomar conversa parada. Criam-se
em **WhatsApp Manager → Modelos de mensagem**, e a aprovação leva de minutos a
algumas horas.

Categoria importa no preço: **Utilidade** (~R$ 0,04) para aviso e retomada de
atendimento; **Marketing** (~R$ 0,38) para divulgação. Classificar marketing como
utilidade é motivo de bloqueio — a Meta reclassifica e pune.
