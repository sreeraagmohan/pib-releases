/* global supabase, PIB_CONFIG */

let db;

async function init() {
  db = supabase.createClient(window.PIB_CONFIG.SUPABASE_URL, window.PIB_CONFIG.SUPABASE_ANON_KEY);

  // Unsubscribe page: handled in unsubscribe.html, not here
  setupSignupForm();
  loadLatestDigest();
}

// ── Signup form ───────────────────────────────────────────────────────────────

function setupSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  const emailInput = document.getElementById('email');
  const btn = document.getElementById('signup-submit');

  // Enable submit only when email field has a value
  emailInput.addEventListener('input', () => {
    btn.disabled = !emailInput.value.trim();
  });

  // Toggle topic picker visibility when topic brief checkbox changes
  const topicToggle = document.getElementById('pref-topic');
  const topicPicker = document.getElementById('topic-picker');
  if (topicToggle && topicPicker) {
    topicToggle.addEventListener('change', () => {
      topicPicker.classList.toggle('visible', topicToggle.checked);
    });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const email = emailInput.value.trim().toLowerCase();
    const digest = document.getElementById('pref-digest').checked;
    const breaking = document.getElementById('pref-breaking').checked;
    const topicDigest = document.getElementById('pref-topic').checked;
    const topics = topicDigest
      ? [...document.querySelectorAll('input[name="topics"]:checked')].map(el => el.value)
      : [];
    const msg = document.getElementById('signup-msg');

    if (!email) return;
    if (!digest && !breaking && !topicDigest) {
      showMsg(msg, 'error', 'Please select at least one option.');
      return;
    }
    if (topicDigest && topics.length === 0) {
      showMsg(msg, 'error', 'Please choose at least one topic for your topic brief.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Subscribing…';
    msg.className = 'msg';
    msg.style.display = 'none';

    // Check if this email is already in the system
    const { data: existing } = await db
      .from('subscribers')
      .select('digest, breaking_alerts, topic_digest, topics')
      .eq('email', email)
      .maybeSingle();

    let error;

    if (existing) {
      // Merge preferences — never turn off something already enabled
      const mergedTopics = [...new Set([...(existing.topics || []), ...topics])];
      ({ error } = await db.from('subscribers').update({
        digest:           existing.digest           || digest,
        breaking_alerts:  existing.breaking_alerts  || breaking,
        topic_digest:     existing.topic_digest     || topicDigest,
        topics:           mergedTopics,
      }).eq('email', email));
    } else {
      ({ error } = await db.from('subscribers').insert({
        email,
        digest,
        breaking_alerts: breaking,
        topic_digest:    topicDigest,
        topics,
      }));
    }

    btn.disabled = !emailInput.value.trim();
    btn.textContent = 'Subscribe';

    if (error) {
      showMsg(msg, 'error', 'Something went wrong. Please try again in a moment.');
      console.error(error);
      return;
    }

    form.reset();
    btn.disabled = true; // reset disables the button (email is empty again)
    document.getElementById('pref-digest').checked = true;
    if (topicPicker) topicPicker.classList.remove('visible');

    const successMsg = existing
      ? "Preferences updated! Your new subscriptions will kick in from the next send."
      : "You're subscribed! You'll receive your first email when the next significant release drops.";
    showMsg(msg, 'success', successMsg);
  });
}

function showMsg(el, type, text) {
  el.className = `msg ${type}`;
  el.textContent = text;
  el.style.display = 'block';
}

// ── Digest display ────────────────────────────────────────────────────────────

async function loadLatestDigest() {
  const container = document.getElementById('digest-content');
  if (!container) return;

  const { data: digest } = await db
    .from('digests')
    .select('date, content, article_count')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!digest) {
    container.innerHTML = '<p class="empty">No digest yet — check back after 8 PM IST today.</p>';
    return;
  }

  const dateLabel = new Date(digest.date).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  container.innerHTML = `
    <div class="digest-content">${escHtml(digest.content)}</div>
    <p class="digest-meta">${digest.article_count} releases reviewed · ${dateLabel}</p>
  `;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
