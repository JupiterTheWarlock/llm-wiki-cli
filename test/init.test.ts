import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');
let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `llm-wiki-init-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('init command', () => {
  it('should create vault structure', () => {
    execSync(`node ${CLI} init`, { cwd: testDir });
    expect(existsSync(join(testDir, 'wiki'))).toBe(true);
    expect(existsSync(join(testDir, 'sources'))).toBe(true);
    expect(existsSync(join(testDir, 'wiki-purpose.md'))).toBe(true);
    expect(existsSync(join(testDir, 'wiki-schema.md'))).toBe(true);
    expect(existsSync(join(testDir, 'wiki-log.md'))).toBe(true);
    expect(existsSync(join(testDir, '.llm-wiki/config.toml'))).toBe(true);
  });

  it('should generate agent bootstrap files', () => {
    execSync(`node ${CLI} init`, { cwd: testDir });
    expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
  });

  it('should auto-install skills to both agent dirs', () => {
    execSync(`node ${CLI} init`, { cwd: testDir });
    const claudeSkill = join(testDir, '.claude/skills/llm-wiki/SKILL.md');
    const agentsSkill = join(testDir, '.agents/skills/llm-wiki/SKILL.md');
    expect(existsSync(claudeSkill)).toBe(true);
    expect(existsSync(agentsSkill)).toBe(true);
    const claudeContent = readFileSync(claudeSkill, 'utf-8');
    const agentsContent = readFileSync(agentsSkill, 'utf-8');
    expect(claudeContent.length).toBeGreaterThan(100);
    expect(claudeContent).toEqual(agentsContent);
  });

  it('should not clobber pre-existing customized skill files', () => {
    const claudeSkillDir = join(testDir, '.claude/skills/llm-wiki');
    mkdirSync(claudeSkillDir, { recursive: true });
    const customContent = '# My Custom Skill\n\nDo not overwrite me.\n';
    writeFileSync(join(claudeSkillDir, 'SKILL.md'), customContent);

    execSync(`node ${CLI} init`, { cwd: testDir });

    expect(readFileSync(join(claudeSkillDir, 'SKILL.md'), 'utf-8')).toEqual(customContent);
    expect(existsSync(join(testDir, '.agents/skills/llm-wiki/SKILL.md'))).toBe(true);
  });

  it('should not overwrite existing files', () => {
    execSync(`node ${CLI} init`, { cwd: testDir });
    expect(() => execSync(`node ${CLI} init`, { cwd: testDir, stdio: 'pipe' })).toThrow();
  });
});

describe('init --existing', () => {
  it('should adopt existing wiki directory', () => {
    // Pre-create wiki with content
    mkdirSync(join(testDir, 'wiki', 'entities'), { recursive: true });
    writeFileSync(join(testDir, 'wiki/entities/test.md'), '# Test Entity');
    writeFileSync(join(testDir, 'purpose.md'), '# My Purpose');
    writeFileSync(join(testDir, 'schema.md'), '# My Schema');

    execSync(`node ${CLI} init --existing`, { cwd: testDir });

    // Config created
    expect(existsSync(join(testDir, '.llm-wiki/config.toml'))).toBe(true);
    // Existing files not overwritten
    expect(readFileSync(join(testDir, 'purpose.md'), 'utf-8')).toBe('# My Purpose');
    expect(readFileSync(join(testDir, 'schema.md'), 'utf-8')).toBe('# My Schema');
    // Existing wiki not touched
    expect(readFileSync(join(testDir, 'wiki/entities/test.md'), 'utf-8')).toBe('# Test Entity');
  });

  it('should detect Chinese wiki and set language to zh', () => {
    mkdirSync(join(testDir, 'wiki'), { recursive: true });
    writeFileSync(join(testDir, 'wiki/test.md'), '# 测试\n这是一个中文维基页面');

    execSync(`node ${CLI} init --existing`, { cwd: testDir });

    const config = readFileSync(join(testDir, '.llm-wiki/config.toml'), 'utf-8');
    expect(config).toContain('language = "zh"');
  });

  it('should create wiki-agent.md if missing', () => {
    mkdirSync(join(testDir, 'wiki'), { recursive: true });

    execSync(`node ${CLI} init --existing`, { cwd: testDir });

    expect(existsSync(join(testDir, 'wiki-agent.md'))).toBe(true);
    const agent = readFileSync(join(testDir, 'wiki-agent.md'), 'utf-8');
    expect(agent).toContain('MUST capture');
    expect(agent).toContain('NEVER capture');
  });
});
