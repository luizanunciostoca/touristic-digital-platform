# Branch Protection — Status and Configuration

## Current status

A proteção de `main` está ativa por meio do ruleset `main-release-protection` no repositório `luizanunciostoca/touristic-digital-platform`. O ruleset aplica-se à branch padrão e atualmente bloqueia deleção e non-fast-forward, exige pull request, exige o status `quality`, exige resolução de threads e exige uma aprovação independente. Aprovações obsoletas são descartadas quando novos commits entram. A lista de bypass está vazia.

O estado verificável em 26 de agosto de 2026 é:

| Regra                            | Estado                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Pull request antes do merge      | Ativo                                                                               |
| Aprovação independente           | 1 reviewer                                                                          |
| Dismiss de approval obsoleta     | Ativo                                                                               |
| Resolução de threads             | Ativo                                                                               |
| Status obrigatório               | `quality`                                                                           |
| Branch atualizada antes do merge | Política de status estrita ativa; confirmar regra equivalente na UI caso necessário |
| Force-push/non-fast-forward      | Bloqueado                                                                           |
| Deleção da branch                | Bloqueada                                                                           |
| Bypass actors                    | Nenhum                                                                              |
| Método de merge                  | `merge`                                                                             |

## Comando de inspeção

```bash
gh api repos/luizanunciostoca/touristic-digital-platform/rulesets/21205682 \
  --jq '{name,target,enforcement,conditions,rules,bypass_actors}'
```

O ID do ruleset pode mudar se a administração o recriar. Nesse caso, localize o ruleset pelo nome antes de editar e preserve as mesmas invariantes.

## Teste controlado obrigatório

A PR de hardening deste ciclo é a PR controlada. Ela deve produzir o job `Quality Gate / quality`, permanecer em um SHA explícito e exigir a aprovação de um reviewer independente. Não se deve testar a proteção com push direto, force-push, bypass ou merge administrativo. Se o teste revelar que o ruleset não bloqueia a operação esperada, pare a promoção e corrija a configuração administrativa antes de aceitar qualquer release.

## Governança de emergência

Uma exceção emergencial só pode ser temporária, nomeada, documentada e autorizada pelo owner do serviço. Depois da mitigação, remova a exceção, reexecute o Quality Gate no SHA final e registre o evento na evidência de release. O padrão permanente continua sendo PR obrigatório, uma revisão independente, status `quality` verde, threads resolvidas, sem bypass e sem force-push.
