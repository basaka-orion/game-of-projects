/**
 * 数据采集服务
 *
 * 捕获所有模块的原始作答数据, 用于后续心理测量分析
 * 双重持久化: localStorage (离线容错) + Insforge 后端 (云端)
 *
 * 采集内容:
 *   - 问卷量表作答 (含锚定量表)
 *   - AVG 情境选择
 *   - 认知/博弈游戏结果
 *   - CAT 自适应响应链
 *   - 元数据 (时间戳、设备、做题时长)
 */

import { insforge } from '../api/insforge';

export interface ResponseRecord {
  sessionId: string;
  module: string;              // 'cognitive' | 'personality' | 'avg' | 'stroop' | 'cat_personality' ...
  moduleType: 'questionnaire' | 'avg' | 'game' | 'cat' | 'anchor';
  answers: Record<string, string | number>;
  metadata: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    device: string;
    userAgent: string;
    screenSize: string;
  };
}

export interface CollectedDataset {
  version: string;
  exportedAt: string;
  totalSessions: number;
  records: ResponseRecord[];
}

const STORAGE_KEY = 'psychometric-data-v1';
const SESSION_KEY = 'current-session-id';
const SYNC_QUEUE_KEY = 'psychometric-sync-queue';

// ── Session Management ──
function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function getDeviceInfo() {
  return {
    device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    userAgent: navigator.userAgent.slice(0, 120),
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
  };
}

// ── Insforge Cloud Sync ──

/**
 * 将单条记录同步到 Insforge 后端
 * 静默失败 — 失败的记录会加入重试队列
 */
async function syncToBackend(record: ResponseRecord): Promise<boolean> {
  if (!insforge) return false;

  try {
    const { error } = await insforge.database
      .from('psychometric_responses')
      .insert({
        session_id: record.sessionId,
        module: record.module,
        module_type: record.moduleType,
        answers: record.answers,
        started_at: record.metadata.startedAt,
        completed_at: record.metadata.completedAt,
        duration_ms: record.metadata.durationMs,
        device: record.metadata.device,
        user_agent: record.metadata.userAgent,
        screen_size: record.metadata.screenSize,
      });

    if (error) {
      console.warn('[DataCollection] Sync error:', error.message);
      return false;
    }

    console.log(`[DataCollection] ☁️ Synced ${record.module} to cloud`);
    return true;
  } catch (err) {
    console.warn('[DataCollection] Sync failed:', err);
    return false;
  }
}

/**
 * 重试队列中的待同步记录
 */
function addToSyncQueue(record: ResponseRecord): void {
  try {
    const queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    queue.push(record);
    // 最多保留 200 条待同步
    const trimmed = queue.slice(-200);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/**
 * 尝试同步队列中的待发送记录 (页面载入时调用)
 */
export async function flushSyncQueue(): Promise<void> {
  if (!insforge) return;
  try {
    const queue: ResponseRecord[] = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    console.log(`[DataCollection] Flushing ${queue.length} queued records…`);
    const remaining: ResponseRecord[] = [];
    for (const record of queue) {
      const ok = await syncToBackend(record);
      if (!ok) remaining.push(record);
    }
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remaining));
    if (remaining.length > 0) {
      console.warn(`[DataCollection] ${remaining.length} records still in queue`);
    }
  } catch { /* ignore */ }
}

// ── Core Collection Functions ──

/**
 * 记录一个模块的完整作答数据
 */
export function recordModuleResponse(
  module: string,
  moduleType: ResponseRecord['moduleType'],
  answers: Record<string, string | number>,
  startTime: number,
): void {
  const now = Date.now();
  const record: ResponseRecord = {
    sessionId: getOrCreateSessionId(),
    module,
    moduleType,
    answers,
    metadata: {
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(now).toISOString(),
      durationMs: now - startTime,
      ...getDeviceInfo(),
    },
  };

  // 1. 本地持久化 (离线容错)
  const existing = getAllRecords();
  existing.push(record);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    const trimmed = existing.slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  // 2. 云端同步 (异步, 非阻塞)
  syncToBackend(record).then((ok) => {
    if (!ok) addToSyncQueue(record);
  });

  console.log(`[DataCollection] Recorded ${module} (${moduleType}), session=${record.sessionId.slice(0, 8)}…`);
}

/**
 * 获取所有已收集的记录
 */
export function getAllRecords(): ResponseRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 导出完整数据集为 JSON (用于下载分析)
 */
export function exportDataset(): CollectedDataset {
  const records = getAllRecords();
  const sessionIds = new Set(records.map(r => r.sessionId));
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    totalSessions: sessionIds.size,
    records,
  };
}

/**
 * 下载数据集为 JSON 文件
 */
export function downloadDataset(): void {
  const data = exportDataset();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `psychometric-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 获取简要统计摘要
 */
export function getCollectionStats(): {
  totalRecords: number;
  totalSessions: number;
  moduleBreakdown: Record<string, number>;
} {
  const records = getAllRecords();
  const sessions = new Set(records.map(r => r.sessionId));
  const breakdown: Record<string, number> = {};
  records.forEach(r => { breakdown[r.module] = (breakdown[r.module] || 0) + 1; });
  return {
    totalRecords: records.length,
    totalSessions: sessions.size,
    moduleBreakdown: breakdown,
  };
}

/**
 * 清除所有已收集数据
 */
export function clearCollectedData(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SYNC_QUEUE_KEY);
}
