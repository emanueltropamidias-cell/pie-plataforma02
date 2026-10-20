#!/bin/bash
# Prepara fotos novas para a galeria.
#
# COMO USAR
#   1. Jogue as fotos dentro da pasta  fotos-novas/
#   2. Rode:  ./adicionar-fotos.sh
#   3. Copie as linhas que aparecerem no fim e cole em GALERIA, no dados.py
#   4. Rode:  python3 gerar.py
#
# O que ele faz: guarda o original intacto, gera a versão de web em 1600 px e
# JPEG (foto de celular tem 4 a 8 MB e trava a página na rua), e escreve a linha
# pronta para o dados.py — faltando só a legenda, que é a parte que só uma pessoa
# sabe escrever.

cd "$(dirname "$0")" || exit 1
ENTRADA="fotos-novas"
DESTINO="assets/images/galeria"
mkdir -p "$ENTRADA" "$DESTINO" originais

achou=0
for f in "$ENTRADA"/*; do
  [ -f "$f" ] || continue
  case "${f##*.}" in
    jpg|JPG|jpeg|JPEG|png|PNG|heic|HEIC|webp|WEBP) ;;
    *) continue ;;
  esac
  achou=$((achou + 1))

  # nome limpo: sem acento, sem espaço, minúsculo
  base=$(basename "$f"); base="${base%.*}"
  limpo=$(echo "$base" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null | \
          tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g;s/^-//;s/-$//')
  [ -z "$limpo" ] && limpo="foto-$achou"

  cp "$f" "originais/$limpo.${f##*.}"
  # -Z tambem AMPLIA o que e menor que o limite: foto de 1024 px virava 1600 px,
  # mais pesada e mais borrada que a original. So reduz quem passa de 1600.
  maior=$(sips -g pixelWidth -g pixelHeight "$f" 2>/dev/null | awk '/pixel/{print $2}' | sort -rn | head -1)
  if [ "${maior:-0}" -gt 1600 ]; then
    sips -s format jpeg -s formatOptions 82 -Z 1600 "$f" --out "$DESTINO/$limpo.jpg" >/dev/null 2>&1
  else
    sips -s format jpeg -s formatOptions 82 "$f" --out "$DESTINO/$limpo.jpg" >/dev/null 2>&1
  fi

  antes=$(stat -f%z "$f")
  depois=$(stat -f%z "$DESTINO/$limpo.jpg" 2>/dev/null || echo 0)
  printf "  %-40s %5.1f MB -> %4.0f KB\n" "$limpo.jpg" \
    "$(echo "scale=2; $antes/1048576" | bc)" "$(echo "$depois/1024" | bc)"
done

if [ "$achou" -eq 0 ]; then
  echo "Nenhuma foto em $ENTRADA/. Coloque as fotos lá e rode de novo."
  exit 0
fi

echo
echo "Pronto. Copie as linhas abaixo para GALERIA, no dados.py,"
echo "e troque a categoria e a legenda de cada uma:"
echo
echo "  categorias possíveis: povo · palestra · eventos · bahia · mandato"
echo
for f in "$DESTINO"/*.jpg; do
  [ -f "$f" ] || continue
  n=$(basename "$f")
  echo "    {\"arq\": \"$DESTINO/$n\", \"cat\": \"povo\","
  echo "     \"alt\": \"DESCREVA A FOTO AQUI\"},"
done
echo
echo "A legenda não é enfeite: é o que uma pessoa cega ouve no lugar da foto,"
echo "e é o que o Google lê. Escreva o que está acontecendo, não 'foto 1'."
