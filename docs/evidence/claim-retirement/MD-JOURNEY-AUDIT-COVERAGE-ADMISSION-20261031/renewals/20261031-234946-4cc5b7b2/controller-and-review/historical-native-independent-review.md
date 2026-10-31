# Revisão independente do histórico Native e do escopo de lifecycle

**Decisão: há fundamento canônico para preservar este canal como execução histórica de governança, separado da autora de implementação.** Isso não admite um novo pedido nem libera a claim. A decisão é específica aos artefatos recuperados, às identidades verificadas e ao escopo de três metadados.

Revisor: `/root/runtime_evidencias`. Registro: `2026-10-31T23:47:29.352087+00:00`. Base lida: `d979b9813c1ab40b96dee64616b9f7d08a7c0d07`. Claim: `MD-JOURNEY-AUDIT-COVERAGE-ADMISSION-20261031`.

## Fundamento da classificação

`tooling/mdctl/mdctl.mjs` separa as rotas `claim` e `task`. A rota de tarefa adquire leases ao iniciar e os libera ao submeter, mantendo a tarefa local `SUBMITTED`. A rota de retirement coleta a evidência depois do snapshot/ACK e constrói uma transição própria: o evento é emitido por `ORCHESTRATOR`, o estado material permanece inalterado e os únicos alvos são registro de claims, ledger e manifesto. Não há abertura de task nem aquisição de lease de implementação nessa construção.

Essa separação também é aplicada pelas provas: `local-fast-gate.mjs` reconhece a retirada de uma claim e exige os três paths exatos antes de retornar sua prova específica; `merge-gate.mjs` retorna a rota de retirement antes da rota de aquisição/implementação. Portanto, geração desses metadados pelo controlador depois do ACK é parte da operação de lifecycle prevista pelo contrato. Não é, por si só, retomada da implementação sob a claim.

A conclusão é uma inferência operacional sustentada por essas rotas e pelo conteúdo concreto, não uma exceção inventada ao formato do inventário. A regra que exige executor/controlador enumerado e o inventário fechado permanecem intactos. O controlador não recebe a identidade da autora original: os jobs e arquivos de governança precisam conservar atribuição própria.

## O que efetivamente aconteceu

| Job | Resultado histórico | Alcance da prova |
|---|---|---|
| 3459 | exit0; collect/build às23:01:51.275UTC; JSON e Git blob publicados | Gerou três saídas de retirement. Não foi mero transporte; não integra a transição em main. |
| 3460 | exit1; dependências não encontradas | Interrompeu antes de admission/certify e antes do push. |
| 3461 | exit1; tarball ausente em instalação offline | Interrompeu antes da prova e antes do push. |
| 3462 | exit125; AUTH_EXEC_RUNTIME_FAILED no certify | Sem aprovação de admissão/certificação; o trecho de push não foi alcançado. |
| 3463 | exit0; probes Native/Debian | Diagnóstico de runtime, com readback do candidato limpo. |
| 3464 | exit0; plano governance/HIGH/NON_RUNTIME | Identificou os três metadados; plano não equivale a admissão. |
| 3465 | exit2; VOLUNTARY_CONSENT_TIME_INVALID | Readiness passou; a admissão foi recusada. |
| 3466 | exit0; 432 testes passaram | Suíte isolada; não equivale a admission/certify completos ou publicação. |

Os oito digests canônicos dos requests coincidem com os preflights e resultados capturados. Cada issue informa três comentários e o respectivo arquivo contém três. Isso vincula os registros capturados; não afirma ausência de atividade posterior em outros canais.

## Identidade e diferença de formatação preservada

O coletor recuperado contém **618.804 bytes**, SHA256 `9f11cbd6a18ce81dea50f72f2ee5fc3b02d07cbebe25b86c394ee9baddbda7cd`, Git blob `296c6be7388fa144310d1755cf94fd3a8755da82`. Seu request é igual ao pedido antigo congelado, digest `04133e7876940a9ad616176f70b0e7d02c349ee45be926d4b20e25fa955e9a2e`.

O candidato histórico é `e78f891eaea58ce850d154426420ea5e0c3dcdc1`, árvore `98d1f5b4b861684ec6495d983e0d272ef4960d42`, pai `d979b9813c1ab40b96dee64616b9f7d08a7c0d07`. A inspeção recuperou exatamente os três paths de governança. **Ledger e manifesto são byte-idênticos ao coletor; claims.json tem formatação diferente e JSON semanticamente idêntico.** Não há afirmação de igualdade de bytes dos três arquivos.

A alteração remove só a claim alvo, preserva o prefixo do ledger e acrescenta um `CLAIM_RELEASED`. No manifesto, muda apenas baseSha/branch; o estado continua IMPLEMENTING. A preparação canônica formata arquivos JSON após a escrita (`prepareClaimLifecycleMutation`), portanto a diferença de formatação é compatível com essa preparação, sem identificar por si só qual comando histórico a produziu. A primeira comparação que encontrou a diferença continua preservada.

Bundle: **6.771 bytes**, SHA256 `4cf01dd154b864e665566864f64d15b0710bf176462795923aaec27bfc7e2d91`. A inspeção de candidato está em `historical-native/candidate-exact-output-inspection.json`, SHA256 `6e56140be8ea7703f17adf67c2783284bcdb7aadd5d61e0ea954c17835adc9a9`.

## Inventário Native3468 e limites

A execução3468 terminou exit0 em **23:41:12UTC** e vincula seu request ao digest `0412e4f732e4386f45581255f3cd3538707d5d0ce1aed623c7992152f10babc7`. Recuperou dois clones limpos do mesmo candidato e o cache do coletor; registrou hashes de20 arquivos nos três diretórios observados. O ref remoto exato do retirement retornou404 naquele instante.

O censo contou22 entradas; inspetor e ancestrais listados foram excluídos da inspeção de cwd/cmdline. Não encontrou processo que correspondesse aos roots/marcadores exatos e não registrou leitura inacessível nesse recorte. Isso não cobre todos os dispositivos, contas ou canais externos. Os dez PIDs não legíveis da observação cloud da autora continuam sendo um limite separado, não apagado pelo censo Native.

O inventário do controlador, SHA256 `45797c696f60ce54f8efcbabd5c18136701b330b9989abed54a7f30579ece5a1`, registra main d979, material fc089 e backup08ede inalterados; declara ausência de comandos materiais próprios pendentes e mantém os dois filhos de preparação identificados como ativos, sem autoridade material. Os jobs abertos não relacionados não foram encerrados nem declarados drenados.

## Consentimento histórico e prazo atual

O comentário6550135699 foi criado e atualizado em **22:44:06UTC**. A coleta histórica ocorreu às23:01:51.275, dentro dos30min. Seu prazo pessoal terminou às **23:14:06**, antes da recusa3465 às23:20. Esse prazo é distinto do limite geral do ACK antigo, **23:22:24**. O comentário foi descoberto na revisão posterior; ele não é novo consentimento e não pode migrar para outro digest/nonce/pedido.

## Representação recomendada e condição de bloqueio

Preservar a autora original `/root/autoridade_e_codigo` como escritora da implementação fc089 e revelar integralmente o canal do controlador/Native como histórico de lifecycle: saídas, bundle, comandos, resultados, diagnósticos, caches e a falha de admissão. Esses artefatos podem ser arquivados com sua origem própria; isso não os transforma em material criado pela autora nem substitui o manifesto original.

A unicidade global de `wipInventory.path` e a cobertura por backup são exigências reais. Se aparecer um segundo escritor de implementação com versão própria do mesmo manifesto, não se pode renomear, omitir ou consolidar o path para passar. Nesse caso o pedido deve ficar BLOCKED. A evidência concreta revista sustenta a distinção porque o candidato é exclusivo da transição de lifecycle, não porque duas versões seriam inconvenientes ao schema.

Qualquer diff fora dos três metadados, abertura/migração de task, lease de implementação, escrita material não declarada, identidade desconhecida ou comando material pendente exige reavaliar a conclusão. Esta revisão não cria request, nonce, receipt, aprovação, claim, pacote ou autorização de escrita. Nenhum teste, coletor ou liberação foi executado por este revisor.

## Arquivos da revisão

O JSON ao lado contém hashes dos arquivos examinados, resultados individuais dos jobs, referências de código fixadas em d979 e limites da observação. As fontes históricas permanecem intactas. O parecer permite continuar a preparação factual; o eventual pedido completo ainda precisará de sua própria revisão de identidade, inventário, frescor e prova remota.
