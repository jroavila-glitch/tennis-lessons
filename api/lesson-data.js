export default async function handler(req, res) {
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const scriptUrl = process.env.APPS_SCRIPT_URL
  const secret    = process.env.APPS_SCRIPT_SECRET
  if (!scriptUrl) return res.status(500).json({ error: 'APPS_SCRIPT_URL not configured' })

  try {
    const url = `${scriptUrl}?id=${encodeURIComponent(id)}&s=${encodeURIComponent(secret)}`
    const response = await fetch(url, { redirect: 'follow' })
    const data = await response.json()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
