# Pipeline

1. Ler `config.json` e iniciar log por execução.
2. Ler o modelo DOCX local e validar pacote OOXML, índices e estrutura.
3. Criar uma cópia em memória: limpar valores antigos de campos, dados pessoais de tabela, pixels da assinatura reservada e metadados pessoais do pacote, sem alterar o original.
4. Extrair o manifesto usando a cópia sanitizada como contrato e gravar modelo, manifesto e log.
5. No navegador, editar campos/tabelas, colar dados, acrescentar fotos e escolher composição do Anexo I para cada desmonte.
6. Validar valores e fotos, conferir SHA-256 do modelo publicado e gerar o DOCX no próprio navegador.
7. Verificar estrutura, partes fixas, tabelas, relações de imagem e renderização no Word.
8. Publicar apenas `pages/` e validar o site e uma geração real no endereço público.

`src/reader.py` lê a configuração e o pacote; `src/validation.py` verifica configuração, OOXML e índices; `src/sanitization.py` cria a cópia pública limpa; `src/processing.py` extrai o manifesto; `src/output.py` grava os artefatos; `src/run_logging.py` registra a execução. `main.py` apenas orquestra esses módulos. Os exemplos preenchidos e o DOCX-fonte permanecem locais.

Os testes cobrem sete tabelas, dezenove ocorrências de imagem, gráficos normativos fixos, dados pessoais removidos da cópia pública, hash do modelo, três desmontes, anexos completos e somente plano, células multiline, imagens ausentes e integridade das partes fixas.
