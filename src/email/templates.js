const SIMTURA_CONTEXT = `
Simtura.ai creates hyperrealistic AI video simulations for EMS training.

What makes it different:
- AI-generated video cases that progress in real time — vitals change, the patient deteriorates or improves based on student decisions
- Students feel like they're actually on the call, not watching a slideshow
- Immersive, scenario-based learning built on the science of deliberate practice
- NREMT-aligned case progressions that prepare students for what they'll actually face
- The future of EMS pedagogy — immersion over memorization

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
- Under 100 words in the body
- Open with one honest observation about how EMS training typically feels disconnected from real calls — the gap between classroom and scene
- Introduce Simtura as hyperrealistic AI video simulations where cases actually progress — the patient gets worse, vitals shift, the scene evolves
- One line: this is what immersive EMS education looks like
- End with: "Worth seeing — https://simtura.ai"
- No buzzwords, no fluff. Write like a real person.
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
- Under 90 words
- Don't reference the previous email
- Make it about the experience: when a student watches a Simtura case, the patient is breathing, struggling, deteriorating — it feels like a real call because the AI video progresses based on what should happen next
- Contrast this with static mannequins or slideshows
- One line CTA: "Would love to show you a case — https://simtura.ai"
- Sign off: Yousef Radwan, Simtura.ai

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  3: (prospect) => `
You are writing follow-up email #3 for Simtura.ai. Two emails have gone out, no reply.

Prospect:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Title: ${prospect.contact_title || ''}
- Type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching Program'}

${SIMTURA_CONTEXT}

Rules:
- Under 90 words
- Zoom in on pedagogy: immersion is how humans actually learn — flight simulators, surgical simulators, now EMS simulators. The research on deliberate practice in high-stakes fields points to this
- Simtura brings that same level of immersion to EMS — hyperrealistic video progressions that make the brain treat it like a real call
- One concrete outcome: students who train this way make better decisions under pressure
- CTA: https://simtura.ai
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
- Under 70 words. Make it feel human.
- Ask one genuine question: something like "What does a typical training scenario look like for your students right now?" or "Do your students ever get to practice a call that goes sideways in real time?"
- Don't pitch hard. Just be curious.
- One passing mention of Simtura is fine but not required
- Sign off: Yousef Radwan, Simtura.ai

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  5: (prospect) => `
You are writing the final email (#5) for Simtura.ai. This is the last in the sequence.

Prospect:
- Organization: ${prospect.organization}
- Contact name: ${prospect.contact_name || 'there'}
- Title: ${prospect.contact_title || ''}
- Type: ${prospect.type === 'agency' ? 'EMS Agency' : 'EMS Teaching Program'}

${SIMTURA_CONTEXT}

Rules:
- Under 70 words
- Be genuine: this is the last email, you won't keep following up
- Leave one lasting thought — something like: the gap between how EMS providers train and how they actually perform on scene is closing, and immersive simulation is how
- Leave the door open warmly
- Link: https://simtura.ai
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
