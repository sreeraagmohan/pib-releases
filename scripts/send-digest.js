#!/usr/bin/env node
// Runs at 8 PM IST (14:30 UTC) via GitHub Actions.
// 1. Sends the general evening digest to all digest subscribers.
// 2. Sends personalised topic briefs to topic-digest subscribers.

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { sendEmail, digestHtml, topicDigestHtml } = require('./email');

const DIGEST_THRESHOLD = 5;
const TOPIC_THRESHOLD  = 4; // lower bar — catches MOSPI/commerce releases that score 5 globally

const TOPIC_LABELS = {
  foreign_relations: 'Foreign Relations',
  science_tech:      'Science & Tech',
  defence:           'Defence',
  pm_modi:           'PM Modi',
  economics:         'Economics',
};

async function main() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Start of today in IST (UTC+5:30)
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayIST = nowIST.toISOString().split('T')[0];
  const startOfDayUTC = new Date(`${todayIST}T00:00:00+05:30`).toISOString();

  const dateLabel = nowIST.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  });

  const siteUrl = process.env.SITE_URL;

  // ── 1. General digest ─────────────────────────────────────────────────────

  const { data: digestArticles } = await supabase
    .from('articles')
    .select('title, url, score, category, headline, topics')
    .gte('published_at', startOfDayUTC)
    .gte('score', DIGEST_THRESHOLD)
    .order('score', { ascending: false })
    .limit(15);

  const { data: digestSubs } = await supabase
    .from('subscribers')
    .select('email, unsubscribe_token')
    .eq('digest', true);

  if (digestArticles?.length && digestSubs?.length) {
    console.log(`General digest: ${digestArticles.length} articles → ${digestSubs.length} subscribers`);
    const digestText = await generateDigest(anthropic, digestArticles);

    await supabase.from('digests').upsert({
      date: todayIST, content: digestText, article_count: digestArticles.length,
    });

    const bullets = digestText.split('\n').filter(l => l.trim());
    for (const sub of digestSubs) {
      const unsubscribeUrl = `${siteUrl}/unsubscribe.html?token=${sub.unsubscribe_token}`;
      try {
        await sendEmail({
          to: sub.email,
          subject: `PIB Evening Brief — ${dateLabel}`,
          html: digestHtml({ dateLabel, bullets, topArticles: digestArticles, unsubscribeUrl }),
        });
      } catch (e) { console.error(`Digest failed for ${sub.email}:`, e.message); }
    }
    console.log(`General digest sent.`);
  } else {
    console.log('General digest: skipped (no articles or no subscribers).');
  }

  // ── 2. Topic briefs ───────────────────────────────────────────────────────

  const { data: topicSubs } = await supabase
    .from('subscribers')
    .select('email, unsubscribe_token, topics')
    .eq('topic_digest', true)
    .not('topics', 'eq', '{}');

  if (!topicSubs?.length) {
    console.log('Topic digest: no subscribers.');
    return;
  }

  // Fetch all today's articles above the lower topic threshold
  const { data: topicArticles } = await supabase
    .from('articles')
    .select('title, url, score, category, headline, topics')
    .gte('published_at', startOfDayUTC)
    .gte('score', TOPIC_THRESHOLD)
    .order('score', { ascending: false })
    .limit(30);

  console.log(`Topic digest: ${topicSubs.length} subscribers, ${topicArticles?.length || 0} candidate articles`);

  for (const sub of topicSubs) {
    const matching = (topicArticles || []).filter(a =>
      a.topics?.some(t => sub.topics.includes(t))
    );

    if (!matching.length) {
      console.log(`No matching articles for ${sub.email} — skipping`);
      continue;
    }

    const topicNames = sub.topics
      .map(t => TOPIC_LABELS[t] || t)
      .join(' · ');

    const topicText = await generateTopicDigest(anthropic, matching, sub.topics);
    const bullets = topicText.split('\n').filter(l => l.trim());
    const unsubscribeUrl = `${siteUrl}/unsubscribe.html?token=${sub.unsubscribe_token}`;

    try {
      await sendEmail({
        to: sub.email,
        subject: `PIB Topic Brief — ${topicNames} — ${dateLabel}`,
        html: topicDigestHtml({ dateLabel, topicNames, bullets, topArticles: matching, unsubscribeUrl }),
      });
      console.log(`Topic brief sent to ${sub.email} (${matching.length} articles)`);
    } catch (e) {
      console.error(`Topic brief failed for ${sub.email}:`, e.message);
    }
  }
}

// ── Digest generators ─────────────────────────────────────────────────────────

async function generateDigest(anthropic, articles) {
  const list = articles
    .map((a, i) => `${i + 1}. [${a.score}/10] ${a.title}${a.headline ? ' — ' + a.headline : ''}`)
    .join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are writing the PIB Alerts evening briefing — a digest of significant Indian government press releases from today.

Releases available (ranked by importance, scored 1–10):
${list}

Rules:
- Write UP TO 5 bullet points starting with •. If fewer releases are worth covering, write fewer — quality over quantity.
- Each bullet: one tight, factual sentence. What happened and why it matters.
- Only cover genuinely significant releases (score 6+). Skip routine or ceremonial ones.
- If nothing today clears the bar for significance, respond with ONLY this single line (no bullets):
  "Quiet day in New Delhi — nothing significant crossed the wire today."
- Never ask for more information. Never explain what you'd need. Work only with what's given.
- No filler, no preamble. Start directly with the first bullet or the quiet-day line.`,
    }],
  });

  return msg.content[0].text.trim();
}

async function generateTopicDigest(anthropic, articles, topics) {
  const topicNames = topics.map(t => TOPIC_LABELS[t] || t).join(', ');
  const list = articles
    .map((a, i) => `${i + 1}. [${a.score}/10] [${(a.topics || []).join(', ')}] ${a.title}${a.headline ? ' — ' + a.headline : ''}`)
    .join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: `You are writing a specialised PIB Alerts topic brief for a subscriber who follows: ${topicNames}.

Today's relevant Indian government press releases:
${list}

Rules:
- Write UP TO 5 bullet points starting with •.
- Be more analytical than the general digest — briefly note implications where relevant (e.g. trade data: what it signals, a defence deal: strategic context).
- Each bullet: one to two tight sentences max.
- If nothing is worth covering, respond with ONLY: "Nothing in your tracked topics crossed the wire today."
- Never ask for more information. Work only with what's given.
- No preamble. Start directly with the first bullet or the quiet line.`,
    }],
  });

  return msg.content[0].text.trim();
}

// Force exit — Supabase realtime WebSocket keeps Node alive otherwise
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
