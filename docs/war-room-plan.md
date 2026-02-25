# War Room - Plano Tecnico Pratico

## Objetivo
Ferramenta local de vantagem competitiva para CS2, com parsing de demo, enriquecimento de dados e analise tatico-competitiva orientada a decisao.

## Stack atual implementada
- Frontend: Vite + React
- Backend: Node + Express
- Parser: @laihoe/demoparser2 (nativo no backend)
- Contrato: Zod schema para match
- Analytics: modulo dedicado (RIS, Trade, Pressao, Economia, Consistencia)

## Arquitetura atual
- `apps/api/server.js`: API `/api/parse`, `/api/analyze`, `/api/health`
- `packages/parser/index.js`: normalizacao e extracao de match estruturado
- `packages/analytics/index.js`: metricas competitivas
- `packages/shared-types/matchSchema.js`: validacao de contrato
- `docs/match-model.json`: exemplo de payload

## RIS (Round Impact Score)
RIS por evento (base):
- kill: +0.9
- first kill (opening): +1.8
- trade kill: +1.0
- morte sofrida: -0.6
- multiplicador rounds criticos (12,15,24,match-point): x1.25

RIS do jogador:
- `RIS_total = soma(score_eventos)`
- `RIS_match = (RIS_total / rounds_total) * 100`

## Trade Efficiency
- `% entries tradadas = entries_com_trade / entry_deaths`
- `tempo medio de trade = media(t_trade)`
- `% mortes sem suporte = mortes_sem_trade / mortes_totais`

Janela de trade atual:
- 320 ticks (~5s) para marcar trade.

## Roadmap por fases
1. Fase 1 - Base estavel
- Parse completo
- Modelo de dados unificado
- Dashboard com dados reais

2. Fase 2 - Vantagem competitiva core
- RIS v2 com contexto numerico (4v5, 3v4)
- Trade efficiency com proximidade de suporte
- Economia (buy strength vs winrate, ROI)

3. Fase 3 - Pressao e consistencia
- Clutch engine 1v1..1v5
- Rounds criticos e pos-streak negativa
- Desvio padrao de impacto por jogador e por metade

4. Fase 4 - Camada tatico-visual
- Heatmap de mortes primeiros 20s
- Timeline interativa com trade chains
- Modo review de rounds perdidos com vantagem

5. Fase 5 - Escala de time
- Persistencia em banco
- Multi-match compare
- Perfil por jogador
- Preparacao para login Steam

## Performance (pratico)
- Processamento pesado no backend (nao no browser)
- Cache por hash do arquivo demo
- Pre-agregacao por round/jogador para reduzir payload
- API separada para parse e analise
- Evoluir para worker queue para processar batches

## Diferenciais competitivos futuros
- Round Loss Diagnosis (por que perdeu round ganho)
- Support Debt Index (mortes sem cobertura)
- Pressure Resilience Index
- Protocol Drift (desvio da execucao padrao)
