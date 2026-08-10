from pathlib import Path

path = Path("docs/migration/ASSISTANT-MIGRATION-MATRIX.md")
text = path.read_text()
lines = text.splitlines()
output: list[str] = []

for line in lines:
    if line.startswith("| location/photos/price/hours"):
        output.append(
            "| location/photos/price/hours           | `intent-engine.js`         | `src/intent-engine.ts` + `src/domain-handlers.ts`                                                               | PARTIAL    | geolocalização, preço, hours e copy PT/EN/ES/HE conectados; assets binários de photos ainda pendentes                                    |"
        )
    elif line.startswith("| nearby/favorites/help"):
        output.append(
            "| nearby/favorites/help                 | `intent-engine.js`         | `src/intent-engine.ts` + `src/domain-handlers.ts`                                                               | PASS       | browser adapters, catálogo V1 + geolocalização e copy/opções PT/EN/ES/HE cobertos por testes unitários e de integração                   |"
        )
    elif line.startswith("| Handlers de domínio do diálogo"):
        output.append(
            "| Handlers de domínio do diálogo        | `assistant-dialog.js`      | `src/domain-handlers.ts` + portas do `src/dialog-controller.ts`                                                 | PARTIAL    | handlers e i18n PT/EN/ES/HE conectados sem drift de metadata; assets binários de photos ainda impedem equivalência integral               |"
        )
    else:
        output.append(line)

if "## Estado do milestone M32" not in text:
    output.extend(
        [
            "",
            "## Estado do milestone M32",
            "",
            "O M32 conclui a camada observável de internacionalização dos handlers de domínio do Assistente sem criar um segundo estado de idioma. `assistant-domain-copy.ts` centraliza copy e opções para PT/EN/ES/HE, enquanto `assistant-domain-adapter.ts` reutiliza `intent.entities.language` como fonte de verdade para localização, fotos, preço, horário, detalhes, favoritos e ajuda. `assistant-nearby-adapter.ts` aplica a mesma fonte ao fluxo de categoria, permissão e resultados próximos.",
            "",
            "O contrato genérico de `awaiting_place` em `@touristic/assistant` passa a receber o `request` original, permitindo localizar a pergunta antes de delegar ao adapter sem acoplar o pacote de domínio ao browser. Os metadados observáveis existentes foram preservados deliberadamente: o idioma altera texto e opções, mas não acrescenta campos novos aos payloads de domínio já consumidos pela V2.",
            "",
            "As regressões cobrem o dicionário completo e integração real dos handlers em inglês, espanhol e hebraico, além da preservação do comportamento em português. Com isso, `nearby/favorites/help` passa a `PASS`. O agrupamento `location/photos/price/hours` e a linha geral de handlers permanecem `PARTIAL` exclusivamente porque os assets binários de fotos da V1 ainda não estão disponíveis na V2; esse gap será tratado separadamente.",
            "",
            "A FEATURE-0004 / MIG-0006 ainda não está integralmente equivalente. Permanecem como principais frentes os assets observáveis de fotos e o lifecycle/UI completo de mensagens e shell do Assistente.",
        ]
    )

path.write_text("\n".join(output) + "\n")
