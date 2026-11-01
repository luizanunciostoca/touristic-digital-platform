# Revisão independente das fontes canônicas — preparação voluntária

**Resultado: PASS documental, somente preparação.** Main capturada: `693543a39eb4a3923668cc0005883daee9bbc5a0`. Revisão registrada em `2026-11-01T02:00:25.138Z`. Este parecer não executa nem autoriza liberação, coleta do provedor, consentimento pessoal, testes ou gates.

## Fontes e integridade

Foram materializadas 12 fontes exatas em `source/`, com **671880 bytes** no total. Cada tamanho, SHA256 e Git blob SHA1 foi recalculado e corresponde ao FETCH fixado na main. O inventário completo está em `source-manifest.json` (SHA256 `0f9283cf9b3fd71333fa5c409b56edb853438cf17c3f6afbcc59d872114d8c8d`). O JSON de revisão registra cada caminho, identidade e comparação.

As bibliotecas necessárias para uma futura validação pura são `tooling/fabric/claim-retirement-proof.mjs`, `tooling/fabric/claim-guard.mjs`, `tooling/mdctl/claim-lifecycle.mjs`, `tooling/mdctl/changeset-v2.mjs` e `tooling/mdctl/event-ledger.mjs`. A inspeção estática confirmou que todos os imports relativos desses cinco módulos estão presentes e que os demais são built-ins Node. Nenhum módulo foi importado ou executado nesta revisão. `mdctl.mjs` está preservado como fonte documental do roteamento da CLI; seu grafo separado de scheduler/task/control-state não está completo neste espelho. Ele também possui guarda de invocação direta — não foi caracterizado como execução incondicional no import.

## PRs integrados e mudança efetiva

| PR | Merge confirmado | Efeito revisado |
|---|---|---|
| #1339 | `65f743f075edb433c10ea2849306fe125229dd43` em `2026-11-01T01:36:44Z` | Leitura dos blobs do WIP em lotes ordenados de no máximo quatro, com `Promise.allSettled`; duas definições de regressão e três ajustes de metadados da claim da correção. |
| #1340 | `693543a39eb4a3923668cc0005883daee9bbc5a0` em `2026-11-01T01:45:43Z` | Apenas três metadados: remove a claim da correção do registro ativo, acrescenta os eventos MERGED/CLAIM_RELEASED e projeta seu manifest para MERGED. |

Cada lote iniciado é drenado antes da validação dos resultados em ordem do inventário. Uma falha interrompe a progressão antes do próximo lote ou do readback final do backup. Permanecem a leitura por item, inclusive blob SHA repetido em caminhos distintos, os tombstones, tipo/mode/SHA, tamanho/hash dos bytes, ancestralidade, refs antes/depois, receipts e consentimento.

O paralelismo beneficia o caminho HTTP assíncrono; o fallback `gh` síncrono permanece serial. A revisão não mediu um novo tempo de coleta e não garante sucesso em até 60 segundos. As novas definições de testes foram lidas, sem execução ou recertificação dos resultados históricos.

## Formato e janelas preservados

| Regra atual | Resultado da inspeção |
|---|---|
| Coleta do provedor | Máximo **60 s** do início à última observação de main; sem extensão. |
| Snapshot e autor parado | Snapshot e `drainedAt` com idade máxima de **1 h**; `requestedAt ≤ acknowledgedAt ≤ drainedAt ≤ snapshotAt ≤ now`. |
| Consentimento pessoal | Máximo **30 min**, posterior ou igual ao snapshot, marcador exato, um OWNER pessoal, comentário não editado, revogação ausente e releituras exigidas. |
| HTTP fetch | Timeout individual de **15 s** preservado. |
| Pedido | Schema 1, campos fechados, JSON compacto até **65.536 bytes**, até 32 writers/receipts, 512 itens WIP e 16 backups; mesmos digests e identidades. |

A região de `validateVoluntaryReleaseRequest` é byte-idêntica à base histórica d979: 7310 bytes, SHA256 `50d27eda741f8f2f15577068feb3ae12ef6bca9dba617c9ed412f7ad217fb804`. A delimitação inclui o espaço entre essa função e a próxima declaração exportada. `claim-lifecycle`, `claim-guard`, `changeset-v2`, `event-ledger` e `mdctl` também permanecem byte-idênticos. O novo pedido deve usar **exactBaseSha = `693543a39eb4a3923668cc0005883daee9bbc5a0`**; a base antiga e consentimentos expirados não se tornam válidos com a correção de desempenho.

## Claims na main capturada

**Cobertura:** `MD-JOURNEY-AUDIT-COVERAGE-ADMISSION-20261031` continua no registro ativo com status **IMPLEMENTING**, manifest **IMPLEMENTING**, base `c33b7b6ccd20e66f5ec0e75e91b5fc60a249eac9` e expiração `2026-11-01T23:00:00.000Z`. Seu registro e manifest são idênticos aos de d979; digest canônico `4d4b0748ae7209892eaa924d17ddc3e2d3ebff7dbee2e42c4a46cd651b5801e0`. Não há evento CLAIM_RELEASED dessa claim no ledger capturado.

**Correção do coletor:** `MD-RETIREMENT-BLOB-CONCURRENCY-20261101` já não está no registro ativo. O manifest está **MERGED**; os eventos MERGED/CLAIM_RELEASED têm `observedAt = 2026-11-01T01:37:37.109Z`, com base na integração material #1339. Esses metadados foram integrados pelo #1340 às 01:45:43Z; o horário do evento e o horário do merge são distintos.

## Limites para o próximo pacote

O pacote novo precisa de ACK factual atual da autora original, inventário delimitado de comandos/filhos e backup descendente de `dc7f5e3a22d88256639e6e699f894e9bf82ff268`, preservando os **112 itens anteriores** sem sobrescrever bytes, modes, pedidos, ACKs, consentimentos ou resultados históricos. Essa nova preservação ainda será revisada separadamente. O canal histórico do controlador de lifecycle deve continuar integralmente atribuído e distinguido da autora material; um censo local delimitado não prova ausência global de comandos ou WIP.

Não houve execução de coletor, import de módulo, validação funcional, teste, gate, lifecycle/retire/release, publicação, merge, deploy ou criação de filhos. O parecer não representa consentimento nem pedido novo. Se a main mudar, a nova autoridade precisa ser recapturada.
