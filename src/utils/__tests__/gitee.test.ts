import { describe, expect, test, vi } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildGiteeBranchUrl,
  buildGiteeCommitUrl,
  buildGiteeContentsUrl,
  buildGiteeGitUrl,
  buildGiteeCloneAuth,
  buildGiteeRawUrl,
  fetchGiteeJSONCompat,
  fetchGiteeFile,
  getGiteeBranchCandidates,
  getGiteeTreeSha,
  selectGiteeSkillFiles,
} from '../gitee'

const require = createRequire(import.meta.url)
const { buildGiteeLocalFileManifest, getGiteeChangedFiles } = require('../../../public/preload/lib/gitee-skills.js')

describe('Gitee skill repository support', () => {
  test('builds a contents API URL instead of a zip URL', () => {
    const url = buildGiteeContentsUrl('acme/skills', 'skills/my-skill/SKILL.md', 'master')
    expect(url).toBe('https://gitee.com/api/v5/repos/acme/skills/contents/skills/my-skill/SKILL.md?ref=master')
    expect(url).not.toContain('zip')
  })

  test('builds a public raw file URL', () => {
    expect(buildGiteeRawUrl('acme/skills', 'skills/my skill/SKILL.md', 'main')).toBe(
      'https://gitee.com/acme/skills/raw/main/skills/my%20skill/SKILL.md',
    )
  })

  test('builds the anonymous Gitee Git HTTP clone URL', () => {
    expect(buildGiteeGitUrl('acme/skills')).toBe('https://gitee.com/acme/skills.git')
  })

  test('uses the Gitee token as the Git HTTPS password when provided', () => {
    expect(buildGiteeCloneAuth('acme/skills', 'gitee-token')).toEqual({
      username: 'acme',
      password: 'gitee-token',
    })
    expect(buildGiteeCloneAuth('acme/skills')).toBeUndefined()
  })

  test('gets the branch commit from the branches API', () => {
    expect(buildGiteeBranchUrl('acme/skills', 'master')).toBe('https://gitee.com/api/v5/repos/acme/skills/branches/master')
  })

  test('resolves the tree SHA from a Gitee commit response', () => {
    expect(buildGiteeCommitUrl('acme/skills', 'commit-sha')).toBe(
      'https://gitee.com/api/v5/repos/acme/skills/commits/commit-sha',
    )
    expect(getGiteeTreeSha({ sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } })).toBe('tree-sha')
    expect(
      getGiteeTreeSha({ commit: { sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } } }),
    ).toBe('tree-sha')
  })

  test('tries the configured branch before Gitee common defaults', () => {
    expect(getGiteeBranchCandidates('develop')).toEqual(['develop', 'main', 'master'])
    expect(getGiteeBranchCandidates('master')).toEqual(['master', 'main'])
  })

  test('falls back to the existing download bridge when the new preload API is unavailable', async () => {
    const oldFetch = window.services.fetchGiteeJSON
    const oldDownload = window.services.downloadFile
    delete (window.services as any).fetchGiteeJSON
    window.services.downloadFile = vi.fn(async () => new TextEncoder().encode('{"sha":"abc"}').buffer)

    await expect(fetchGiteeJSONCompat('https://gitee.com/api/v5/repos/acme/skills/branches/master')).resolves.toEqual({ sha: 'abc' })

    window.services.fetchGiteeJSON = oldFetch
    window.services.downloadFile = oldDownload
  })

  test('reads public Gitee files from raw instead of the API contents endpoint', async () => {
    const oldDownload = window.services.downloadFile
    const oldFetch = window.services.fetchGiteeJSON
    const apiFetch = vi.fn(async () => ({ content: '' }))
    window.services.fetchGiteeJSON = apiFetch
    window.services.downloadFile = vi.fn(async (url: string, token?: string) => {
      expect(url).toBe('https://gitee.com/acme/skills/raw/main/SKILL.md')
      expect(token).toBeUndefined()
      return new TextEncoder().encode('---\nname: Demo\n---').buffer
    })

    await expect(fetchGiteeFile('acme', 'skills', 'SKILL.md', 'main')).resolves.toContain('name: Demo')
    expect(apiFetch).not.toHaveBeenCalled()

    window.services.downloadFile = oldDownload
    window.services.fetchGiteeJSON = oldFetch
  })

  test('selects only files under the requested skill directory', () => {
    const files = selectGiteeSkillFiles(
      [
        { path: 'README.md', type: 'blob' },
        { path: 'skills/my-skill/SKILL.md', type: 'blob' },
        { path: 'skills/my-skill/scripts/run.js', type: 'blob' },
        { path: 'skills/other-skill/SKILL.md', type: 'blob' },
      ],
      'my-skill',
    )
    expect(files).toEqual([
      { remotePath: 'skills/my-skill/SKILL.md', localPath: 'SKILL.md' },
      { remotePath: 'skills/my-skill/scripts/run.js', localPath: 'scripts/run.js' },
    ])
  })

  test('builds metadata files without including .skill-meta.json itself', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-gitee-'))
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.writeFileSync(path.join(root, 'SKILL.md'), 'skill')
    fs.writeFileSync(path.join(root, 'scripts', 'run.js'), 'run')
    fs.writeFileSync(path.join(root, '.skill-meta.json'), '{}')

    expect(buildGiteeLocalFileManifest(root)).toEqual([
      { path: 'SKILL.md', size: 5 },
      { path: 'scripts/run.js', size: 3 },
    ])

    fs.rmSync(root, { recursive: true, force: true })
  })

  test('compares Gitee local and remote manifests', () => {
    expect(
      getGiteeChangedFiles(
        [{ path: 'SKILL.md', size: 10 }, { path: 'scripts/run.js', size: 4 }],
        [{ path: 'SKILL.md', size: 10 }, { path: 'scripts/new.js', size: 2 }],
      ),
    ).toEqual(['scripts/new.js', 'scripts/run.js'])
  })

  test('detects same-size file content changes by hash', () => {
    expect(
      getGiteeChangedFiles(
        [{ path: 'SKILL.md', size: 10, hash: 'remote' }],
        [{ path: 'SKILL.md', size: 10, hash: 'local' }],
      ),
    ).toEqual(['SKILL.md'])
  })
})
