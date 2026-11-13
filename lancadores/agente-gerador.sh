#!/usr/bin/env sh
# Lançador leve para Linux e macOS (precisa do Node 20+ e do Git instalados).
# Copie para a pasta raiz do seu site e rode: sh agente-gerador.sh
# Sem Node? Use o executável agente-gerador-linux ou agente-gerador-macos da página de Releases.
cd "$(dirname "$0")" || exit 1
npx --yes github:AllanRodriguesCosta/Agent_generator assistente "$(pwd)"
