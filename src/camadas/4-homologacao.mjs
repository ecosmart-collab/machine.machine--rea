// Camada 4 — Homologação (e2e): testes + E2E na branch integrada e verificação de cada critério de aceite.
import { CFG } from '../nucleo/config.mjs';
import { git, sh, cauda, corta, prompt } from '../nucleo/util.mjs';
import { agenteJson, TOOLS_LEITURA } from '../nucleo/harness.mjs';
import { testar } from './3-engenharia.mjs';

export async function homologar(ctx, spec) {
  ctx.log('🧪 Homologação');
  if (CFG.comandoPreparo) await sh(CFG.comandoPreparo, ctx.wtIntegracao);
  const teste = await testar(ctx.wtIntegracao);
  if (!teste.ok) return { aprovado: false, criterios: [], observacoes: `Testes falharam após integração:\n${cauda(teste.saida, 3000)}` };

  const diff = (await git(['diff', `${CFG.branchBase}...HEAD`], ctx.wtIntegracao)).stdout;
  const res = await agenteJson(ctx, 'qa', prompt('qa', { spec, diff: corta(diff), comandoTeste: CFG.comandoTeste }),
    { cwd: ctx.wtIntegracao, tools: [...TOOLS_LEITURA, 'Bash'] });

  // O portão não confia só no "aprovado" do agente: todo critério de aceite precisa estar atendido.
  const pendentes = (res.criterios ?? []).filter((c) => !c.atendido);
  if ((res.criterios?.length ?? 0) < (spec.criterios_aceite?.length ?? 0) || pendentes.length) {
    res.aprovado = false;
    res.observacoes = [res.observacoes, `Critérios não atendidos ou não verificados: ${pendentes.length || 'faltando no QA'}`].filter(Boolean).join('\n');
  }
  return res;
}
