import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // A malha da Bahia não muda: guardada no navegador, a segunda abertura
        // do mapa não baixa nada. Se um dia mudar, muda-se o nome do arquivo.
        source: "/bahia-municipios.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },

  async rewrites() {
    return [
      // O Instituto tem domínio próprio, que é o declarado na verificação da
      // Meta. Acessos à raiz de institutorose.com abrem a página do Instituto
      // sem mudar a URL — o visitante não vê "/instituto" na barra.
      {
        source: "/",
        has: [{ type: "host", value: "institutorose.com" }],
        destination: "/instituto",
      },
      {
        source: "/",
        has: [{ type: "host", value: "www.institutorose.com" }],
        destination: "/instituto",
      },
    ];
  },
};

export default nextConfig;
