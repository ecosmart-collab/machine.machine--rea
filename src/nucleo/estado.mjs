// Ledger de demandas: cada demanda tem uma pasta em .fabrica/demandas/<id>/ com estado.json
// e o resultado de cada etapa. Isso permite acompanhar o status (como no portal de ideias)
// e RETOMAR uma demanda de onde parou, sem refazer etapas já concluídas.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DIR } from './config.mjs';
import { slug } from './util.mjs';

// Mesmo ciclo de vida do portal "Ideias e roadmap".
export const STATUS = {
  recebida: '📥', 'em-triagem': '🔎', rejeitada: '🚫', 'aprovada-para-dev': '✅',
  'em-desenvolvimento': '🛠️', 'em-homologacao': '🧪', 'aguardando-aprovacao': '⏸️', entregue: '🚀', falha: '💥',
};
const PRIORIDADE = { P0: 0, P1: 1, P2: 2, P3: 3 };

// Lê um cabeçalho opcional "--- chave: valor ---" no topo do texto da demanda.
function lerCabecalho(texto) {
  const m = texto.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { meta: {}, corpo: texto };
  const meta = Object.fromEntries(m[1].split('\n').map((l) => l.split(/:\s*/, 2)).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  return { meta, corpo: texto.slice(m[0].length) };
}

export async function criar(texto, { nome, origem, votos } = {}) {
  const { meta, corpo } = lerCabecalho(texto);
  const agora = new Date();
  const titulo = nome ?? corpo.match(/^#\s+(.+)/m)?.[1] ?? corpo.trim().split('\n')[0].slice(0, 60);
  const id = `${agora.toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${slug(titulo)}`;
  const dir = path.join(DIR.ledger, id);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'demanda.md'), corpo);
  const estado = {
    id, titulo,
    origem: origem ?? meta.origem ?? 'manual',
    votos: Number(votos ?? meta.votos ?? 0),
    prioridade: null, risco: null, status: 'recebida', custo: 0,
    etapas: {},
    historico: [{ status: 'recebida', em: agora.toISOString() }],
  };
  await fsp.writeFile(path.join(dir, 'estado.json'), JSON.stringify(estado, null, 2));
  return id;
}

export function carregar(id) {
  const arq = path.join(DIR.ledger, id, 'estado.json');
  if (!fs.existsSync(arq)) throw new Error(`Demanda não encontrada: ${id}`);
  return JSON.parse(fs.readFileSync(arq, 'utf8'));
}

export function listar() {
  if (!fs.existsSync(DIR.ledger)) return [];
  return fs.readdirSync(DIR.ledger).filter((d) => fs.existsSync(path.join(DIR.ledger, d, 'estado.json'))).map(carregar);
}

// Ordem de trabalho: prioridade (P0 primeiro), depois votos da comunidade, depois a mais antiga.
export function ordenar(estados) {
  return [...estados].sort((a, b) =>
    (PRIORIDADE[a.prioridade] ?? 9) - (PRIORIDADE[b.prioridade] ?? 9) || b.votos - a.votos || a.id.localeCompare(b.id));
}

export function abrir(id) {
  const dir = path.join(DIR.ledger, id);
  const estado = carregar(id);
  const salvarEstado = () => fs.writeFileSync(path.join(dir, 'estado.json'), JSON.stringify(estado, null, 2));
  const ctx = {
    id, dir, estado,
    branchIntegracao: `fabrica/${id}`,
    wtIntegracao: path.join(DIR.worktrees, `${id}-integracao`),
    demanda: () => fs.readFileSync(path.join(dir, 'demanda.md'), 'utf8'),
    log: (m) => { console.log(m); fs.appendFileSync(path.join(dir, 'log.txt'), m + '\n'); },
    custo: (v) => { estado.custo += v; salvarEstado(); },
    atualizar: (campos) => { Object.assign(estado, campos); salvarEstado(); },
    status: (novo, detalhe) => {
      estado.status = novo;
      estado.historico.push({ status: novo, em: new Date().toISOString(), ...(detalhe ? { detalhe } : {}) });
      salvarEstado();
      ctx.log(`${STATUS[novo] ?? '•'} status: ${novo}${detalhe ? ` — ${detalhe}` : ''}`);
    },
    ler: (nome) => {
      const arq = path.join(dir, `${nome}.json`);
      return fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : undefined;
    },
    // Executa uma etapa uma única vez: se já foi concluída antes, devolve o resultado salvo.
    async etapa(nome, fn, { concluida = () => true } = {}) {
      if (estado.etapas[nome]?.ok) { ctx.log(`↩️  ${nome}: reaproveitado`); return ctx.ler(nome); }
      const resultado = await fn();
      fs.writeFileSync(path.join(dir, `${nome}.json`), JSON.stringify(resultado, null, 2));
      estado.etapas[nome] = { ok: concluida(resultado), em: new Date().toISOString() };
      salvarEstado();
      return resultado;
    },
  };
  return ctx;
}
