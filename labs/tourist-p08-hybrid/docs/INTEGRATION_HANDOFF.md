# P08 híbrida — contrato de integração futura (NÃO EXECUTADO)

## A. Autoridades observadas na main

SHA de referência da `main`: `37eb641eefa91f57d8d74c1dc87894c2da36f3ae`. Mudar o SHA invalida este handoff até nova recaptura.

| Boundary existente | Código verificado / função | Ação futura permitida sob flag OFF |
|---|---|---|
| Home | `apps/morro-digital-platform/src/home/home-discover-navigation.ts`: `action === "saved"` abre Assistant com `favorites`; ação também aparece no perfil | Interceptar APENAS `saved` se P08 flag ON, abrindo o painel. Preservar caminho antigo se flag OFF. Não alterar fluxo `tours`. |
| Assistant | `apps/morro-digital-platform/src/assistant/assistant-domain-adapter.ts`: `favorites` e operações por texto; `packages/assistant/src/user-profile.ts`: `favoritePlaces` associados majoritariamente ao nome | Reutilizar o mesmo serviço P08 como port de favorito por ID canônico. Não manter nova lista independente e não migrar nomes sem associação unívoca + opt-in. |
| State | `src/ux/tourist-experience-snapshot.ts`: preserva modo/categoria/Place/câmera/idioma/sheet e contexto | Fazer painel não modal, estado `savedPanelOpen` meramente apresentacional e retorno ao snapshot, sem reset de câmera/Assistant. |
| Place | `src/map/place-bottom-sheet.ts`: peek/half/full e ações contextuais | O comando "Salvar" chama o serviço apenas para `placeId` canônico validado. Não habilitar em Place legado sem identidade confirmada. |
| Destino | Home existente é Morro-específica; nova arquitetura multi-destino prevista | Consumir o `destinationId` do runtime owner. Jamais presumir Morro fixo em operação canônica. Troca de destino isola favoritos e contexto. |
| Commerce/Financeiro | Fora de escopo | P08 não altera nem confirma preços, ingressos, reservas, pagamentos, XP, comissões ou payouts. |

## B. Ordem técnica de um FUTURO PR de integração (não autorizado agora)

1. Recapturar `main` exata e registrar prints reais aprovados em 320,360,390,430,768,844x390,1440; fluxos `saved`, `tours`, Place e Assistant.
2. Definir authority matrix: usuários não autenticados (sessão x persistente com consentimento); autenticados (owner canônico e auth), expiração e deleção dos dados.
3. Validar o endpoint de favoritos ou construir domain owner separado com `userId`, `destinationId`, `placeId` únicos, autorização contextual, antirreplay/idempotency key e readback. Nenhum POST pela fixture do laboratório.
4. Criar adapters TS V2 que compõem `SavedPlacesService` com Auth/Domain Owner no ponto de entrada; feature flag `P08_HYBRID_ENABLED=false` no default; não injetar chaves ou segredos em `VITE_*`.
5. Conectar o botão existente `Salvos` e ação homóloga no perfil ao `mountSavedHybrid`, montando o painel no mesmo shell em vez de duplicar a Home. Sob flag OFF, comportamento existente permanece inalterado.
6. Conectar **o mesmo serviço** ao `favorites` handler do Assistant; `createAssistantSavedContext` exige ação explícita. Somente encaminhar detalhes verificados a navegação, chat inteligente ou rotas. Resposta em fixture jamais deve ser enviada como resposta real.
7. Para perfis antigos, produzir relatório `inspectLegacyAssistantFavorites`, vincular à projeção canônica e solicitar confirmação do usuário. Guardar itens ambíguos em revisão, sem duplicar nem eliminar histórico.
8. Garantir estados offline/sem sessão/sem permissão/conflito de abas: hóspedes podem salvar em sessão local; mutações remotas bloqueadas até leitura autoritativa após reconexão. Incluir exportação/exclusão e preferências de privacidade.
9. Comparar screenshots e métricas contra o baseline da Home aprovada; testar teclado, screen reader, touch ≥44, zoom 200%, RTL, rede lenta, volta de Place/Assistant/rotas, SW/offline e sete viewports, sem publicidade de produto fictício.
10. Rodar Quality e Security no SHA de integração, contrato de owner, smoke TEST-only no staging, cross-destination (Morro + Itacaré), rollback e revisão da aprovação visual; só então solicitar autorização de merge/publicação.

## C. Regras invariantes

- Ações `add/remove` por ID canônico; nome serve somente à apresentação.
- `source='guest'` não vira autoridade canônica só porque está no navegador; `source='owner'` requer readback válido.
- Nenhum fallback de nome para lugar semelhante, mídia errada ou rota estimada.
- Não gravar no perfil legado em paralelo por iniciativa deste módulo; um adaptador de migração exigirá idempotência e consentimento.
- One store, two read-only projections; nunca `localStorage` anônimo quando o usuário não autorizou persistência.
- Flags OFF até aprovação separada; sem modificações na main, nenhuma operação financeira e nenhum deploy.

## D. Declarações explícitas de não certificação

Os testes Node e Chromium deste pacote confirmam apenas **código e fixture isolados**. Não certificam que a API de favoritos exista, autenticação real, persistência MySQL, migração em produção, mapa real, Assistant com LLM ou checkout. O preview usa mapa ilustrativo, e o modo "owner" é em memória sem rede.
