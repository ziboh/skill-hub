import { afterEach, describe, expect, test, vi } from 'vitest'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { deployCherryStudioSkill, uninstallCherryStudioSkill, sanitizeCherryStudioFolderName } = require('../../../public/preload/lib/cherry-studio.js')
const { deployPlatformSkill } = require('../../../public/preload/lib/platform-deploy.js')
const { setAllowedWriteRoots } = require('../../../public/preload/lib/write-roots.js')

const tempDirs: string[] = []

function createFixture(tableName = 'skills') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-cherry-'))
  tempDirs.push(root)
  const dataDir = path.join(root, 'Data')
  const sourceDir = path.join(root, 'source')
  const skillsDir = path.join(dataDir, 'Skills')
  const dbPath = path.join(dataDir, 'agents.db')
  fs.mkdirSync(sourceDir, { recursive: true })
  fs.mkdirSync(skillsDir, { recursive: true })
  fs.writeFileSync(
    path.join(sourceDir, 'SKILL.md'),
    `---\nname: 新技能\ndescription: 新描述\nauthor: tester\ntags: [one, two]\n---\n正文\n`,
    'utf-8',
  )

  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      folder_name TEXT NOT NULL UNIQUE,
      source TEXT,
      source_url TEXT,
      namespace TEXT,
      author TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      content_hash TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.close()

  return {
    root,
    sourceDir,
    skillsDir,
    dbPath,
    targetDir: path.join(skillsDir, 'Test Skill'),
    tableName,
  }
}

function createFileOps(copyFile = vi.fn()) {
  return {
    copyFile,
    createSymlink: vi.fn(),
    removeFile: vi.fn(),
  }
}

function adapterDependencies(fileOps: ReturnType<typeof createFileOps>) {
  return { DatabaseSync, fileOps, assertWritable: (value: string) => value }
}

function createDeleteFileOps() {
  return {
    pathExists: vi.fn((value: string) => fs.existsSync(value)),
    removeFile: vi.fn((value: string) => fs.rmSync(value, { recursive: true, force: true })),
  }
}

function insertSkillRow(fixture: ReturnType<typeof createFixture>, source = 'local') {
  const db = new DatabaseSync(fixture.dbPath)
  db.prepare(
    `INSERT INTO ${fixture.tableName}
     (id, name, description, folder_name, source, source_url, namespace, author, tags, content_hash, is_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, ?, ?)`,
  ).run('skill-id', '技能', '描述', 'Test_Skill', source, 'author', '[]', 'hash', 1, 1)
  db.close()
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('Cherry Studio preload adapter', () => {
  test('普通平台不进入特殊适配器', () => {
    expect(deployPlatformSkill({ platformId: 'cursor' })).toEqual({ handled: false })
  })

  test('数据库不存在时不复制文件', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-cherry-missing-'))
    tempDirs.push(root)
    const sourceDir = path.join(root, 'source')
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '---\nname: Test\n---\n', 'utf-8')
    const fileOps = createFileOps()

    expect(() =>
      deployCherryStudioSkill(
        {
          sourceDir,
          targetDir: path.join(root, 'Data', 'Skills', 'test'),
          skillName: 'test',
          mode: 'copy',
        },
        adapterDependencies(fileOps),
      ),
    ).toThrow(/未找到 Cherry Studio 数据库/)
    expect(fileOps.copyFile).not.toHaveBeenCalled()
  })

  test('数据库写入失败时不复制也不删除目标目录', () => {
    const fixture = createFixture('skills')
    const db = new DatabaseSync(fixture.dbPath)
    db.exec(`CREATE TRIGGER block_skill_insert BEFORE INSERT ON skills BEGIN SELECT RAISE(ABORT, '禁止写入'); END`)
    db.close()
    const fileOps = createFileOps()

    expect(() =>
      deployCherryStudioSkill(
        {
          sourceDir: fixture.sourceDir,
          targetDir: fixture.targetDir,
          skillName: 'Test Skill',
          mode: 'copy',
        },
        adapterDependencies(fileOps),
      ),
    ).toThrow(/禁止写入/)
    expect(fileOps.copyFile).not.toHaveBeenCalled()
    expect(fileOps.removeFile).not.toHaveBeenCalled()
  })

  test('先提交新版数据库记录再复制，并返回规范化目录', () => {
    const fixture = createFixture('skills')
    const copyFile = vi.fn(() => {
      const db = new DatabaseSync(fixture.dbPath)
      const row = db.prepare('SELECT name, folder_name FROM skills').get()
      db.close()
      expect(row).toMatchObject({ name: '新技能', folder_name: 'Test_Skill' })
    })
    const fileOps = createFileOps(copyFile)

    const result = deployCherryStudioSkill(
      {
        sourceDir: fixture.sourceDir,
        targetDir: fixture.targetDir,
        skillName: 'Test Skill',
        mode: 'copy',
      },
      adapterDependencies(fileOps),
    )

    expect(result.targetDir).toBe(path.join(fixture.skillsDir, 'Test_Skill'))
    expect(copyFile).toHaveBeenCalledWith(fixture.sourceDir, result.targetDir)
  })

  test('默认文件服务可在允许目录中完成真实复制', () => {
    const fixture = createFixture('skills')
    setAllowedWriteRoots([fixture.root])

    const result = deployCherryStudioSkill(
      {
        sourceDir: fixture.sourceDir,
        targetDir: fixture.targetDir,
        skillName: 'Test Skill',
        mode: 'copy',
      },
      { DatabaseSync },
    )

    expect(fs.existsSync(path.join(result.targetDir, 'SKILL.md'))).toBe(true)
  })

  test('兼容旧版 agent_global_skill 表', () => {
    const fixture = createFixture('agent_global_skill')
    const fileOps = createFileOps()

    deployCherryStudioSkill(
      {
        sourceDir: fixture.sourceDir,
        targetDir: fixture.targetDir,
        skillName: 'Test Skill',
        mode: 'copy',
      },
      adapterDependencies(fileOps),
    )

    const db = new DatabaseSync(fixture.dbPath)
    const row = db.prepare('SELECT folder_name FROM agent_global_skill').get()
    db.close()
    expect(row.folder_name).toBe('Test_Skill')
  })

  test('复制失败时删除本次新增的数据库记录', () => {
    const fixture = createFixture('skills')
    const fileOps = createFileOps(
      vi.fn(() => {
        throw new Error('复制失败')
      }),
    )

    expect(() =>
      deployCherryStudioSkill(
        {
          sourceDir: fixture.sourceDir,
          targetDir: fixture.targetDir,
          skillName: 'Test Skill',
          mode: 'copy',
        },
        adapterDependencies(fileOps),
      ),
    ).toThrow('复制失败')

    const db = new DatabaseSync(fixture.dbPath)
    const row = db.prepare('SELECT id FROM skills').get()
    db.close()
    expect(row).toBeUndefined()
  })

  test('更新已有记录后复制失败会恢复原数据', () => {
    const fixture = createFixture('skills')
    const db = new DatabaseSync(fixture.dbPath)
    db.prepare(
      `INSERT INTO skills
       (id, name, description, folder_name, source, source_url, namespace, author, tags, content_hash, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, ?, ?)`,
    ).run('old-id', '旧技能', '旧描述', 'Test_Skill', 'local', 'old-author', '[]', 'old-hash', 1, 1)
    db.close()
    const fileOps = createFileOps(
      vi.fn(() => {
        throw new Error('复制失败')
      }),
    )

    expect(() =>
      deployCherryStudioSkill(
        {
          sourceDir: fixture.sourceDir,
          targetDir: fixture.targetDir,
          skillName: 'Test Skill',
          mode: 'copy',
        },
        adapterDependencies(fileOps),
      ),
    ).toThrow('复制失败')

    const checkDb = new DatabaseSync(fixture.dbPath)
    const row = checkDb.prepare('SELECT name, description, author, content_hash FROM skills WHERE id = ?').get('old-id')
    checkDb.close()
    expect(row).toEqual({ name: '旧技能', description: '旧描述', author: 'old-author', content_hash: 'old-hash' })
  })

  test('删除时同步注销数据库记录和 Agent 关联', () => {
    const fixture = createFixture('skills')
    insertSkillRow(fixture)
    const db = new DatabaseSync(fixture.dbPath)
    db.exec(`CREATE TABLE agent_skills (agent_id TEXT, skill_id TEXT, is_enabled INTEGER)`)
    db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, accessible_paths TEXT)`)
    db.prepare('INSERT INTO agent_skills (agent_id, skill_id, is_enabled) VALUES (?, ?, ?)').run('agent-1', 'skill-id', 1)
    db.prepare('INSERT INTO agents (id, accessible_paths) VALUES (?, ?)').run('agent-1', '[]')
    db.close()
    const targetDir = path.join(fixture.skillsDir, 'Test_Skill')
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), '---\nname: Test\n---\n', 'utf-8')

    uninstallCherryStudioSkill(
      { targetDir: fixture.targetDir, skillName: 'Test Skill' },
      { DatabaseSync, fileOps: createDeleteFileOps(), assertWritable: (value: string) => value },
    )

    const checkDb = new DatabaseSync(fixture.dbPath)
    expect(checkDb.prepare('SELECT id FROM skills').get()).toBeUndefined()
    expect(checkDb.prepare('SELECT skill_id FROM agent_skills').get()).toBeUndefined()
    checkDb.close()
    expect(fs.existsSync(targetDir)).toBe(false)
  })

  test('内置 Skill 拒绝删除', () => {
    const fixture = createFixture('skills')
    insertSkillRow(fixture, 'builtin')
    const targetDir = path.join(fixture.skillsDir, 'Test_Skill')
    fs.mkdirSync(targetDir, { recursive: true })
    const fileOps = createDeleteFileOps()

    expect(() =>
      uninstallCherryStudioSkill(
        { targetDir: fixture.targetDir, skillName: 'Test Skill' },
        { DatabaseSync, fileOps, assertWritable: (value: string) => value },
      ),
    ).toThrow(/不能删除/)
    expect(fileOps.removeFile).not.toHaveBeenCalled()
    expect(fs.existsSync(targetDir)).toBe(true)
  })

  test('没有 Cherry 数据库时仍可清理未注册的旧目录', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-cherry-unregistered-'))
    tempDirs.push(root)
    const skillsDir = path.join(root, 'Data', 'Skills')
    const targetDir = path.join(skillsDir, 'old-skill')
    fs.mkdirSync(targetDir, { recursive: true })
    const fileOps = createDeleteFileOps()

    uninstallCherryStudioSkill(
      { targetDir, skillName: 'old-skill' },
      { DatabaseSync, fileOps, assertWritable: (value: string) => value },
    )
    expect(fs.existsSync(targetDir)).toBe(false)
  })

  test('文件夹名遵循 Cherry Studio 约束', () => {
    expect(sanitizeCherryStudioFolderName('含 空格/name')).toBe('_____name')
  })
})
