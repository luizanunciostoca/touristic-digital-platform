# Local release gates

O repositório agora possui `pnpm release:gates`, um executor reproduzível de verificações locais. Ele não substitui GitHub Actions nem evidencia deploy, sandbox de provedor ou aprovação operacional.

Quando o `pnpm check` for conhecido por consumir memória ou exceder o tempo operacional, a execução pode usar `pnpm release:gates --skip-check`. Esse argumento registra explicitamente que o gate pesado foi pulado; não transforma o resultado em `CHECK_PASSED`.

O runner executa os checks já configurados no `package.json` e marca comandos ainda não configurados como `NOT_CONFIGURED`. Smokes externos ou dependentes de infraestrutura podem terminar como `BLOCKED_OR_NOT_CONFIGURED`, mantendo a execução dos demais checks independentes. Essa semântica evita afirmar que Mercado Pago, Render, browser E2E ou migração MySQL foram validados quando a infraestrutura correspondente não está presente.

O smoke de Ticketing em `tooling/ticketing/browser-contract.test.mjs` verifica a superfície pública estática e o contrato de handoff do browser: inventário, reserva, checkout canônico, confirmação, obtenção do ingresso, cancelamento de hold, autenticação same-origin e rejeição de handoff inconsistente. Ele é um contract smoke local, não um teste Playwright contra um ambiente implantado.

O caminho recomendado para evidência local é:

```text
pnpm release:gates --skip-check
```

A execução histórica completa de `pnpm check` informada para este repositório — 37 tarefas, 331 testes MySQL e 374 testes browser — permanece evidência anterior registrada; não é repetida automaticamente neste fechamento para evitar OOM ou demora improdutiva.
