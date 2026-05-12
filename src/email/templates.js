const SIMTURA_CONTEXT = `
Simtura.ai builds AI-powered simulation and training tools for EMS and pre-hospital care.

Key value propositions:
- AI-generated clinical scenarios — instructors get unlimited, evidence-based scenarios in seconds
- Competency gap tracking — identifies where students are struggling and adapts
- NREMT alignment — all scenarios map to NREMT cognitive and psychomotor competencies
- Reduces instructor prep time by 80%

Website: https://simtura.ai
`.trim();

const STEP_PROMPTS = {
  1: (prospect) => `
You are writing a cold outreach email on behalf of Yousef Radwan at Simtura.ai.

Prospect:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Title: ${prospect.contact_title || ''}
- Type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching Program'}

${SIMTURA_CONTEXT}

Rules:
- Under 100 words in the body. Short is better.
- One specific sentence about what they likely deal with (instructor time, scenario variety, NREMT pass rates — pick what fits their org type)
- One sentence on what Simtura does about it
- End with a single low-pressure question: "Would it be worth a quick look?"
- Include the website: https://simtura.ai
- No buzzwords. No fluffy openers like "I hope this finds you well."
- Sign off: Yousef Radwan, Simtura.ai

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  2: (prospect) => `
You are writing follow-up email #2 for Simtura.ai. The first email introduced the platform.

Prospect:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Title: ${prospect.contact_title || ''}
- Type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching Program'}

${SIMTURA_CONTEXT}

Rules:
- Under 80 words. Get to the point fast.
- Don't mention the previous email
- Lead with one sharp pain point for their org type:
  * Agency: "Building scenarios from scratch eats hours your instructors don't have"
  * School: "NREMT pass rates live or die on scenario volume and variety"
- One line on how Simtura solves it
- Ask: "Worth 15 minutes?"
- Include https://simtura.ai
- Sign off: Yousef Radwan, Simtura.ai

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  3: (prospect) => `
You are writing follow-up email #3 for Simtura.ai. Two emails have gone out with no reply.

Prospect:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Title: ${prospect.contact_title || ''}
- Type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching Program'}

${SIMTURA_CONTEXT}

Rules:
- Under 90 words
- Share one concrete, believable result from a similar org (e.g. "cut scenario prep from 2 hours to 10 minutes", "doubled their scenario library before NREMT season")
- Don't exaggerate — keep it grounded and specific
- One soft CTA: offer to send a short demo clip or case study
- Include https://simtura.ai
- Sign off: Yousef Radwan, Simtura.ai

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  4: (prospect) => `
You are writing follow-up email #4 for Simtura.ai. Three emails, no reply.

Prospect:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Title: ${prospect.contact_title || ''}
- Type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching Program'}

${SIMTURA_CONTEXT}

Rules:
- Under 60 words. Extremely brief.
- Ask one genuine question about their biggest training challenge right now — make it feel human, not like a sales follow-up
- Don't pitch the product hard. One passing mention max.
- No website link needed in this one — this should feel personal
- Sign off: Yousef Radwan, Simtura.ai

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  5: (prospect) => `
You are writing the final email (#5) for Simtura.ai. This is the breakup email.

Prospect:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Title: ${prospect.contact_title || ''}
- Type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching Program'}

${SIMTURA_CONTEXT}

Rules:
- Under 60 words. Clean and respectful.
- Say this is the last email — you don't want to clutter their inbox
- Leave the door open warmly, no pressure
- Include https://simtura.ai one final time
- Sign off: Yousef Radwan, Simtura.ai

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,
};

// Days to wait after sending step N before sending step N+1
const STEP_INTERVALS = {
  1: 3,
  2: 4,
  3: 6,
  4: 7,
};

module.exports = { STEP_PROMPTS, STEP_INTERVALS };
