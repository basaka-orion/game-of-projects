/**
 * SQLite 数据存储层
 * 本地优先，零配置
 */

export interface ProjectRecord {
  id: string
  title: string
  oneLiner: string
  tags: string
  radarJson: string
  survivalRate: number
  survivalGrade: string
  summary: string
  recommendation: string
  warLogsJson: string
  rawContent: string
  createdAt: string
  updatedAt: string
}

export interface BossProfile {
  key: string
  value: string
}

/** 生成 Schema SQL */
export function getSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      one_liner TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      radar_json TEXT DEFAULT '{}',
      survival_rate REAL DEFAULT 0,
      survival_grade TEXT DEFAULT 'F',
      summary TEXT DEFAULT '',
      recommendation TEXT DEFAULT '',
      war_logs_json TEXT DEFAULT '[]',
      raw_content TEXT DEFAULT '',
      is_pinned INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      priority_level TEXT DEFAULT 'normal' CHECK(priority_level IN ('low','normal','high','urgent')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS boss_profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 对话持久化（Openbasaka 聊天记录）
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT '',
      messages_json TEXT DEFAULT '[]',
      context_type TEXT DEFAULT 'openbasaka',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 项目版本历史（每次重新推演产生新版本）
    CREATE TABLE IF NOT EXISTS project_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version INTEGER DEFAULT 1,
      radar_json TEXT DEFAULT '{}',
      survival_rate REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Boss 决策记录（Pursue/Pivot/Abandon）
    CREATE TABLE IF NOT EXISTS boss_decisions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      decision_type TEXT NOT NULL CHECK(decision_type IN ('pursue', 'pivot', 'abandon', 'archive')),
      reasoning TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Boss 记忆（从交互中学习的洞察）
    CREATE TABLE IF NOT EXISTS boss_memory (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK(category IN ('preference', 'pattern', 'insight', 'correction', 'goal', 'emotion')),
      content TEXT NOT NULL,
      source TEXT DEFAULT '',
      confidence REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 项目分类学（多维度科学分类）
    CREATE TABLE IF NOT EXISTS project_taxonomy (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      taxonomy_json TEXT DEFAULT '{}',
      analysis_json TEXT DEFAULT '{}',
      industry TEXT DEFAULT '',
      sub_industry TEXT DEFAULT '',
      innovation_type TEXT DEFAULT 'incremental',
      era_relevance REAL DEFAULT 50,
      breakthrough_potential REAL DEFAULT 50,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_survival ON projects(survival_rate DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_attention ON projects(is_pinned DESC, is_starred DESC, priority_level, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_versions_project ON project_versions(project_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_boss_decisions_project ON boss_decisions(project_id);
    CREATE INDEX IF NOT EXISTS idx_boss_memory_category ON boss_memory(category);
    CREATE INDEX IF NOT EXISTS idx_boss_memory_confidence ON boss_memory(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_taxonomy_project ON project_taxonomy(project_id);
    CREATE INDEX IF NOT EXISTS idx_taxonomy_industry ON project_taxonomy(industry);

    -- Boss 多维画像测评记录
    CREATE TABLE IF NOT EXISTS boss_assessment_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'multi_dimension_profiling',
      profile_version TEXT DEFAULT 'v1',
      mode TEXT NOT NULL CHECK(mode IN ('quick', 'deep', 'dialogue')),
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('draft', 'running', 'completed', 'failed')),
      title TEXT DEFAULT '',
      raw_result_json TEXT NOT NULL DEFAULT '{}',
      normalized_result_json TEXT NOT NULL DEFAULT '{}',
      summary_json TEXT NOT NULL DEFAULT '{}',
      confidence REAL DEFAULT 0.7,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_boss_assessment_runs_created ON boss_assessment_runs(created_at DESC);

    -- Boss 生效画像快照
    CREATE TABLE IF NOT EXISTS boss_profile_snapshots (
      id TEXT PRIMARY KEY,
      run_id TEXT REFERENCES boss_assessment_runs(id) ON DELETE SET NULL,
      profile_json TEXT NOT NULL DEFAULT '{}',
      diff_json TEXT NOT NULL DEFAULT '{}',
      source TEXT DEFAULT 'profiling_apply',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_boss_profile_snapshots_created ON boss_profile_snapshots(created_at DESC);

    -- Boss 自我蒸馏：所有关于 Boss 的长期结论都必须带证据、状态和确认门
    CREATE TABLE IF NOT EXISTS boss_distillation_proposals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      rationale TEXT NOT NULL DEFAULT '',
      proposed_by TEXT NOT NULL DEFAULT 'openbasaka',
      source_kind TEXT DEFAULT '',
      source_id TEXT DEFAULT '',
      source_title TEXT DEFAULT '',
      claim_ids_json TEXT DEFAULT '[]',
      profile_patch_json TEXT DEFAULT '{}',
      memory_writes_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','superseded')),
      review_note TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',
      rejected_at TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_boss_distillation_proposals_status
      ON boss_distillation_proposals(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_boss_distillation_proposals_source
      ON boss_distillation_proposals(source_kind, source_id);

    CREATE TABLE IF NOT EXISTS boss_distillation_claims (
      id TEXT PRIMARY KEY,
      proposal_id TEXT DEFAULT '',
      dimension TEXT NOT NULL DEFAULT 'preference'
        CHECK(dimension IN ('mission','value','preference','anti_pattern','decision_pattern','emotion_weight','boundary','learning_mode','project_taste')),
      claim TEXT NOT NULL DEFAULT '',
      evidence_tier TEXT NOT NULL DEFAULT 'derived_inference'
        CHECK(evidence_tier IN ('boss_verbatim','boss_action','boss_assessment','derived_inference','external_context')),
      evidence_refs_json TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.5,
      temporal_scope TEXT NOT NULL DEFAULT 'stage' CHECK(temporal_scope IN ('momentary','stage','long_term')),
      status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('raw','proposed','approved','rejected','superseded','approved_legacy')),
      affects_profile_keys_json TEXT DEFAULT '[]',
      source_kind TEXT DEFAULT '',
      source_id TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_boss_distillation_claims_status
      ON boss_distillation_claims(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_boss_distillation_claims_dimension
      ON boss_distillation_claims(dimension, status, confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_boss_distillation_claims_source
      ON boss_distillation_claims(source_kind, source_id);

    -- 突触连接（项目间的关系）
    CREATE TABLE IF NOT EXISTS synapses (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('complementary', 'sequential', 'synergistic', 'conflicting', 'inspiration', 'skill-transfer')),
      strength REAL DEFAULT 50,
      reason TEXT DEFAULT '',
      action_items_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_synapses_source ON synapses(source_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_target ON synapses(target_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_type ON synapses(type);
    CREATE INDEX IF NOT EXISTS idx_synapses_strength ON synapses(strength DESC);

    -- 知识图谱：三元组
    CREATE TABLE IF NOT EXISTS knowledge_triples (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL,
      source TEXT DEFAULT '',
      confidence REAL DEFAULT 0.8,
      valid_from TEXT DEFAULT '',
      valid_to TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_kg_subject ON knowledge_triples(subject);
    CREATE INDEX IF NOT EXISTS idx_kg_object ON knowledge_triples(object);
    CREATE INDEX IF NOT EXISTS idx_kg_predicate ON knowledge_triples(predicate);
    CREATE INDEX IF NOT EXISTS idx_kg_confidence ON knowledge_triples(confidence DESC);

    -- 实体注册表（MemPalace 对齐）
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'concept',
      aliases TEXT DEFAULT '[]',
      description TEXT DEFAULT '',
      first_seen TEXT DEFAULT (datetime('now','localtime')),
      last_updated TEXT DEFAULT (datetime('now','localtime')),
      metadata_json TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

    -- 记忆宫殿：房间
    CREATE TABLE IF NOT EXISTS memory_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '🏠',
      room_type TEXT NOT NULL DEFAULT 'custom',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 记忆宫殿：记忆条目
    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES memory_rooms(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'note',
      content TEXT NOT NULL,
      source TEXT DEFAULT '',
      importance REAL DEFAULT 50,
      access_count INTEGER DEFAULT 0,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_memory_items_room ON memory_items(room_id, importance DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_items_importance ON memory_items(importance DESC);

    -- FTS5 全文搜索索引
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      content,
      source,
      content='memory_items',
      content_rowid='rowid'
    );

    -- 触发器：自动同步 FTS
    CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_items BEGIN
      INSERT INTO memory_fts(rowid, content, source) VALUES (new.rowid, new.content, new.source);
    END;
    CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_items BEGIN
      INSERT INTO memory_fts(memory_fts, rowid, content, source) VALUES ('delete', old.rowid, old.content, old.source);
    END;
    CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory_items BEGIN
      INSERT INTO memory_fts(memory_fts, rowid, content, source) VALUES ('delete', old.rowid, old.content, old.source);
      INSERT INTO memory_fts(rowid, content, source) VALUES (new.rowid, new.content, new.source);
    END;

    -- 预设房间（首次运行时由代码插入）

    -- 自定义 Agent Bot
    CREATE TABLE IF NOT EXISTS custom_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      icon TEXT DEFAULT '◈',
      avatar_style TEXT DEFAULT 'default',
      system_prompt TEXT NOT NULL,
      system_prompt_en TEXT DEFAULT '',
      temperature REAL DEFAULT 0.7,
      personality TEXT DEFAULT '',
      skills TEXT DEFAULT '[]',
      color TEXT DEFAULT '#00d4aa',
      soul_json TEXT DEFAULT '',
      memory_json TEXT DEFAULT '',
      bot_token TEXT DEFAULT '',
      platform_config_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 内置角色的 Soul 覆盖层（用户自定义的 Soul 修改）
    CREATE TABLE IF NOT EXISTS agent_souls (
      agent_id TEXT PRIMARY KEY,
      soul_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Agent 记忆条目（MEMORY.md — Hermes 风格）
    CREATE TABLE IF NOT EXISTS agent_memories (
      agent_id TEXT NOT NULL,
      entry TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (agent_id, created_at)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id);

    -- Agent 会话快照（Hermes 冻结记忆模式）
    CREATE TABLE IF NOT EXISTS agent_session_snapshots (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_id TEXT DEFAULT '',
      topic TEXT DEFAULT '',
      soul_json TEXT DEFAULT '{}',
      memory_snapshot_json TEXT DEFAULT '{}',
      prompt_preview TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_session_snapshots_agent ON agent_session_snapshots(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_session_snapshots_session ON agent_session_snapshots(session_id, created_at DESC);

    -- Agent 反思记录（每轮结束后的学习与下次改进）
    CREATE TABLE IF NOT EXISTS agent_reflections (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_id TEXT DEFAULT '',
      team_id TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      phase TEXT DEFAULT '',
      learned TEXT DEFAULT '',
      next_time TEXT DEFAULT '',
      memory_entry TEXT DEFAULT '',
      update_memory INTEGER DEFAULT 1,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_reflections_agent ON agent_reflections(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_reflections_session ON agent_reflections(session_id, created_at DESC);

    -- 工作流
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      goal TEXT NOT NULL,
      steps_json TEXT DEFAULT '[]',
      agents_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id),
      results_json TEXT DEFAULT '{}',
      status TEXT DEFAULT 'running',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS openbasaka_runs (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      module_name TEXT DEFAULT '',
      boss_demand TEXT DEFAULT '',
      title TEXT DEFAULT '',
      status TEXT DEFAULT 'queued',
      current_step_id TEXT DEFAULT '',
      result_preview TEXT DEFAULT '',
      error TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      completed_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS openbasaka_run_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      node_id TEXT DEFAULT '',
      target_tab TEXT DEFAULT '',
      title TEXT DEFAULT '',
      detail TEXT DEFAULT '',
      status TEXT DEFAULT 'queued',
      started_at TEXT DEFAULT '',
      completed_at TEXT DEFAULT '',
      output_preview TEXT DEFAULT '',
      order_index INTEGER DEFAULT 0,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_openbasaka_runs_status
      ON openbasaka_runs(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_openbasaka_run_steps_run
      ON openbasaka_run_steps(run_id, order_index ASC);

    CREATE TABLE IF NOT EXISTS workflow_studio_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal TEXT DEFAULT '',
      workflow_type TEXT DEFAULT 'custom',
      team_id TEXT DEFAULT '',
      prompt_template TEXT DEFAULT '',
      steps_json TEXT DEFAULT '[]',
      target_consumers_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      last_test_status TEXT DEFAULT 'idle',
      last_test_input TEXT DEFAULT '',
      last_test_output TEXT DEFAULT '',
      last_optimization_feedback TEXT DEFAULT '',
      last_optimization_output TEXT DEFAULT '',
      published_targets_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 技能进化追踪
    CREATE TABLE IF NOT EXISTS skill_evolution (
      skill_id TEXT PRIMARY KEY,
      usage_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      last_used TEXT DEFAULT '',
      improved_prompt TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 定时任务
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      task_type TEXT NOT NULL,
      task_config_json TEXT DEFAULT '{}',
      agent_id TEXT DEFAULT '',
      platform_config_json TEXT DEFAULT '{}',
      last_run TEXT DEFAULT '',
      next_run TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Cron 执行日志
    CREATE TABLE IF NOT EXISTS cron_execution_log (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_name TEXT NOT NULL,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
      message TEXT DEFAULT '',
      duration_ms INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_cron_log_task ON cron_execution_log(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cron_log_time ON cron_execution_log(created_at DESC);

    -- 对话全文搜索
    CREATE VIRTUAL TABLE IF NOT EXISTS conversation_fts USING fts5(
      content,
      role,
      session_id
    );

    -- 团队
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      team_type TEXT NOT NULL CHECK(team_type IN ('permanent', 'agency', 'brainstorm')),
      agents_json TEXT DEFAULT '[]',
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      config_json TEXT DEFAULT '{}',
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'disbanded')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_teams_type ON teams(team_type);
    CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);

    -- 团队会话日志
    CREATE TABLE IF NOT EXISTS team_sessions (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      title TEXT DEFAULT '',
      topic TEXT DEFAULT '',
      messages_json TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      is_pinned INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'failed')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_team_sessions_team ON team_sessions(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_sessions_attention ON team_sessions(team_id, is_pinned DESC, is_starred DESC, updated_at DESC);

    -- 群策执行动作队列
    CREATE TABLE IF NOT EXISTS team_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES team_sessions(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      owner_agent_id TEXT DEFAULT '',
      owner_agent_name TEXT DEFAULT '',
      capability TEXT DEFAULT 'review',
      tool_id TEXT DEFAULT 'manual_review',
      title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      params_json TEXT DEFAULT '{}',
      risk TEXT DEFAULT 'medium' CHECK(risk IN ('low', 'medium', 'high')),
      requires_approval INTEGER DEFAULT 1,
      status TEXT DEFAULT 'proposed' CHECK(status IN ('proposed', 'approved', 'running', 'completed', 'failed', 'rejected')),
      result_json TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_team_actions_session ON team_actions(session_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_team_actions_team ON team_actions(team_id, status, updated_at DESC);

    -- ═══ 小白诊断助手 ═══

    -- AI 诊断方案库（评分≥4 的方案自动入库，供知识库检索）
    CREATE TABLE IF NOT EXISTS xiaobai_solutions (
      id TEXT PRIMARY KEY,
      problem TEXT NOT NULL,
      solution TEXT NOT NULL,
      source TEXT DEFAULT 'generated',
      confidence REAL DEFAULT 0.5,
      action_type TEXT DEFAULT 'copy',
      rating INTEGER DEFAULT 0,
      feedback TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 笔记
    CREATE TABLE IF NOT EXISTS xiaobai_notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      is_pinned INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      source TEXT DEFAULT 'local',
      cloud_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 诊断历史
    CREATE TABLE IF NOT EXISTS xiaobai_history (
      id TEXT PRIMARY KEY,
      problem TEXT NOT NULL,
      solution TEXT NOT NULL,
      source TEXT DEFAULT 'generated',
      confidence REAL DEFAULT 0.5,
      action_type TEXT DEFAULT 'copy',
      tags TEXT DEFAULT '',
      followups_json TEXT DEFAULT '[]',
      metadata_json TEXT DEFAULT '{}',
      is_pinned INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      cloud_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_xiaobai_solutions_rating ON xiaobai_solutions(rating DESC);
    CREATE INDEX IF NOT EXISTS idx_xiaobai_notes_updated ON xiaobai_notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_xiaobai_history_created ON xiaobai_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_xiaobai_history_pinned ON xiaobai_history(is_pinned DESC, created_at DESC);

    -- FTS 全文搜索索引
    CREATE VIRTUAL TABLE IF NOT EXISTS xiaobai_solutions_fts USING fts5(
      problem, solution, tags,
      content=xiaobai_solutions, content_rowid=rowid
    );

    -- ═══ 知识库 (Knowledge Vault) ═══

    -- 原始来源（不可变）
    CREATE TABLE IF NOT EXISTS wiki_sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('url','paste','file','clipper','auto')),
      content TEXT NOT NULL DEFAULT '',
      raw_content TEXT NOT NULL DEFAULT '',
      url TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      folder_path TEXT DEFAULT '',
      author TEXT DEFAULT '',
      language TEXT DEFAULT 'zh',
      frontmatter_json TEXT DEFAULT '{}',
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','processed','failed')),
      error_message TEXT DEFAULT '',
      template_id TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Wiki 页面（LLM 维护）
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      summary TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      tags TEXT DEFAULT '[]',
      frontmatter_json TEXT DEFAULT '{}',
      source_ids TEXT DEFAULT '[]',
      linked_page_ids TEXT DEFAULT '[]',
      backlink_count INTEGER DEFAULT 0,
      importance REAL DEFAULT 50,
      confidence REAL DEFAULT 0.8,
      is_index INTEGER DEFAULT 0,
      is_log INTEGER DEFAULT 0,
      folder_path TEXT DEFAULT '',
      template_id TEXT DEFAULT '',
      version INTEGER DEFAULT 1,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 页面间关系
    CREATE TABLE IF NOT EXISTS wiki_page_links (
      id TEXT PRIMARY KEY,
      source_page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      target_page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
      link_type TEXT NOT NULL DEFAULT 'reference' CHECK(link_type IN ('reference','contradicts','supports','extends','derived_from','related')),
      context TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(source_page_id, target_page_id, link_type)
    );

    -- 活动日志（Karpathy log.md）
    CREATE TABLE IF NOT EXISTS wiki_activity_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL CHECK(action IN ('ingest','create','update','delete','query','lint','link','template','clipper')),
      target_type TEXT NOT NULL CHECK(target_type IN ('source','page','link')),
      target_id TEXT NOT NULL,
      description TEXT DEFAULT '',
      details_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 捕获模板
    CREATE TABLE IF NOT EXISTS wiki_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      icon TEXT DEFAULT '📄',
      description TEXT DEFAULT '',
      frontmatter_schema TEXT DEFAULT '{}',
      content_template TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      is_builtin INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 体检发现
    CREATE TABLE IF NOT EXISTS wiki_lint_issues (
      id TEXT PRIMARY KEY,
      issue_type TEXT NOT NULL CHECK(issue_type IN ('orphan','contradiction','stale','missing_ref','broken_link','duplicate','low_confidence','missing_summary')),
      severity TEXT DEFAULT 'warning' CHECK(severity IN ('info','warning','error')),
      page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
      related_page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      suggestion TEXT DEFAULT '',
      status TEXT DEFAULT 'open' CHECK(status IN ('open','fixed','dismissed')),
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Wiki 索引
    CREATE INDEX IF NOT EXISTS idx_wiki_sources_type ON wiki_sources(source_type);
    CREATE INDEX IF NOT EXISTS idx_wiki_sources_status ON wiki_sources(status);
    CREATE INDEX IF NOT EXISTS idx_wiki_sources_created ON wiki_sources(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wiki_sources_folder ON wiki_sources(folder_path);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_slug ON wiki_pages(slug);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_category ON wiki_pages(category);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_importance ON wiki_pages(importance DESC);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_updated ON wiki_pages(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_folder ON wiki_pages(folder_path);
    CREATE INDEX IF NOT EXISTS idx_wiki_links_source ON wiki_page_links(source_page_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_links_target ON wiki_page_links(target_page_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_lint_status ON wiki_lint_issues(status);
    CREATE INDEX IF NOT EXISTS idx_wiki_lint_page ON wiki_lint_issues(page_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_log_created ON wiki_activity_log(created_at DESC);

    -- Wiki FTS 全文搜索
    CREATE VIRTUAL TABLE IF NOT EXISTS wiki_pages_fts USING fts5(
      title, content, summary, tags,
      content=wiki_pages, content_rowid=rowid
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS wiki_sources_fts USING fts5(
      title, content, tags,
      content=wiki_sources, content_rowid=rowid
    );

    -- Wiki FTS 触发器（自动同步）
    CREATE TRIGGER IF NOT EXISTS wiki_pages_fts_insert AFTER INSERT ON wiki_pages BEGIN
      INSERT INTO wiki_pages_fts(rowid, title, content, summary, tags) VALUES (new.rowid, new.title, new.content, new.summary, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS wiki_pages_fts_delete AFTER DELETE ON wiki_pages BEGIN
      INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, content, summary, tags) VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS wiki_pages_fts_update AFTER UPDATE ON wiki_pages BEGIN
      INSERT INTO wiki_pages_fts(wiki_pages_fts, rowid, title, content, summary, tags) VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tags);
      INSERT INTO wiki_pages_fts(rowid, title, content, summary, tags) VALUES (new.rowid, new.title, new.content, new.summary, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS wiki_sources_fts_insert AFTER INSERT ON wiki_sources BEGIN
      INSERT INTO wiki_sources_fts(rowid, title, content, tags) VALUES (new.rowid, new.title, new.content, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS wiki_sources_fts_delete AFTER DELETE ON wiki_sources BEGIN
      INSERT INTO wiki_sources_fts(wiki_sources_fts, rowid, title, content, tags) VALUES ('delete', old.rowid, old.title, old.content, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS wiki_sources_fts_update AFTER UPDATE ON wiki_sources BEGIN
      INSERT INTO wiki_sources_fts(wiki_sources_fts, rowid, title, content, tags) VALUES ('delete', old.rowid, old.title, old.content, old.tags);
      INSERT INTO wiki_sources_fts(rowid, title, content, tags) VALUES (new.rowid, new.title, new.content, new.tags);
    END;

    -- ═══ 海马体：无损原始记忆抽屉 (Hippocampus: Lossless Raw Memory) ═══
    CREATE TABLE IF NOT EXISTS mempalace_drawers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      wing TEXT NOT NULL DEFAULT 'default',
      hall TEXT NOT NULL DEFAULT 'general',
      room TEXT NOT NULL DEFAULT 'inbox',
      raw_content TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'paste'
        CHECK(source_type IN ('url','paste','file','clipper','auto','self-nudge','conversation')),
      source_url TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      folder_path TEXT DEFAULT '',
      author TEXT DEFAULT '',
      language TEXT DEFAULT 'zh',
      tags TEXT DEFAULT '[]',
      is_compiled INTEGER DEFAULT 0,
      compiled_page_id TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_drawers_compiled ON mempalace_drawers(is_compiled, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_drawers_wing ON mempalace_drawers(wing);
    CREATE INDEX IF NOT EXISTS idx_drawers_source ON mempalace_drawers(source_type);
    CREATE INDEX IF NOT EXISTS idx_drawers_created ON mempalace_drawers(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_drawers_page ON mempalace_drawers(compiled_page_id);
    CREATE INDEX IF NOT EXISTS idx_drawers_folder ON mempalace_drawers(folder_path);

    CREATE VIRTUAL TABLE IF NOT EXISTS mempalace_drawers_fts USING fts5(
      title, raw_content, tags,
      content=mempalace_drawers, content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS drawers_fts_insert AFTER INSERT ON mempalace_drawers BEGIN
      INSERT INTO mempalace_drawers_fts(rowid, title, raw_content, tags)
        VALUES (new.rowid, new.title, new.raw_content, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS drawers_fts_delete AFTER DELETE ON mempalace_drawers BEGIN
      INSERT INTO mempalace_drawers_fts(mempalace_drawers_fts, rowid, title, raw_content, tags)
        VALUES ('delete', old.rowid, old.title, old.raw_content, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS drawers_fts_update AFTER UPDATE ON mempalace_drawers BEGIN
      INSERT INTO mempalace_drawers_fts(mempalace_drawers_fts, rowid, title, raw_content, tags)
        VALUES ('delete', old.rowid, old.title, old.raw_content, old.tags);
      INSERT INTO mempalace_drawers_fts(rowid, title, raw_content, tags)
        VALUES (new.rowid, new.title, new.raw_content, new.tags);
    END;

    -- 《启蒙》归档门：Openbasaka 只生成候选，点击后才正式入宫
    CREATE TABLE IF NOT EXISTS archive_candidates (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      message_role TEXT NOT NULL CHECK(message_role IN ('user','assistant','system')),
      content TEXT NOT NULL DEFAULT '',
      source_surface TEXT NOT NULL DEFAULT 'openbasaka',
      agent_role TEXT DEFAULT '',
      target_kind TEXT NOT NULL DEFAULT 'qimeng' CHECK(target_kind IN ('qimeng','knowledge','master')),
      target_label TEXT DEFAULT '归入启蒙',
      target_section TEXT DEFAULT 'personal',
      title TEXT DEFAULT '',
      suggested_wing TEXT NOT NULL DEFAULT 'dialogue',
      suggested_hall TEXT NOT NULL DEFAULT 'memory',
      suggested_room TEXT NOT NULL DEFAULT '对话-关键碰撞',
      suggested_tags TEXT DEFAULT '[]',
      suggested_facets TEXT DEFAULT '[]',
      suggested_targets_json TEXT DEFAULT '[]',
      rationale TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','archived','dismissed')),
      archived_drawer_id TEXT DEFAULT '',
      archived_source_id TEXT DEFAULT '',
      archived_page_id TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_candidates_message
      ON archive_candidates(conversation_id, message_id);
    CREATE INDEX IF NOT EXISTS idx_archive_candidates_status
      ON archive_candidates(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_archive_candidates_surface
      ON archive_candidates(source_surface, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_archive_candidates_target
      ON archive_candidates(target_kind, status, updated_at DESC);

    -- 知识＋大佬：从外部高手、项目实践、Hermes/MemPalace 等案例中沉淀可复用方法
    CREATE TABLE IF NOT EXISTS master_skill_patterns (
      id TEXT PRIMARY KEY,
      pattern_name TEXT NOT NULL DEFAULT '',
      master_name TEXT DEFAULT '',
      source_title TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      what_it_solves TEXT DEFAULT '',
      steps_json TEXT DEFAULT '[]',
      when_to_use_json TEXT DEFAULT '[]',
      when_not_to_use_json TEXT DEFAULT '[]',
      related_projects_json TEXT DEFAULT '[]',
      related_agents_json TEXT DEFAULT '[]',
      evidence_source_ids_json TEXT DEFAULT '[]',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_master_skill_patterns_master
      ON master_skill_patterns(master_name, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_master_skill_patterns_updated
      ON master_skill_patterns(updated_at DESC);

    -- 有机智能系统进化账本：记录每次学习如何影响神经元、突触、技能和下一步行动
    CREATE TABLE IF NOT EXISTS evolution_events (
      id TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL DEFAULT '',
      source_id TEXT DEFAULT '',
      event_type TEXT NOT NULL DEFAULT 'learning',
      learned_what TEXT NOT NULL DEFAULT '',
      evidence_json TEXT DEFAULT '[]',
      affected_neuron_ids_json TEXT DEFAULT '[]',
      suggested_synapses_json TEXT DEFAULT '[]',
      suggested_skill_pattern_ids_json TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.7,
      next_action TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','dismissed','applied')),
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_evolution_events_status
      ON evolution_events(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_evolution_events_source
      ON evolution_events(source_kind, source_id);

    -- 模型角色：把“大脑主模型”和“本地小任务模型”拆成可配置岗位
    CREATE TABLE IF NOT EXISTS model_roles (
      role_id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      base_url TEXT DEFAULT '',
      model TEXT DEFAULT '',
      api_key_ref TEXT DEFAULT '',
      fallback_role_id TEXT DEFAULT '',
      task_hint TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 外脑 OS 主循环事件账本：跨启蒙、画像、知识、推演、Agent 的统一追踪层
    CREATE TABLE IF NOT EXISTS operating_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      stage TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      source_kind TEXT DEFAULT '',
      source_id TEXT DEFAULT '',
      source_title TEXT DEFAULT '',
      confidence REAL,
      entities_json TEXT DEFAULT '[]',
      project_ids_json TEXT DEFAULT '[]',
      payload_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_operating_events_stage
      ON operating_events(stage, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_operating_events_type
      ON operating_events(type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_operating_events_source
      ON operating_events(source_kind, source_id);
    CREATE INDEX IF NOT EXISTS idx_operating_events_created
      ON operating_events(created_at DESC);

    -- 白板：沙盘内的零摩擦灵感采样器
    CREATE TABLE IF NOT EXISTS whiteboard_trials (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT '',
      text TEXT DEFAULT '',
      images_json TEXT DEFAULT '[]',
      ai_result_json TEXT DEFAULT '',
      exported_path TEXT DEFAULT '',
      save_kind TEXT DEFAULT '',
      is_starred INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      priority_level TEXT DEFAULT 'normal',
      is_draft INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_whiteboard_trials_draft
      ON whiteboard_trials(is_draft, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whiteboard_trials_created
      ON whiteboard_trials(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whiteboard_trials_kind
      ON whiteboard_trials(save_kind, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whiteboard_trials_attention
      ON whiteboard_trials(is_pinned DESC, is_starred DESC, priority_level, updated_at DESC);

    -- ═══ 知识库：文本分块（Karpathy LLM Wiki Chunking）═══

    CREATE TABLE IF NOT EXISTS wiki_chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES wiki_sources(id) ON DELETE CASCADE,
      page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
      drawer_id TEXT REFERENCES mempalace_drawers(id) ON DELETE SET NULL,
      folder_path TEXT DEFAULT '',
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      header_breadcrumb TEXT DEFAULT '',
      overlap_prev INTEGER DEFAULT 0,
      overlap_next INTEGER DEFAULT 0,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_source ON wiki_chunks(source_id, chunk_index);
    CREATE INDEX IF NOT EXISTS idx_chunks_page ON wiki_chunks(page_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_drawer ON wiki_chunks(drawer_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_folder ON wiki_chunks(folder_path);

    CREATE VIRTUAL TABLE IF NOT EXISTS wiki_chunks_fts USING fts5(
      content,
      content=wiki_chunks,
      content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON wiki_chunks BEGIN
      INSERT INTO wiki_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON wiki_chunks BEGIN
      INSERT INTO wiki_chunks_fts(wiki_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON wiki_chunks BEGIN
      INSERT INTO wiki_chunks_fts(wiki_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
      INSERT INTO wiki_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
    END;

    -- ═══ 知识库：向量索引（Semantic Search）═══

    CREATE TABLE IF NOT EXISTS wiki_vectors (
      id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL REFERENCES wiki_chunks(id) ON DELETE CASCADE,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL DEFAULT 'embedding-3',
      dimension INTEGER NOT NULL DEFAULT 1024,
      norm REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_wiki_vectors_chunk ON wiki_vectors(chunk_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_vectors_model ON wiki_vectors(model);

    -- ═══ 记忆：向量索引（MemPalace Semantic Recall）═══

    CREATE TABLE IF NOT EXISTS memory_vectors (
      id TEXT PRIMARY KEY,
      memory_item_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL DEFAULT 'embedding-3',
      dimension INTEGER NOT NULL DEFAULT 1024,
      norm REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_memory_vectors_item ON memory_vectors(memory_item_id);
    CREATE INDEX IF NOT EXISTS idx_memory_vectors_model ON memory_vectors(model);

    -- ═══ 记忆：Closet 索引层（AAAK 压缩格式）═══

    CREATE TABLE IF NOT EXISTS memory_closet (
      id TEXT PRIMARY KEY,
      memory_item_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL DEFAULT 'general',
      anchor TEXT NOT NULL DEFAULT '',
      abbreviated TEXT NOT NULL DEFAULT '',
      associative_tags TEXT DEFAULT '[]',
      key_hash TEXT NOT NULL DEFAULT '',
      importance REAL DEFAULT 50,
      recency_score REAL DEFAULT 0,
      access_score REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_closet_item ON memory_closet(memory_item_id);
    CREATE INDEX IF NOT EXISTS idx_closet_agent ON memory_closet(agent_id);
    CREATE INDEX IF NOT EXISTS idx_closet_key ON memory_closet(key_hash);
    CREATE INDEX IF NOT EXISTS idx_closet_importance ON memory_closet(importance DESC);
  `
}

/** 安全的列迁移（幂等） */
export function getMigrations(): string[] {
  return [
    'ALTER TABLE custom_agents ADD COLUMN bot_token TEXT DEFAULT ""',
    'ALTER TABLE custom_agents ADD COLUMN platform_config_json TEXT DEFAULT "{}"',
    'ALTER TABLE custom_agents ADD COLUMN soul_json TEXT DEFAULT ""',
    'ALTER TABLE custom_agents ADD COLUMN memory_json TEXT DEFAULT ""',
    'ALTER TABLE scheduled_tasks ADD COLUMN agent_id TEXT DEFAULT ""',
    'ALTER TABLE scheduled_tasks ADD COLUMN platform_config_json TEXT DEFAULT "{}"',
    // MemPalace: Agent 独立记忆上下文
    'ALTER TABLE memory_items ADD COLUMN agent_id TEXT DEFAULT "general"',
    'ALTER TABLE memory_rooms ADD COLUMN agent_id TEXT DEFAULT "general"',
    // 知识图谱时间窗口（已有 valid_from/valid_to，确保默认值）
    'ALTER TABLE knowledge_triples ADD COLUMN valid_from TEXT DEFAULT ""',
    'ALTER TABLE knowledge_triples ADD COLUMN valid_to TEXT DEFAULT ""',
    'ALTER TABLE wiki_sources ADD COLUMN folder_path TEXT DEFAULT ""',
    'ALTER TABLE wiki_pages ADD COLUMN folder_path TEXT DEFAULT ""',
    'ALTER TABLE mempalace_drawers ADD COLUMN folder_path TEXT DEFAULT ""',
    'ALTER TABLE wiki_chunks ADD COLUMN folder_path TEXT DEFAULT ""',
    'ALTER TABLE projects ADD COLUMN is_pinned INTEGER DEFAULT 0',
    'ALTER TABLE projects ADD COLUMN is_starred INTEGER DEFAULT 0',
    'ALTER TABLE projects ADD COLUMN priority_level TEXT DEFAULT "normal"',
    'ALTER TABLE team_sessions ADD COLUMN title TEXT DEFAULT ""',
    'ALTER TABLE team_sessions ADD COLUMN tags_json TEXT DEFAULT "[]"',
    'ALTER TABLE team_sessions ADD COLUMN is_pinned INTEGER DEFAULT 0',
    'ALTER TABLE team_sessions ADD COLUMN is_starred INTEGER DEFAULT 0',
    'ALTER TABLE archive_candidates ADD COLUMN target_kind TEXT NOT NULL DEFAULT "qimeng"',
    'ALTER TABLE archive_candidates ADD COLUMN target_label TEXT DEFAULT "归入启蒙"',
    'ALTER TABLE archive_candidates ADD COLUMN target_section TEXT DEFAULT "personal"',
    'ALTER TABLE archive_candidates ADD COLUMN suggested_targets_json TEXT DEFAULT "[]"',
    'ALTER TABLE archive_candidates ADD COLUMN archived_source_id TEXT DEFAULT ""',
    'ALTER TABLE archive_candidates ADD COLUMN archived_page_id TEXT DEFAULT ""',
    'ALTER TABLE whiteboard_trials ADD COLUMN title TEXT DEFAULT ""',
    'ALTER TABLE whiteboard_trials ADD COLUMN save_kind TEXT DEFAULT ""',
    'ALTER TABLE whiteboard_trials ADD COLUMN is_starred INTEGER DEFAULT 0',
    'ALTER TABLE whiteboard_trials ADD COLUMN is_pinned INTEGER DEFAULT 0',
    'ALTER TABLE whiteboard_trials ADD COLUMN priority_level TEXT DEFAULT "normal"',
    'CREATE INDEX IF NOT EXISTS idx_wiki_sources_folder ON wiki_sources(folder_path)',
    'CREATE INDEX IF NOT EXISTS idx_wiki_pages_folder ON wiki_pages(folder_path)',
    'CREATE INDEX IF NOT EXISTS idx_drawers_folder ON mempalace_drawers(folder_path)',
    'CREATE INDEX IF NOT EXISTS idx_chunks_folder ON wiki_chunks(folder_path)',
    'CREATE INDEX IF NOT EXISTS idx_projects_attention ON projects(is_pinned DESC, is_starred DESC, priority_level, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_team_sessions_attention ON team_sessions(team_id, is_pinned DESC, is_starred DESC, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_whiteboard_trials_kind ON whiteboard_trials(save_kind, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_whiteboard_trials_attention ON whiteboard_trials(is_pinned DESC, is_starred DESC, priority_level, updated_at DESC)',
    `CREATE TABLE IF NOT EXISTS team_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES team_sessions(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      owner_agent_id TEXT DEFAULT '',
      owner_agent_name TEXT DEFAULT '',
      capability TEXT DEFAULT 'review',
      tool_id TEXT DEFAULT 'manual_review',
      title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      params_json TEXT DEFAULT '{}',
      risk TEXT DEFAULT 'medium' CHECK(risk IN ('low', 'medium', 'high')),
      requires_approval INTEGER DEFAULT 1,
      status TEXT DEFAULT 'proposed' CHECK(status IN ('proposed', 'approved', 'running', 'completed', 'failed', 'rejected')),
      result_json TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_team_actions_session ON team_actions(session_id, status, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_team_actions_team ON team_actions(team_id, status, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_archive_candidates_target ON archive_candidates(target_kind, status, updated_at DESC)',
    `CREATE TABLE IF NOT EXISTS master_skill_patterns (
      id TEXT PRIMARY KEY,
      pattern_name TEXT NOT NULL DEFAULT '',
      master_name TEXT DEFAULT '',
      source_title TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      what_it_solves TEXT DEFAULT '',
      steps_json TEXT DEFAULT '[]',
      when_to_use_json TEXT DEFAULT '[]',
      when_not_to_use_json TEXT DEFAULT '[]',
      related_projects_json TEXT DEFAULT '[]',
      related_agents_json TEXT DEFAULT '[]',
      evidence_source_ids_json TEXT DEFAULT '[]',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_master_skill_patterns_master ON master_skill_patterns(master_name, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_master_skill_patterns_updated ON master_skill_patterns(updated_at DESC)',
    `CREATE TABLE IF NOT EXISTS evolution_events (
      id TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL DEFAULT '',
      source_id TEXT DEFAULT '',
      event_type TEXT NOT NULL DEFAULT 'learning',
      learned_what TEXT NOT NULL DEFAULT '',
      evidence_json TEXT DEFAULT '[]',
      affected_neuron_ids_json TEXT DEFAULT '[]',
      suggested_synapses_json TEXT DEFAULT '[]',
      suggested_skill_pattern_ids_json TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.7,
      next_action TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','dismissed','applied')),
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_evolution_events_status ON evolution_events(status, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_evolution_events_source ON evolution_events(source_kind, source_id)',
    `CREATE TABLE IF NOT EXISTS model_roles (
      role_id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      base_url TEXT DEFAULT '',
      model TEXT DEFAULT '',
      api_key_ref TEXT DEFAULT '',
      fallback_role_id TEXT DEFAULT '',
      task_hint TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS boss_distillation_proposals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      rationale TEXT NOT NULL DEFAULT '',
      proposed_by TEXT NOT NULL DEFAULT 'openbasaka',
      source_kind TEXT DEFAULT '',
      source_id TEXT DEFAULT '',
      source_title TEXT DEFAULT '',
      claim_ids_json TEXT DEFAULT '[]',
      profile_patch_json TEXT DEFAULT '{}',
      memory_writes_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','superseded')),
      review_note TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',
      rejected_at TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_boss_distillation_proposals_status ON boss_distillation_proposals(status, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_boss_distillation_proposals_source ON boss_distillation_proposals(source_kind, source_id)',
    `CREATE TABLE IF NOT EXISTS boss_distillation_claims (
      id TEXT PRIMARY KEY,
      proposal_id TEXT DEFAULT '',
      dimension TEXT NOT NULL DEFAULT 'preference'
        CHECK(dimension IN ('mission','value','preference','anti_pattern','decision_pattern','emotion_weight','boundary','learning_mode','project_taste')),
      claim TEXT NOT NULL DEFAULT '',
      evidence_tier TEXT NOT NULL DEFAULT 'derived_inference'
        CHECK(evidence_tier IN ('boss_verbatim','boss_action','boss_assessment','derived_inference','external_context')),
      evidence_refs_json TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.5,
      temporal_scope TEXT NOT NULL DEFAULT 'stage' CHECK(temporal_scope IN ('momentary','stage','long_term')),
      status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('raw','proposed','approved','rejected','superseded','approved_legacy')),
      affects_profile_keys_json TEXT DEFAULT '[]',
      source_kind TEXT DEFAULT '',
      source_id TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_boss_distillation_claims_status ON boss_distillation_claims(status, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_boss_distillation_claims_dimension ON boss_distillation_claims(dimension, status, confidence DESC)',
    'CREATE INDEX IF NOT EXISTS idx_boss_distillation_claims_source ON boss_distillation_claims(source_kind, source_id)',
  ]
}

/**
 * 复杂迁移：重建带新 CHECK 约束的 wiki_lint_issues 表
 * 需在 database.ts 中单独调用（因为涉及重建表）
 */
export function getComplexMigrations(): Array<{ name: string; sql: string }> {
  return [
    {
      name: 'lint_expand_issue_types',
      sql: `
        CREATE TABLE IF NOT EXISTS wiki_lint_issues_v2 (
          id TEXT PRIMARY KEY,
          issue_type TEXT NOT NULL CHECK(issue_type IN ('orphan','contradiction','stale','missing_ref','broken_link','duplicate','low_confidence','missing_summary','chunk_coverage','embedding_quality','stale_vector')),
          severity TEXT DEFAULT 'warning' CHECK(severity IN ('info','warning','error')),
          page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
          related_page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
          description TEXT NOT NULL DEFAULT '',
          suggestion TEXT DEFAULT '',
          status TEXT DEFAULT 'open' CHECK(status IN ('open','fixed','dismissed')),
          auto_fix_available INTEGER DEFAULT 0,
          metadata_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now','localtime')),
          updated_at TEXT DEFAULT (datetime('now','localtime'))
        );
        INSERT OR IGNORE INTO wiki_lint_issues_v2 SELECT id, issue_type, severity, page_id, related_page_id, description, suggestion, status, 0, metadata_json, created_at, updated_at FROM wiki_lint_issues;
        DROP TABLE IF EXISTS wiki_lint_issues;
        ALTER TABLE wiki_lint_issues_v2 RENAME TO wiki_lint_issues;
        CREATE INDEX IF NOT EXISTS idx_wiki_lint_status ON wiki_lint_issues(status);
        CREATE INDEX IF NOT EXISTS idx_wiki_lint_page ON wiki_lint_issues(page_id);
      `,
    },
  ]
}

/** 生成唯一 ID */
export function generateId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
