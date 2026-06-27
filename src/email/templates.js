const STEP_PROMPTS = {
  1: (prospect) => `
Write a cold email from Yousef Radwan at Simtura.ai to ${prospect.contact_name || 'there'} at ${prospect.organization}.

Simtura.ai is a training platform for EMS students — video scenarios where the patient actually deteriorates or improves based on what the student does. It's free to try at https://simtura.ai.

Write a 3-sentence email. Sentence 1: one specific, honest observation about how hard it is to prepare EMS students for the moment a call goes wrong — not generic, not flattering, just real. Sentence 2: mention Simtura lets students work through cases where the patient actually changes based on their decisions — not a slideshow, the patient is breathing and deteriorating in real time. Sentence 3: "Worth a look — https://simtura.ai"

Sign off: Yousef

Rules:
- Sound like a real person, not a company
- No exclamation points
- No "I hope this finds you well" or any opener like that
- No buzzwords: no "leverage", "revolutionize", "cutting-edge", "game-changer"
- Do not mention AI
- Under 80 words total

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  2: (prospect) => `
Write cold follow-up email #2 from Yousef Radwan at Simtura.ai to ${prospect.contact_name || 'there'} at ${prospect.organization}. They didn't respond to the first email.

Don't reference the first email. Write something completely fresh.

Focus on one thing: most EMS training gives students a scenario that stays the same no matter what they do. Simtura cases actually progress — the patient gets worse if you miss something, stabilizes if you get it right. That's the difference.

End with a soft CTA: "Free to try — https://simtura.ai"

Sign off: Yousef

Rules:
- Under 75 words
- No opener, just get into it
- Sound like a person who actually cares about EMS education, not a salesperson
- No exclamation points, no buzzwords, no mention of AI

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  3: (prospect) => `
Write cold follow-up email #3 from Yousef Radwan at Simtura.ai to ${prospect.contact_name || 'there'} at ${prospect.organization}. Two emails sent, no reply.

Ask a genuine question about their program — something like how they currently handle scenario training, or what their students struggle with most on the NREMT. Make it sound like you're actually curious, not fishing for an opening.

One sentence mentioning Simtura exists is fine but not required. Don't pitch.

Sign off: Yousef

Rules:
- Under 65 words
- One question max
- Sound genuinely curious, not strategic
- No exclamation points, no buzzwords

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  4: (prospect) => `
Write cold follow-up email #4 from Yousef Radwan at Simtura.ai to ${prospect.contact_name || 'there'} at ${prospect.organization}. Three emails, no reply.

Keep it very short. Something like: you've been building this for EMS programs, you think it'd be useful for theirs specifically, and you're happy to show them a case live on a 15-minute call if they ever want. No pressure.

Sign off: Yousef

Rules:
- Under 55 words
- Very low pressure, very human
- No pitch language at all

Return ONLY valid JSON, no markdown:
{"subject": "...", "body": "..."}
`,

  5: (prospect) => `
Write the final email (#5) from Yousef Radwan at Simtura.ai to ${prospect.contact_name || 'there'} at ${prospect.organization}. Last in the sequence.

Tell them this is the last you'll reach out. Leave one honest thought — not a pitch, just something real about why you think simulation matters for EMS training and why you built this. Leave the door open warmly. Link: https://simtura.ai

Sign off: Yousef

Rules:
- Under 65 words
- Genuine, not dramatic
- No pressure, no pitch

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
