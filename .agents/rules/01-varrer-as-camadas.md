# Varrer as camadas — regra oficial

**Nenhuma correção termina onde o sintoma apareceu.** Antes de programar, alterar ou
atualizar qualquer coisa, mapear quais camadas existem, o que a mudança toca e o que mais
sofre do mesmo defeito.

Isto vale para TODA mudança, não só para as grandes.

## Por que existe

Emanuel não é programador, e as correções que ele faz vêm de perceber número estranho na
tela — nunca de ler código. **Ele não pode ser a rede de segurança.** O que passar
despercebido por ele fica quebrado para sempre.

Falhas reais que criaram esta regra, todas no mesmo dia:

- etiqueta subcontada diagnosticada como problema "da Maiana"; era de toda atendente com
  mais de 200 conversas
- eventos de etiqueta configurados só numa das três instâncias; duas equipes marcaram no
  vazio por dias
- painel corrigido para 290 e a lista deixada em 83
- cadastro liberado numa das duas travas de caminho; no subdomínio a tela existia e o
  botão devolvia para a fila
- limpeza de município escrita para duas tabelas, conferida em uma, e faltando outras três
- `painel.sql` corrigido no banco e não no arquivo — quem rodasse o script de novo trazia
  o defeito de volta

O padrão é sempre o mesmo: atacar o sintoma relatado em vez da classe.

## Como aplicar

1. **A primeira pergunta é "onde mais isso existe?"**, não "como conserto isso".

2. **Varrer as duas dimensões:**
   - por CAMADA — todas as telas do PIE, as funções do banco, os gatilhos, as rotas de
     API e os arquivos SQL do repositório
   - por NÚMERO e por ATENDENTE — se vale para uma, conferir todas as instâncias e todas
     as contas

3. **O arquivo do repositório é uma camada.** Consertar no banco e não no arquivo deixa o
   defeito armado para voltar — e voltar pelo gesto mais seguro que existe, que é rodar um
   script do próprio repositório.

4. **O mesmo fato escrito em dois lugares sempre desencontra.** Ao achar lista, regra ou
   constante duplicada, unificar em vez de corrigir as duas cópias.

5. **Conferir o que se escreveu, não o que se lembra de ter escrito.** Update que rodou
   não é update que funcionou: comparar contra tabela vazia passa sem erro e sem efeito.

6. **Dizer explicitamente o que foi conferido e o que NÃO foi.** Se faltou varrer alguma
   camada, isso vai escrito. Nunca deixar implícito que está tudo coberto.

7. **Número de tela tem que vir do banco, não do que coube na consulta.** Teto de consulta
   virando métrica é o defeito mais silencioso desta base.
