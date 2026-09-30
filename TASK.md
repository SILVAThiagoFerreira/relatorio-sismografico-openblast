# TASK
Implementar análise auditável do modelo e exemplos, configuração, preparação modular, editor de campos/tabelas/fotos/legendas, geração DOCX fiel, armazenamento de projetos, testes estruturais, revisão visual dos documentos e site desktop/mobile, repositório dedicado e deployment GitHub Pages verificado por geração real.

Preparação implementada: `python main.py --config config.json` valida o DOCX local, cria uma cópia de publicação sanitizada, gera `pages/assets/template-manifest.json` e registra log. O original nunca é alterado nem publicado. A sanitização limpa valores variáveis antigos e o responsável anterior, substitui os pixels de assinatura por um PNG transparente e preserva o slot para nova assinatura. Configuração inclui posições, sanitização, limites e visual; alterar configuração exige regenerar manifesto e executar os testes Python.

- Acomodar até três desmontes, fotos adicionais, legendas, dados de coordenadas em múltiplos parágrafos e anexos de plano apenas ou plano/temporização/histograma por tipo de desmonte.

No modo de Anexo I somente com plano, não copiar o retângulo vazio reservado à seção de temporização.

A conclusão fica vazia e opcional, para não afirmar resultados sem revisão técnica. O operador informa os dados do novo responsável e pode anexar a própria assinatura.
