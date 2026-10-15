// Camada 1 — Fontes de demanda: "Eu", "Usuário", "Agente olhando a telemetria", "Entre outros…".
// Toda fonte termina igual: um texto + origem que vira uma demanda no ledger.
// - Pasta demandas/entrada/*.md (n8n, scripts, você)
// - CLI: node src/fabrica.mjs nova --origem usuario --votos 10 "texto"
// - Futuro: webhook do portal de ideias / formulário "Reportar bug" / alertas OpenTelemetry
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIR } from '../nucleo/config.mjs';
import { criar } from '../nucleo/estado.mjs';

export async function receber(texto, opcoes = {}) {
  if (!texto?.trim()) throw new Error('Demanda vazia.');
  return criar(texto, opcoes);
}

// Move cada arquivo da pasta de entrada para o ledger.
export async function coletarEntrada() {
  await fs.mkdir(DIR.entrada, { recursive: true });
  const ids = [];
  for (const f of (await fs.readdir(DIR.entrada)).filter((f) => /\.(md|txt)$/i.test(f)).sort()) {
    const arq = path.join(DIR.entrada, f);
    ids.push(await receber(await fs.readFile(arq, 'utf8')));
    await fs.unlink(arq);
  }
  return ids;
}
