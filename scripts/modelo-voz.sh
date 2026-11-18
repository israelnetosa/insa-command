#!/usr/bin/env bash
# Baixa o modelo pequeno de português do Vosk (Apache 2.0), reempacota em .tar.gz e divide em partes
# de até 20 MB (o Cloudflare aceita até 25 MB por arquivo). O Worker junta as partes em /vosk/pt.tar.gz.
set -euo pipefail
NOME=vosk-model-small-pt-0.3
DEST=public/vosk/pt
TMP=$(mktemp -d)
curl -fsSL --retry 3 -o "$TMP/m.zip" "https://alphacephei.com/vosk/models/$NOME.zip"
(cd "$TMP" && unzip -q m.zip && tar -czf pt.tar.gz "$NOME")
rm -rf "$DEST" && mkdir -p "$DEST"
split -b 20m -d -a 2 "$TMP/pt.tar.gz" "$DEST/parte-"
TAM=$(stat -c %s "$TMP/pt.tar.gz"); SHA=$(sha256sum "$TMP/pt.tar.gz" | cut -c1-16)
node -e "const f=require('fs');const p=f.readdirSync('$DEST').filter(n=>n.startsWith('parte-')).sort();f.writeFileSync('$DEST/manifesto.json',JSON.stringify({modelo:'$NOME',partes:p,tamanho:$TAM,versao:'$SHA'}))"
cat "$DEST/manifesto.json"; echo
rm -rf "$TMP"
