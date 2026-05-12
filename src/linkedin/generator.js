const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db/database');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const POST_PROMPTS = {
  hook: `Write a LinkedIn hook post for Simtura.ai that stops the scroll.
Target audience: EMS Directors and EMS Program Directors.
The post should start with a bold, specific statement or surprising fact about EMS training.
Then connect it to what Simtura.ai does (AI-powered scenario generation + competency tracking for EMS).
Length: 150–200 words. No hashtags in the body — add 3 relevant hashtags at the end.
Use short sentences. Make the first line a standalone hook.
Return ONLY the post text.`,

  education: `Write an educational LinkedIn post for Simtura.ai.
Target audience: EMS Directors and EMS Program Directors.
Teach something genuinely useful about EMS training, simulation-based learning, or competency assessment.
Reference real challenges EMS instructors face (time pressure, NREMT alignment, scenario variety).
Subtly position Simtura.ai as a solution without being salesy.
Length: 200–250 words. End with a thought-provoking question for engagement.
Add 3 relevant hashtags at the end.
Return ONLY the post text.`,

  community: `Write a community-focused LinkedIn post for Simtura.ai.
Target audience: EMS community — providers, instructors, directors.
Celebrate something about EMS professionals — their dedication, a milestone, or the importance of their work.
Make it feel human and genuine, not corporate.
Simtura.ai can be mentioned lightly at the end as a tool built to support their work.
Length: 150–180 words. Add 3 relevant hashtags at the end.
Return ONLY the post text.`,

  proof: `Write a social proof / results-focused LinkedIn post for Simtura.ai.
Target audience: EMS Directors and EMS Program Directors considering training tools.
Share a realistic, believable outcome or use case — like how an agency/school saved instructor prep time,
improved NREMT pass rates, or expanded their scenario library.
Be honest and specific. Don't exaggerate.
Length: 180–220 words. End with a soft CTA (e.g., "DM me if you'd like to see how it works").
Add 3 relevant hashtags at the end.
Return ONLY the post text.`,
};

// Returns the ISO week string like "2026-W20"
function getWeekOf(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo    = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function generateWeeklyPosts() {
  const weekOf  = getWeekOf();
  const postTypes = ['hook', 'education', 'community', 'proof'];

  // Don't regenerate if this week already has posts
  const existing = db.db.prepare(
    "SELECT COUNT(*) as n FROM linkedin_posts WHERE week_of = ?"
  ).get(weekOf);
  if (existing.n >= 4) {
    console.log(`[LinkedIn] Posts for ${weekOf} already exist — skipping.`);
    return [];
  }

  const created = [];

  for (const postType of postTypes) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: POST_PROMPTS[postType] }],
      });

      const content = message.content[0].text.trim();
      const post    = db.createLinkedInPost(postType, content, weekOf);
      created.push(post);
      console.log(`[LinkedIn] Generated ${postType} post for week ${weekOf}`);

      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.error(`[LinkedIn] Failed to generate ${postType} post:`, err.message);
    }
  }

  db.logActivity('linkedin_generated', JSON.stringify({ week: weekOf, count: created.length }));
  return created;
}

module.exports = { generateWeeklyPosts, getWeekOf };
