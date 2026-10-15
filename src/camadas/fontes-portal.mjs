// Fonte "Usuário": o portal de Ideias e roadmap (repositório acelera-portal).
// Ida: ideias aprovadas por voto e bugs reportados viram demandas.
// Volta: o status de cada demanda aparece no portal para quem pediu/votou.
import { CFG } from '../nucleo/config.mjs';
import { listar, abrir } from '../nucleo/estado.mjs';
import { receber } from './1-fontes.mjs';

// Status da fábrica → etapa visível no portal.
const PARA_PORTAL = {
  recebida: 'aprovada-para-dev', 'em-triagem': 'aprovada-para-dev', 'aprovada-para-dev': 'aprovada-para-dev',
  'em-desenvolvimento': 'em-desenvolvimento', falha: 'em-desenvolvimento',
  'em-homologacao': 'em-homologacao', 'aguardando-aprovacao': 'em-homologacao',
  entregue: 'entregue', rejeitada: 'recusada',
};

function configurado() {
  const url = CFG.portal?.url;
  const token = process.env[CFG.portal?.tokenEnv ?? 'PORTAL_TOKEN'];
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function chamar(p, caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(p.url + caminho, {
    method: metodo,
    headers: { authorization: `Bearer ${p.token}`, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Portal ${metodo} ${caminho}: ${r.status} ${json.erro ?? ''}`);
  return json;
}

function textoDemanda(item) {
  const partes = [`# ${item.titulo}`, '', item.descricao, ''];
  if (item.tipo === 'bug') partes.push(`Tipo: bug reportado por usuário${item.pagina ? `\nPágina onde aconteceu: ${item.pagina}` : ''}`);
  else partes.push(`Tipo: ideia da comunidade — ${item.votos} votos — categoria ${item.categoria}`);
  partes.push(`Autor: ${item.autor}`);
  return partes.join('\n');
}

// Busca a fila do portal e cria uma demanda para cada item novo.
export async function puxarDoPortal(log = console.log) {
  const p = configurado();
  if (!p) return [];
  const ids = [];
  for (const item of await chamar(p, '/api/fabrica/fila')) {
    const id = await receber(textoDemanda(item), {
      nome: item.titulo,
      origem: item.tipo === 'bug' ? 'usuario-bug' : 'comunidade',
      votos: item.votos,
      externo: { portal: item.id, statusPortal: 'aprovada-para-dev' },
    });
    await chamar(p, `/api/fabrica/itens/${item.id}`, { metodo: 'PATCH', corpo: { fabricaId: id } });
    log(`📥 Portal → demanda ${id} ("${item.titulo}")`);
    ids.push(id);
  }
  return ids;
}

// Publica no portal o status atual de cada demanda que veio de lá (só quando mudou).
export async function devolverStatusAoPortal(log = console.log) {
  const p = configurado();
  if (!p) return;
  for (const e of listar().filter((e) => e.externo?.portal)) {
    const alvo = PARA_PORTAL[e.status];
    if (!alvo || alvo === e.externo.statusPortal) continue;
    const detalhe = e.historico.at(-1)?.detalhe;
    await chamar(p, `/api/fabrica/itens/${e.externo.portal}`, { metodo: 'PATCH', corpo: { status: alvo, detalhe } });
    abrir(e.id).atualizar({ externo: { ...e.externo, statusPortal: alvo } });
    log(`📤 Portal ← ${e.id}: ${alvo}`);
  }
}

export const portalConfigurado = () => Boolean(configurado());
