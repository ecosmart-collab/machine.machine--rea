# Arquitetura — Fábrica de Software Autônoma (acelera.360)

Análise do quadro "Agent Factory" do Kelvin Cleto (vídeo *"Estou Construindo a Máquina que Constrói Máquinas com IA"*),
cruzada com o [Gas Town](https://github.com/gastownhall/gastown) (orquestrador open-source de multiagentes)
e mapeada para a estrutura deste repositório.

---

## 1. A evolução mostrada no quadro

| Nível | Quadro | O que muda | Gargalo |
|---|---|---|---|
| 1 | **Eu + IA** (prompt) | Humano conversa com uma IA | Humano faz tudo |
| 2 | **Eu + Coordenador + Agentes** | Claude Code como coordenador de Dev, PO, CTO | Humano cria a tarefa e valida |
| 3 | **Eu + Equipes multiagentes** | Dev(1-3), PO, CTO, Arquiteto, Revisor, Teste; +2 Claude 20x, +1 Codex; `.worktree` → espaço separado por agente | Humano ainda dispara e supervisiona tudo |
| 4 | **A fábrica autônoma** "?" | Ninguém dispara nem supervisiona | — |

O "?" do nível 4 é respondido no próprio quadro com quatro requisitos:

1. **Conhecimento do projeto, do código, do que é** — os agentes precisam saber o que é o produto sem perguntar.
2. **Não supervisionada por um humano** — o humano sai do caminho crítico.
3. **Trigger (gatilho)** — "Eu quero que você desenvolva tal coisa" / "Aconteceu um bug na ferramenta" (via OpenTelemetry).
4. **Processo + Harness** — um processo definido (as etapas) rodando sobre um motor de agentes (Claude Code, Codex).

E o fluxo: **Trigger → Tomar a ação → Time multiagentes → Homologação (e2e) → Disponibilizar a solução pronta**.

## 2. As camadas do quadro (versão verde, final)

```
Fonte de demandas      Eu · Usuário · Agente olhando a telemetria · Entre outros…
        │
Inteligência de        Recebe a demanda → Triagem → Investigação → Refinamento
triagem                                      └→ Especificação e critérios de aceite
        │
Engenharia             Planejar · Priorizar · Avaliar o risco · Orquestrar
        │                  └→ Claude Code 1 | 2 | 3, cada um na sua VPS
Homologação (e2e)
        │
Disponibilizar a solução pronta
```

A **fonte "Usuário"** no produto dele (360 Growth AIOS) é o portal **Ideias e roadmap**:
- ideias com **votos** ("as mais votadas viram prioridade");
- ciclo de vida: **Em votação → Aprovada para dev → Em desenvolvimento → Entregue**;
- abas Ideias / Roadmap / **Bugs** e um formulário **Reportar bug** (título ≥ 8 caracteres, descrição ≥ 10, URL da página preenchida
  automaticamente, prints e vídeos).

Ou seja: a fábrica não começa num chat, começa num **produto que coleta demandas estruturadas**.

## 3. Mapeamento: quadro × Gas Town × acelera.360

| Quadro do Kelvin | Gas Town | acelera.360 | Onde |
|---|---|---|---|
| Fontes de demanda | Beads criados por humanos/agentes | `nova`, `demandas/entrada/`, cabeçalho `origem`/`votos` | `src/camadas/1-fontes.mjs` |
| Agente olhando telemetria / OpenTelemetry | Modelo OTel com `run.id` por agente | origem `telemetria` (coletor ainda não implementado) | fase 3 |
| Triagem | `mol-idea-to-plan` → passo `intake` | prompt `triagem`: tipo, prioridade, viabilidade | `src/camadas/2-triagem.mjs` |
| Investigação / "agente de aprofundamento" | Dogs (Boot for triage) | prompt `investigacao`: reproduz, causa raiz (só leitura) | idem |
| Refinamento → spec + critérios | `prd-review` + `prd-align` 1-3 | prompt `refinamento`: critérios testáveis + decisões | idem |
| Planejar / Arquiteto | `generate-plan` + `plan-review` | prompt `planejador`: tarefas + dependências | `src/camadas/3-engenharia.mjs` |
| Priorizar | prioridades P0-P3 + Scheduler | ordem P0→P3, depois votos, depois data | `src/nucleo/estado.mjs` |
| Avaliar o risco | Escalation (CRITICAL/HIGH/MEDIUM) | `risco` baixo/médio/alto → portão de entrega | `src/camadas/5-entrega.mjs` |
| Orquestrar / Coordenador | **Mayor** + Convoys | ondas paralelas por dependência | `orquestrar()` |
| Dev(1-3), espaço separado, `.worktree` | **Polecats** + Hooks (worktrees) | 1 worktree + 1 agente por tarefa | `executarTarefa()` |
| Revisor | `mol-polecat-code-review` | prompt `revisor` + retentativa com feedback | idem |
| Teste | gates do Refinery | `comandoTeste` a cada tentativa | idem |
| Merge das equipes | **Refinery** + integration branches | merge na branch `fabrica/<id>` | idem |
| Homologação (e2e) | verificação antes do land | `comandoE2E` + QA critério a critério | `src/camadas/4-homologacao.mjs` |
| Disponibilizar | `gt mq integration land` | `aprovar` ou deploy automático por risco | `src/camadas/5-entrega.mjs` |
| Conhecimento do projeto | `gt prime` / CLAUDE.md | `conhecimento/projeto.md` injetado em todo prompt | `conhecer` |
| Não supervisionada | Witness / Deacon (detecta agente travado) | timeout por agente + retentativas | `src/nucleo/harness.mjs` |
| Processo | Formulas / Molecules (TOML) | pipeline em `src/fabrica.mjs` + `prompts/` | — |
| Harness | multi-runtime (Claude, Codex, Gemini…) | `harness.padrao` / por papel na config | `src/nucleo/harness.mjs` |
| Status no portal | Beads (ledger) | ledger com os mesmos status do portal | `.fabrica/demandas/<id>/estado.json` |
| VPS por Claude Code | sandboxed polecats (exitbox/daytona) | — | fase 4 |

## 4. Ciclo de vida de uma demanda

```
📥 recebida ─▶ 🔎 em-triagem ─┬─▶ 🚫 rejeitada
                              └─▶ ✅ aprovada-para-dev ─▶ 🛠️ em-desenvolvimento ─▶ 🧪 em-homologacao
                                                                                       │
                                     ⏸️ aguardando-aprovacao ◀── risco acima do limite ──┤
                                              │ aprovar                                 │ risco dentro do limite
                                              ▼                                         ▼
                                          🚀 entregue ◀───────────────────────────────────┘
                  qualquer etapa ─▶ 💥 falha ─▶ retomar <id> (reaproveita o que já foi feito)
```

Os status são os mesmos do portal (Aprovada para dev / Em desenvolvimento / Entregue), então o portal pode
ler `status --json` e mostrar o andamento real para quem votou.

## 5. Decisões de projeto

1. **Triar tudo, desenvolver um por vez.** A triagem é barata e roda para toda demanda nova; o desenvolvimento é caro e
   pega a demanda mais prioritária. É assim que "Priorizar" funciona na prática.
2. **A qualidade sai dos critérios de aceite, não dos agentes.** O refinamento só aceita critérios testáveis; a homologação
   reprova se qualquer critério não estiver comprovado, mesmo que o agente de QA diga "aprovado".
3. **O risco decide o nível de autonomia.** `deployAutomaticoAteRisco` começa em `nenhum` (tudo passa por você) e sobe
   para `baixo` → `medio` conforme a confiança nos testes cresce. Esse é o caminho para tirar o humano do caminho crítico.
4. **Estado no disco, não na memória do agente.** Mesmo princípio dos Hooks/Beads do Gas Town: se algo cai,
   `retomar` continua sem pagar de novo pelas etapas já feitas.
5. **Cada papel trabalha sozinho.** Subagentes ficam bloqueados; cada agente devolve uma resposta estruturada (JSON).

## 6. Roadmap

| Fase | Entrega | Status |
|---|---|---|
| 1 — MVP | Triagem → planejamento → devs paralelos em worktrees → revisão → QA → aprovação | ✅ |
| 2 — Estrutura do quadro | Camadas, investigação, refinamento, risco, prioridade, ledger, retomada, timeout, conhecimento | ✅ |
| 3a — Portal como fonte | Repositório `acelera-portal`: ideias com votos, bugs, esteira de status; a fábrica puxa a fila (`/api/fabrica/fila`) e devolve o status (`PATCH /api/fabrica/itens/:id`) | ✅ |
| 3b — Telemetria | Alerta OpenTelemetry/Sentry → demanda `telemetria`; hospedar portal + fábrica numa VPS | próximo |
| 4 — Escala | Cada esquadrão em container/VPS; harness Codex; preview por demanda para homologação e2e (Playwright) | — |
| 5 — Autonomia total | `deployAutomaticoAteRisco: medio`; métricas (custo por demanda, % entregue sem humano, retrabalho); ou migrar a execução para o Gas Town e manter o acelera.360 como camada de triagem | — |
