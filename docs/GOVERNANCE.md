# Governança de Documentação

## Fonte oficial por tipo de informação

### GitHub

O repositório `luizidebook/touristic-digital-platform` é a fonte oficial para:

- código-fonte;
- arquitetura de software;
- ADRs;
- contratos e eventos;
- padrões de engenharia;
- segurança técnica;
- testes e qualidade;
- operação, observabilidade e recuperação;
- documentação versionada junto à implementação.

### Google Drive

O Google Drive é a fonte principal para:

- visão estratégica;
- modelo de negócio;
- planejamento executivo;
- processos comerciais e operacionais;
- materiais colaborativos;
- manuais de negócio;
- apresentações e documentação não vinculada diretamente ao código.

## Regra de precedência

Quando houver conflito sobre comportamento técnico implementado, o repositório e seus ADRs prevalecem. Quando houver conflito sobre estratégia, posicionamento, operação ou regras de negócio ainda não implementadas, o documento executivo aprovado no Google Drive prevalece até ser convertido em contrato técnico ou ADR.

## Sincronização

Toda decisão de negócio que alterar arquitetura, contratos, segurança, persistência ou integrações deve gerar atualização correspondente no GitHub. Toda decisão técnica com impacto executivo deve ser refletida no índice mestre do Google Drive.
