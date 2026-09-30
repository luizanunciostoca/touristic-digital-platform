# Matriz de evidências P08 híbrida

## Suite executada isoladamente

- Node 22 — `node --test tests/*.test.mjs`, incluindo validação canônica, escopo por destino, consentimento, cross-tab conflict, idempotência, confirmação owner por readback, offline, falhas, Assistant, migração bloqueada e fallback.
- Chromium headless — `python3 tools/browser_matrix.py`, sem solicitações externas e com HTML/CSS/JS do laboratório executados por inlining devido às restrições de rede do container.
- Matriz de viewport: 320×720, 360×800, 390×844, 430×932, 768×1024, 844×390, 1440×900; screenshots de painel e Assistant em cada tamanho.
- Casos adicionais: retorno entre Morro e Itacaré (apenas fixtures), alternância pt-BR/en/es/he + RTL, owner simulated com readback, offline bloqueado, injeção HTML escapada, Escape, restauração de estado, hit targets ≥44, composer visível.
- HTTP real no localhost: GET/HEAD 200, POST/PUT/PATCH/DELETE 405, traversal 403, URL malformada 400 e processo sobrevive ao erro.

Evidências detalhadas com hashes encontram-se em `evidence/browser/BROWSER_MATRIX.json` e nas PNGs do pacote de evidências. O JSON não é prova de E2E no aplicativo real nem substitui acessibilidade axe ou inspeção visual humana de todas as combinações.

## Gatilhos ainda obrigatórios antes da integração

- [ ] Resolver contrato de dados e autenticação do owner real (ainda não confirmado em `main`).
- [ ] Política explícita de consentimento e eliminação/extracão de favoritos locais, legal/privacy review.
- [ ] Migração user-profile name-only controlada e auditável.
- [ ] UI híbrida integrada sob feature flag em preview candidato isolado com Main V2 real; sem preservar a fixture como UI final.
- [ ] Coverage E2E Mapbox real + Places canônicos + Assistant + rota a partir dos salvos.
- [ ] Playwright real no bundle servido com import map e sem a limitação de inlining.
- [ ] Axe/WCAG real, zoom, leitor de tela, Samsung Android e Safari/Firefox.
- [ ] Testes E2E de persistência MySQL em ambiente seguro, cross-destino e cross-conta.
- [ ] Qualidade/Segurança no SHA congelado e rollback testado.
- [ ] Aceitação visual da Home real e autorização explícita de merge/deploy.

## Recertificação estendida (sem composição no produto)

Nos arquivos de código do laboratório, Node 22 concluiu **72/72 testes PASS**. Um segundo script reprodutível, `tools/browser-qa.py`, executou o HTML, CSS e JavaScript reais do preview por inlining em **8 viewports**, capturou **72 screenshots** (9 cenários por resolução) e validou atualização Home ↔ Assistant, foco após Escape/remover, segregação Morro/Itacaré, idioma hebraico RTL, guest/owner de fixture e bloqueio offline, sem overflow horizontal ou sobreposição de painel/dock. O servidor HTTP isolado passou **10/10** verificações de GET/HEAD, bloqueio de POST/PUT, traversal e URL malformada. Execução real do aplicativo integrado não ocorreu; screenshots completos acompanham o ZIP de evidências entregue ao usuário. Hashes: `evidence/browser-extended/browser-proof.json`, `evidence/browser/BROWSER_MATRIX.json`; relatório consolidado: `evidence/isolated-certification.json`.
