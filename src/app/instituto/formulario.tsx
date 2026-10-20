"use client";

import { useState } from "react";
import { INSTITUTO } from "./dados";

const MUNICIPIOS_DESTAQUE = [
  "Salvador",
  "Feira de Santana",
  "Vitória da Conquista",
  "Camaçari",
  "Lauro de Freitas",
  "Itabuna",
  "Ilhéus",
  "Juazeiro",
  "Jequié",
  "Barreiras",
  "Alagoinhas",
  "Teixeira de Freitas",
  "Porto Seguro",
  "Simões Filho",
  "Paulo Afonso",
  "Outro município",
];

function mascaraTel(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function Formulario() {
  const [nome, setNome] = useState("");
  const [whats, setWhats] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [interesse, setInteresse] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState("");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) return setErro("Escreva o seu nome.");
    if (whats.replace(/\D/g, "").length < 10) return setErro("Escreva o seu WhatsApp com DDD.");
    if (!aceite) return setErro("É preciso aceitar o uso dos dados para continuar.");

    const texto = [
      `Olá! Quero fazer parte do ${INSTITUTO.nomeFantasia}.`,
      `Nome: ${nome.trim()}`,
      `WhatsApp: ${whats}`,
      municipio ? `Município: ${municipio}` : "",
      interesse ? `Interesse: ${interesse}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const p = new URLSearchParams({
      phone: INSTITUTO.whatsapp,
      text: texto,
      type: "phone_number",
      app_absent: "0",
    });
    window.location.href = `https://api.whatsapp.com/send?${p.toString()}`;
  }

  const campo =
    "h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-[15px] text-zinc-900 outline-none focus:border-zinc-400";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome completo"
        autoComplete="name"
        className={campo}
      />
      <input
        value={whats}
        onChange={(e) => setWhats(mascaraTel(e.target.value))}
        placeholder="WhatsApp com DDD"
        inputMode="numeric"
        autoComplete="tel"
        className={campo}
      />
      <select value={municipio} onChange={(e) => setMunicipio(e.target.value)} className={campo}>
        <option value="">Município</option>
        {MUNICIPIOS_DESTAQUE.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select value={interesse} onChange={(e) => setInteresse(e.target.value)} className={campo}>
        <option value="">Como quer participar</option>
        <option value="Voluntariado">Voluntariado</option>
        <option value="Projetos sociais">Projetos sociais</option>
        <option value="Capacitação">Capacitação</option>
        <option value="Parceria">Parceria institucional</option>
      </select>

      <label className="flex items-start gap-2 text-[12.5px] leading-snug text-zinc-500">
        <input
          type="checkbox"
          checked={aceite}
          onChange={(e) => setAceite(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          Autorizo o {INSTITUTO.nomeFantasia} a usar meus dados para entrar em contato sobre as
          ações do instituto, conforme a Lei Geral de Proteção de Dados.
        </span>
      </label>

      {erro && <p className="text-[13px] font-medium text-red-600">{erro}</p>}

      <button
        type="submit"
        className="h-12 rounded-xl bg-zinc-900 text-[15px] font-bold text-white transition-colors hover:bg-zinc-800"
      >
        Quero fazer parte
      </button>
    </form>
  );
}
