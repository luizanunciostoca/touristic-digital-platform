# Platform Manifest

## Propósito

A Touristic Digital Platform existe para permitir que destinos turísticos operem experiências digitais completas sem duplicação de código, sem acoplamento a cidades específicas e sem perda de autonomia operacional, visual ou comercial.

## Missão

Fornecer um núcleo confiável, extensível e multi-destino para turismo, comércio local, reservas, ingressos, pagamentos, afiliados, conteúdo, geolocalização e operação administrativa.

## Visão

Ser a infraestrutura digital de referência para destinos turísticos, começando pelo Morro Digital e evoluindo para múltiplas localidades com governança, segurança, observabilidade e qualidade de nível de plataforma.

## Princípios imutáveis

1. O core não conhece cidades específicas.
2. Todo dado operacional relevante pertence a um `Destination`.
3. Todo dado privado de empresa pertence também a um `Tenant`.
4. Nenhum app acessa internals de outro app.
5. Nenhum frontend importa lógica de domínio autoritativa.
6. Financial Core é ledger-first, auditável e reversível por lançamentos compensatórios.
7. Afiliados pertencem à plataforma, nunca às empresas.
8. Integrações dependem de contratos públicos e adapters.
9. Segurança, privacidade e isolamento bloqueiam merge quando violados.
10. Toda decisão estrutural relevante deve ser registrada em ADR.
11. Todo comportamento crítico deve ser testável e observável.
12. Nenhuma otimização justifica quebrar isolamento, rastreabilidade ou integridade.

## Princípios de engenharia

- Domínios explícitos e fronteiras verificáveis.
- Dependências unidirecionais.
- Contratos versionados.
- Eventos idempotentes e rastreáveis.
- Infraestrutura substituível por adapters.
- Código específico de destino limitado a `destinations/<slug>/`.
- Mudanças pequenas, revisáveis e reversíveis.
- Automação obrigatória para qualidade, segurança e arquitetura.

## Princípios de produto

- A experiência deve parecer nativa de cada destino.
- Geografia e contexto local devem orientar descoberta e operação.
- O turista nunca deve precisar entender a complexidade da plataforma.
- Empresas devem operar com autonomia dentro de limites claros.
- O Platform Admin deve preservar visão global sem romper isolamento.

## Princípios de UX

- Clareza antes de novidade.
- Mobile-first e acessível.
- Feedback explícito para estados de carregamento, sucesso e erro.
- Recuperação segura antes de bloqueios irreversíveis.
- Personalização por destino sem fragmentar o design system.

## Princípios financeiros

- Dinheiro é representado em unidades mínimas inteiras.
- Lançamentos financeiros não são apagados.
- Operações críticas são idempotentes.
- Conciliação é parte do produto, não tarefa manual posterior.
- Comissões, taxas e splits são regras versionadas e auditáveis.

## Proibições

- Regras com nomes de cidades em módulos compartilhados.
- Consultas operacionais sem `destinationId` quando aplicável.
- Acesso direto entre bancos de aplicações.
- Imports entre apps.
- Dependências cíclicas.
- Segredos no repositório.
- Mutação destrutiva de ledger ou auditoria.
- Eventos sem versão.
- Código de integração dentro do domínio.
- Exceções cross-destination sem autorização e auditoria.

## Critério de decisão

Quando houver dúvida, prevalece a opção que melhor preserva:

1. isolamento;
2. integridade;
3. simplicidade operacional;
4. auditabilidade;
5. substituibilidade;
6. experiência por destino;
7. evolução incremental.

## Status

Documento P0. Alterações exigem ADR, revisão arquitetural e atualização do Blueprint.
