export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const scriptUrl = (process.env.APPS_SCRIPT_URL    || '').trim()
  const secret    = (process.env.APPS_SCRIPT_SECRET || '').trim()
  if (!scriptUrl) return res.status(500).json({ error: 'APPS_SCRIPT_URL not configured' })

  const { confirmed } = req.body || {}
  if (!confirmed) return res.status(400).json({ error: 'Missing confirmed data' })

  const body = JSON.stringify({ s: secret, confirmed })

  try {
    // Apps Script /exec redirects with 302; follow it manually to preserve POST body
    let response = await fetch(scriptUrl, {
      method:   'POST',
      redirect: 'manual',
      headers:  { 'Content-Type': 'application/json' },
      body,
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (location) {
        response = await fetch(location, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
      }
    }

    const data = await response.json()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
