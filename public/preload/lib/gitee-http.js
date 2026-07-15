const https = require('node:https')

function downloadGiteeRawFile(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'skill-hub', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(downloadGiteeRawFile(res.headers.location, token))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`Gitee raw: ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

function fetchGiteeJSON(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    if (token) parsed.searchParams.set('access_token', token)
    const req = https.get(
      parsed,
      { headers: { Accept: 'application/json', 'User-Agent': 'skill-hub' } },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            const requestId = res.headers['x-request-id'] || res.headers['bdwaf-request-id']
            const suffix = requestId ? ` (request: ${requestId})` : ''
            if (res.statusCode === 403 && /rate limit/i.test(data)) {
              return reject(new Error(`Gitee API 请求频率受限，请稍后重试或配置 Gitee Token${suffix}`))
            }
            return reject(new Error(`Gitee API: ${res.statusCode}${suffix}`))
          }
          try {
            resolve(JSON.parse(data))
          } catch (error) {
            reject(new Error(`Gitee API JSON parse error: ${error.message}`))
          }
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
  })
}

module.exports = { fetchGiteeJSON, downloadGiteeRawFile }
