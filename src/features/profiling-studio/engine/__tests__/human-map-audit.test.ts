import { describe, expect, it } from 'vitest';
import { getHumanMapQuestions } from '../../data/human-map';
import { auditHumanMapAnswer, buildHumanMapBlueprint } from '../human-map';

describe('human map answer audit', () => {
  it('marks concrete recent answers as stronger evidence', () => {
    const question = getHumanMapQuestions('compact')[0];
    const audit = auditHumanMapAnswer(
      question,
      '最近 30 天我最明显的问题是项目一多就会切换太快。例如昨天同时开三个任务，结果每个都只推进了一半，所以我下一步要先固定一个主线。',
    );

    expect(audit.specificity).toBeGreaterThan(60);
    expect(audit.evidenceLevel).toBeGreaterThan(60);
    expect(audit.actionability).toBeGreaterThan(50);
    expect(audit.needsClarifier).toBe(false);
  });

  it('persists stage conclusions inside the Human Map blueprint', () => {
    const blueprint = buildHumanMapBlueprint('compact', {
      life_stage: '转型期，正在把 Openbasaka 变成真正的外脑。',
      current_issues: '最近最卡的是执行链路和记忆回写不稳定。',
      ideal_state: '我希望系统每天知道自己学到了什么，也知道下一步修哪里。',
    });

    expect(blueprint.answerAudits.length).toBeGreaterThan(0);
    expect(blueprint.stageConclusion.answeredCount).toBe(blueprint.answerAudits.length);
    expect(blueprint.stageConclusion.boundaryNote).toContain('不是临床诊断');
  });
});
