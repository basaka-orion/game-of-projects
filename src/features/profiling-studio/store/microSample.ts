/**
 * Micro Sample Store — 日常微采样状态管理
 *
 * 双模式：
 * - 已登录 → Insforge 云端优先，localStorage 作为缓存
 * - 未登录 → 纯 localStorage
 *
 * 新增 localHistory 字段保存未登录期间的历史记录，
 * 登录后通过 syncLocalHistory 同步到云端。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MicroSampleRecord } from '../types';
import { getTodayMicroSample, syncLocalToCloud } from '../api/microSamples';

interface MicroSampleState {
  todayRecord: MicroSampleRecord | null;
  isLoadingToday: boolean;

  /** 未登录期间的历史记录（持久化到 localStorage） */
  localHistory: MicroSampleRecord[];

  /** 加载今日的微采样记录 */
  loadTodayMicroSample: (userId: string, isLoggedIn: boolean) => Promise<void>;
  /** 手动设置今日记录（提交成功后调用） */
  setTodayRecord: (record: MicroSampleRecord | null) => void;
  /** 添加到本地历史（未登录提交时调用） */
  addToLocalHistory: (record: MicroSampleRecord) => void;
  /** 登录后同步本地历史到云端 */
  syncLocalHistory: (userId: string) => Promise<void>;
}

const getToday = () => new Date().toISOString().slice(0, 10);

export const useMicroSampleStore = create<MicroSampleState>()(
  persist(
    (set, get) => ({
      todayRecord: null,
      isLoadingToday: false,
      localHistory: [],

      loadTodayMicroSample: async (userId: string, isLoggedIn: boolean) => {
        // 先检查本地缓存的记录是否是今天的
        const cached = get().todayRecord;
        if (cached && cached.date === getToday()) {
          return; // 今天已经有记录了
        }

        // 如果缓存的日期不是今天，清除旧缓存
        if (cached && cached.date !== getToday()) {
          set({ todayRecord: null });
        }

        set({ isLoadingToday: true });

        try {
          if (isLoggedIn) {
            // 已登录 → 先查云端
            const cloudRecord = await getTodayMicroSample(userId, true);
            if (cloudRecord) {
              set({ todayRecord: cloudRecord, isLoadingToday: false });
              return;
            }
          }

          // 未登录 or 云端无数据 → 检查 localHistory 中今天的记录
          const localToday = get().localHistory.find(
            (r) => r.date === getToday() && r.userId === userId,
          );
          set({
            todayRecord: localToday || null,
            isLoadingToday: false,
          });
        } catch {
          set({ isLoadingToday: false });
        }
      },

      setTodayRecord: (record) => set({ todayRecord: record }),

      addToLocalHistory: (record) => {
        const history = get().localHistory;
        // 避免重复（同 userId + 同 date）
        const filtered = history.filter(
          (r) => !(r.userId === record.userId && r.date === record.date),
        );
        // 只保留最近 30 天
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);
        const trimmed = filtered.filter((r) => r.date >= cutoff);
        set({ localHistory: [...trimmed, record] });
      },

      syncLocalHistory: async (userId: string) => {
        const { localHistory } = get();
        // 只同步属于当前用户的记录
        const userRecords = localHistory.filter((r) => r.userId === userId);

        if (userRecords.length === 0) return;

        const synced = await syncLocalToCloud(userRecords);

        if (synced > 0) {
          // 清除已同步的本地记录（保留其他用户的）
          const remaining = localHistory.filter((r) => r.userId !== userId);
          set({ localHistory: remaining });
        }
      },
    }),
    {
      name: 'mdp-micro-sample',
      partialize: (state) => ({
        todayRecord: state.todayRecord,
        localHistory: state.localHistory,
      }),
    },
  ),
);
