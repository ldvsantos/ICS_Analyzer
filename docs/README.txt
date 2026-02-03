ICS ANALYZER SITE
=================

Estrutura do site:
- index.html          (Página principal)
- biblioteca.html     (Página de biblioteca e downloads)
- assets/
  - css/styles.css    (Estilos globais)
  - js/app.js         (Scripts básicos)

Como publicar no domínio:
1) Faça upload da pasta ics_analyzer_site para o servidor.
2) Garanta que index.html esteja na raiz do domínio configurado.
3) Mantenha os arquivos do software (ics_analyzer_pdf.html, ics_analyzer.html)
   no nível acima ou ajuste os links na biblioteca.

Observação:
- O site foi criado em HTML/CSS puro para máxima compatibilidade.
- Não depende de backend.
- Funciona com qualquer hospedagem estática.


ISPC reduzido (tuning, produção, qualidade)
=========================================

Os artefatos do ISPC reduzido que alimentam o dashboard e o runtime no navegador ficam em data/ispc e em docs/assets/js.
O refresh completo pode ser feito localmente com o script tools/ispc_refresh_dashboard_artifacts.py, que encadeia tuning, promoção ridge para produção, relatório de qualidade e alertas.

O processo também roda automaticamente no GitHub Actions, via workflow .github/workflows/ispc-refresh-artifacts.yml.


Release do desktop (Windows)
===========================

O workflow .github/workflows/desktop-windows-release.yml publica um release quando um tag do tipo vX.Y.Z é enviado.
Para disparar o build, a versão em desktop/package.json deve bater com a versão do tag.
