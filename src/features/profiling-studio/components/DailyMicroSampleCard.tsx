/**
 * DailyMicroSampleCard — 首页「今日快照」卡片
 *
 * 显示在 HomePage 的探索路径和进度之间。
 * 登录用户每天可填写一次微采样。
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from '../lib/motion-lite';
import { useAuthStore } from '../store/auth';
import { useAssessmentStore } from '../store';
import { useMicroSampleStore } from '../store/microSample';
import { pickTodayMicroSampleQuestions } from '../utils/microSampleUtils';
import { insforge } from '../api/insforge';
import type { MicroSampleQuestion } from '../types';
import DailyMicroSampleDialog from './DailyMicroSampleDialog';

export default function DailyMicroSampleCard() {
  const user = useAuthStore((s) => s.user);
  const topology = useAssessmentStore((s) => s.topology);
  const { todayRecord, isLoadingToday, loadTodayMicroSample, syncLocalHistory } = useMicroSampleStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const syncTriggered = useRef(false);

  const isLoggedIn = !!insforge;

  // 挂载时加载今日记录
  useEffect(() => {
    if (user?.id) {
      loadTodayMicroSample(user.id, isLoggedIn);
    }
  }, [user?.id, isLoggedIn, loadTodayMicroSample]);

  // 登录后首次加载时，静默同步本地历史到云端
  useEffect(() => {
    if (user?.id && isLoggedIn && !syncTriggered.current) {
      syncTriggered.current = true;
      syncLocalHistory(user.id).catch(() => { /* 静默失败 */ });
    }
  }, [user?.id, isLoggedIn, syncLocalHistory]);

  // 从拓扑画像提取高优先级子维度 ID
  // TODO: 当画像系统更完善后，可根据 drainZones / confidenceMap 等维度得到更精确的排序
  const topDimensionIds = useMemo<string[]>(() => {
    if (!topology?.dimensionTopologies) {
      // 用户还没有画像，使用默认值
      return ['emotion_regulation'];
    }
    // 提取所有 dominant traits 对应的 dimensionId
    const ids: string[] = [];
    for (const dimTopo of Object.values(topology.dimensionTopologies)) {
      const dt = dimTopo as { dominantTraits?: Array<{ subDimensionId?: string }> };
      if (dt.dominantTraits) {
        for (const trait of dt.dominantTraits) {
          if (trait.subDimensionId) ids.push(trait.subDimensionId);
        }
      }
    }
    return ids.length > 0 ? ids : ['emotion_regulation'];
  }, [topology]);

  const todayQuestions: MicroSampleQuestion[] = useMemo(
    () => pickTodayMicroSampleQuestions(topDimensionIds),
    [topDimensionIds],
  );

  const completed = !!todayRecord;

  // 未登录不显示
  if (!user) return null;

  return (
    <>
      <section style={{ maxWidth: '760px', margin: '0 auto 2rem', padding: '0 1.5rem' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="glass-card"
          style={{
            padding: '28px 32px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Top accent line */}
          <div style={{
            position: 'absolute', top: 0, left: '10%', right: '10%', height: 2,
            background: completed
              ? 'linear-gradient(90deg, transparent, rgba(100, 255, 218, 0.3), transparent)'
              : 'linear-gradient(90deg, transparent, var(--accent-gold), transparent)',
            opacity: 0.6,
          }} />

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 16,
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: completed
                    ? 'rgba(100, 255, 218, 0.08)'
                    : 'rgba(255, 215, 0, 0.08)',
                  border: `1px solid ${completed
                    ? 'rgba(100, 255, 218, 0.15)'
                    : 'rgba(255, 215, 0, 0.15)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem',
                }}>
                  {completed ? '✓' : '📷'}
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: '1.05rem',
                }}>
                  今日快照
                </h3>
                <span className="badge" style={{ fontSize: '0.62rem' }}>
                  信号源⑤
                </span>
              </div>

              <p style={{
                color: 'var(--text-secondary)', fontSize: '0.82rem',
                lineHeight: 1.6, marginBottom: completed ? 8 : 0,
              }}>
                {completed
                  ? '今日数据已采集，感谢你的记录。'
                  : '用 1 分钟记录今天最真实的自己（每天仅一次）'}
              </p>

              {completed && (
                <p style={{
                  color: 'var(--text-tertiary)', fontSize: '0.74rem',
                  lineHeight: 1.5, fontStyle: 'italic',
                }}>
                  明天会结合更多数据，为你总结趋势。
                </p>
              )}
            </div>

            <div>
              {isLoadingToday ? (
                <div style={{
                  padding: '10px 24px', fontSize: '0.82rem',
                  color: 'var(--text-tertiary)',
                }}>
                  加载中…
                </div>
              ) : completed ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 24px', borderRadius: 12,
                  background: 'rgba(100, 255, 218, 0.06)',
                  border: '1px solid rgba(100, 255, 218, 0.12)',
                  color: 'rgba(100, 255, 218, 0.5)',
                  fontSize: '0.82rem', fontWeight: 500,
                  cursor: 'default',
                }}>
                  ✓ 今日已完成
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="btn-primary"
                  onClick={() => setDialogOpen(true)}
                  style={{ padding: '10px 28px', fontSize: '0.85rem' }}
                >
                  开始填写 ✦
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      </section>

      <DailyMicroSampleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        questions={todayQuestions}
      />
    </>
  );
}
