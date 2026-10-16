/* ============================================================
   GoalFlow – app.js
   All app logic: goals, progress, focus timer, localStorage
============================================================ */

'use strict';

// ─────────────────────────────────────────────────────────────
//  CONSTANTS & STATE
// ─────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  goals:       'gf_goals',
  history:     'gf_history',
  bestStreak:  'gf_best_streak',
  focusSess:   'gf_focus_sessions',
  xp:          'gf_xp',
};

const CATEGORY_ICONS = {
  Study: '📚', Exercise: '💪', Reading: '📖',
  Health: '🥗', Personal: '🌟', Other: '🔧',
};

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Robin Sharma" },
  { text: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.", author: "Malcolm X" },
  { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
  { text: "Great things never come from comfort zones.", author: "Unknown" },
  { text: "Dream it. Wish it. Do it.", author: "Unknown" },
  { text: "Stay focused and never give up.", author: "Unknown" },
  { text: "Work hard in silence, let success be your noise.", author: "Frank Ocean" },
  { text: "You are capable of more than you know.", author: "Unknown" },
];

const FOCUS_DURATIONS = {
  pomodoro: 25 * 60,
  short:    5  * 60,
  long:     15 * 60,
};

const FOCUS_LABELS = {
  pomodoro: 'Focus',
  short:    'Short Break',
  long:     'Long Break',
};

let state = {
  goals:       [],   // [{id, name, category, note, doneToday, createdAt}]
  history:     {},   // { "YYYY-MM-DD": { total, done } }
  bestStreak:  0,
  currentFilter: 'all',
  editingGoalId: null,
  selectedCategory: 'Study',
  currentSection: 'dashboard',
  focusMode:   'pomodoro',
  focusRunning: false,
  focusRemaining: 25 * 60,
  focusTotal:  25 * 60,
  focusTimer:  null,
  focusSessions: 0,
  sessionLog:  [],
  xp: 0,
};

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function save() {
  localStorage.setItem(STORAGE_KEYS.goals,      JSON.stringify(state.goals));
  localStorage.setItem(STORAGE_KEYS.history,    JSON.stringify(state.history));
  localStorage.setItem(STORAGE_KEYS.bestStreak, state.bestStreak);
  localStorage.setItem(STORAGE_KEYS.xp,         state.xp);
}

function load() {
  try {
    state.goals      = JSON.parse(localStorage.getItem(STORAGE_KEYS.goals)   || '[]');
    state.history    = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '{}');
    state.bestStreak = parseInt(localStorage.getItem(STORAGE_KEYS.bestStreak) || '0', 10);
    state.xp         = parseInt(localStorage.getItem(STORAGE_KEYS.xp)         || '0', 10);
    const fs = localStorage.getItem(STORAGE_KEYS.focusSess);
    if (fs) {
      const parsed = JSON.parse(fs);
      if (parsed.date === todayStr()) {
        state.focusSessions = parsed.count || 0;
        state.sessionLog = parsed.log || [];
      }
    }
  } catch(e) {
    console.warn('Load error:', e);
  }
}

function recordTodayHistory() {
  const today = todayStr();
  const total = state.goals.length;
  const done  = state.goals.filter(g => g.doneToday).length;
  state.history[today] = { total, done };
  save();
}

function calcStreak() {
  let streak = 0;
  const d = new Date();
  // Check if today is complete
  const today = state.history[todayStr()];
  if (today && today.total > 0 && today.done === today.total) {
    streak = 1;
    d.setDate(d.getDate() - 1);
  } else {
    d.setDate(d.getDate() - 1);
  }
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    const h = state.history[key];
    if (h && h.total > 0 && h.done === h.total) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  if (streak > state.bestStreak) {
    state.bestStreak = streak;
    save();
  }
  return streak;
}

function todayCompletion() {
  const total = state.goals.length;
  const done  = state.goals.filter(g => g.doneToday).length;
  return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function addXP(amount) {
  state.xp += amount;
  save();
  updateXPBar();
}

function xpLevel() {
  return Math.floor(state.xp / 100) + 1;
}

function xpProgress() {
  return state.xp % 100;
}

// ─────────────────────────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  sidebar:           $('sidebar'),
  sidebarOverlay:    $('sidebarOverlay'),
  sidebarCloseBtn:   $('sidebarCloseBtn'),
  menuBtn:           $('menuBtn'),
  topbarDate:        $('topbarDate'),
  topAddGoalBtn:     $('topAddGoalBtn'),

  // Dashboard
  totalGoalsNum:     $('totalGoalsNum'),
  doneGoalsNum:      $('doneGoalsNum'),
  streakNum:         $('streakNum'),
  pctNum:            $('pctNum'),
  cpFill:            $('cpFill'),
  cpPct:             $('cpPct'),
  dashDoneText:      $('dashDoneText'),
  dashTodayList:     $('dashTodayList'),
  dashGreeting:      $('dashGreeting'),
  quoteText:         $('quoteText'),
  quoteAuthor:       $('quoteAuthor'),
  newQuoteBtn:       $('newQuoteBtn'),

  // Goals
  goalsGrid:         $('goalsGrid'),
  goalsEmpty:        $('goalsEmpty'),
  addGoalBtn:        $('addGoalBtn'),
  emptyAddBtn:       $('emptyAddBtn'),

  // Progress
  streakBig:         $('streakBig'),
  streakDesc:        $('streakDesc'),
  weeklyCalendar:    $('weeklyCalendar'),
  barChart:          $('barChart'),
  statTotalDays:     $('statTotalDays'),
  statBestStreak:    $('statBestStreak'),
  statAvgRate:       $('statAvgRate'),
  statTotalDone:     $('statTotalDone'),

  // Focus
  focusTime:         $('focusTime'),
  focusMode:         $('focusMode'),
  focusRingFill:     $('focusRingFill'),
  focusStartBtn:     $('focusStartBtn'),
  focusResetBtn:     $('focusResetBtn'),
  focusSkipBtn:      $('focusSkipBtn'),
  focusPlayIcon:     $('focusPlayIcon'),
  focusSessions:     $('focusSessions'),
  sessionLog:        $('sessionLog'),
  focusGoalSelect:   $('focusGoalSelect'),

  // Modal
  goalModalBackdrop: $('goalModalBackdrop'),
  goalModal:         $('goalModal'),
  modalTitle:        $('modalTitle'),
  goalForm:          $('goalForm'),
  goalName:          $('goalName'),
  goalNote:          $('goalNote'),
  goalNameCount:     $('goalNameCount'),
  modalCloseBtn:     $('modalCloseBtn'),
  cancelGoalBtn:     $('cancelGoalBtn'),
  categoryPills:     $('categoryPills'),

  // Toast
  toastContainer:    $('toastContainer'),

  // XP
  xpBarFill:         $('xpBarFill'),
  xpLevel:           $('xpLevel'),
  xpSub:             $('xpSub'),

  // Confetti
  confettiCanvas:    $('confettiCanvas'),
};

// ─────────────────────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────────────────────

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const section = document.getElementById('section-' + name);
  const btn     = document.getElementById('nav-' + name);
  if (section) section.classList.add('active');
  if (btn) btn.classList.add('active');
  state.currentSection = name;
  // Refresh section data
  if (name === 'dashboard')  renderDashboard();
  if (name === 'goals')      renderGoals();
  if (name === 'progress')   renderProgress();
  if (name === 'focus')      renderFocusGoalSelect();
  // Close sidebar on mobile
  if (window.innerWidth <= 900) closeSidebar();
}

function openSidebar() {
  els.sidebar.classList.add('open');
  els.sidebarOverlay.classList.add('open');
}
function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.sidebarOverlay.classList.remove('open');
}

// ─────────────────────────────────────────────────────────────
//  TOPBAR DATE & GREETING
// ─────────────────────────────────────────────────────────────

function updateTopbarDate() {
  const now = new Date();
  els.topbarDate.textContent = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const hour = now.getHours();
  let greet = 'Good evening';
  if (hour < 12) greet = 'Good morning';
  else if (hour < 17) greet = 'Good afternoon';
  const phrases = [
    "Let's crush your goals today 🚀",
    "You've got this! 💪",
    "Make today count ⭐",
    "Stay consistent, stay winning 🏆",
    "One goal at a time 🎯",
  ];
  els.dashGreeting.textContent = `${greet}! ${phrases[new Date().getDay() % phrases.length]}`;
}

// ─────────────────────────────────────────────────────────────
//  QUOTES
// ─────────────────────────────────────────────────────────────

let quoteIndex = Math.floor(Math.random() * QUOTES.length);
function showQuote() {
  const q = QUOTES[quoteIndex];
  els.quoteText.textContent   = `"${q.text}"`;
  els.quoteAuthor.textContent = `— ${q.author}`;
}
function nextQuote() {
  quoteIndex = (quoteIndex + 1) % QUOTES.length;
  showQuote();
}

// ─────────────────────────────────────────────────────────────
//  XP BAR
// ─────────────────────────────────────────────────────────────

function updateXPBar() {
  const lvl  = xpLevel();
  const prog = xpProgress();
  els.xpBarFill.style.width = prog + '%';
  els.xpLevel.textContent   = lvl;
  els.xpSub.textContent     = `${prog} / 100 XP`;
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD RENDER
// ─────────────────────────────────────────────────────────────

function renderDashboard() {
  const { total, done, pct } = todayCompletion();
  const streak = calcStreak();

  els.totalGoalsNum.textContent = total;
  els.doneGoalsNum.textContent  = done;
  els.streakNum.textContent     = streak;
  els.pctNum.textContent        = pct + '%';

  // Circular progress
  const circumference = 2 * Math.PI * 52; // 326.7
  const offset = circumference - (pct / 100) * circumference;
  els.cpFill.style.strokeDashoffset = offset;
  els.cpPct.textContent = pct + '%';
  els.dashDoneText.textContent = `${done} of ${total} goals completed`;

  // Today's goals list
  if (state.goals.length === 0) {
    els.dashTodayList.innerHTML = '<div class="empty-state-sm">No goals yet. Add one! 🌱</div>';
  } else {
    els.dashTodayList.innerHTML = state.goals.map(g => `
      <div class="today-goal-item ${g.doneToday ? 'tg-done' : ''}"
           role="button" tabindex="0" data-gid="${g.id}"
           aria-label="Toggle ${g.name}">
        <div class="tg-check">
          <svg class="tg-check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <span class="tg-name">${escHtml(g.name)}</span>
        <span class="tg-cat">${CATEGORY_ICONS[g.category] || ''}${g.category}</span>
      </div>
    `).join('');
    els.dashTodayList.querySelectorAll('.today-goal-item').forEach(item => {
      item.addEventListener('click', () => toggleGoalDone(item.dataset.gid));
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggleGoalDone(item.dataset.gid); });
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  GOALS RENDER
// ─────────────────────────────────────────────────────────────

function renderGoals() {
  const filter = state.currentFilter;
  const filtered = filter === 'all'
    ? state.goals
    : state.goals.filter(g => g.category === filter);

  if (state.goals.length === 0) {
    els.goalsGrid.innerHTML = '';
    els.goalsEmpty.classList.add('visible');
  } else {
    els.goalsEmpty.classList.remove('visible');
    if (filtered.length === 0) {
      els.goalsGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-3); font-size:0.9rem;">No goals in this category.</div>`;
    } else {
      els.goalsGrid.innerHTML = filtered.map((g, i) => goalCardHTML(g, i)).join('');
      // Bind events
      els.goalsGrid.querySelectorAll('.goal-card').forEach(card => {
        const gid = card.dataset.gid;
        card.querySelector('.btn-check').addEventListener('click', () => toggleGoalDone(gid));
        card.querySelector('.btn-edit').addEventListener('click', () => openEditModal(gid));
        card.querySelector('.btn-delete').addEventListener('click', () => deleteGoal(gid));
      });
    }
  }
}

function goalCardHTML(g, idx) {
  const catClass = 'cat-' + g.category;
  const catIcon  = CATEGORY_ICONS[g.category] || '';
  return `
    <div class="goal-card ${g.doneToday ? 'done-card' : ''}"
         data-gid="${g.id}"
         style="animation-delay:${idx * 0.05}s">
      <div class="goal-card-top">
        <span class="goal-name">${escHtml(g.name)}</span>
        <span class="goal-cat-badge ${catClass}">${catIcon} ${g.category}</span>
      </div>
      ${g.note ? `<p class="goal-note">${escHtml(g.note)}</p>` : ''}
      <div class="goal-card-actions">
        <button class="btn-check" id="check-${g.id}" aria-label="${g.doneToday ? 'Mark undone' : 'Mark done'}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          ${g.doneToday ? 'Done ✓' : 'Mark Done'}
        </button>
        <button class="btn-icon btn-edit" id="edit-${g.id}" aria-label="Edit goal" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon btn-delete" id="delete-${g.id}" aria-label="Delete goal" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
      <div class="goal-streak-bar">
        <div class="goal-streak-bar-fill" style="width:${g.doneToday?100:0}%"></div>
      </div>
    </div>
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────
//  TOGGLE GOAL DONE
// ─────────────────────────────────────────────────────────────

function toggleGoalDone(gid) {
  const goal = state.goals.find(g => g.id === gid);
  if (!goal) return;
  const wasAllDone = state.goals.every(g => g.doneToday);
  goal.doneToday = !goal.doneToday;
  recordTodayHistory();

  if (goal.doneToday) {
    addXP(10);
    showToast(`✅ "${goal.name}" marked as done!`, 'success');
    // Check if all goals done now
    const allDone = state.goals.length > 0 && state.goals.every(g => g.doneToday);
    if (!wasAllDone && allDone) {
      setTimeout(() => {
        showToast('🎉 All goals completed! Amazing work!', 'success');
        triggerConfetti();
      }, 300);
    }
  } else {
    showToast(`↩️ "${goal.name}" unmarked`, 'info');
  }

  save();
  refreshAll();
}

// ─────────────────────────────────────────────────────────────
//  GOAL MODAL
// ─────────────────────────────────────────────────────────────

function openAddModal() {
  state.editingGoalId = null;
  state.selectedCategory = 'Study';
  els.modalTitle.textContent = 'Add New Goal';
  els.goalName.value = '';
  els.goalNote.value = '';
  els.goalNameCount.textContent = '0/80';
  updateCatPills('Study');
  openModal();
}

function openEditModal(gid) {
  const goal = state.goals.find(g => g.id === gid);
  if (!goal) return;
  state.editingGoalId = gid;
  state.selectedCategory = goal.category;
  els.modalTitle.textContent = 'Edit Goal';
  els.goalName.value = goal.name;
  els.goalNote.value = goal.note || '';
  els.goalNameCount.textContent = `${goal.name.length}/80`;
  updateCatPills(goal.category);
  openModal();
}

function openModal() {
  els.goalModalBackdrop.classList.add('open');
  setTimeout(() => els.goalName.focus(), 100);
}

function closeModal() {
  els.goalModalBackdrop.classList.remove('open');
}

function updateCatPills(selected) {
  els.categoryPills.querySelectorAll('.cat-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.cat === selected);
  });
}

function saveGoal(e) {
  e.preventDefault();
  const name = els.goalName.value.trim();
  if (!name) {
    els.goalName.style.borderColor = 'var(--rose)';
    setTimeout(() => els.goalName.style.borderColor = '', 1000);
    showToast('Please enter a goal name', 'error');
    return;
  }

  if (state.editingGoalId) {
    const goal = state.goals.find(g => g.id === state.editingGoalId);
    if (goal) {
      goal.name     = name;
      goal.category = state.selectedCategory;
      goal.note     = els.goalNote.value.trim();
      showToast('✏️ Goal updated!', 'info');
      addXP(5);
    }
  } else {
    const newGoal = {
      id:        uid(),
      name,
      category:  state.selectedCategory,
      note:      els.goalNote.value.trim(),
      doneToday: false,
      createdAt: new Date().toISOString(),
    };
    state.goals.push(newGoal);
    showToast('🎯 New goal added! Let\'s go!', 'success');
    addXP(20);
  }

  recordTodayHistory();
  save();
  closeModal();
  refreshAll();
}

function deleteGoal(gid) {
  const goal = state.goals.find(g => g.id === gid);
  if (!goal) return;
  if (!confirm(`Delete "${goal.name}"? This cannot be undone.`)) return;
  state.goals = state.goals.filter(g => g.id !== gid);
  recordTodayHistory();
  save();
  showToast('🗑️ Goal deleted', 'info');
  refreshAll();
}

// ─────────────────────────────────────────────────────────────
//  PROGRESS RENDER
// ─────────────────────────────────────────────────────────────

function renderProgress() {
  const streak = calcStreak();
  els.streakBig.textContent = streak;

  // Streak description
  if (streak === 0)       els.streakDesc.textContent = 'Complete all goals today to start your streak!';
  else if (streak === 1)  els.streakDesc.textContent = 'Great start! Keep it up tomorrow 💪';
  else if (streak < 7)   els.streakDesc.textContent = `You're on a ${streak}-day roll! Don't break the chain 🔥`;
  else if (streak < 14)  els.streakDesc.textContent = `One week+ streak! You're becoming unstoppable 🌟`;
  else if (streak < 30)  els.streakDesc.textContent = `Incredible! ${streak} days of consistent effort 🏅`;
  else                   els.streakDesc.textContent = `LEGENDARY! ${streak}-day streak! You're a champion 🏆`;

  // Milestones
  ['ms3', 'ms7', 'ms14', 'ms30'].forEach((id, i) => {
    const thresholds = [3, 7, 14, 30];
    $(id).classList.toggle('achieved', streak >= thresholds[i]);
  });

  // Weekly calendar
  renderWeeklyCalendar();

  // Bar chart
  renderBarChart();

  // Stats
  renderStats();
}

function renderWeeklyCalendar() {
  const today = new Date();
  const days = [];
  // Get start of week (Monday)
  const dayOfWeek = today.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  els.weeklyCalendar.innerHTML = days.map((d, i) => {
    const key = d.toISOString().slice(0, 10);
    const todayKey = today.toISOString().slice(0, 10);
    const isFuture = d > today && key !== todayKey;
    const h = state.history[key];
    const isToday = key === todayKey;
    let dotClass = 'future-dot';
    let label = d.getDate();
    if (!isFuture) {
      if (!h || h.total === 0) dotClass = '';
      else if (h.done === h.total) dotClass = 'done-dot';
      else if (h.done > 0) dotClass = 'partial-dot';
      else dotClass = '';
    }
    if (isToday) dotClass += ' today-dot';
    return `
      <div class="week-day">
        <span class="week-day-label">${dayNames[i]}</span>
        <div class="week-day-dot ${dotClass}" title="${key}">${label}</div>
      </div>
    `;
  }).join('');
}

function renderBarChart() {
  const days = 30;
  const bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const h = state.history[key];
    const pct = (!h || h.total === 0) ? 0 : Math.round((h.done / h.total) * 100);
    bars.push({ key, pct, date: d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) });
  }

  els.barChart.innerHTML = bars.map(b => {
    const height = Math.max(b.pct, 3);
    let barClass = '';
    if (b.pct === 100) barClass = 'bar-done';
    else if (b.pct > 0) barClass = 'bar-partial';
    return `
      <div class="bar-wrap">
        <div class="bar-tooltip">${b.date}: ${b.pct}%</div>
        <div class="bar ${barClass}" style="height:${height}%"></div>
      </div>
    `;
  }).join('');
}

function renderStats() {
  const histKeys = Object.keys(state.history).filter(k => state.history[k].total > 0);
  const totalDays = histKeys.length;
  const bestStreak = state.bestStreak;

  let totalDoneCount = 0;
  let totalGoalInstances = 0;
  histKeys.forEach(k => {
    const h = state.history[k];
    totalDoneCount += h.done;
    totalGoalInstances += h.total;
  });
  const avgRate = totalGoalInstances === 0 ? 0 : Math.round((totalDoneCount / totalGoalInstances) * 100);

  els.statTotalDays.textContent  = totalDays;
  els.statBestStreak.textContent = bestStreak;
  els.statAvgRate.textContent    = avgRate + '%';
  els.statTotalDone.textContent  = totalDoneCount;
}

// ─────────────────────────────────────────────────────────────
//  FOCUS TIMER
// ─────────────────────────────────────────────────────────────

function setFocusMode(mode) {
  if (state.focusRunning) return;
  state.focusMode = mode;
  state.focusTotal = FOCUS_DURATIONS[mode];
  state.focusRemaining = FOCUS_DURATIONS[mode];
  document.querySelectorAll('.focus-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  $('focusMode').textContent = FOCUS_LABELS[mode];
  updateFocusClock();
}

function updateFocusClock() {
  const m = Math.floor(state.focusRemaining / 60).toString().padStart(2, '0');
  const s = (state.focusRemaining % 60).toString().padStart(2, '0');
  els.focusTime.textContent = `${m}:${s}`;

  const circumference = 2 * Math.PI * 88; // 553
  const fraction = state.focusRemaining / state.focusTotal;
  els.focusRingFill.style.strokeDashoffset = circumference * (1 - fraction);
}

function startFocus() {
  if (state.focusRunning) {
    // Pause
    clearInterval(state.focusTimer);
    state.focusRunning = false;
    els.focusPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    els.focusStartBtn.setAttribute('aria-label', 'Start timer');
  } else {
    state.focusRunning = true;
    els.focusPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    els.focusStartBtn.setAttribute('aria-label', 'Pause timer');
    state.focusTimer = setInterval(() => {
      if (state.focusRemaining <= 0) {
        clearInterval(state.focusTimer);
        state.focusRunning = false;
        onFocusComplete();
      } else {
        state.focusRemaining--;
        updateFocusClock();
      }
    }, 1000);
  }
}

function resetFocus() {
  clearInterval(state.focusTimer);
  state.focusRunning = false;
  state.focusRemaining = state.focusTotal;
  els.focusPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  updateFocusClock();
}

function skipFocus() {
  clearInterval(state.focusTimer);
  state.focusRunning = false;
  onFocusComplete();
}

function onFocusComplete() {
  els.focusPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  if (state.focusMode === 'pomodoro') {
    state.focusSessions++;
    els.focusSessions.textContent = state.focusSessions;
    addXP(25);
    showToast('🍅 Pomodoro complete! Great focus!', 'success');
    const selectedGoal = els.focusGoalSelect.value;
    const goal = state.goals.find(g => g.id === selectedGoal);
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const entry = {
      time: now,
      goalName: goal ? goal.name : null,
      mode: state.focusMode,
    };
    state.sessionLog.unshift(entry);
    renderSessionLog();
    saveFocusSessions();
    // Auto-switch to short break
    setFocusMode('short');
  } else {
    showToast('⏰ Break is over! Time to focus!', 'info');
    setFocusMode('pomodoro');
  }
  state.focusRemaining = state.focusTotal;
  updateFocusClock();
}

function renderSessionLog() {
  if (state.sessionLog.length === 0) {
    els.sessionLog.innerHTML = '<div class="empty-state-sm">No sessions yet. Start focusing! 🍅</div>';
    return;
  }
  els.sessionLog.innerHTML = state.sessionLog.slice(0, 10).map(e => `
    <div class="session-entry">
      <span class="se-icon">🍅</span>
      <div class="se-info">
        <div>${e.goalName ? escHtml(e.goalName) : 'Free session'}</div>
        <div class="se-time">${e.time} · 25 min focus</div>
      </div>
    </div>
  `).join('');
}

function saveFocusSessions() {
  localStorage.setItem(STORAGE_KEYS.focusSess, JSON.stringify({
    date: todayStr(),
    count: state.focusSessions,
    log: state.sessionLog,
  }));
}

function renderFocusGoalSelect() {
  els.focusGoalSelect.innerHTML = '<option value="">— Select a goal —</option>' +
    state.goals.map(g => `<option value="${g.id}">${escHtml(CATEGORY_ICONS[g.category] || '')} ${escHtml(g.name)}</option>`).join('');
}

// ─────────────────────────────────────────────────────────────
//  TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const iconMap = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${iconMap[type]}</span><span>${message}</span>`;
  toast.addEventListener('click', () => removeToast(toast));
  els.toastContainer.appendChild(toast);
  setTimeout(() => removeToast(toast), 3500);
}

function removeToast(toast) {
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}

// ─────────────────────────────────────────────────────────────
//  CONFETTI
// ─────────────────────────────────────────────────────────────

function triggerConfetti() {
  const canvas = els.confettiCanvas;
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = [];
  const colors = ['#a855f7','#06b6d4','#f97316','#22c55e','#f43f5e','#eab308','#ec4899'];

  for (let i = 0; i < 120; i++) {
    pieces.push({
      x:   Math.random() * canvas.width,
      y:   Math.random() * canvas.height - canvas.height,
      w:   Math.random() * 10 + 5,
      h:   Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: Math.random() * 4 + 2,
      angle: Math.random() * Math.PI * 2,
      spin:  (Math.random() - 0.5) * 0.2,
      vx:   (Math.random() - 0.5) * 3,
    });
  }

  let frame;
  let elapsed = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    elapsed++;
    pieces.forEach(p => {
      p.y += p.speed;
      p.x += p.vx;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 120);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (elapsed < 150) {
      frame = requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  cancelAnimationFrame(frame);
  animate();
}

// ─────────────────────────────────────────────────────────────
//  REFRESH ALL
// ─────────────────────────────────────────────────────────────

function refreshAll() {
  renderDashboard();
  if (state.currentSection === 'goals')    renderGoals();
  if (state.currentSection === 'progress') renderProgress();
  if (state.currentSection === 'focus')    renderFocusGoalSelect();
  updateXPBar();
}

// ─────────────────────────────────────────────────────────────
//  MIDNIGHT RESET
// ─────────────────────────────────────────────────────────────

function checkMidnightReset() {
  const lastDate = localStorage.getItem('gf_last_date');
  const today = todayStr();
  if (lastDate && lastDate !== today) {
    // New day — reset doneToday for all goals
    state.goals.forEach(g => { g.doneToday = false; });
    save();
    showToast('🌅 Good morning! Your goals are reset for today.', 'info');
  }
  localStorage.setItem('gf_last_date', today);
}

// ─────────────────────────────────────────────────────────────
//  INIT & EVENT LISTENERS
// ─────────────────────────────────────────────────────────────

function init() {
  load();
  checkMidnightReset();
  updateTopbarDate();
  showQuote();
  updateXPBar();

  // Initialize focus sessions counter
  els.focusSessions.textContent = state.focusSessions;
  renderSessionLog();

  // Show dashboard
  showSection('dashboard');

  // Nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  // Sidebar toggle
  els.menuBtn.addEventListener('click', openSidebar);
  els.sidebarCloseBtn.addEventListener('click', closeSidebar);
  els.sidebarOverlay.addEventListener('click', closeSidebar);

  // Add goal buttons
  els.topAddGoalBtn.addEventListener('click', () => { showSection('goals'); openAddModal(); });
  els.addGoalBtn.addEventListener('click', openAddModal);
  els.emptyAddBtn.addEventListener('click', openAddModal);

  // Modal
  els.modalCloseBtn.addEventListener('click', closeModal);
  els.cancelGoalBtn.addEventListener('click', closeModal);
  els.goalModalBackdrop.addEventListener('click', e => {
    if (e.target === els.goalModalBackdrop) closeModal();
  });
  els.goalForm.addEventListener('submit', saveGoal);

  // Char count
  els.goalName.addEventListener('input', () => {
    els.goalNameCount.textContent = `${els.goalName.value.length}/80`;
  });

  // Category pills
  els.categoryPills.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      state.selectedCategory = pill.dataset.cat;
      updateCatPills(pill.dataset.cat);
    });
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.dataset.filter;
      renderGoals();
    });
  });

  // Quote
  els.newQuoteBtn.addEventListener('click', nextQuote);

  // Focus timer
  document.querySelectorAll('.focus-tab').forEach(tab => {
    tab.addEventListener('click', () => setFocusMode(tab.dataset.mode));
  });
  els.focusStartBtn.addEventListener('click', startFocus);
  els.focusResetBtn.addEventListener('click', resetFocus);
  els.focusSkipBtn.addEventListener('click', skipFocus);

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && els.goalModalBackdrop.classList.contains('open')) closeModal();
  });

  // Handle window resize for confetti canvas
  window.addEventListener('resize', () => {
    els.confettiCanvas.width  = window.innerWidth;
    els.confettiCanvas.height = window.innerHeight;
  });

  // Set up periodic midnight check (every minute)
  setInterval(checkMidnightReset, 60000);

  // Initial render
  renderGoals();
  updateFocusClock();
}

document.addEventListener('DOMContentLoaded', init);
