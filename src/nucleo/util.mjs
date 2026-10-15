import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, REPO, DIR } from './config.mjs';

function matar(p) {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true });
  else p.kill('SIGKILL');
}

export function run(cmd, args, { cwd = ROOT, input, shell = false, timeoutMs } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, shell, windowsHide: true });
    let stdout = '', stderr = '', estourou = false;
    const timer = timeoutMs ? setTimeout(() => { estourou = true; matar(p); }, timeoutMs) : null;
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + String(e), estourou }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, estourou }); });
    p.stdin.end(input);
  });
}

export const sh = (comando, cwd) => run(comando, [], { cwd, shell: true });

export async function git(args, cwd = REPO, { permitirFalha = false } = {}) {
  const r = await run('git', ['-c', 'user.name=fabrica', '-c', 'user.email=fabrica@local', ...args], { cwd });
  if (r.code !== 0 && !permitirFalha) throw new Error(`git ${args.join(' ')} falhou:\n${r.stderr || r.stdout}`);
  return r;
}

export const branchExiste = async (b) => (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], REPO, { permitirFalha: true })).code === 0;

export const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'demanda';
export const cauda = (s, n = 6000) => (s.length > n ? '…' + s.slice(-n) : s);
export const corta = (s, n = 60000) => (s.length > n ? s.slice(0, n) + '\n… (truncado)' : s);

export function extrairJson(texto) {
  const bloco = texto.match(/```json\s*([\s\S]*?)```/);
  const bruto = bloco ? bloco[1] : texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1);
  try { return JSON.parse(bruto); } catch { throw new Error(`Resposta sem JSON válido:\n${cauda(texto, 1500)}`); }
}

// "Conhecimento do projeto": injetado em todo prompt para os agentes saberem o que é o produto.
export function conhecimento() {
  const arq = path.join(DIR.conhecimento, 'projeto.md');
  return fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8')
    : '(Sem base de conhecimento ainda. Investigue o repositório e leia CLAUDE.md/README se existirem.)';
}

export function prompt(nome, vars) {
  const tpl = fs.readFileSync(path.join(DIR.prompts, `${nome}.md`), 'utf8');
  const todas = { conhecimento: conhecimento(), ...vars };
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = todas[k] ?? '';
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  });
}

export async function pool(itens, limite, fn) {
  const resultados = [];
  let i = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) { const idx = i++; resultados[idx] = await fn(itens[idx]); }
  });
  await Promise.all(trabalhadores);
  return resultados;
}

export function serializador() {
  let fila = Promise.resolve();
  return (fn) => (fila = fila.then(fn, fn));
}
