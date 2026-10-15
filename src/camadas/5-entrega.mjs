// Camada 5 — Disponibilizar a solução pronta.
// Portão por risco: até o nível configurado, publica sozinho; acima disso, espera aprovação humana.
import { CFG, REPO } from '../nucleo/config.mjs';
import { git, sh, cauda } from '../nucleo/util.mjs';

const NIVEL = { nenhum: -1, baixo: 0, medio: 1, alto: 2 };

export function podePublicarSozinho(risco) {
  return (NIVEL[risco] ?? 2) <= (NIVEL[CFG.entrega?.deployAutomaticoAteRisco] ?? -1);
}

export async function publicar(ctx) {
  ctx.log(`🚢 Integrando ${ctx.branchIntegracao} em ${CFG.branchBase}`);
  const atual = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  if (atual !== CFG.branchBase) throw new Error(`O repositório alvo está na branch "${atual}"; esperado "${CFG.branchBase}".`);
  const merge = await git(['merge', '--no-ff', '-m', `Fábrica: entrega ${ctx.id} — ${ctx.estado.titulo}`, ctx.branchIntegracao],
    REPO, { permitirFalha: true });
  if (merge.code !== 0) {
    await git(['merge', '--abort'], REPO, { permitirFalha: true });
    return { ok: false, conflito: true };
  }
  if (CFG.entrega?.comando) {
    ctx.log(`🚀 Deploy: ${CFG.entrega.comando}`);
    const r = await sh(CFG.entrega.comando, REPO);
    if (r.code !== 0) throw new Error(`Deploy falhou:\n${cauda(r.stdout + r.stderr, 3000)}`);
  }
  return { ok: true };
}

// A base andou (outra entrega foi publicada) e esta entrega conflita: descarta a engenharia e devolve
// a demanda para a fila, mantendo triagem/investigação/refinamento. Ela será refeita sobre a base atual.
export async function devolverParaFila(ctx) {
  await git(['worktree', 'remove', '--force', ctx.wtIntegracao], REPO, { permitirFalha: true });
  await git(['branch', '-D', ctx.branchIntegracao], REPO, { permitirFalha: true });
  for (const nome of Object.keys(ctx.estado.etapas)) {
    if (nome === 'planejamento' || nome === 'homologacao' || nome.startsWith('tarefa-')) delete ctx.estado.etapas[nome];
  }
  ctx.atualizar({ risco: null });
  ctx.status('aprovada-para-dev', `conflito com ${CFG.branchBase}: será refeita sobre a versão atual`);
}
