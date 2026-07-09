export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mode, projectDetails, rawNotes } = req.body;

    const systemPrompt = `You are a senior program management expert with 20+ years of experience. Your job is to analyze project information and return a comprehensive health assessment.

Return ONLY a valid JSON object with this exact structure. No markdown, no backticks, no explanation â€” raw JSON only:

{
  "overall": "RED",
  "overall_reason": "2-3 sentence explanation of overall status",
  "executive_summary": "One crisp sentence suitable for copy-pasting into an executive status report",
  "dimensions": {
    "schedule": {"rag": "RED", "label": "Schedule", "note": "One sentence explanation"},
    "budget": {"rag": "AMBER", "label": "Budget", "note": "One sentence explanation"},
    "resources": {"rag": "GREEN", "label": "Resources", "note": "One sentence explanation"},
    "risks": {"rag": "RED", "label": "Risks", "note": "One sentence explanation"},
    "stakeholders": {"rag": "AMBER", "label": "Stakeholders", "note": "One sentence explanation"}
  },
  "hidden_risks": [
    {"title": "Short risk title", "severity": "high", "why": "Why this is a hidden risk â€” what signal you spotted", "action": "Specific action to take this week"},
    {"title": "Short risk title", "severity": "medium", "why": "Why this is a hidden risk", "action": "Specific action to take this week"},
    {"title": "Short risk title", "severity": "low", "why": "Why this is a hidden risk", "action": "Specific action to take this week"}
  ],
  "top_actions": [
    {"text": "Specific action with owner and timeline"},
    {"text": "Specific action with owner and timeline"},
    {"text": "Specific action with owner and timeline"}
  ]
}

Rules:
- overall, and all rag values must be exactly "RED", "AMBER", or "GREEN"
- severity must be exactly "high", "medium", or "low"
- hidden_risks should surface NON-OBVIOUS risks â€” things that look fine but carry danger signals
- Return raw JSON only`;

    const userContent = mode === 'raw'
      ? `Analyze these project notes and provide a full health assessment:\n\n${rawNotes}`
      : `Analyze this project and provide a full health assessment:\n\n${projectDetails}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `API error ${response.status}: ${errText}` });
    }

    const data = await response.json();

    if (!data.content || data.content.length === 0) {
      return res.status(500).json({ error: 'Empty response from Claude' });
    }

    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const clean = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      return res.status(500).json({ error: 'No JSON found in response', raw: clean });
    }

    const jsonStr = clean.substring(jsonStart, jsonEnd + 1);
    const result = JSON.parse(jsonStr);

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
