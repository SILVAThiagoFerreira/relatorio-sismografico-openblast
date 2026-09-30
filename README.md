# Relatório Sismográfico OpenBlast

Editor no navegador para preparar relatórios a partir do modelo R.334.r01. O operador preenche as tabelas, informa datas, adiciona fotos e ajusta as legendas. O site gera e baixa um DOCX, sem enviar os dados inseridos para servidor.

## Execução local

1. Instale Node.js e Python 3.
2. Instale as dependências de teste com `npm ci`.
3. Inicie um servidor HTTP na pasta `pages/` (por exemplo, `python -m http.server 4173 --directory pages`).
4. Abra `http://localhost:4173` no navegador.

O gerador usa JSZip e o visualizador usa docx-preview. As cópias distribuídas e suas licenças estão em `pages/vendor/`.

## Modelo e privacidade

O DOCX autoritativo permanece na pasta local `EXEMPLOS` e não é enviado ao repositório. `python main.py --config config.json` valida esse original e cria a cópia pública sanitizada em `pages/assets/template.docx`, além do manifesto e log. O sanitizador remove valores antigos de data, legendas, conclusões e propriedades pessoais do pacote, limpa nome/cargo/CREA anteriores e troca os pixels da assinatura por um PNG transparente. Estilos, páginas, quadros, certificados e a posição reservada para uma assinatura nova permanecem no modelo. Os exemplos preenchidos nunca entram no site.

O manifesto vincula o site ao SHA-256 da cópia sanitizada. A geração valida esse hash antes de alterar o DOCX. Cada relatório continua local no navegador até o operador baixar o resultado. No modo de Anexo I somente com plano, o gerador omite também o retângulo vazio que o modelo reserva à temporização.

## Estrutura e qualidade

- `main.py` só orquestra a leitura, validação, sanitização, manifesto, saída e log.
- `config.json` define campos, tabelas, imagens, intervalos repetíveis, visual, limites e regras de sanitização.
- `src/` contém os módulos da preparação Python.
- `pages/` contém a interface, validador e gerador OOXML do lado do cliente.
- `tests/` verifica o contrato, a sanitização, os arquivos DOCX e casos com um a três desmontes.

Comandos de verificação: `python main.py --config config.json`, `python -m unittest discover -s tests/python -v` e `npm test`.

O site usa a barra grafite, vermelho Enaex, hexágonos e tipografia compacta da referência OpenBlast, com adaptação para celular. Consulte `SPEC.md`, `DATA_SCHEMA.md`, `PIPELINE.md` e `TASK.md` antes de alterar o contrato.
