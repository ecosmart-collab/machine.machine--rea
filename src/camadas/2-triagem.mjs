// Camada 2 — Inteligência de triagem: Recebe → Triagem → Investigação → Refinamento → Especificação + critérios de aceite.
import { REPO } from '../nucleo/config.mjs';
import { prompt } from '../nucleo/util.mjs';
import { agenteJson, TOOLS_LEITURA, TOOLS_INVESTIGACAO } from '../nucleo/harness.mjs';

export async function triagem(ctx) {
  ctx.log('🔎 Triagem');
  const t = await agenteJson(ctx, 'triagem', prompt('triagem', { demanda: ctx.demanda(), origem: ctx.estado.origem }),
    { cwd: REPO, tools: TOOLS_LEITURA });
  ctx.log(`  → ${t.tipo} ${t.prioridade} · ${t.viavel ? 'viável' : 'inviável'}${t.precisa_investigacao ? ' · precisa investigar' : ''}`);
  return t;
}

// "Agente de aprofundamento": reproduz bugs, acha a causa, mapeia o código afetado.
export async function investigacao(ctx, tri) {
  ctx.log('🕵️  Investigação');
  const inv = await agenteJson(ctx, 'investigacao', prompt('investigacao', { demanda: ctx.demanda(), triagem: tri }),
    { cwd: REPO, tools: TOOLS_INVESTIGACAO });
  ctx.log(`  → ${inv.conclusao ?? ''}`.slice(0, 200));
  return inv;
}

export async function refinamento(ctx, tri, inv) {
  ctx.log('📝 Refinamento → especificação');
  const spec = await agenteJson(ctx, 'refinamento',
    prompt('refinamento', { demanda: ctx.demanda(), triagem: tri, investigacao: inv ?? '(não houve investigação)' }),
    { cwd: REPO, tools: TOOLS_LEITURA });
  ctx.log(`  → ${spec.titulo} — ${spec.criterios_aceite?.length ?? 0} critérios de aceite`);
  return spec;
}
