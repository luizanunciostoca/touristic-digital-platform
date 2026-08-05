# Engineering Handbook

## Regra principal

A V1 é a baseline funcional, visual e comportamental. A decisão padrão é preservar. Substituição exige ADR, evidência de equivalência e plano de rollback.

## Limites de dependência

- `apps/*` podem depender de `packages/*`.
- `packages/*` não podem depender de `apps/*`.
- `core` não depende de outros pacotes internos.
- `shared` oferece primitivas sem lógica de domínio.
- `design-system` preserva e generaliza a linguagem visual da V1.
- `geospatial` encapsula Mapbox, rotas e fallbacks; consumidores não acessam provedores diretamente.

## Definition of Done

Uma alteração só está concluída quando possui tipagem estrita, testes proporcionais ao risco, documentação atualizada, CI verde, segurança revisada e evidência de que não descaracteriza a V1.

## Migração

Cada onda deve registrar origem, destino, dependências, contrato de equivalência, baseline visual, comportamento observado, métricas, rollback e aprovação em PR.

## Multi-destino

Diferenças de destino devem viver em configuração, conteúdo e branding. Não é permitido duplicar aplicações para incorporar regras específicas que possam ser parametrizadas.
