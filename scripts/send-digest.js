#!/usr/bin/env node
// Runs at 8 PM IST (14:30 UTC) via GitHub Actions.
// Generates a digest with Claude and emails it to all digest subscribers.

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { sendEmail, digestHtml } = require('./email');

const DIGEST_THRESHOLD = 5;

async function main() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Start of today in IST (UTC+5:30)
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayIST = nowIST.toISOString().split('T')[0];
  const startOfDayUTC = new Date(`${todayIST}T00:00:00+05:30`).toISOString();

  const { data: articles, error } = await supabase
    .from('articles')
    .select('title, url, score, category, headline')
    .gte('published_at', startOfDayUTC)
    .gte('score', DIGEST_THRESHOLD)
    .order('score', { ascending: false })
    .limit(15);

  if (error) throw error;

  if (!articles?.length) {
    console.log('No significant articles today — skipping digest.');
    return;
  }

  console.log(`Building digest from ${articles.length} articles`);
  const digest = await generateDigest(anthropic, articles);

  // Save to DB so the landing page can show it
  await supabase.from('digests').upsert({
    date: todayIST,
    content: digest,
    article_count: articles.length,
  });

  // Send to digest subscribers
  const { data: subscribers } = await supabase
    .from('subscribers')
    .select('email, unsubscribe_token')
    .eq('digest', true);

  if (!subscribers?.length) { console.log('No digest subscribers.'); return; }

  const siteUrl = process.env.SITE_URL;
  const dateLabel = nowIST.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Asia/Kolkata',
  });
  const bullets = digest.split('\n').filter(l => l.trim());

  let sent = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${siteUrl}/unsubscribe.html?token=${sub.unsubscribe_token}`;
    try {
      await sendEmail({
        to: sub.email,
        subject: `PIB Evening Brief — ${dateLabel}`,
        html: digestHtml({ dateLabel, bullets, topArticles: articles, unsubscribeUrl }),
      });
      sent++;
    } catch (e) {
      console.error(`Failed to email ${sub.email}:`, e.message);
    }
  }

  console.log(`Digest sent to ${sent}/${subscribers.length} subscribers`);
}

async function generateDigest(anthropic, articles) {
  const list = articles
    .map((a, i) => `${i + 1}. [${a.score}/10] ${a.title}${a.headline ? ' — ' + a.headline : ''}`)
    .join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Write an evening briefing of today's significant Indian government press releases.

Releases ranked by importance:
${list}

Write exactly 5 bullet points starting with •. Each bullet: one tight, factual sentence. Lead with the biggest geopolitical or economic story. State what happened and why it matters. No filler words. Total under 280 words — this is read on a phone.`,
    }],
  });

  return msg.content[0].text.trim();
}

main().catch(err => { console.error(err); process.exit(1); });
