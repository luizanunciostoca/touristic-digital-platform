# MIG-0005 — Integration Gate

Este checkpoint integra a pilha completa de Navigation diretamente contra `main` depois da matriz executável atingir 24/24 cenários em `PASS`.

O estado `equivalent` somente é válido quando o diff integrado mantém verdes os gates aplicáveis do repositório, incluindo Quality Gate e as provas browser de Navigation disparadas pelo conjunto de arquivos alterados.

A promoção continua separada de `released`: rollout e publicação permanecem etapas posteriores.
