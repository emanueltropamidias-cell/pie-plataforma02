import { redirect } from "next/navigation";

// Esta tela virou "Números da campanha".
//
// Ela era a conexão de UM número: estado, QR, desconectar. Com vários, a de
// números faz tudo isso para cada um — e mais: quem atende, quantos leads
// entraram nas últimas 24 horas, e o alerta de risco de banimento.
//
// O arquivo continua existindo só para redirecionar. Duas portas para a mesma
// coisa é como nasce o "eu conectei lá e não funcionou aqui" — e o link antigo
// está em conversa de WhatsApp, em favorito e no histórico de meia dúzia de
// navegadores. Apagar sem redirecionar transformaria isso num 404 no dia mais
// cheio.

export default function ConexaoPage() {
  redirect("/atendimento/numeros");
}
