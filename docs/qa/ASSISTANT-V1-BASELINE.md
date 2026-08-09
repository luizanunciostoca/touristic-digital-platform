# Assistente Digital — baseline V1 congelada

**Feature:** FEATURE-0004  
**Migração:** MIG-0006  
**Origem:** `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`  
**Raiz V1:** `js/assistant/**`  
**Destino V2:** `packages/assistant`

## Objetivo

Congelar, antes da implementação funcional da V2, os comportamentos observáveis e os invariantes arquiteturais do Assistente Digital da V1. Este documento é um checkpoint de referência; ele **não** declara equivalência da MIG-0006.

## Contrato do menu principal

A V1 expõe dez opções canônicas, com valores semânticos estáveis e rótulos traduzidos:

<!-- prettier-ignore -->
| # | Valor | PT | EN | ES | HE |
|---|---|---|---|---|---|
| 1 | `beaches` | Praias | Beaches | Playas | חופים |
| 2 | `restaurants` | Restaurantes | Restaurants | Restaurantes | מסעדות |
| 3 | `hotels` | Pousadas | Hotels | Hoteles | מלונות |
| 4 | `shops` | Lojas | Shops | Tiendas | חנויות |
| 5 | `transport` | Transporte | Transport | Transporte | תחבורה |
| 6 | `attractions` | Atrações | Attractions | Atracciones | אטרקציות |
| 7 | `tours` | Passeios | Tours | Paseos | סיורים |
| 8 | `nightlife` | Vida Noturna | Nightlife | Vida Nocturna | חיי לילה |
| 9 | `emergencies` | Emergências | Emergencies | Emergencias | מקרי חירום |
| 10 | `help` | Ajuda | Help | Ayuda | עזרה |

Os valores acima vêm de `MAIN_MENU_OPTION_VALUES` da V1 e são o contrato, não apenas o texto visual.

## Pipeline de entendimento

O motor V1 executa NLP/intents localmente como primeira camada. O fallback LLM só deve ser necessário quando a intenção local não atingir confiança suficiente ou quando a entrada exigir interpretação semântica mais complexa.

Invariantes congelados:

- motor local primeiro;
- fallback LLM abaixo de confiança `0.5`;
- análise especial para entradas longas a partir de `90` caracteres;
- suporte a `modifiers` para intenções compostas;
- sugestões e contexto em PT, EN, ES e HE;
- intents de alto valor incluem `navigate`, `cancel_navigation`, `open_now`, `weather`, `my_location`, `photos`, `price`, `hours`, `more_info`, `nearby`, `favorites`, `help`, `confirm`, `deny`, `greeting` e `thanks`.

## Estado e contexto

O estado central exposto pela V1 inclui `lastTopic`, preferências de praia/restaurante e preferências de voz. A migração deve preservar o comportamento observável do contexto sem reproduzir acoplamentos globais desnecessários.

## Voz e idiomas

A árvore congelada contém uma camada de voz substancial (`voiceSystem`, `voiceAssistant`, `enhancedVoice`, suporte específico para hebraico, vozes premium e speech). A V2 deve preservar a capacidade multimodal e o comportamento multilíngue em PT/EN/ES/HE, mas pode reorganizar a implementação internamente.

## Integração com Navigation

A V1 possui integração direta entre mensagens/diálogo do assistente e navegação. Como a MIG-0005 já foi migrada para `packages/navigation`, a V2 deve consumir o contrato público de Navigation; não deve reintroduzir dependências no legado de mapa/navegação.

## Boundary do provedor de IA

A equivalência funcional **não autoriza** copiar credenciais de provedor para o browser. A V2 deve manter a relação funcional `/api/ai/*` por um boundary same-origin/server-side. Segredos de provedor no cliente são explicitamente proibidos neste baseline.

Isso é uma correção arquitetural de segurança permitida porque preserva o comportamento observável sem preservar uma exposição de credenciais.

## Manifesto de fontes congeladas

O manifesto machine-readable está em:

`docs/qa/attachments/FEATURE-0004-v1-baseline.json`

A representação executável está em:

`packages/assistant/src/v1-baseline.ts`

Os principais blobs V1 estão fixados por SHA, incluindo controlador de diálogo, intent engine, fallback LLM, sugestões proativas e a pilha de voz.

## Teste executável

`tests/assistant-v1-baseline.test.ts` valida automaticamente:

1. commit V1 congelado;
2. dez opções canônicas e sua ordem;
3. quatro idiomas;
4. prioridade do NLP local e thresholds de fallback;
5. intents críticas;
6. integração com Navigation/voz;
7. boundary server-side e proibição de segredos de provedor no cliente.

O teste é anexado ao `pnpm test` raiz para participar do Quality Gate sem introduzir ainda um `package.json` para `packages/assistant`. Isso evita alterar o lockfile apenas para o checkpoint de baseline. O package workspace completo será criado junto com a primeira implementação funcional da MIG-0006.

## Critério para avançar

Este checkpoint só pode ser considerado aprovado quando o head do PR passar integralmente:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm architecture:check
pnpm features:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Após isso, o próximo passo é decompor a MIG-0006 em matriz de equivalência e implementar o primeiro slice funcional do `packages/assistant`, sem marcar FEATURE-0004 como `equivalent` antes de todos os contratos estarem comprovados.
