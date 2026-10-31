# Readback remoto independente da renovação

**PASS: 52/52 itens WIP verificados diretamente no GitHub. A atestação pessoal do proprietário está ausente; nenhuma liberação foi executada.**

Foram realizadas 76 leituras GET na janela **2026-10-31 22:28:40 UTC a 2026-10-31 22:29:54 UTC**. As quatro refs permaneceram iguais antes e depois. A leitura incluiu cinco commits, cinco árvores recursivas completas, os 52 blobs únicos, claim, manifest, PR de aquisição, comentários e identidade do proprietário.

| Identidade | Resultado remoto |
|---|---|
| Nova ref | `refs/heads/archive/audit-coverage-renewal-20261031-222400-f25b97cd` |
| Commit | `08ede13aa6e7028c826335986a94ab98c6b1cdd8` |
| Árvore | `1da9ede636b875aa0d2656db0dde7e33b88522bb` |
| Pai | `23870e2376903139188a04118a306542ffbf68aa` |
| Pai do backup anterior | `fc089a1fcef27e3c39f3c3d27faf4f69b088436b` |
| Main | `d979b9813c1ab40b96dee64616b9f7d08a7c0d07` |
| Fonte material | `fc089a1fcef27e3c39f3c3d27faf4f69b088436b` |
| Digest da claim | `4d4b0748ae7209892eaa924d17ddc3e2d3ebff7dbee2e42c4a46cd651b5801e0` |
| Digest canônico do pedido | `04133e7876940a9ad616176f70b0e7d02c349ee45be926d4b20e25fa955e9a2e` |
| Recibo renovado — blob | `0f5ed808d40895ec85a09909397bc1f2e79071e9` |
| Recibo renovado — SHA-256 | `3c034c2282d8f558ee09b5ff4674ef59817d33b66433eaed00dc135e1dbae97d` |

As árvores remotas demonstram **15 adições arquivísticas novas**, os **32 arquivos anteriores inalterados** e os **cinco blobs owned preservados**. O inventário cobre integralmente os deltas owned e os 47 arquivos arquivísticos, sem caminhos duplicados. O backup novo descende do material por dois commits arquivísticos; essa conclusão usa os pais retornados diretamente pelas APIs.

Para cada um dos 52 blobs, foram recalculados localmente o SHA-256, o SHA-1 do objeto Git e o tamanho em bytes a partir do conteúdo remoto. Caminho, modo, tipo e identidade também conferem com a árvore remota. O recibo possui exatamente o schema fechado `{schemaVersion, writer, receipt}` e corresponde aos fatos do pedido: STOPPED, zero comandos e zero filhos pendentes; solicitação às 22:21:36 e ACK/drenagem às 22:22:24 UTC.

Os **124 controles** passaram. Claim e manifest permanecem iguais, com estado IMPLEMENTING. O PR 1336 está integrado e a página completa de comentários continuou vazia: **não existe consentimento pessoal observado**. Esta leitura não executou o coletor de retirement nem transição de tarefa ou claim.

## O que está pronto e o que falta

O backup remoto está comprovado. Depois da revisão do controller, o pedido pessoal pode usar o novo marker em `owner-review-current.md`, sujeito aos estados continuarem iguais e à validade **antes de 23:22:24 UTC de 31/10/2026**. O comentário pessoal deve ter até 30 minutos. O coletor canônico deverá conferir novamente identidades, estados, horários e eventual revogação. Nenhum consentimento é presumido.

`completion.json`, `HANDOFF.md`, `owner-review.md` de pré-publicação, pedido e bundle conservaram os hashes congelados. O pedido antigo das 18h permanece expirado. Se a janela nova vencer, é necessária outra renovação factual; não se deve editar timestamps históricos.

Os bytes brutos estão separados em `remote-readback-raw/` e devem permanecer fora do ZIP documental. O JSON deste parecer contém somente identidades, hashes, resultados, URLs e limites. As observações de processos continuam limitadas à visibilidade documentada; elas não substituem a atestação pessoal de completude global exigida pelo [protocolo](https://github.com/luizanunciostoca/touristic-digital-platform/blob/d979b9813c1ab40b96dee64616b9f7d08a7c0d07/tooling/fabric/claim-retirement-proof.mjs).
