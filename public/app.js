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

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim().toLowerCase();
    const digest = document.getElementById('pref-digest').checked;
    const breaking = document.getElementById('pref-breaking').checked;
    const btn = document.getElementById('signup-submit');
    const msg = document.getElementById('signup-msg');

    if (!email) return;
    if (!digest && !breaking) {
      showMsg(msg, 'error', 'Please select at least one option.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Subscribing…';
    msg.className = 'msg';
    msg.style.display = 'none';

    const { error } = await db.from('subscribers').insert({
      email,
      digest,
      breaking_alerts: breaking,
    });

    btn.disabled = false;
    btn.textContent = 'Subscribe';

    if (error) {
      if (error.code === '23505') {
        // Unique violation — already subscribed
        showMsg(msg, 'success', "You're already subscribed. Check your inbox for a previous confirmation.");
      } else {
        showMsg(msg, 'error', 'Something went wrong. Please try again in a moment.');
        console.error(error);
      }
      return;
    }

    form.reset();
    document.getElementById('pref-digest').checked = true;
    showMsg(msg, 'success', "You're subscribed! You'll receive your first email when the next significant release drops.");
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
