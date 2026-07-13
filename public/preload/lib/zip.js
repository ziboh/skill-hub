const fs = require('node:fs')
const AdmZip = require('adm-zip')
const { safeResolveWithin } = require('./path-utils')
const { assertWritable } = require('./write-roots')

function extractBufferZip(buffer, dest) {
  const fullDest = assertWritable(dest)
  fs.mkdirSync(fullDest, { recursive: true })
  const zip = new AdmZip(Buffer.from(buffer))
  const entries = zip.getEntries()
  for (const entry of entries) {
    const entryPath = entry.entryName
    try {
      safeResolveWithin(fullDest, entryPath)
    } catch {
      throw new Error(`Zip Slip detected: "${entryPath}" escapes destination`)
    }
  }
  zip.extractAllTo(fullDest, true)
  return fullDest
}

module.exports = { extractBufferZip }
