#!/bin/bash
# Originais ficam intactos em originais/. A web recebe copia de 1600px em JPEG:
# 6000px e 25 MB de PNG travam qualquer celular na rua.
cd /Users/talitasantosdeoliveira/PIEPLATAFORMA/site-talita
o=originais
declare -a par=(
  "2W1A0563.jpg.jpeg:retrato-estudio"
  "2W1A0635.jpg.jpeg:bandeiras-corpo"
  "2W1A0641.jpg.jpeg:bandeiras-close"
  "2W1A0811.jpg.jpeg:blazer-branco"
  "Gemini_Generated_Image_uygk9luygk9luygk.jpg.jpeg:sertao-senhora"
  "IMG_0376.PNG:gabinete"
  "IMG_0392.JPEG:criancas-praca"
  "SANTINHO-REMODULADO---RECUPERADOTALITA.png:santinho-1022"
  "TALITA-NO-PLANALTO (1).png:planalto"
)
for p in "${par[@]}"; do
  src="$o/${p%%:*}"; dst="fotos/${p##*:}.jpg"
  [ -f "$src" ] && sips -s format jpeg -s formatOptions 82 -Z 1600 "$src" --out "$dst" >/dev/null 2>&1 &
done
wait
