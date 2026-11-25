export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const scriptUrl = (process.env.APPS_SCRIPT_URL    || '').trim()
  const secret    = (process.env.APPS_SCRIPT_SECRET || '').trim()
  if (!scriptUrl) return res.status(500).json({ error: 'APPS_SCRIPT_URL not configured' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const url = `${scriptUrl}?id=${encodeURIComponent(id)}&s=${encodeURIComponent(secret)}`

  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' })
    const data = await response.json()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
