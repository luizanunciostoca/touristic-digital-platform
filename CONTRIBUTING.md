# Contributing

## Fluxo de contribuição

1. Crie uma branch a partir de `main`.
2. Implemente mudanças pequenas e coesas.
3. Atualize documentação e contratos afetados.
4. Execute formatação, lint, análise de dependências, typecheck, testes e build.
5. Abra um Pull Request descrevendo contexto, decisão, riscos e validações.
6. Não faça merge com checks obrigatórios falhando.

## Definition of Done

Uma mudança só está concluída quando:

- atende aos critérios funcionais;
- respeita as fronteiras arquiteturais;
- contém testes adequados;
- não introduz dependências cíclicas;
- preserva isolamento por `destinationId` e `tenantId`;
- atualiza contratos e documentação;
- possui observabilidade compatível com o risco;
- não expõe segredos ou dados pessoais;
- passa pelo pipeline de qualidade.

## ADRs

Crie um ADR quando a decisão:

- afetar múltiplos módulos ou aplicações;
- introduzir tecnologia estrutural;
- alterar persistência, segurança ou integração;
- criar nova fronteira de domínio;
- possuir impacto relevante de longo prazo.

ADRs devem registrar contexto, decisão, alternativas, consequências e status.

## Segurança

Nunca inclua credenciais, tokens, dados pessoais reais ou segredos no repositório. Falhas de autorização, isolamento, pagamentos e privacidade bloqueiam merge.
