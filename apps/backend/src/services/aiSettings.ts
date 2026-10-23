import { z } from 'zod';
import { config } from '../config';
import { getDocument, putDocument } from './documentStore';

const key = 'ai-scope-settings';
export const aiSettingsInput = z.object({ navigationOnly: z.boolean() }).strict();
let savedNavigationOnly: boolean | null = null;

export function readAiSettings() {
  return { navigationOnly: savedNavigationOnly ?? config.ai.navigationOnly };
}
export async function initializeAiSettings() {
  const saved = await getDocument<unknown>(key, 'ai-settings');
  savedNavigationOnly = saved === null ? null : aiSettingsInput.parse(saved).navigationOnly;
}
export async function updateAiSettings(raw: unknown) {
  const settings = aiSettingsInput.parse(raw);
  // Apply only after storage confirms success, so a failed save cannot change the active mode.
  await putDocument(key, 'ai-settings', settings);
  savedNavigationOnly = settings.navigationOnly;
  return readAiSettings();
}
