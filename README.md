# acelera.360 — A máquina que constrói máquinas

Fábrica de software autônoma: demandas entram (você, usuários, comunidade, telemetria) e saem como código
testado, revisado e homologado — usando o Claude Code em modo headless (`claude -p`).

A arquitetura segue o quadro "Agent Factory" do Kelvin Cleto, cruzado com o Gas Town:
veja **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**.

```
Fontes ─▶ Triagem ─▶ Investigação ─▶ Refinamento ─▶ Planejar/Risco ─▶ Devs em paralelo ─▶ Homologação ─▶ Entrega
 (1)        (2)          (2)             (2)              (3)          (worktrees, 3)          (4)          (5)
```

## Uso

```bash
node src/fabrica.mjs demo                     # sandbox de exemplo + 2 demandas
node src/fabrica.mjs conhecer                 # gera conhecimento/projeto.md do repositório alvo
node src/fabrica.mjs nova --origem usuario --votos 7 "Quero exportar o relatório em PDF"
node src/fabrica.mjs run                      # 1 ciclo: tria tudo que chegou e desenvolve a mais prioritária
node src/fabrica.mjs watch                    # modo autônomo
node src/fabrica.mjs status [--json]          # painel das demandas (o que um portal leria)
node src/fabrica.mjs retomar <id>             # continua de onde parou
node src/fabrica.mjs aprovar <id>             # publica entrega que aguarda aprovação
```

Requisitos: Node 18+, git e Claude Code autenticado. Sem dependências npm.

## Estrutura

```
fabrica.config.json        repositório alvo, comandos de teste/E2E/deploy, paralelismo, timeouts, limite de risco
conhecimento/projeto.md    "Conhecimento do projeto" — lido por todos os agentes
prompts/                   um prompt por papel: triagem, investigacao, refinamento, planejador, dev, revisor, qa, conhecer
src/
  fabrica.mjs              o Processo: liga as camadas + CLI
  nucleo/                  config, util, harness (motor dos agentes), estado (ledger)
  camadas/                 1-fontes · 2-triagem · 3-engenharia · 4-homologacao · 5-entrega
demandas/entrada/          solte .md aqui (cabeçalho opcional: origem, votos)
.fabrica/demandas/<id>/    estado.json, log.txt, triagem/investigacao/refinamento/planejamento/homologacao.json, relatorio.md
.fabrica/worktrees/        espaços isolados dos agentes (temporários)
```

## Portal de ideias (fonte de demandas)

O produto que a fábrica desenvolve — e que também alimenta a fábrica — é o
[acelera-portal](../acelera-portal): ideias com votos, "Reportar bug" e a esteira com o status de cada pedido.
Ideias que atingem o limiar de votos e bugs reportados entram na fila; a fábrica devolve o status a cada ciclo.

```bash
# terminal 1 — portal (clonado ao lado deste repositório)
cd ../acelera-portal && PORTAL_TOKEN=um-segredo-longo npm start
# terminal 2 — fábrica
PORTAL_TOKEN=um-segredo-longo node src/fabrica.mjs watch
```

## Apontar para um projeto real

Em `fabrica.config.json`: `repo`, `branchBase`, `comandoPreparo` (ex. `npm ci`), `comandoTeste`, `comandoE2E`
(ex. `npx playwright test`) e `entrega.comando`. Depois rode `conhecer` e revise `conhecimento/projeto.md`.

`entrega.deployAutomaticoAteRisco`: `nenhum` (padrão — tudo passa por você) → `baixo` → `medio` → `alto`.
Suba o nível só quando os testes do projeto merecerem essa confiança.
