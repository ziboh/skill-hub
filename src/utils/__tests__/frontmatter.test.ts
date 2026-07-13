import { describe, test, expect } from 'vitest'
import { parseFrontmatter } from '../frontmatter'

describe('parseFrontmatter', () => {
  test('parses simple key-value pairs', () => {
    const result = parseFrontmatter('---\nname: test\nversion: 1.0\n---')
    expect(result).toEqual({ name: 'test', version: '1.0' })
  })

  test('handles quoted values', () => {
    const result = parseFrontmatter('---\ndescription: "hello world"\ntitle: \'single quotes\'\n---')
    expect(result).toEqual({ description: 'hello world', title: 'single quotes' })
  })

  test('handles multi-line value with pipe literal block, keeping leading spaces', () => {
    const text = `---
description: |
  line1
  line2
  line3
---`
    const result = parseFrontmatter(text)
    expect(result.description).toBe('  line1\n  line2\n  line3')
  })

  test('handles multi-line value with folded block, keeping leading spaces', () => {
    const text = `---
description: >
  This is
  a folded
  block
---`
    const result = parseFrontmatter(text)
    expect(result.description).toBe('  This is   a folded   block')
  })

  test('handles block scalar with plus chomp, keeping leading spaces', () => {
    const text = `---
description: |+
  line1

---`
    const result = parseFrontmatter(text)
    expect(result.description).toBe('  line1')
  })

  test('handles indented block value for empty key', () => {
    const text = `---
description:
  This is an indented
  block value
---`
    const result = parseFrontmatter(text)
    expect(result.description).toBe('This is an indented block value')
  })

  test('strips brackets from array-like values', () => {
    const result = parseFrontmatter('---\ntags: [one, two, three]\n---')
    expect(result.tags).toBe('one, two, three')
  })

  test('parses YAML list-style tags', () => {
    const result = parseFrontmatter('---\ntags:\n  - search\n  - dev\n---')
    expect(result.tags).toBe('search, dev')
  })

  test('extracts description from body when not in frontmatter', () => {
    const result = parseFrontmatter('---\nname: test\n---\n\nThis is the first paragraph.')
    expect(result.description).toBe('This is the first paragraph.')
  })

  test('extracts description limited to 200 chars', () => {
    const long = 'x'.repeat(300)
    const result = parseFrontmatter(`---\nname: test\n---\n\n${long}`)
    expect(result.description!.length).toBe(200)
  })

  test('returns description from body when no frontmatter markers exist', () => {
    const result = parseFrontmatter('just some text\nwithout frontmatter')
    expect(result.description).toBe('just some text')
  })

  test('handles CRLF line endings', () => {
    const result = parseFrontmatter('---\r\nname: test\r\nversion: 2.0\r\n---')
    expect(result).toEqual({ name: 'test', version: '2.0' })
  })

  test('skips frontmatter delimiter when extracting description from body', () => {
    const result = parseFrontmatter('---\n---\nbody content')
    expect(result.description).toBe('body content')
  })
})
