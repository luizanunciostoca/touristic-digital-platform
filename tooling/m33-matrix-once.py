from pathlib import Path

path = Path("docs/migration/ASSISTANT-MIGRATION-MATRIX.md")
text = path.read_text()
lines = text.splitlines()
output = []
updated = False

for line in lines:
    if line.startswith("| Mensagens — DOM/UI"):
        output.append(
            "| Mensagens — DOM/UI                    | `assistant-messages.js`    | app V2                                                                                                          | PASS       | pipeline conectado ao DOM; áreas, clear, dedupe, sanitização, scroll, classes/metadata e opções dinâmicas cobertos por testes            |"
        )
        updated = True
    else:
        output.append(line)

if not updated:
    raise SystemExit("M33 matrix source row not found")

section = """
## Estado do milestone M33

O M33 conecta o `message-pipeline.ts` já validado ao DOM real do Assistente. `assistant-message-dom.ts` passa a materializar os contratos V1 de áreas `messages`/`navigation`, limpeza, deduplicação temporal, prioridade, supressão de mensagens de navegação fora da área correta, classes, IDs, `data-message-type` e scroll para a mensagem mais recente. O runtime deixa de adicionar mensagens diretamente e passa a utilizar essa fronteira para entradas do usuário, respostas do Assistente e estados do microfone.

`assistant-dom-view.ts` preserva apenas o pequeno subconjunto de formatação observado nas respostas auditadas (`b`, `strong`, `em` e quebras de linha) e escapa qualquer outro markup, inclusive scripts, imagens e tags com atributos executáveis. As opções retornadas pelos handlers voltam a ser materializadas como botões clicáveis; após a seleção, o valor é reenviado pelo evento `morro:assistant-option-selected`, mantendo o mesmo pipeline de processamento usado pelas opções iniciais.

As regressões unitárias verificam a fronteira de sanitização e o Quality Gate completo valida lint, typecheck, suíte integral e build. O `Assistant Voice Browser Contract` também permanece verde, comprovando que o novo lifecycle visual não regrediu síntese, microfone, preferências ou fallback. Com isso, `Mensagens — DOM/UI` passa a `PASS`.

A FEATURE-0004 / MIG-0006 ainda não está integralmente equivalente. Permanecem o delivery físico dos assets de fotos e a paridade visual completa do shell do Assistente, incluindo os estados observáveis de abertura, minimização e composição final da interface.
""".strip()

if "## Estado do milestone M33" not in text:
    output.extend(["", section])

path.write_text("\n".join(output) + "\n")
