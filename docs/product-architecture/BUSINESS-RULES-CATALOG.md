# Business Rules Catalog — Touristic Digital Platform

## 1. Objetivo

Centralizar regras de negócio que devem ser preservadas, testadas e auditadas em toda a plataforma.

## 2. Destino e tenancy

- BR-DEST-001: todo dado operacional pertence a um destino.
- BR-DEST-002: todo dado privado empresarial também pertence a um tenant.
- BR-DEST-003: um tenant não pode ler ou alterar dados de outro tenant.
- BR-DEST-004: acesso cross-destination exige papel, escopo e auditoria.
- BR-DEST-005: o Core não contém nomes ou regras específicas de cidade.
- BR-DEST-006: novo destino nasce por configuração validada, não por cópia de aplicação.

## 3. Empresas e catálogo

- BR-CAT-001: empresa pode possuir múltiplas localizações físicas autorizadas.
- BR-CAT-002: área de serviço é distinta de localização física.
- BR-CAT-003: publicação exige dados mínimos, validação e autorização.
- BR-CAT-004: alterações empresariais ficam limitadas ao tenant correspondente.
- BR-CAT-005: conteúdo, preços e disponibilidade devem indicar origem e versão.

## 4. Marketplace

- BR-MKT-001: busca e descoberta respeitam destino e idioma atuais.
- BR-MKT-002: resultados indisponíveis ou expirados não podem ser apresentados como compráveis.
- BR-MKT-003: preço exibido no checkout deve ser revalidado no backend.
- BR-MKT-004: favoritos e histórico não autorizam acesso a dados privados.
- BR-MKT-005: rastreamento analítico deve minimizar dados pessoais.

## 5. Reservas e pedidos

- BR-BKG-001: reserva só é confirmada quando disponibilidade e política forem validadas.
- BR-BKG-002: concorrência de disponibilidade deve ser resolvida de forma transacional ou equivalente.
- BR-BKG-003: cancelamentos e no-show seguem política versionada aceita no momento da reserva.
- BR-ORD-001: pedido registra itens, preços, descontos, moeda e contexto imutáveis da transação.
- BR-ORD-002: operações repetidas usam idempotência.

## 6. Financeiro

- BR-FIN-001: valores monetários são armazenados em unidades mínimas e moeda ISO.
- BR-FIN-002: o ledger é a fonte de verdade financeira.
- BR-FIN-003: toda movimentação possui contrapartida, referência e trilha de auditoria.
- BR-FIN-004: provider de pagamento é adapter, não owner da regra de negócio.
- BR-FIN-005: webhooks são autenticados, idempotentes e resistentes a replay.
- BR-FIN-006: estorno e chargeback produzem reversões rastreáveis.
- BR-FIN-007: split e repasse não são calculados no frontend.
- BR-FIN-008: reconciliação compara ledger, provider e saldo operacional.

## 7. Afiliados

- BR-AFF-001: afiliados pertencem exclusivamente à plataforma.
- BR-AFF-002: sellers e tenants não administram afiliados próprios.
- BR-AFF-003: atribuição segue Afiliado → Cliente → compras elegíveis do Marketplace.
- BR-AFF-004: comissão é definida pela plataforma e versionada.
- BR-AFF-005: comissão só é consolidada após evento financeiro elegível.
- BR-AFF-006: estorno ou cancelamento pode reverter comissão.
- BR-AFF-007: carteira e payout possuem ledger e auditoria.
- BR-AFF-008: comportamento cross-destination é configurável e explícito.

## 8. Identidade e autorização

- BR-ID-001: autenticação não substitui autorização.
- BR-ID-002: sessão possui expiração, revogação e proteção segura.
- BR-ID-003: operações sensíveis exigem papel e escopo apropriados.
- BR-ID-004: ações administrativas registram ator, contexto, alvo e resultado.
- BR-ID-005: credenciais, tokens e secrets nunca são armazenados em texto aberto ou expostos ao cliente.

## 9. Geoespacial

- BR-GEO-001: PostGIS é a fonte de verdade para geometrias próprias.
- BR-GEO-002: inclusão territorial prefere polígonos ou multipolígonos.
- BR-GEO-003: raio é fallback ou medida de proximidade.
- BR-GEO-004: localização do usuário depende de consentimento e fallback manual.
- BR-GEO-005: providers externos não definem sozinhos a verdade de caminhos locais, escadas, vielas, cais ou rotas marítimas.
- BR-GEO-006: falha de provider deve possuir comportamento de contingência compatível com a jornada.

## 10. Conteúdo e internacionalização

- BR-CMS-001: conteúdo é versionado por destino e idioma.
- BR-CMS-002: publicação e preview possuem permissões distintas.
- BR-CMS-003: ausência de tradução usa fallback configurado e observável.
- BR-CMS-004: documentos legais preservam versão aceita pelo usuário.

## 11. Assistente e IA

- BR-AI-001: ações do assistente usam ferramentas autorizadas e contratos públicos.
- BR-AI-002: o assistente não grava diretamente em banco.
- BR-AI-003: respostas e ações respeitam destino, tenant, idioma e permissões.
- BR-AI-004: falha, timeout e indisponibilidade possuem fallback seguro.
- BR-AI-005: dados enviados a providers seguem minimização e política de privacidade.

## 12. Operação e observabilidade

- BR-OPS-001: logs sensíveis não exibem secrets ou dados pessoais desnecessários.
- BR-OPS-002: fluxos críticos possuem correlation ID.
- BR-OPS-003: falhas de pagamento, reserva, autenticação e integrações geram alertas apropriados.
- BR-OPS-004: configuração de destino é validada antes de ativação.
- BR-OPS-005: mudanças destrutivas exigem backup, rollback e aprovação.

## 13. Governança das regras

Cada regra deve possuir owner, testes, versão e referência às capacidades afetadas. Alteração incompatível exige ADR, migração e atualização deste catálogo.