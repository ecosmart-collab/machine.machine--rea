// Camada 3 — Engenharia: Planejar · Priorizar · Avaliar o risco · Orquestrar.
// Cada tarefa roda num "espaço separado" (git worktree) com seu próprio agente; tarefas
// independentes rodam em paralelo, em ondas, e são integradas na branch fabrica/<id>.
import fs from 'node:fs';
import path from 'node:path';
import { CFG, REPO, DIR } from '../nucleo/config.mjs';
import { git, sh, branchExiste, slug, cauda, corta, prompt, pool, serializador } from '../nucleo/util.mjs';
import { agente, agenteJson, TOOLS_LEITURA, TOOLS_DEV } from '../nucleo/harness.mjs';

export async function planejar(ctx, spec) {
  ctx.log('🗺️  Planejamento');
  const plano = await agenteJson(ctx, 'planejador', prompt('planejador', { spec }), { cwd: REPO, tools: TOOLS_LEITURA });
  ctx.log(`  → risco ${plano.risco}: ${plano.motivo_risco ?? ''}`);
  for (const t of plano.tarefas) ctx.log(`  → ${t.id} [${t.area}] ${t.titulo}${t.depende_de?.length ? ` (depende de ${t.depende_de.join(', ')})` : ''}`);
  return plano;
}

export async function testar(cwd) {
  for (const c of [CFG.comandoTeste, CFG.comandoE2E].filter(Boolean)) {
    const r = await sh(c, cwd);
    if (r.code !== 0) return { ok: false, saida: `$ ${c}\n${r.stdout}\n${r.stderr}` };
  }
  return { ok: true, saida: '' };
}

// Garante o worktree da branch de integração (cria na 1ª vez, reaproveita ao retomar).
export async function abrirIntegracao(ctx) {
  // O estado da integração vive na branch, não na pasta: recria o worktree sempre
  // (no Windows o "worktree remove" pode deixar a pasta vazia para trás).
  fs.mkdirSync(DIR.worktrees, { recursive: true });
  await git(['worktree', 'remove', '--force', ctx.wtIntegracao], REPO, { permitirFalha: true });
  fs.rmSync(ctx.wtIntegracao, { recursive: true, force: true });
  await git(['worktree', 'prune'], REPO, { permitirFalha: true });
  if (await branchExiste(ctx.branchIntegracao)) await git(['worktree', 'add', ctx.wtIntegracao, ctx.branchIntegracao]);
  else await git(['worktree', 'add', '-b', ctx.branchIntegracao, ctx.wtIntegracao, CFG.branchBase]);
}

export const fecharIntegracao = (ctx) => git(['worktree', 'remove', '--force', ctx.wtIntegracao], REPO, { permitirFalha: true });

async function executarTarefa(ctx, spec, tarefa, integrar) {
  // Não pode ser "fabrica/<id>/t1": o git não aceita uma branch dentro do "caminho" de outra (fabrica/<id>).
  const branch = `${ctx.branchIntegracao}--${slug(tarefa.id)}`;
  const wt = path.join(DIR.worktrees, `${ctx.id}-${slug(tarefa.id)}`);
  await git(['worktree', 'remove', '--force', wt], REPO, { permitirFalha: true });
  fs.rmSync(wt, { recursive: true, force: true });
  await git(['worktree', 'prune'], REPO, { permitirFalha: true });
  await git(['branch', '-D', branch], REPO, { permitirFalha: true });
  await git(['worktree', 'add', '-b', branch, wt, ctx.branchIntegracao]);
  if (CFG.comandoPreparo) await sh(CFG.comandoPreparo, wt);

  let feedback = '';
  try {
    for (let tentativa = 1; tentativa <= CFG.tentativasPorTarefa; tentativa++) {
      ctx.log(`🛠️  ${tarefa.id} — tentativa ${tentativa}/${CFG.tentativasPorTarefa}`);
      try {
        await agente(ctx, 'dev', prompt('dev', { area: tarefa.area, spec, tarefa, comandoTeste: CFG.comandoTeste, feedback }),
          { cwd: wt, tools: TOOLS_DEV });
      } catch (e) {
        // Agente travado/quebrado: conta como tentativa perdida, não derruba a demanda inteira.
        ctx.log(`  ❌ ${tarefa.id}: ${e.message.split('\n')[0]}`);
        feedback = `## Feedback da tentativa anterior\nA tentativa anterior foi interrompida (${e.message.split('\n')[0]}). Seja mais direto.`;
        continue;
      }

      await git(['add', '-A'], wt);
      if ((await git(['status', '--porcelain'], wt)).stdout.trim()) {
        await git(['commit', '-m', `${tarefa.id}: ${tarefa.titulo} (tentativa ${tentativa})`], wt);
      }

      const teste = await testar(wt);
      if (!teste.ok) {
        ctx.log(`  ❌ ${tarefa.id}: testes falharam`);
        feedback = `## Feedback da tentativa anterior\nOs testes FALHARAM. Corrija:\n\`\`\`\n${cauda(teste.saida)}\n\`\`\``;
        continue;
      }

      const diff = (await git(['diff', `${ctx.branchIntegracao}...HEAD`], wt)).stdout;
      if (!diff.trim()) {
        ctx.log(`  ❌ ${tarefa.id}: nenhuma alteração`);
        feedback = '## Feedback da tentativa anterior\nNenhuma alteração foi feita. Implemente a tarefa.';
        continue;
      }
      const rev = await agenteJson(ctx, 'revisor', prompt('revisor', { tarefa, diff: corta(diff) }), { cwd: wt, tools: TOOLS_LEITURA });
      if (!rev.aprovado) {
        ctx.log(`  ❌ ${tarefa.id}: revisão reprovou (${rev.problemas.length} problema(s))`);
        feedback = `## Feedback da tentativa anterior\nOs testes passaram, mas o REVISOR reprovou:\n${rev.problemas.map((p) => `- ${p}`).join('\n')}`;
        continue;
      }

      ctx.log(`  ✅ ${tarefa.id}: testes e revisão aprovados`);
      const merge = await integrar(() => git(['merge', '--no-ff', '-m', `Integra ${tarefa.id}: ${tarefa.titulo}`, branch],
        ctx.wtIntegracao, { permitirFalha: true }));
      if (merge.code !== 0) {
        await git(['merge', '--abort'], ctx.wtIntegracao, { permitirFalha: true });
        return { id: tarefa.id, ok: false, motivo: 'conflito de merge na integração' };
      }
      return { id: tarefa.id, ok: true, tentativas: tentativa };
    }
    return { id: tarefa.id, ok: false, motivo: `esgotou ${CFG.tentativasPorTarefa} tentativas` };
  } finally {
    await git(['worktree', 'remove', '--force', wt], REPO, { permitirFalha: true });
    await git(['branch', '-D', branch], REPO, { permitirFalha: true });
  }
}

// Orquestra em ondas: cada onda roda em paralelo as tarefas cujas dependências já foram integradas.
// Tarefas concluídas em execuções anteriores são reaproveitadas (retomada).
export async function orquestrar(ctx, spec, tarefas) {
  const integrar = serializador();
  const feitas = new Set();
  const resultados = {};
  let pendentes = [...tarefas];
  while (pendentes.length) {
    const prontas = pendentes.filter((t) => (t.depende_de ?? []).every((d) => feitas.has(d)));
    if (!prontas.length) {
      for (const t of pendentes) resultados[t.id] = { id: t.id, ok: false, motivo: 'dependência falhou' };
      break;
    }
    ctx.log(`🚀 Onda com ${prontas.length} tarefa(s) em paralelo: ${prontas.map((t) => t.id).join(', ')}`);
    const r = await pool(prontas, CFG.paralelismo, (t) =>
      ctx.etapa(`tarefa-${slug(t.id)}`, () => executarTarefa(ctx, spec, t, integrar), { concluida: (x) => x.ok }));
    for (const x of r) { resultados[x.id] = x; if (x.ok) feitas.add(x.id); }
    pendentes = pendentes.filter((t) => !prontas.includes(t));
  }
  return tarefas.map((t) => ({ ...resultados[t.id], titulo: t.titulo, area: t.area }));
}
