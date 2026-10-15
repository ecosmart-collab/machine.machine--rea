// Harness: o "motor" que executa cada agente. Hoje só Claude Code (claude -p);
// o ponto de extensão para Codex/Gemini é o mapa HARNESS abaixo.
import { CFG } from './config.mjs';
import { run, cauda, extrairJson } from './util.mjs';

const HARNESS = {
  async claude({ papel, texto, cwd, tools, retomar, maxTurns, timeoutMs }) {
    const args = ['-p', '--output-format', 'json', '--max-turns', String(maxTurns), '--permission-mode', CFG.permissionMode];
    if (retomar) args.push('--resume', retomar);
    if (CFG.modelo) args.push('--model', CFG.modelo);
    // Cada papel trabalha sozinho e termina com a própria resposta — sem subagentes.
    args.push('--disallowedTools', 'Agent', 'Task');
    args.push('--allowedTools', ...tools);
    const r = await run('claude', args, { cwd, input: texto, shell: process.platform === 'win32', timeoutMs });
    if (r.estourou) throw new Error(`Agente ${papel} travado: passou do timeout de ${timeoutMs / 60000} min.`);
    let saida;
    try { saida = JSON.parse(r.stdout); } catch {
      throw new Error(`Agente ${papel} não retornou JSON (código ${r.code}):\n${cauda(r.stderr || r.stdout, 1500)}`);
    }
    if (saida.is_error) throw new Error(`Agente ${papel} terminou com erro: ${saida.subtype ?? ''} ${saida.result ?? ''}`);
    return { texto: saida.result ?? '', sessao: saida.session_id, custo: saida.total_cost_usd ?? 0 };
  },
};

export async function agente(ctx, papel, texto, { cwd, tools, retomar, maxTurns }) {
  const nome = CFG.harness?.[papel] ?? CFG.harness?.padrao ?? 'claude';
  const h = HARNESS[nome];
  if (!h) throw new Error(`Harness "${nome}" não implementado (papel ${papel}).`);
  const minutos = CFG.timeoutMinutos?.[papel] ?? CFG.timeoutMinutos?.padrao ?? 20;
  ctx.log(`  🤖 ${papel} ${retomar ? 'formatando resposta…' : 'trabalhando…'}`);
  const r = await h({
    papel, texto, cwd, tools, retomar,
    maxTurns: maxTurns ?? CFG.maxTurns?.[papel] ?? 40,
    timeoutMs: minutos * 60000,
  });
  ctx.custo(r.custo);
  return r;
}

// Agente cuja resposta precisa ser JSON. Se vier sem, retoma a mesma sessão e pede só o bloco final.
export async function agenteJson(ctx, papel, texto, opcoes) {
  const r = await agente(ctx, papel, texto, opcoes);
  try { return extrairJson(r.texto); } catch (e) {
    if (!r.sessao) throw e;
    const r2 = await agente(ctx, papel,
      'Sua última resposta não trouxe o bloco ```json pedido. Responda AGORA apenas com esse bloco JSON final, no formato especificado, sem nenhum outro texto.',
      { ...opcoes, retomar: r.sessao, maxTurns: 3 });
    return extrairJson(r2.texto);
  }
}

export const TOOLS_LEITURA = ['Read', 'Glob', 'Grep'];
export const TOOLS_INVESTIGACAO = ['Read', 'Glob', 'Grep', 'Bash'];
export const TOOLS_DEV = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'];
