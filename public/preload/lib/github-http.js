const https = require('node:https')
const http = require('node:http')

const _rateLimitState = { remaining: 5000, reset: 0 }

function _updateRateLimit(headers) {
  const remaining = headers['x-ratelimit-remaining']
  const reset = headers['x-ratelimit-reset']
  if (remaining !== undefined) _rateLimitState.remaining = Number(remaining)
  if (reset !== undefined) _rateLimitState.reset = Number(reset)
}

async function _rateLimitWait() {
  if (_rateLimitState.remaining > 10) return
  const resetMs = _rateLimitState.reset * 1000
  const waitMs = resetMs - Date.now() + 1000
  if (waitMs > 0) await new Promise((r) => setTimeout(r, Math.min(waitMs, 60000)))
}

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function _downloadFileInternal(url, token, redirectCount) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'))
    }
    const headers = { 'User-Agent': 'skill-hub' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const client = url.startsWith('https') ? https : http

    function doRequest(retriesLeft) {
      client
        .get(url, { headers }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return resolve(_downloadFileInternal(res.headers.location, token, redirectCount + 1))
          }
          _updateRateLimit(res.headers)

          if ((res.statusCode === 429 || res.statusCode === 403) && retriesLeft > 0) {
            res.resume()
            const retryAfter = res.headers['retry-after']
            const waitMs = retryAfter ? Number(retryAfter) * 1000 : (4 - retriesLeft) * 2000
            return _sleep(Math.min(waitMs, 30000)).then(() => doRequest(retriesLeft - 1))
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed: ${res.statusCode}`))
          }
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => resolve(Buffer.concat(chunks)))
          res.on('error', reject)
        })
        .on('error', (err) => {
          if (retriesLeft > 0) {
            _sleep(2000).then(() => doRequest(retriesLeft - 1))
          } else {
            reject(err)
          }
        })
    }

    _rateLimitWait().then(() => doRequest(2))
  })
}

function _fetchGitHubJSONInternal(url, token, redirectCount) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'))
    }
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'skill-hub',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const client = url.startsWith('https') ? https : http

    function doRequest(retriesLeft) {
      client
        .get(url, { headers }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return resolve(_fetchGitHubJSONInternal(res.headers.location, token, redirectCount + 1))
          }
          _updateRateLimit(res.headers)

          if ((res.statusCode === 429 || res.statusCode === 403) && retriesLeft > 0) {
            res.resume()
            const retryAfter = res.headers['retry-after']
            const waitMs = retryAfter ? Number(retryAfter) * 1000 : (4 - retriesLeft) * 2000
            return _sleep(Math.min(waitMs, 30000)).then(() => doRequest(retriesLeft - 1))
          }

          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            if (res.statusCode !== 200) reject(new Error(`GitHub API: ${res.statusCode}`))
            else {
              try {
                resolve(JSON.parse(data))
              } catch (e) {
                reject(new Error(`GitHub API JSON parse error: ${e.message}`))
              }
            }
          })
          res.on('error', reject)
        })
        .on('error', (err) => {
          if (retriesLeft > 0) {
            _sleep(2000).then(() => doRequest(retriesLeft - 1))
          } else {
            reject(err)
          }
        })
    }

    _rateLimitWait().then(() => doRequest(2))
  })
}

function downloadFile(url, token) {
  return _downloadFileInternal(url, token, 0)
}

function fetchGitHubJSON(url, token) {
  return _fetchGitHubJSONInternal(url, token, 0)
}

module.exports = {
  downloadFile,
  fetchGitHubJSON,
  _downloadFileInternal,
  _fetchGitHubJSONInternal,
}
