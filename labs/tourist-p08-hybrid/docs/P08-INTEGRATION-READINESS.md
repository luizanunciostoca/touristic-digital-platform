# P08 — plano de integração controlada (SEM alterações na aplicação atual)

**Aprovação do usuário:** opção híbrida, painel de Salvos na Home com acesso conversacional pelo Assistant; sem redesenhar a Home, recolocar quick actions/FAB ou alterar o legado.

## Fronteiras existentes verificadas na `main` 37eb641e…

- `apps/morro-digital-platform/src/home/home-discover-navigation.ts`: `saved` hoje despacha `morro:assistant-open-request` + `morro:assistant-option-selected` `favorites`. Manter Assistant como entrada alternativa. No futuro, alterar SOMENTE a composição nova da Home, sob flag inicialmente OFF, para o botão Salvos abrir painel; o botão contextual do painel deve solicitar o mesmo intent no Assistant. Não alterar a navegação dos demais botões.
- `apps/morro-digital-platform/src/assistant/assistant-domain-adapter.ts`: o intent favorites e as mutações atuais usam o profile legado. Implementar adapter compatível que consulte o módulo único; **não** manter gravação concorrente independente após a ativação. O contexto só circula por solicitação explícita.
- `packages/assistant/src/user-profile.ts`: `favoritePlaces` legado guarda nome/categoria/posição sem ID canônico. Sua inspeção é somente leitura. Converter apenas registros com vínculo unívoco do mesmo destino e consentimento do titular; os demais ficam pendentes e nunca são apagados automaticamente.
- `apps/morro-digital-platform/src/ux/tourist-experience-snapshot.ts`: a navegação preserva centro/zoom/bearing/pitch e place/categoria/idioma; uma futura versão deve acrescentar o estado transitório do painel, **sem** salvar dados sensíveis no snapshot nem conflitar com controles peek/half/full do Place.
- `apps/morro-digital-platform/src/map/place-bottom-sheet.ts`: o botão salvar/remover futuro chama o **mesmo** serviço. Manter mapa e sheet atuais. Nenhuma rota real é iniciada sem recuperar o Place canônico de `destinationId+placeId` e autorização apropriada.
- `apps/morro-digital-platform/public/tourist-shell-v2.css`: incorporar estilos aditivos e escopados **após** screenshot de comparação validado; preservar tokens, compositor e touch targets atuais; nenhum componente genérico da Interface Fabric deve substituir a identidade aprovada.

## API do owner (requer projeto e aceite de contrato, NÃO existe aqui)

`GET saved-places?destinationId=…` deve retornar resposta autenticada, revision monotônica, `ownerVerified=true`, IDs canônicos, estado por destino e escopo de usuário. Mutação `POST/DELETE` somente sob capability `favorites.write`, CSRF, idempotency-key estável por tentativa, antifraude/rate limiting e readback autoritativo. Divergência 409 ou timeout preserva estado não confirmado: nunca reexecutar pagamentos ou navegação em cascata. Campos de referência limitados a `destinationId,placeId,category,name`, sem coordenadas/URL legadas como autoridade.

**Não gerar endpoint nem editar backend atual apenas para fazer o preview passar.** O owner de favoritos e o contrato versionado devem ser estabelecidos antes de binding. Qualquer migração ou sincronização cross-device precisa de plano específico de consentimento, conflict resolution e reversão.

## Gates que faltam antes de qualquer integração

- [x] P08 híbrida aprovada; um store e dois acessos.
- [x] Módulos isolados, testes Node 22 e casos fail-closed desenvolvidos.
- [x] Preview real HTML/CSS/JS isolado e matriz Chromium 7 resoluções; 4 idiomas e RTL.
- [x] Screenshots com SHA-256 e sem solicitações externas; servidor read-only local testado separadamente.
- [ ] Recapturar `main` **imediatamente antes** de uma proposta de integração; se o SHA mudar, rever contracts e sobreposição.
- [ ] Localizar ou implementar e aprovar owner canônico real para favoritos; provar autorização, IAM, CSRF, escopo, monotonicidade, idempotência e persistência.
- [ ] Criar adapters TypeScript na **futura candidata de integração**, atrás de flag OFF, sem duplicar storage.
- [ ] Prova com dados autorizados: convidado / autenticado / migração legada consentida / duas abas / dois destinos / offline→online / timeout / 409 / owner indisponível.
- [ ] Comparar lado a lado com screenshot aprovado da Home da `main`, em 320/360/390/430/768/844-landscape/1440 + zoom 200%, teclado, leitor de tela, WebKit/Firefox e safe areas.
- [ ] Provar ausência de regressões no mapa, Place peek/half/full, categorização, Assistant dock, voz e modal, rotas e i18n no ambiente composto.
- [ ] Rodar quality/security/integration E2E no exact-head, revisão de diffs, rollback e ativação canário somente após novo aceite. **Não há autorização atual para merge/deploy.**
