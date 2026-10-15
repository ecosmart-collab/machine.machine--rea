import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'fabrica.config.json'), 'utf8'));
export const REPO = path.resolve(ROOT, CFG.repo);
export const DIR = {
  entrada: path.join(ROOT, 'demandas', 'entrada'),
  ledger: path.join(ROOT, '.fabrica', 'demandas'),
  worktrees: path.join(ROOT, '.fabrica', 'worktrees'),
  prompts: path.join(ROOT, 'prompts'),
  conhecimento: path.join(ROOT, 'conhecimento'),
};
