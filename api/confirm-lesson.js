export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const scriptUrl = process.env.APPS_SCRIPT_URL
  const secret    = process.env.APPS_SCRIPT_SECRET
  if (!scriptUrl) return res.status(500).json({ error: 'APPS_SCRIPT_URL not configured' })

  const { id, confirmed } = req.body || {}
  if (!id || !confirmed) return res.status(400).json({ error: 'Missing id or confirmed' })

  try {
    const response = await fetch(scriptUrl, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'application/json' },
      body:     JSON.stringify({ id, s: secret, confirmed }),
    })
    const data = await response.json()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
