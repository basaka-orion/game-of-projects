/**
 * 微采样题目模板 — 3 组 preset
 *
 * 每组 3 道题（1 单选 + 2 Likert），约 30-60 秒即可完成。
 * 后续可根据画像动态扩展更多维度的模板。
 */
import type { MicroSampleQuestion } from '../types';

export const microSamplePresets: Record<string, MicroSampleQuestion[]> = {
  // ── 模板 A：情绪起伏 & 调节 ──
  // 适用于高神经质 / 情绪调节薄弱的用户
  emotion_regulation: [
    {
      id: 'emotion_peak_event',
      dimensionId: 'emotion_regulation',
      type: 'single_choice',
      prompt: '今天让你情绪波动最大的一件事，大致是哪一类？',
      options: [
        '工作/学习相关（任务、deadline、绩效）',
        '人际相关（家人、伴侣、同事、朋友）',
        '身体状态相关（睡眠、健康、疲劳）',
        '其他小事（排队、交通、社交媒体等）',
      ],
    },
    {
      id: 'emotion_awareness',
      dimensionId: 'emotion_regulation',
      type: 'likert5',
      prompt: '今天大部分时间里，我都能清楚知道自己在感受什么情绪。',
    },
    {
      id: 'emotion_regulation_strategy',
      dimensionId: 'emotion_regulation',
      type: 'likert5',
      prompt: '当情绪变得比较激烈时，我能用一种对自己有帮助的方式让情绪缓和下来。',
    },
  ],

  // ── 模板 B：过度工作 & 界限 ──
  // 适用于高尽责性、高自我压力的用户
  work_overcommitment: [
    {
      id: 'work_overcommit_event',
      dimensionId: 'work_overcommitment',
      type: 'single_choice',
      prompt: '今天有没有答应一件其实可以说"不"的工作/请求？',
      options: [
        '有，而且当时其实很不想答应',
        '有，但当时觉得还好',
        '没有，我拒绝了几件不必要的请求',
        '没有，也没有类似情况',
      ],
    },
    {
      id: 'boundary_feeling',
      dimensionId: 'work_overcommitment',
      type: 'likert5',
      prompt: '当我拒绝别人合理范围之外的要求时，我心里是踏实而不是内疚的。',
    },
    {
      id: 'rest_guilt',
      dimensionId: 'work_overcommitment',
      type: 'likert5',
      prompt: '当我选择休息而不是继续工作时，我会觉得有点"浪费时间"或"不配"。',
    },
  ],

  // ── 模板 C：社交回避 & 连接 ──
  // 适用于社交退缩倾向的用户
  social_avoidance: [
    {
      id: 'social_opportunity',
      dimensionId: 'social_avoidance',
      type: 'single_choice',
      prompt: '今天有没有一个你本可以和别人多说几句/多主动一点的时刻？',
      options: [
        '有，但我选择装作没看到/没听到',
        '有，我犹豫了一下，最后还是没有行动',
        '有，我鼓起勇气主动了一点',
        '我没遇到类似的机会',
      ],
    },
    {
      id: 'social_satisfaction',
      dimensionId: 'social_avoidance',
      type: 'likert5',
      prompt: '今天结束的时候，我对自己和他人的连接感到基本满意。',
    },
    {
      id: 'social_fear',
      dimensionId: 'social_avoidance',
      type: 'likert5',
      prompt: '一想到要主动联系别人，我会下意识有点紧张或不安。',
    },
  ],
};
