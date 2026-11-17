// Vercel serverless function: GET /api/availability
import { computeAvailability } from '../lib/availability.js';

export default async function handler(req, res) {
  try {
    const data = await computeAvailability();
    // cached 5 min at the edge, served stale up to 10 min while refreshing
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
