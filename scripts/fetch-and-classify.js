#!/usr/bin/env node
// Fetches new PIB press releases, classifies with Claude,
// and emails breaking alerts (score >= 7) to opted-in subscribers.
// Runs every 30 minutes via GitHub Actions.

const Parser = require('rss-parser');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { sendEmail, breakingAlertHtml } = require('./email');

// PIB RSS feed — Lang=1 English, Regid=3&reg=3 All India
// ModId=6 is the main English all-ministry feed (others return 404)
const PIB_RSS_FEEDS = [
  'https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3&reg=3',
];

const IMPORTANCE_THRESHOLD = 7;
const MAX_NEW_PER_RUN = 10; // cap per run — prevents long backlogs on first run

async function main() {
  const parser = new Parser({ timeout: 10000 });
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Fetch all feeds in parallel
  const feedResults = await Promise.allSettled(
    PIB_RSS_FEEDS.map(url => parser.parseURL(url)),
  );

  const allItems = [];
  feedResults.forEach((r, i) => {
    if (r.status === 'fulfilled') allItems.push(...r.value.items);
    else console.warn(`Feed ${PIB_RSS_FEEDS[i]} failed:`, r.reason.message);
  });

  // Deduplicate by URL
  const seen = new Set();
  const uniqueItems = allItems.filter(item => {
    if (!item.link || seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });

  if (!uniqueItems.length) { console.log('No items found.'); return; }

  // Check which are already stored
  const { data: existing } = await supabase
    .from('articles')
    .select('url')
    .in('url', uniqueItems.map(i => i.link));

  const existingUrls = new Set((existing || []).map(e => e.url));
  const newItems = uniqueItems
    .filter(i => !existingUrls.has(i.link))
    .slice(0, MAX_NEW_PER_RUN); // most recent first (feeds are newest-first)
  console.log(`${uniqueItems.length} total, ${newItems.length} new (capped at ${MAX_NEW_PER_RUN})`);

  for (const item of newItems) {
    const result = await classify(anthropic, item);

    const { error } = await supabase.from('articles').insert({
      url: item.link,
      title: item.title?.trim() || 'Untitled',
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      score: result.score,
      category: result.category,
      headline: result.headline,
      topics: result.topics || [],
    });

    if (error) { console.error('DB error:', error.message); continue; }
    console.log(`[${result.score}/10] ${item.title?.slice(0, 80)}`);

    if (result.score >= IMPORTANCE_THRESHOLD) {
      await sendBreakingAlerts(supabase, item, result);
    }
  }
}

async function classify(anthropic, item) {
  const body = [item.contentSnippet, item.summary, item.content]
    .filter(Boolean).join(' ').slice(0, 600);

  const prompt = `Classify this Indian government press release for news significance.

Title: ${item.title}
Content: ${body || '(no body)'}

Score 1–10. Score 7+ if it involves:
- PM Modi foreign visits, bilateral summits, joint statements, MoUs
- Major trade or economic policy (tariffs, trade deals, RBI decisions, budget items)
- Defence agreements, military exercises, arms procurement
- Foreign policy shifts, diplomatic incidents, expulsions, sanctions
- Major cabinet decisions with national economic impact
- G20, SCO, BRICS, UN, WTO multilateral outcomes
- Anything likely front-page tomorrow

Also tag every topic bucket that applies (can be multiple, can be empty):
- "foreign_relations": bilateral/multilateral meetings, MEA releases, treaties, summits, diplomatic incidents
- "science_tech": ISRO, space, biotech, IT ministry, AI policy, DST, nuclear energy, tech policy
- "defence": MoD, military exercises, DRDO, arms procurement, border security, Coast Guard
- "pm_modi": directly involves PM Modi — his meetings, visits, statements, inaugurations
- "economics": MoC, MOSPI data releases, trade/export/import figures, RBI, SEBI, tariffs, commerce, industrial output

Return ONLY valid JSON, no markdown:
{"score":<1-10>,"category":"<foreign_policy|economic|defense|domestic|diplomatic|trade>","headline":"<one crisp sentence why it matters; empty string if score<7>","topics":["topic1","topic2"]}`;

  try {
    const msg = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Claude timeout')), 15000)
      ),
    ]);
    return JSON.parse(msg.content[0].text.trim());
  } catch (e) {
    console.warn('Classification failed:', e.message);
    return { score: 3, category: 'domestic', headline: '' };
  }
}

async function sendBreakingAlerts(supabase, item, result) {
  const { data: subscribers } = await supabase
    .from('subscribers')
    .select('email, unsubscribe_token')
    .eq('breaking_alerts', true);

  if (!subscribers?.length) { console.log('No breaking-alert subscribers.'); return; }

  const siteUrl = process.env.SITE_URL;
  let sent = 0;

  for (const sub of subscribers) {
    const unsubscribeUrl = `${siteUrl}/unsubscribe.html?token=${sub.unsubscribe_token}`;
    try {
      await sendEmail({
        to: sub.email,
        subject: `⚡ PIB Alert — ${result.headline || item.title}`,
        html: breakingAlertHtml({
          title: item.title,
          headline: result.headline || item.title,
          url: item.link,
          unsubscribeUrl,
        }),
      });
      sent++;
    } catch (e) {
      console.error(`Failed to email ${sub.email}:`, e.message);
    }
  }

  console.log(`Breaking alert sent to ${sent}/${subscribers.length} subscribers`);
}

// Force exit — Supabase realtime WebSocket keeps Node alive otherwise
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
