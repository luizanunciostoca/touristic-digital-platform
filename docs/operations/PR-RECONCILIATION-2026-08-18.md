# PR reconciliation — 2026-08-18

## Baseline

A referência de reconciliação é `main@19d35bf6906ec6e71c8ebbb4ecfb640db80948e4`. A análise foi feita contra a linhagem atual do repositório e não assume que um PR draft seja evidência de integração em produção.

| PR   | Decisão                                                | Justificativa operacional                                                                                                                  | Estado conhecido                                                                                            |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| #264 | **Superseded/closed**                                  | A fundação de Affiliates e a documentação-base já estão na main pela linha M154; manter o branch stacked duplicaria a autoridade.          | Fechado como superseded.                                                                                    |
| #268 | **Superseded/closed**                                  | A linha Platform é ancestral/precedente da linha Payments #293; não deve ser reintegrada separadamente.                                    | Fechado como superseded.                                                                                    |
| #285 | **Sobrevivente, branch stale localmente reconciliada** | Governance/quality foi rebaseado sobre o head atual de #286, preservando os scripts da main e consolidando o Quality Gate.                 | Commit local rebaseado; publicação rejeitada por falta de permissão GitHub `workflows`.                     |
| #286 | **Sobrevivente**                                       | Restauração de Quality/Governance é independente da linha de Payments.                                                                     | Branch remoto atualizado e mergeability reportada como limpa.                                               |
| #288 | **Sobrevivente, base corrigida**                       | A documentação final não deve depender do #264 fechado.                                                                                    | Branch forçado para a main atual; base `main`, sem commits adicionais além do baseline quando reconciliado. |
| #289 | **Sobrevivente**                                       | Mantém a linha documental final e deve ser integrada somente após a verdade documental ser atualizada.                                     | Draft; mergeability previamente limpa.                                                                      |
| #293 | **Sobrevivente/candidato técnico**                     | Contém a linha de Platform necessária e adiciona o adapter Mercado Pago/Render; recebeu hardening de amount/currency em terminal outcomes. | Branch remoto atualizado com o commit `e2cd6ca7`; ainda draft.                                              |

## Ordem de integração

A ordem operacional recalculada é: primeiro atualizar/decidir #285 e #286 como a linha de governança; depois integrar ou substituir a documentação #288/#289; em seguida revisar #293 com os gates externos de Mercado Pago/Render; por fim aplicar a implementação de Affiliates da branch técnica candidata após confirmação do contrato de Ordering e Financial em ambiente integrado.

## Limitações de publicação

O conector usado nesta execução não possui permissão `workflows`; por isso o push da branch rebaseada de #285 foi rejeitado pelo GitHub. Uma segunda branch técnica de Affiliates foi commitada localmente (`5ed10d02`), mas o token disponível na sessão não foi aceito para publicação dessa branch. Nenhuma dessas limitações deve ser representada como integração concluída na main.
