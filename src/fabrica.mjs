#!/usr/bin/env node
// Fábrica de software autônoma — o "Processo" que liga as camadas:
// Fontes → Triagem (triagem, investigação, refinamento) → Engenharia (planejar, priorizar, risco, orquestrar)
// → Homologação → Entrega. Estado em .fabrica/demandas/<id>/ permite retomar de onde parou.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CFG, ROOT, REPO, DIR } from './nucleo/config.mjs';
import { git, prompt } from './nucleo/util.mjs';
import { agente, TOOLS_LEITURA } from './nucleo/harness.mjs';
import { abrir, listar, ordenar, carregar, STATUS } from './nucleo/estado.mjs';
import { receber, coletarEntrada } from './camadas/1-fontes.mjs';
import { triagem, investigacao, refinamento } from './camadas/2-triagem.mjs';
import { planejar, orquestrar, abrirIntegracao, fecharIntegracao } from './camadas/3-engenharia.mjs';
import { homologar } from './camadas/4-homologacao.mjs';
import { podePublicarSozinho, publicar, devolverParaFila } from './camadas/5-entrega.mjs';
import { puxarDoPortal, devolverStatusAoPortal, portalConfigurado } from './camadas/fontes-portal.mjs';

const FINAIS = ['rejeitada', 'entregue', 'aguardando-aprovacao'];

// Etapa A: da demanda crua até "aprovada-para-dev" (ou rejeitada). Barata; roda para todas as demandas novas.
async function triar(ctx) {
  ctx.status('em-triagem');
  const tri = await ctx.etapa('triagem', () => triagem(ctx));
  ctx.atualizar({ prioridade: tri.prioridade });
  if (!tri.viavel) return ctx.status('rejeitada', tri.motivo);
  const inv = tri.precisa_investigacao ? await ctx.etapa('investigacao', () => investigacao(ctx, tri)) : null;
  const spec = await ctx.etapa('refinamento', () => refinamento(ctx, tri, inv));
  ctx.atualizar({ titulo: spec.titulo });
  ctx.status('aprovada-para-dev');
}

// Etapa B: da especificação até a entrega. Cara; roda uma demanda por vez, por prioridade.
async function desenvolver(ctx) {
  const spec = ctx.ler('refinamento');
  const plano = await ctx.etapa('planejamento', () => planejar(ctx, spec));
  ctx.atualizar({ risco: plano.risco });
  ctx.status('em-desenvolvimento');
  await abrirIntegracao(ctx);
  try {
    const tarefas = await orquestrar(ctx, spec, plano.tarefas);
    await fsp.writeFile(path.join(ctx.dir, 'tarefas.json'), JSON.stringify(tarefas, null, 2));
    const falhas = tarefas.filter((t) => !t.ok);
    if (falhas.length) return ctx.status('falha', `tarefas não concluídas: ${falhas.map((t) => `${t.id} (${t.motivo})`).join(', ')}`);

    ctx.status('em-homologacao');
    const qa = await ctx.etapa('homologacao', () => homologar(ctx, spec), { concluida: (r) => r.aprovado });
    if (!qa.aprovado) return ctx.status('falha', `homologação reprovou: ${qa.observacoes ?? ''}`.slice(0, 500));
  } finally {
    await fecharIntegracao(ctx);
  }

  if (podePublicarSozinho(plano.risco)) {
    if ((await publicar(ctx)).ok) ctx.status('entregue', `publicado automaticamente (risco ${plano.risco})`);
    else await devolverParaFila(ctx);
  } else {
    ctx.status('aguardando-aprovacao', `risco ${plano.risco}: revise ${ctx.branchIntegracao} e rode "aprovar ${ctx.id}"`);
  }
}

async function processar(id, { soTriagem = false } = {}) {
  const ctx = abrir(id);
  ctx.log(`\n🏭 Demanda ${id} (${ctx.estado.origem})`);
  try {
    if (['recebida', 'em-triagem'].includes(ctx.estado.status) || !ctx.estado.etapas.refinamento?.ok) await triar(ctx);
    if (!soTriagem && ctx.estado.status !== 'rejeitada') await desenvolver(ctx);
  } catch (e) {
    ctx.status('falha', e.message.split('\n')[0]);
    fs.appendFileSync(path.join(ctx.dir, 'log.txt'), `${e.stack}\n`);
  }
  await fsp.writeFile(path.join(ctx.dir, 'relatorio.md'), relatorio(ctx));
  ctx.log(`📄 ${path.relative(ROOT, path.join(ctx.dir, 'relatorio.md'))} | ${ctx.estado.status} | custo total US$ ${ctx.estado.custo.toFixed(2)}`);
  return ctx.estado.status;
}

function relatorio(ctx) {
  const { estado } = ctx;
  const spec = ctx.ler('refinamento'), plano = ctx.ler('planejamento'), qa = ctx.ler('homologacao');
  const tarefas = fs.existsSync(path.join(ctx.dir, 'tarefas.json')) ? JSON.parse(fs.readFileSync(path.join(ctx.dir, 'tarefas.json'), 'utf8')) : [];
  const l = [`# ${estado.titulo}`, '',
    `| Status | Origem | Prioridade | Risco | Custo |`, `|---|---|---|---|---|`,
    `| ${STATUS[estado.status]} ${estado.status} | ${estado.origem}${estado.votos ? ` (${estado.votos} votos)` : ''} | ${estado.prioridade ?? '—'} | ${estado.risco ?? '—'} | US$ ${estado.custo.toFixed(2)} |`, ''];
  if (spec) {
    l.push(spec.resumo ?? '', '', '## Critérios de aceite');
    for (const [i, c] of (spec.criterios_aceite ?? []).entries()) {
      const v = qa?.criterios?.find((x) => x.criterio === c) ?? qa?.criterios?.[i];
      l.push(`- ${v ? (v.atendido ? '✅' : '❌') : '◻️'} ${c}${v?.evidencia ? ` — _${v.evidencia}_` : ''}`);
    }
  }
  if (plano?.risco) l.push('', `## Risco: ${plano.risco}`, plano.motivo_risco ?? '');
  if (tarefas.length) {
    l.push('', '## Tarefas');
    for (const t of tarefas) l.push(`- ${t.ok ? '✅' : '❌'} **${t.id}** [${t.area}] ${t.titulo}${t.ok ? ` (${t.tentativas} tentativa(s))` : ` — ${t.motivo}`}`);
  }
  if (qa?.observacoes) l.push('', '## Homologação', qa.observacoes);
  l.push('', '## Histórico', ...estado.historico.map((h) => `- ${h.em.slice(0, 19).replace('T', ' ')} ${STATUS[h.status] ?? ''} ${h.status}${h.detalhe ? ` — ${h.detalhe}` : ''}`));
  return l.join('\n') + '\n';
}

// Roda um ciclo: tria tudo que chegou e desenvolve a demanda mais prioritária.
async function ciclo() {
  // Uma falha de rede com o portal não pode parar a fábrica: registra e segue.
  const portal = (fn) => fn().catch((e) => console.error(`⚠️  Portal: ${e.message}`));
  await portal(puxarDoPortal);
  await coletarEntrada();
  for (const e of listar().filter((e) => e.status === 'recebida')) await processar(e.id, { soTriagem: true });
  await portal(devolverStatusAoPortal);
  const proxima = ordenar(listar().filter((e) => e.status === 'aprovada-para-dev'))[0];
  if (proxima) await processar(proxima.id);
  await portal(devolverStatusAoPortal);
  return Boolean(proxima);
}

// ---------- comandos ----------

function opcoes(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) o[args[i].slice(2)] = args[++i];
    else o._.push(args[i]);
  }
  return o;
}

const comandos = {
  async nova(args) {
    const o = opcoes(args);
    const fonte = o._.join(' ');
    const texto = fs.existsSync(fonte) ? fs.readFileSync(fonte, 'utf8') : fonte;
    const id = await receber(texto, { origem: o.origem, votos: o.votos });
    console.log(`📥 Demanda recebida: ${id}`);
  },

  async run(args) {
    const [id] = args;
    if (id) return void (process.exitCode = ['falha', 'rejeitada'].includes(await processar(id)) ? 1 : 0);
    if (!(await ciclo())) console.log('Nenhuma demanda aprovada para desenvolvimento.');
  },

  async retomar([id]) {
    if (!id) throw new Error('Uso: retomar <id>');
    if (carregar(id).status === 'entregue') return console.log('Demanda já entregue.');
    await processar(id);
  },

  async watch() {
    console.log(`👀 Fábrica ligada: vigiando demandas a cada ${CFG.intervaloWatchSegundos}s (Ctrl+C para sair)`);
    for (;;) {
      const trabalhou = await ciclo().catch((e) => { console.error(`💥 ${e.message}`); return false; });
      if (!trabalhou) await new Promise((r) => setTimeout(r, CFG.intervaloWatchSegundos * 1000));
    }
  },

  async status(args) {
    const o = opcoes(args);
    const lista = o._[0] ? [carregar(o._[0])] : ordenar(listar());
    if ('json' in o || args.includes('--json')) return console.log(JSON.stringify(lista, null, 2));
    if (!lista.length) return console.log('Nenhuma demanda.');
    for (const e of lista) {
      console.log(`${STATUS[e.status]} ${e.status.padEnd(20)} ${(e.prioridade ?? '--').padEnd(3)} ${(e.risco ?? '-').padEnd(6)} US$ ${e.custo.toFixed(2).padStart(5)}  ${e.id}`);
    }
  },

  // Só a ponte com o portal, sem rodar agentes: traz a fila e devolve os status.
  async sincronizar() {
    if (!portalConfigurado()) throw new Error(`Portal não configurado: defina "portal.url" na config e a variável ${CFG.portal?.tokenEnv ?? 'PORTAL_TOKEN'}.`);
    const novos = await puxarDoPortal();
    await devolverStatusAoPortal();
    console.log(`🔄 Sincronizado: ${novos.length} demanda(s) nova(s) vinda(s) do portal.`);
  },

  async aprovar([id]) {
    if (!id) throw new Error('Uso: aprovar <id>');
    const ctx = abrir(id);
    if (ctx.estado.status !== 'aguardando-aprovacao') throw new Error(`Demanda está "${ctx.estado.status}", não "aguardando-aprovacao".`);
    if ((await publicar(ctx)).ok) {
      ctx.status('entregue', 'aprovado por humano');
      return devolverStatusAoPortal().catch((e) => console.error(`⚠️  Portal: ${e.message}`));
    }
    await devolverParaFila(ctx);
    console.log('↩️  Conflito com a versão atual: a demanda voltou para a fila e será refeita no próximo "run".');
  },

  // "Conhecimento do projeto": gera conhecimento/projeto.md a partir do repositório alvo.
  async conhecer() {
    const custo = { v: 0 };
    const ctx = { log: console.log, custo: (v) => (custo.v += v) };
    console.log(`📚 Estudando ${path.relative(ROOT, REPO)}…`);
    const r = await agente(ctx, 'conhecer', prompt('conhecer', { conhecimento: '' }), { cwd: REPO, tools: TOOLS_LEITURA });
    await fsp.mkdir(DIR.conhecimento, { recursive: true });
    await fsp.writeFile(path.join(DIR.conhecimento, 'projeto.md'), r.texto.replace(/^```(?:markdown|md)?\n|```\s*$/g, ''));
    console.log(`✅ conhecimento/projeto.md atualizado (US$ ${custo.v.toFixed(2)}). Revise e complemente à mão.`);
  },

  async demo() {
    const app = path.join(ROOT, 'sandbox', 'app-exemplo');
    if (!fs.existsSync(app)) {
      await fsp.mkdir(path.join(app, 'src'), { recursive: true });
      await fsp.mkdir(path.join(app, 'test'), { recursive: true });
      await fsp.writeFile(path.join(app, 'package.json'), JSON.stringify({
        name: 'app-exemplo', version: '1.0.0', type: 'module', scripts: { test: 'node --test' },
      }, null, 2) + '\n');
      await fsp.writeFile(path.join(app, 'src', 'carrinho.js'), `export function criarCarrinho() {
  return { itens: [] };
}

export function adicionarItem(carrinho, { sku, preco, quantidade = 1 }) {
  if (preco < 0) throw new Error('preço inválido');
  if (quantidade <= 0) throw new Error('quantidade inválida');
  const existente = carrinho.itens.find((i) => i.sku === sku);
  if (existente) existente.quantidade += quantidade;
  else carrinho.itens.push({ sku, preco, quantidade });
  return carrinho;
}

export function total(carrinho) {
  return carrinho.itens.reduce((soma, i) => soma + i.preco * i.quantidade, 0);
}
`);
      await fsp.writeFile(path.join(app, 'test', 'carrinho.test.js'), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarCarrinho, adicionarItem, total } from '../src/carrinho.js';

test('soma itens do carrinho', () => {
  const c = criarCarrinho();
  adicionarItem(c, { sku: 'A', preco: 10, quantidade: 2 });
  adicionarItem(c, { sku: 'B', preco: 5 });
  assert.equal(total(c), 25);
});
`);
      await git(['init', '-b', 'main'], app);
      await git(['add', '-A'], app);
      await git(['commit', '-m', 'App de exemplo'], app);
      console.log(`✅ Repositório de exemplo criado em ${path.relative(ROOT, app)}`);
    }
    await fsp.mkdir(DIR.entrada, { recursive: true });
    await fsp.writeFile(path.join(DIR.entrada, 'cupom-desconto.md'), `---
origem: comunidade
votos: 10
---
# Cupom de desconto no carrinho

Quero poder aplicar um cupom de desconto no carrinho. Pode ser percentual (ex.: 10%)
ou valor fixo (ex.: R$ 15). O total nunca pode ficar negativo e só pode existir um cupom por vez.
`);
    await fsp.writeFile(path.join(DIR.entrada, 'bug-quantidade.md'), `---
origem: telemetria
---
# Erro: quantidade fracionada aceita no carrinho

Alerta de telemetria: pedidos com quantidade 0.5 e 1.7 chegaram ao checkout.
adicionarItem() aceita quantidade não inteira.
`);
    console.log('✅ 2 demandas de exemplo em demandas/entrada/ (uma da comunidade, um bug da telemetria)');
    console.log('\nPara usar o sandbox, ajuste "repo" em fabrica.config.json para "./sandbox/app-exemplo" e rode:  node src/fabrica.mjs run');
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!comandos[cmd]) {
  console.log(`Fábrica de software autônoma — acelera.360

  Fontes
    nova [--origem usuario|comunidade|telemetria|eu] [--votos N] "texto" | arquivo.md
    (ou solte um .md em demandas/entrada/)

  Operação
    run [id]        um ciclo: tria tudo que chegou e desenvolve a demanda mais prioritária
    watch           modo autônomo: roda ciclos continuamente
    retomar <id>    continua uma demanda de onde parou (reaproveita etapas concluídas)
    status [id] [--json]
    aprovar <id>    publica uma entrega que aguarda aprovação humana
    sincronizar     só a ponte com o portal: traz a fila e devolve os status

  Conhecimento
    conhecer        gera conhecimento/projeto.md a partir do repositório alvo
    demo            cria repositório e demandas de exemplo`);
} else {
  comandos[cmd](args).catch((e) => { console.error(`💥 ${e.message}`); process.exitCode = 1; });
}
