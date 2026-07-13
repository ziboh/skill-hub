const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { parseSkillFrontmatter } = require('./frontmatter')

const DB_CANDIDATE_NAMES = [
  ['data', 'agents.db'],
  ['data', 'agent.db'],
  ['root', 'cherrystudio.sqlite'],
]
const SUPPORTED_TABLES = ['skills', 'agent_global_skill']
const REQUIRED_COLUMNS = [
  'id',
  'name',
  'description',
  'folder_name',
  'source',
  'source_url',
  'namespace',
  'author',
  'tags',
  'content_hash',
  'is_enabled',
  'created_at',
  'updated_at',
]
const SNAPSHOT_COLUMNS = ['id', 'name', 'description', 'author', 'tags', 'content_hash', 'updated_at']

function sanitizeCherryStudioFolderName(folderName) {
  const sanitized = String(folderName || '')
    .replace(/[\\/]/g, '_')
    .replace(/\0/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80)
  return sanitized || 'skill'
}

function getDatabaseCandidates(targetDir) {
  const skillsDir = path.dirname(path.resolve(targetDir))
  const dataDir = path.dirname(skillsDir)
  const rootDir = path.dirname(dataDir)
  return DB_CANDIDATE_NAMES.map(([base, name]) => path.join(base === 'data' ? dataDir : rootDir, name))
}

function loadDatabaseSync(override) {
  if (override) return override
  try {
    return require('node:sqlite').DatabaseSync
  } catch {
    throw new Error('当前 ZTools 运行时不支持 Cherry Studio 数据库注册，请升级 ZTools 后重试')
  }
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName))
}

function getTableColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name))
}

function findSupportedDatabase(targetDir, DatabaseSync, assertWritable) {
  const candidates = getDatabaseCandidates(targetDir)
  const unsupported = []

  for (const dbPath of candidates) {
    if (!fs.existsSync(dbPath)) continue
    assertWritable(dbPath)
    const db = new DatabaseSync(dbPath)
    let keepOpen = false
    try {
      db.exec('PRAGMA busy_timeout = 2000')
      const tableName = SUPPORTED_TABLES.find((name) => tableExists(db, name))
      if (!tableName) {
        unsupported.push(dbPath)
        continue
      }
      const columns = getTableColumns(db, tableName)
      const missing = REQUIRED_COLUMNS.filter((name) => !columns.has(name))
      if (missing.length) {
        throw new Error(`Cherry Studio 数据库表 ${tableName} 缺少字段：${missing.join(', ')}`)
      }
      keepOpen = true
      return { db, dbPath, tableName, columns }
    } finally {
      if (!keepOpen) db.close()
    }
  }

  if (unsupported.length) {
    throw new Error(`Cherry Studio 数据库结构不受支持：${unsupported.join(', ')}`)
  }
  throw new Error(`未找到 Cherry Studio 数据库：${candidates.join(', ')}`)
}

function readSkillMetadata(sourceDir, fallbackName) {
  const skillFile = ['SKILL.md', 'skill.md'].map((name) => path.join(sourceDir, name)).find((file) => fs.existsSync(file))
  if (!skillFile) throw new Error('源目录中未找到 SKILL.md')

  const content = fs.readFileSync(skillFile, 'utf-8')
  const manifest = parseSkillFrontmatter(content)
  return {
    content,
    name: manifest.name || fallbackName,
    description: manifest.description || null,
    author: manifest.author || null,
    tags: JSON.stringify(Array.isArray(manifest.tags) ? manifest.tags : []),
    contentHash: crypto.createHash('sha256').update(content, 'utf-8').digest('hex'),
  }
}

function commitRegistration(handle, folderName, metadata) {
  const { db, tableName } = handle
  const now = Date.now()

  db.exec('BEGIN IMMEDIATE')
  try {
    const existing = db
      .prepare(`SELECT ${SNAPSHOT_COLUMNS.join(', ')} FROM ${tableName} WHERE folder_name = ? LIMIT 1`)
      .get(folderName)
    if (existing) {
      db.prepare(
        `UPDATE ${tableName}
         SET name = ?, description = ?, author = ?, tags = ?, content_hash = ?, updated_at = ?
         WHERE id = ?`,
      ).run(metadata.name, metadata.description, metadata.author, metadata.tags, metadata.contentHash, now, existing.id)
      db.exec('COMMIT')
      return { previous: existing, insertedId: null }
    }

    const insertedId = crypto.randomUUID()
    db.prepare(
      `INSERT INTO ${tableName}
       (id, name, description, folder_name, source, source_url, namespace, author, tags, content_hash, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, ?, ?)`,
    ).run(
      insertedId,
      metadata.name,
      metadata.description,
      folderName,
      'local',
      metadata.author,
      metadata.tags,
      metadata.contentHash,
      now,
      now,
    )
    db.exec('COMMIT')
    return { previous: null, insertedId }
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* transaction may already be closed */
    }
    throw error
  }
}

function rollbackRegistration(handle, snapshot) {
  const { db, tableName } = handle
  db.exec('BEGIN IMMEDIATE')
  try {
    if (snapshot.previous) {
      const previous = snapshot.previous
      db.prepare(
        `UPDATE ${tableName}
         SET name = ?, description = ?, author = ?, tags = ?, content_hash = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        previous.name,
        previous.description,
        previous.author,
        previous.tags,
        previous.content_hash,
        previous.updated_at,
        previous.id,
      )
    } else if (snapshot.insertedId) {
      db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(snapshot.insertedId)
    }
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* transaction may already be closed */
    }
    throw error
  }
}

function deployCherryStudioSkill(options, dependencies = {}) {
  const DatabaseSync = loadDatabaseSync(dependencies.DatabaseSync)
  const fileOps = dependencies.fileOps || require('./fs')
  const assertWritable = dependencies.assertWritable || require('./write-roots').assertWritable
  const folderName = sanitizeCherryStudioFolderName(path.basename(options.targetDir) || options.skillName)
  const actualTargetDir = path.join(path.dirname(options.targetDir), folderName)
  assertWritable(actualTargetDir)
  const metadata = readSkillMetadata(options.sourceDir, options.skillName || folderName)
  const handle = findSupportedDatabase(actualTargetDir, DatabaseSync, assertWritable)
  let snapshot
  let fileOperationStarted = false

  try {
    snapshot = commitRegistration(handle, folderName, metadata)
    fileOperationStarted = true
    if (options.mode === 'symlink') {
      fileOps.createSymlink(options.sourceDir, actualTargetDir)
    } else {
      fileOps.copyFile(options.sourceDir, actualTargetDir)
    }
    return { targetDir: actualTargetDir }
  } catch (error) {
    let rollbackError = null
    if (snapshot) {
      try {
        rollbackRegistration(handle, snapshot)
      } catch (err) {
        rollbackError = err
      }
    }
    if (fileOperationStarted) {
      try {
        fileOps.removeFile(actualTargetDir)
      } catch {
        /* keep the original deployment error */
      }
    }
    if (rollbackError) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}；数据库回滚失败：${rollbackError.message || rollbackError}`)
    }
    throw error
  } finally {
    handle.db.close()
  }
}

function getSkillRow(handle, folderName) {
  return handle.db.prepare(`SELECT * FROM ${handle.tableName} WHERE folder_name = ? LIMIT 1`).get(folderName)
}

function isBuiltinSkill(row) {
  return Boolean(
    row &&
      (row.builtin ||
        row.is_builtin ||
        (typeof row.source === 'string' && row.source.trim().toLowerCase() === 'builtin')),
  )
}

function getRelationTable(handle) {
  const candidates = handle.tableName === 'skills' ? ['agent_skills', 'agent_skill'] : ['agent_skill', 'agent_skills']
  return candidates.find((name) => tableExists(handle.db, name)) || null
}

function getRowsBySkill(db, tableName, skillId) {
  if (!tableName) return []
  const columns = getTableColumns(db, tableName)
  if (!columns.has('skill_id')) return []
  return db.prepare(`SELECT * FROM ${tableName} WHERE skill_id = ?`).all(skillId)
}

function deleteRegistration(handle, folderName) {
  const row = getSkillRow(handle, folderName)
  if (!row) return null

  const relationTable = getRelationTable(handle)
  const relations = getRowsBySkill(handle.db, relationTable, row.id)
  handle.db.exec('BEGIN IMMEDIATE')
  try {
    if (relationTable) handle.db.prepare(`DELETE FROM ${relationTable} WHERE skill_id = ?`).run(row.id)
    handle.db.prepare(`DELETE FROM ${handle.tableName} WHERE id = ?`).run(row.id)
    handle.db.exec('COMMIT')
    return { row, relationTable, relations }
  } catch (error) {
    try {
      handle.db.exec('ROLLBACK')
    } catch {
      /* transaction may already be closed */
    }
    throw error
  }
}

function insertRow(db, tableName, row) {
  const columns = [...getTableColumns(db, tableName)].filter((column) => Object.prototype.hasOwnProperty.call(row, column))
  if (!columns.length) return
  const placeholders = columns.map(() => '?').join(', ')
  db.prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`).run(...columns.map((column) => row[column]))
}

function restoreDeletedRegistration(handle, deleted) {
  if (!deleted) return
  handle.db.exec('BEGIN IMMEDIATE')
  try {
    insertRow(handle.db, handle.tableName, deleted.row)
    if (deleted.relationTable) {
      for (const relation of deleted.relations) insertRow(handle.db, deleted.relationTable, relation)
    }
    handle.db.exec('COMMIT')
  } catch (error) {
    try {
      handle.db.exec('ROLLBACK')
    } catch {
      /* transaction may already be closed */
    }
    throw error
  }
}

function removeEnabledAgentLinks(handle, deleted, folderName) {
  if (!deleted?.relationTable || !deleted.relations.length) return
  const agentTable = deleted.relationTable === 'agent_skills' ? 'agents' : 'agent'
  if (!tableExists(handle.db, agentTable)) return
  const agentColumns = getTableColumns(handle.db, agentTable)
  if (!agentColumns.has('id') || !agentColumns.has('accessible_paths')) return

  const enabledRelations = deleted.relations.filter((relation) => relation.is_enabled)
  for (const relation of enabledRelations) {
    const agent = handle.db.prepare(`SELECT accessible_paths FROM ${agentTable} WHERE id = ?`).get(relation.agent_id)
    let workspaces = []
    try {
      const parsed = JSON.parse(agent?.accessible_paths || '[]')
      workspaces = Array.isArray(parsed) ? parsed : []
    } catch {
      workspaces = []
    }
    for (const workspace of workspaces) {
      if (typeof workspace !== 'string' || !workspace) continue
      const linkPath = path.join(workspace, '.claude', 'skills', folderName)
      try {
        if (fs.lstatSync(linkPath).isSymbolicLink()) fs.unlinkSync(linkPath)
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn('[cherry-studio] failed to remove agent skill link:', linkPath, error)
      }
    }
  }
}

function uninstallCherryStudioSkill(options, dependencies = {}) {
  const DatabaseSync = loadDatabaseSync(dependencies.DatabaseSync)
  const fileOps = dependencies.fileOps || require('./fs')
  const assertWritable = dependencies.assertWritable || require('./write-roots').assertWritable
  const folderName = sanitizeCherryStudioFolderName(path.basename(options.targetDir) || options.skillName)
  const actualTargetDir = path.join(path.dirname(options.targetDir), folderName)
  assertWritable(actualTargetDir)

  let handle
  try {
    handle = findSupportedDatabase(actualTargetDir, DatabaseSync, assertWritable)
  } catch (error) {
    if (String(error?.message || error).startsWith('未找到 Cherry Studio 数据库')) {
      if (fileOps.pathExists(actualTargetDir)) fileOps.removeFile(actualTargetDir)
      return { targetDir: actualTargetDir }
    }
    throw error
  }

  let deleted
  try {
    const row = getSkillRow(handle, folderName)
    if (row && isBuiltinSkill(row)) throw new Error(`不能删除 Cherry Studio 内置 Skill：${folderName}`)
    deleted = deleteRegistration(handle, folderName)
    if (fileOps.pathExists(actualTargetDir)) fileOps.removeFile(actualTargetDir)
    removeEnabledAgentLinks(handle, deleted, folderName)
    return { targetDir: actualTargetDir }
  } catch (error) {
    if (deleted) {
      try {
        restoreDeletedRegistration(handle, deleted)
      } catch (rollbackError) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}；数据库恢复失败：${rollbackError.message || rollbackError}`)
      }
    }
    throw error
  } finally {
    handle.db.close()
  }
}

module.exports = {
  deployCherryStudioSkill,
  uninstallCherryStudioSkill,
  getDatabaseCandidates,
  sanitizeCherryStudioFolderName,
}
