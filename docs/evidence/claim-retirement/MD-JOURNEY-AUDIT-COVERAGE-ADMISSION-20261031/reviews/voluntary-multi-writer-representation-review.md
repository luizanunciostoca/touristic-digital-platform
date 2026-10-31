# VOLUNTARY — representação de autoria material e transporte

**Conclusão:** dois escritores independentes com o mesmo delta material de `fc089` não cabem honestamente no contrato atual. Um único escritor material é uma representação possível somente se o fechamento do inventário confirmar que o controller e o Native foram canais de controle/transporte e não mantiveram um segundo worker ou WIP independente. A distinção deve aparecer expressamente na proveniência, sem inventar uma sessão conjunta.

## Autoridade consultada

Código canônico em `d979b9813c1ab40b96dee64616b9f7d08a7c0d07`; os três arquivos consultados são byte a byte iguais no candidato `fc089a1fcef27e3c39f3c3d27faf4f69b088436b`. A base da claim é `c33b7b6ccd20e66f5ec0e75e91b5fc60a249eac9`. Não foi emitido snapshot fresco, nonce, recibo ou declaração pessoal.

## Por que dois escritores são incompatíveis

O validador exige simultaneamente:

1. Cada writer possui backup próprio e ACK próprio.
2. Cada entrada WIP aponta para um único `backupIndex`; o `path` deve ser único em todo o inventário.
3. Em cada backup, todos os paths owned diferentes entre a base da claim e o head do writer, ou entre esse head e o snapshot, precisam aparecer nas entradas WIP daquele backup.

Para dois writers em `fc089`, os cinco paths abaixo seriam obrigatórios em ambos os backups. Duplicá-los viola `VOLUNTARY_DUPLICATE`; atribuí-los a somente um backup deixa o outro em `VOLUNTARY_WIP_PATH_OMITTED`. O mesmo ocorre se os dois backups apontarem para o mesmo commit. A assinatura do proprietário não altera essa verificação.

- `.morro/ownership.json`
- `tooling/ci/test-impact-manifest.json`
- `tooling/ci/journey-audit-admission.test.mjs`
- `.morro/changesets/MD-JOURNEY-AUDIT-COVERAGE-ADMISSION-20261031.json`
- `.github/workflows/auth-login-browser-contract.yml`

Fontes: `claim-retirement-proof.mjs`, linhas 235–255, 264–290 e 1022–1075. O teste de dois writers, linhas 2209–2258 de `claim-retirement-proof.test.mjs`, é negativo: o recibo do segundo writer foi guardado no backup do primeiro. Seus heads coincidem com a base; ele não prova suporte positivo a delta compartilhado. O teste de linhas 1926–1976 confirma a exigência das duas pernas do delta, inclusive edições revertidas.

## Fatos que distinguem os papéis atuais

| Ator | Papel demonstrado pelos registros | Limite |
|---|---|---|
| `/root/autoridade_e_codigo` | Autor material no workspace da claim, candidato `fc089`; task `SUBMITTED`, leases `RELEASED`. | Ainda precisa de ACK real e contemporâneo na hora do fechamento. |
| `/root` | Controller, revisor independente e coordenador da publicação. | Não há uma segunda autoria material demonstrada nos registros inspecionados; isso não prova sozinho inventário global fechado. |
| Native / #3453 | Transporte imutável do bundle via bare store, verificações e push guardado do SHA exato. | Foi uma escrita de ref remota, sem worktree ou edição de source; o resultado histórico não prova ausência atual de outros comandos. |

O job #3453 terminou com exit 0 em 2026-10-31T17:30:06Z. O código da requisição não cria um checkout nem executa implementação. O recibo de execução existente deve ser preservado com atribuição real ao Native, sem apresentá-lo como recibo VOLUNTARY do autor cloud.

- Job: https://github.com/luizanunciostoca/morro-termux-control/issues/3453
- Resultado: https://github.com/luizanunciostoca/morro-termux-control/issues/3453#issuecomment-6546770361
- SHA-256 canônico do request: `e9623f89930289edc558cec622f683c1888678e03705c4ce8159c4a82c449eb1`.

Os seis precedentes VOLUNTARY do ledger têm um writer e distinguem executor/controller. Eles sustentam a separação dos papéis, mas não autorizam transformar dois escritores reais em um. O contrato não define explicitamente todos os casos de transporte; a interpretação de um autor material com controller separado deve continuar declarada como inferência apoiada pela proveniência.

## Representação recomendada, condicionada ao inventário verdadeiro

Manter um registro do escritor material real, com sua sessão cloud, identidade canônica, branch/head/tree reais e apenas seus command IDs. `jobId` permanece null se não houve job de autoria cloud. Não colocar a sessão Native no campo da autora nem inventar um executor composto. O `controllerIdentity` registra o controller real.

Preservar em arquivo adicional, também incluído no backup e no WIP, a proveniência do controller e do transporte: request/result #3453, locais do bare store/cache, canais capazes de publicar na branch, e confirmação real de que não existem comandos ou filhos pendentes para esta claim. Esse documento complementa o inventário; não serve para ocultar um worker material independente.

Antes de formar o pedido definitivo, confirmar:

- No second material worker, divergent worktree, independent owned edits or pending generation exists for this claim.
- Every controller and publication channel that can resume this claim has no pending command/child and remains stopped for this claim until canonical release.
- The source author acknowledges stopped/drained state with actual timestamps and actual observed commands.
- All material, real history, external proposal, actual receipt and provenance are durably backed without changing the frozen five owned blobs.
- The owner reviews the closed inventory and personally provides the exact consent required by the canonical VOLUNTARY mechanism.

Se a enumeração identificar dois writers materiais reais ou se o fechamento exigir tratá-los como writers independentes, não há encoding válido demonstrado. A saída exige uma mudança de governança separadamente admitida para WIP compartilhado ou outra transição já canônica que o suporte; não cabe ajustar o validador dentro da claim submetida para liberar a própria tarefa. Não usar head antigo, prefixos artificiais, recibos de terceiros ou omissão de escritor.

## Escopo da parada e limites

A parada se aplica a escritas, comandos e filhos da tarefa de cobertura submetida. Leitura, revisão e análise externa autorizada podem continuar. Nenhum teste ou validador foi reexecutado nesta análise; a incompatibilidade foi derivada diretamente das regras determinísticas do código. Nenhuma mutação externa, snapshot novo, nonce, backup ref ou atestação pessoal foi criado.

Registro detalhado com hashes e evidência: `/workspace/scratch/f024a80a7385/remediation/plans/coverage-impact-correction/voluntary-multi-writer-representation-review.json`.
