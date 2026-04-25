/**
 * Insforge Client — Database + AI via @insforge/sdk
 */
import { createClient } from '@insforge/sdk';

const INSFORGE_URL = import.meta.env.VITE_INSFORGE_URL || '';
const INSFORGE_KEY = import.meta.env.VITE_INSFORGE_KEY || '';

export const insforge = INSFORGE_URL && INSFORGE_KEY
  ? createClient({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_KEY })
  : null;

export interface DialogueRecord {
  id?: string;
  created_at?: string;
  session_id: string;
  scores: Record<string, number>;
  messages: Array<{ role: string; content: string; timestamp: string }>;
  phase: string;
  completed: boolean;
}

/**
 * Save a dialogue session (upsert by session_id)
 */
export async function saveDialogue(record: DialogueRecord): Promise<void> {
  if (!insforge) {
    console.warn('[Insforge] Client not configured, skipping save');
    return;
  }

  try {
    const { error } = await insforge.database
      .from('dialogue_sessions')
      .upsert({
        session_id: record.session_id,
        scores: record.scores,
        messages: record.messages,
        phase: record.phase,
        completed: record.completed,
      }, { onConflict: 'session_id' });

    if (error) {
      console.warn('[Insforge] Save error:', error.message);
    }
  } catch (err) {
    console.warn('[Insforge] Save failed:', err);
  }
}

/**
 * Load recent dialogue sessions
 */
export async function loadDialogues(limit = 10): Promise<DialogueRecord[]> {
  if (!insforge) return [];

  try {
    const { data, error } = await insforge.database
      .from('dialogue_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[Insforge] Load error:', error.message);
      return [];
    }
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Save user profile/report data
 */
export async function saveProfile(profileData: {
  scores: Record<string, number>;
  subScores: Record<string, Record<string, number>>;
  reportTitle?: string;
}): Promise<void> {
  if (!insforge) return;

  try {
    await insforge.database
      .from('user_profiles')
      .upsert({
        profile_id: 'default',
        scores: profileData.scores,
        sub_scores: profileData.subScores,
        report_title: profileData.reportTitle || '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'profile_id' });
  } catch (err) {
    console.warn('[Insforge] Profile save failed:', err);
  }
}
