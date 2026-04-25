/**
 * Micro Samples API — 日常微采样数据持久化
 *
 * 双模式架构：
 * - 已登录用户 → Insforge 云端（fallback 到 localStorage）
 * - 未登录用户 → localStorage
 *
 * Insforge `micro_samples` 表已通过 REST API 创建，schema：
 *   id                    INTEGER (auto, PK)
 *   created_at            TIMESTAMP (auto)
 *   updated_at            TIMESTAMP (auto)
 *   user_id               TEXT NOT NULL
 *   date                  TEXT NOT NULL   — 'YYYY-MM-DD'
 *   questions             TEXT NOT NULL   — JSON string
 *   answers               TEXT NOT NULL   — JSON string
 *   related_dimension_ids TEXT            — JSON string
 */
import { insforge } from './insforge';
import type { MicroSampleQuestion, MicroSampleAnswer, MicroSampleRecord } from '../types';

export interface CreateMicroSampleInput {
  userId: string;
  date: string;
  questions: MicroSampleQuestion[];
  answers: MicroSampleAnswer[];
  relatedDimensionIds: string[];
}

// ── Helpers ──

function buildLocalRecord(input: CreateMicroSampleInput): MicroSampleRecord {
  return {
    id: `local_${Date.now()}`,
    userId: input.userId,
    date: input.date,
    createdAt: new Date().toISOString(),
    questions: input.questions,
    answers: input.answers,
    relatedDimensionIds: input.relatedDimensionIds,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToRecord(row: any): MicroSampleRecord {
  return {
    id: String(row.id),
    userId: row.user_id,
    date: row.date,
    createdAt: row.created_at,
    questions: typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions,
    answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
    relatedDimensionIds: typeof row.related_dimension_ids === 'string'
      ? JSON.parse(row.related_dimension_ids)
      : (row.related_dimension_ids || []),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Cloud (Insforge) ──

/**
 * 创建一条微采样记录
 * @param isLoggedIn - 是否已登录，决定走云端还是本地
 */
export async function createMicroSample(
  input: CreateMicroSampleInput,
  isLoggedIn: boolean,
): Promise<MicroSampleRecord> {
  // 未登录 → 直接返回本地 mock
  if (!isLoggedIn || !insforge) {
    if (!isLoggedIn) {
      console.log('[MicroSamples] 未登录，数据仅保存到本地 store');
    } else {
      console.warn('[MicroSamples] Insforge 未配置，数据仅保存到本地 store');
    }
    return buildLocalRecord(input);
  }

  try {
    // Insforge SDK insert 要求传数组
    const { data, error } = await insforge.database
      .from('micro_samples')
      .insert([{
        user_id: input.userId,
        date: input.date,
        questions: JSON.stringify(input.questions),
        answers: JSON.stringify(input.answers),
        related_dimension_ids: JSON.stringify(input.relatedDimensionIds),
      }])
      .select()
      .single();

    if (error) {
      console.warn('[MicroSamples] 云端写入失败，降级到本地:', error.message);
      return buildLocalRecord(input);
    }

    console.log('[MicroSamples] ✅ 云端写入成功');
    return rowToRecord(data);
  } catch (err) {
    console.warn('[MicroSamples] 云端请求异常，降级到本地:', err);
    return buildLocalRecord(input);
  }
}

/**
 * 获取用户今天的微采样记录
 * @param isLoggedIn - 是否已登录
 */
export async function getTodayMicroSample(
  userId: string,
  isLoggedIn: boolean,
): Promise<MicroSampleRecord | null> {
  // 未登录或 Insforge 未配置 → 返回 null，交给 store 的 localStorage 缓存
  if (!isLoggedIn || !insforge) return null;

  const today = new Date().toISOString().slice(0, 10);

  try {
    const { data, error } = await insforge.database
      .from('micro_samples')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    return rowToRecord(data);
  } catch {
    return null;
  }
}

/**
 * 同步本地历史记录到云端（登录后调用，最近 7 天）
 */
export async function syncLocalToCloud(
  localRecords: MicroSampleRecord[],
): Promise<number> {
  if (!insforge) return 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().slice(0, 10);

  const recentRecords = localRecords.filter(
    (r) => r.date >= cutoff && r.id.startsWith('local_'),
  );

  if (recentRecords.length === 0) return 0;

  let synced = 0;

  for (const record of recentRecords) {
    try {
      // 先检查云端是否已有这天的数据
      const { data: existing } = await insforge.database
        .from('micro_samples')
        .select('id')
        .eq('user_id', record.userId)
        .eq('date', record.date)
        .limit(1)
        .single();

      if (existing) {
        synced++; // 已存在，跳过但计数
        continue;
      }

      // 写入云端
      const { error } = await insforge.database
        .from('micro_samples')
        .insert([{
          user_id: record.userId,
          date: record.date,
          questions: JSON.stringify(record.questions),
          answers: JSON.stringify(record.answers),
          related_dimension_ids: JSON.stringify(record.relatedDimensionIds),
        }]);

      if (!error) synced++;
    } catch {
      // 单条失败不影响后续
    }
  }

  if (synced > 0) {
    console.log(`[MicroSamples] ✅ 同步了 ${synced} 条本地记录到云端`);
  }

  return synced;
}
