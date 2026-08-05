# Runbook — Snapshot CSS da V1

## Objetivo

Preservar, sem transformação, todo o grafo de folhas de estilo carregado por `css/main.css` da V1 antes da extração de tokens e componentes do novo Design System.

## Pré-requisito

O checkout da V1 deve estar disponível em:

```text
.audit/v1
```

O arquivo de entrada esperado é:

```text
.audit/v1/css/main.css
```

## Execução

```bash
pnpm design-system:snapshot
pnpm design-system:inventory
```

Também é possível informar caminhos personalizados:

```bash
node tooling/design-system/snapshot-v1-css.mjs \
  /caminho/da/v1 \
  css/main.css \
  packages/design-system/src/legacy/styles \
  packages/design-system/src/legacy/manifest.json
```

## Saídas

O comando gera:

```text
packages/design-system/src/legacy/styles/**
packages/design-system/src/legacy/manifest.json
```

O manifesto contém, para cada arquivo:

- caminho original;
- caminho do snapshot;
- tamanho em bytes;
- hash SHA-256 individual.

Também registra um hash SHA-256 agregado, calculado a partir dos caminhos e hashes individuais em ordem determinística.

## Regras de segurança

- somente imports locais dentro da raiz da V1 são copiados;
- URLs externas, `data:` e imports protocol-relative são ignorados;
- qualquer import local ausente interrompe a execução;
- imports que escapem da raiz informada interrompem a execução;
- o diretório de destino é recriado integralmente a cada execução;
- os arquivos são copiados byte a byte, sem minificação ou refatoração.

## Critérios de aprovação

1. O comando termina com código zero.
2. O manifesto possui o mesmo número de arquivos do grafo local importado por `css/main.css`.
3. Cada arquivo copiado possui SHA-256 idêntico ao arquivo de origem.
4. Duas execuções sobre o mesmo checkout produzem o mesmo `aggregateSha256`.
5. O inventário e o snapshot são revisados antes da extração de tokens.
