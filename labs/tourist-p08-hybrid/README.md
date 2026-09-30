# MORRO DIGITAL — P08 Híbrida (laboratório isolado)

**STATUS: PRONTA PARA AVALIAÇÃO EM LABORATÓRIO, NÃO INTEGRADA.** Esta pasta reúne o código executável da **P08 Híbrida**, aprovada pelo usuário: painel visual de lugares salvos na Home **e** consulta dos mesmos favoritos pelo Assistant. As duas superfícies utilizam **um só** `SavedPlacesService`; somente uma projeção fica aberta visualmente por vez, preservando o composer do Assistant na Home.

## Limites inegociáveis

- Os arquivos aqui são novos e isolados. **Nenhuma** edição dos arquivos atuais `apps/`, `packages/`, `services/`, `public/legacy/**`, nenhuma migração de banco, merge ou deploy.
- O preview possui Mapbox e estabelecimentos **ilustrativos**, não mapa real. Toda simulação é identificada na tela. O preview HTTP aceita somente GET/HEAD em loopback, CSP `connect-src 'none'` e bloqueia escritas e traversal. Não é endpoint da aplicação.
- Nunca equiparar nome legado a `placeId` sem matching canônico inequívoco **e** confirmação explícita do usuário. A identidade é `(destinationId, placeId)`, com isolamento Morro / Itacaré.
- Usuário visitante: armazenamento apenas na sessão até consentimento explícito para persistência local. Os dados locais não conferem autorização para roteamento nem confirmação de inventário.
- Usuário autenticado: `OwnerBoundary` está preparado para readback e comandos idempotentes, mas o endpoint real de favoritos **não foi encontrado nem vinculado**. Nenhuma confirmação otimista; `ownerVerified` somente mediante readback do owner autorizado.
- Assistant só recebe lista quando a pessoa expressamente solicita; o payload compartilhado **não** produz previsão de proximidade, rota ou resultados sem geolocalização e owner verificados.
- Os componentes usam `textContent` e bloqueiam HTML injetado no conteúdo demonstrativo.

## Estrutura

`src/identity.mjs`: identidade canônica, validação e formato de armazenamento; `src/service.mjs`: coleção única observável e estados; `src/owner-port.mjs`: barreira do owner; `src/legacy-bridge.mjs`: inspeção migratória não automática; `src/assistant-bridge.mjs`: contexto explícito para o Assistant; `src/surfaces.mjs`: painel e projeção do Assistant; `preview/`: HTML/CSS/JS reais da demonstração; `tests/`: contratos e cenários negativos; `tools/`: servidor read-only, matriz Playwright e auditoria de compatibilidade; `evidence/browser`: manifesto SHA-256 no repositório. Os 21 PNGs originais do browser são entregues no **ZIP complementar de evidências**, sem adicionar binários pesados à branch.

## Executar

Com Node 22, a partir desta pasta: `node --test tests/*.test.mjs` e `node tools/preview-server.mjs`. O servidor escuta **apenas** `127.0.0.1:42187` e serve somente arquivos do laboratório. Para a matriz automatizada, instale Python Playwright e Chromium e execute `python tools/browser_matrix.py`. A captura do navegador utiliza inline HTML/CSS/JS **idênticos aos arquivos** porque o Chromium do ambiente de testes bloqueia navegação localhost; o HTTP local é auditado separadamente. Consulte o campo `method` do manifesto antes de interpretar as capturas.

## Gate: o que está demonstrado x o que não está

Validado isoladamente: identidade, destino, segurança dos comandos, readback simulado, persistência consentida, estados de conflito/offline, migração apenas consultiva, textos pt-BR/en/es/he, painel↔Assistant sobre a mesma fonte, atalhos de foco/Escape, responsividade do preview, proteção de URL/métodos, conteúdo anti-HTML.

**Não validado/integrado:** interface turística real com Mapbox; backend autorizado real para favoritos e sincronização autenticada; equivalência visual com o screenshot da Home aprovada; testes completos de dispositivos físicos/WebKit/Firefox; operações reais de localização, roteamento, pagamento ou sincronização entre dispositivos. A ausência dessas provas deve permanecer explícita na futura PR de integração.

Veja `docs/P08-INTEGRATION-READINESS.md` para os gates exatos. Status esperado: `ISOLATED_LAB_CERTIFIED / REAL_SYSTEM_INTEGRATION_PENDING` após a prova exata da branch e do manifesto.

## Certificação do candidato híbrido (P08)

Código-fonte reproduzível, sem acesso a API real: 72 testes unitários Node 22, 8 resoluções/72 capturas de interação Playwright com execução inline, 7 resoluções/21 capturas do script anterior e 10 testes da fronteira HTTP do preview. O script adicional exige Python Playwright e Chrome: `python3 tools/browser-qa.py --out /tmp/p08-evidence`. Consulte `evidence/isolated-certification.json`. Os PNGs completos não integram a branch de código: são entregues no pacote visual separado; os manifests de hash permanecem versionados. Nenhuma das duas coleções de screenshots representa a Home de produção.
