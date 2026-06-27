// Static email templates — returns {subject, body} directly, no Claude generation needed.

const STEP_PROMPTS = {
  1: (prospect) => {
    const name = prospect.contact_name || prospect.organization;
    return {
      subject: `Potential Collaboration!`,
      body: `Hi ${name},

My name is Yousef, a neuroscience student at UCLA and a certified EMT. Over the last few months a friend and I built a website/program to help train both pre-licensure EMS students and current providers! It works in providing videos of a scenario, then users are prompted with certain decision points where they then dictate their action (or you can choose MCQ). Our grading system gives users a score based on their answer and moves them on to the next intervention. The premise is that learners think through the call in real time (we even built a mock NREMT psychomotor exam you can check out!).

I'm reaching out because I found that your program/agency has the kind of providers we built this for, and I'd love to get it in front of you guys — as an extra resource or, if it's a fit, part of a curriculum.

Easiest thing is to just play a scenario yourself: simtura.ai

If it clicks, I'd love to grab 15 minutes to show you the rest. Even if you absolutely hate it — I'd love to talk!

Best,
Yousef
My number, call me at any time: 603-573-8480`,
    };
  },

  2: (prospect) => {
    const name = prospect.contact_name || prospect.organization;
    return {
      subject: `Re: Potential Collaboration!`,
      body: `Hi ${name},

Just floating this back to the top of your inbox in case it got buried — totally get how it goes.

Quick recap: I'm Yousef, the UCLA neuro student / EMT who built the EMS training sim. The fastest way to get a feel for it is to play a single scenario yourself (a couple minutes, no setup): simtura.ai

If it's not a fit, no hard feelings at all — even a one-line "not for us" reply helps me. And if you're even a little curious, I'm happy to walk you through it in 15 minutes whenever works.

Best,
Yousef
603-573-8480 — call or text anytime`,
    };
  },

  3: (prospect) => {
    const name = prospect.contact_name || prospect.organization;
    return {
      subject: `Re: Potential Collaboration!`,
      body: `Hi ${name},

Last nudge from me on this, then I'll get out of your inbox — promise.

I still think Simtura could be a genuinely useful resource for your students/providers, but I know timing is everything and a cold email is easy to lose. If now isn't right, totally fair — just let me know and I'll check back down the road instead.

If you'd rather skip the back-and-forth, the scenario's right here to try: simtura.ai — or just text me and I'll send a 2-minute clip of it in action.

Either way, thanks for the time, and good luck with everything this season.

Best,
Yousef
603-573-8480 — call or text anytime`,
    };
  },
};

// Days to wait after sending step N before sending step N+1
const STEP_INTERVALS = {
  1: 3,
  2: 5,
};

module.exports = { STEP_PROMPTS, STEP_INTERVALS };
