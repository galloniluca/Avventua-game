/** Ambientazioni e contenuti data-driven: bestiario, PNG, oggetti. */

import * as repo from '../db/repos';
import { json, nonTrovato } from '../http';
import type { Contesto } from '../router';

export async function getSettings({ env }: Contesto): Promise<Response> {
  return json({ settings: await repo.listaSettings(env.DB) });
}

async function assicuraSetting(env: Contesto['env'], id: string) {
  const s = await repo.getSetting(env.DB, id);
  if (!s) throw nonTrovato('Ambientazione');
  return s;
}

export async function getBestiario({ env, params }: Contesto): Promise<Response> {
  const setting = await assicuraSetting(env, params.settingId!);
  return json({ bestiario: await repo.listaBestiario(env.DB, setting.id) });
}

export async function getNpc({ env, params }: Contesto): Promise<Response> {
  const setting = await assicuraSetting(env, params.settingId!);
  return json({ npc: await repo.listaNpc(env.DB, setting.id) });
}

export async function getItems({ env, params }: Contesto): Promise<Response> {
  const setting = await assicuraSetting(env, params.settingId!);
  return json({ oggetti: await repo.listaItems(env.DB, setting.id) });
}
