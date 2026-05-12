// Prompt context for each step in the 5-step sequence.
// Claude uses this to generate a fully personalized email.

const SIMTURA_CONTEXT = `
Simtura.ai builds AI-powered simulation and training tools specifically for EMS and pre-hospital care.

Key value propositions:
- AI-generated clinical scenario creation — instructors get unlimited, evidence-based scenarios in seconds
- Competency gap tracking — the system identifies where individual students are struggling and adapts
- NREMT alignment — all scenarios map directly to NREMT cognitive and psychomotor competencies
- Reduces instructor prep time by 80% — no more building scenarios from scratch

Target decision makers:
- EMS Directors, Training Chiefs, Medical Directors (for agencies)
- EMS Program Directors, Community College Deans (for schools)

Tone: warm, specific, non-salesy, partnership-focused. Never pushy. Always lead with value.
This is a partnership outreach, not a sales pitch.
`.trim();

const STEP_PROMPTS = {
  1: (prospect) => `
You are writing a cold outreach email on behalf of Simtura.ai to introduce the platform.

Prospect details:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Contact title: ${prospect.contact_title || ''}
- Organization type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching School/Program'}

About Simtura.ai:
${SIMTURA_CONTEXT}

Write a short, warm, personalized introduction email (3–4 paragraphs max).
- Subject line should be specific to their organization, not generic
- Opening line must reference something specific about their organization or EMS work
- Focus on ONE value prop most relevant to their org type
- End with a low-pressure ask: offer to share a short demo or send more info
- Do NOT use buzzwords like "revolutionary", "cutting-edge", "game-changing"
- Signature: Yousef Radwan, Simtura.ai

Return ONLY a JSON object in this exact format (no markdown, no extra text):
{"subject": "...", "body": "..."}

The body should be plain text (no HTML tags) — it will be formatted as HTML automatically.
`,

  2: (prospect) => `
You are writing follow-up email #2 in a drip sequence for Simtura.ai.
The first email introduced Simtura.ai. This email should go deeper on a specific pain point.

Prospect details:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Contact title: ${prospect.contact_title || ''}
- Organization type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching School/Program'}

About Simtura.ai:
${SIMTURA_CONTEXT}

Write a concise follow-up email (2–3 paragraphs).
- Acknowledge you reached out recently, keep it light
- Lead with a specific pain point for their org type:
  * For agencies: instructor burnout, inconsistent training quality, time between runs
  * For schools: NREMT pass rates, scenario variety, student engagement
- Show how Simtura.ai directly solves that pain point with a concrete example or stat
- One soft call to action: "Would a 15-minute call make sense?"
- Signature: Yousef Radwan, Simtura.ai

Return ONLY a JSON object:
{"subject": "...", "body": "..."}
`,

  3: (prospect) => `
You are writing follow-up email #3 in a drip sequence for Simtura.ai.
Previous emails introduced the platform and hit a pain point. This one builds credibility.

Prospect details:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Contact title: ${prospect.contact_title || ''}
- Organization type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching School/Program'}

About Simtura.ai:
${SIMTURA_CONTEXT}

Write a social proof / use-case focused email (2–3 paragraphs).
- Briefly mention how similar organizations (agencies or schools, matching their type) use Simtura
- Give a specific, believable outcome: "instructors saved X hours", "scenario library grew from Y to Z"
- Keep it humble and honest — don't exaggerate
- Light CTA: offer to share a case study or quick demo
- Signature: Yousef Radwan, Simtura.ai

Return ONLY a JSON object:
{"subject": "...", "body": "..."}
`,

  4: (prospect) => `
You are writing follow-up email #4 in a drip sequence for Simtura.ai.
Three emails have gone out. No reply yet. Try a different angle.

Prospect details:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Contact title: ${prospect.contact_title || ''}
- Organization type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching School/Program'}

About Simtura.ai:
${SIMTURA_CONTEXT}

Write a short, honest email that tries a completely different angle (2 paragraphs max).
- Don't mention previous emails
- Ask a genuine question about their current training challenges — make it about them, not the product
- Only briefly mention Simtura.ai as a possible solution if relevant
- This should feel like a genuine curious outreach, not a sales follow-up
- Signature: Yousef Radwan, Simtura.ai

Return ONLY a JSON object:
{"subject": "...", "body": "..."}
`,

  5: (prospect) => `
You are writing the final email (#5) in a drip sequence for Simtura.ai. This is the breakup email.

Prospect details:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Contact title: ${prospect.contact_title || ''}
- Organization type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching School/Program'}

About Simtura.ai:
${SIMTURA_CONTEXT}

Write a graceful "closing the loop" email (1–2 short paragraphs).
- Be honest: this is the last email, you don't want to clutter their inbox
- Leave the door open warmly — "if priorities change" type language
- No hard sell at all. This is about respect and relationship, not conversion
- Short and clean. End warmly.
- Signature: Yousef Radwan, Simtura.ai

Return ONLY a JSON object:
{"subject": "...", "body": "..."}
`,
};

// Days to wait after sending step N before sending step N+1
const STEP_INTERVALS = {
  1: 3,  // step 1 sent → schedule step 2 in 3 days (Day 1→4)
  2: 4,  // step 2 sent → schedule step 3 in 4 days (Day 4→8)
  3: 6,  // step 3 sent → schedule step 4 in 6 days (Day 8→14)
  4: 7,  // step 4 sent → schedule step 5 in 7 days (Day 14→21)
};

module.exports = { STEP_PROMPTS, STEP_INTERVALS };
