export default async function handler(req, res) {
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const scriptUrl = (process.env.APPS_SCRIPT_URL    || '').trim()
  const secret    = (process.env.APPS_SCRIPT_SECRET || '').trim()
  if (!scriptUrl) return res.status(500).json({ error: 'APPS_SCRIPT_URL not configured' })

  try {
    const url = `${scriptUrl}?id=${encodeURIComponent(id)}&s=${encodeURIComponent(secret)}`
    const response = await fetch(url, { redirect: 'follow' })
    const text = await response.text()
    console.log('Apps Script GET status:', response.status, 'url:', response.url)
    console.log('Apps Script GET body (first 200):', text.slice(0, 200))
    let data
    try { data = JSON.parse(text) }
    catch (_) {
      return res.status(502).json({
        error: 'Apps Script returned non-JSON',
        status: response.status,
        finalUrl: response.url,
        body: text.slice(0, 300),
      })
    }
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
