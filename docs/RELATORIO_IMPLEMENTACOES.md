# Relatório de implementações

Este documento descreve as implementações adicionadas ao ICS Analyzer na data de 27 de janeiro de 2026, com foco na evolução do sistema para suporte à decisão em conservação do solo. O núcleo do sistema permaneceu centrado no cálculo do Índice de Cobertura do Solo, enquanto novas camadas de monitoramento foram acopladas para incorporar forçantes ambientais e produzir indicadores operacionais de risco.

## Escopo técnico e premissas

O sistema preserva a lógica de leitura em campo baseada em frações horizontais e verticais no retículo, de modo que cada ponto é calculado por $ICS_i = H_i \cdot V_i$ e a média da unidade amostral é obtida por $\bar{ICS} = \sum ICS_i / n$. A métrica de cobertura percentual é derivada por $\%\,Cobertura = 100 \cdot \bar{ICS}$. A partir dessa base, os novos módulos introduzem uma leitura mecanística de exposição, de modo que a fração de solo potencialmente exposta à energia de impacto e ao escoamento superficial é representada por $Exposi\u00e7\u00e3o = 1 - \bar{ICS}$.

## Ideia 3 integrada ao sistema

A integração climática foi implementada como um módulo opcional que obtém chuva diária e temperatura média em um intervalo definido pelo usuário a partir de latitude, longitude e datas. O acoplamento foi desenhado para não bloquear o uso do sistema em condições offline, uma vez que o cálculo do ICS não depende desse passo e o modelo de risco pode operar apenas com as entradas locais quando os dados climáticos não estiverem disponíveis.

A saída do módulo climático consolida descritores que são operacionais para monitoramento de conservação do solo, especificamente chuva total no período, chuva acumulada nos 7 dias finais, chuva acumulada nos 30 dias finais e o máximo de chuva diária. Esses termos capturam a condição antecedente de umidade e um proxy de intensidade, aumentando a capacidade do sistema de explicar por que uma mesma cobertura pode ter implicações distintas sob regimes pluviométricos diferentes.

## Ideia 1 integrada ao sistema

Foi implementado um escore de risco de erosão potencial com natureza explicável e conservadora, mantendo prioridade para a interpretação de mecanismo. O risco é construído por uma combinação ponderada entre um termo de chuva antecedente, um termo de exposição derivado de $1-\bar{ICS}$, um termo de declividade e um termo de susceptibilidade relativa por textura, com reforço adicional quando o máximo diário de chuva é elevado, pois isso tende a concentrar energia erosiva em eventos curtos e intensos.

O resultado é expresso como um escore de 0 a 100 acompanhado de uma classe interpretativa, permitindo priorização rápida de intervenção em campo. O modelo não substitui uma parametrização completa do tipo RUSLE, porém entrega um indicador de triagem que é operacional em campanhas de monitoramento e já orienta decisão de manejo com base na interação cobertura, topografia e clima antecedente.

## Ideia 2 integrada ao sistema

Foi adicionado um painel de indicador composto orientado a monitoramento, no qual o sistema sintetiza proteção e estabilidade espacial em um único número de fácil comunicação. A composição privilegia a cobertura média como componente dominante e incorpora penalizações por variabilidade, representadas pelo coeficiente de variação e pela amplitude, pois alta heterogeneidade aumenta a probabilidade de hotspots de escoamento e transporte seletivo de partículas.

Quando a calibração geométrica do campo visual está informada, o sistema também estima a área exposta em metros quadrados, convertendo o resultado de percentuais em uma métrica diretamente acionável, particularmente útil para comparar unidades amostrais e monitorar progressão de cobertura ao longo de ciclos de manejo.

## Alterações de interface

A interface do sistema passou a aceitar entradas adicionais de textura do solo e declividade, além de um bloco opcional para coordenadas geográficas e período climático. Também foi incluído um botão para busca de dados climáticos, com integração automática aos resultados apresentados e persistência dos valores para uso posterior na exportação.

## Persistência de resultados

Os resultados avançados foram integrados ao objeto de dados gerado após o cálculo, incluindo exposição, risco, indicador composto e métricas climáticas quando disponíveis. Essa persistência garante consistência entre visualização na interface e exportação, evitando discrepância entre o que é observado na tela e o que é documentado no relatório.

## Exportação em PDF

O relatório em PDF foi estendido para incluir, quando disponíveis, os campos de textura e declividade, além das métricas climáticas e do escore de risco de erosão potencial. As novas linhas são adicionadas de forma condicional para evitar poluição visual quando o usuário não preencher o módulo opcional.

## Arquivos modificados

As alterações de interface foram realizadas no arquivo docs/sistema.html. A lógica do sistema, incluindo cálculo, integração climática, indicadores de risco e extensão do PDF, foi implementada no arquivo docs/assets/js/ics_analyzer_pdf.js.

## Estado atual

A implementação está funcional e não introduz dependências adicionais além do acesso à internet quando a consulta climática for acionada. O sistema continua operacional sem clima e com o fluxo de cálculo do ICS intacto, enquanto as novas camadas ampliam a capacidade de quantificar impacto e suportar decisão, particularmente para priorização de áreas sob maior sensibilidade à erosão.
