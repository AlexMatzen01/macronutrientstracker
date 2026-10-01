const STORAGE_KEY = "macrotrack_v1";

const DEFAULT_STATE = {
  version: 1,
  units: "metric",
  profile: {
    age: "",
    sex: "unspecified",
    heightCm: "",
    weightKg: "",
    activity: "moderate",
    focus: "general",
    sport: ""
  },
  entries: []
};

let state = loadState();
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefault(),
      ...parsed,
      profile: { ...DEFAULT_STATE.profile, ...(parsed.profile || {}) },
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch {
    return cloneDefault();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.add("show");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
}

function todayISO(date = new Date()) {
  const d = new Date(date);
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

function parseDate(dateStr) {
  return new Date(dateStr + "T12:00:00");
}

function formatDate(dateStr, opts = { month: "short", day: "numeric" }) {
  return parseDate(dateStr).toLocaleDateString(undefined, opts);
}

function formatNumber(value, decimals = 0) {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function caloriesFromMacros(p, c, f) {
  return p * 4 + c * 4 + f * 9;
}

function activityFactor(level) {
  return ({
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    high: 1.725,
    athlete: 1.9
  })[level] || 1.55;
}

function focusSettings(focus) {
  return ({
    general: { protein: 1.2, fatPct: 0.30, label: "general wellness" },
    strength: { protein: 1.6, fatPct: 0.27, label: "strength / resistance training" },
    endurance: { protein: 1.6, fatPct: 0.25, label: "endurance training" },
    team: { protein: 1.5, fatPct: 0.27, label: "team / field sport" },
    high: { protein: 1.6, fatPct: 0.27, label: "high activity / mixed training" },
    academics: { protein: 1.2, fatPct: 0.30, label: "academics / long study days" }
  })[focus] || { protein: 1.2, fatPct: 0.30, label: "general wellness" };
}

function calculateBMI(profile) {
  const kg = num(profile.weightKg);
  const cm = num(profile.heightCm);
  if (kg <= 0 || cm <= 0) return null;
  const m = cm / 100;
  return kg / (m * m);
}

function adultBmiCategory(bmi) {
  if (bmi < 18.5) return "Below the adult healthy-weight range";
  if (bmi < 25) return "Adult healthy-weight range";
  if (bmi < 30) return "Above the adult healthy-weight range";
  return "Adult obesity category";
}

function calculateTargets(profile) {
  const age = num(profile.age);
  const kg = num(profile.weightKg);
  const cm = num(profile.heightCm);

  if (age <= 0 || kg <= 0 || cm <= 0) {
    return { ready: false };
  }

  if (age < 18) {
    return {
      ready: true,
      adult: false,
      message: "For users under 18, this app does not generate personalized calorie or body-weight-change targets. You can still track intake and trends, while individualized sports nutrition should come from a pediatric clinician or registered dietitian."
    };
  }

  const sexAdjustment = profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + sexAdjustment;
  const factor = activityFactor(profile.activity);
  const estimatedEnergy = Math.round(bmr * factor);
  const settings = focusSettings(profile.focus);
  const proteinG = Math.round(kg * settings.protein);
  const fatG = Math.round((estimatedEnergy * settings.fatPct) / 9);
  const remainingKcal = Math.max(estimatedEnergy - proteinG * 4 - fatG * 9, 0);
  const carbsG = Math.round(remainingKcal / 4);

  return {
    ready: true,
    adult: true,
    bmr: Math.round(bmr),
    factor,
    estimatedEnergy,
    proteinG,
    carbsG,
    fatG,
    proteinRate: settings.protein,
    fatPct: settings.fatPct,
    focusLabel: settings.label
  };
}

function getEntriesBetween(startDate, endDate) {
  return state.entries.filter((entry) => entry.date >= startDate && entry.date <= endDate);
}

function sumEntries(entries) {
  return entries.reduce((sum, e) => {
    sum.protein += num(e.protein);
    sum.carbs += num(e.carbs);
    sum.fat += num(e.fat);
    return sum;
  }, { protein: 0, carbs: 0, fat: 0 });
}

function divideMacros(sum, denominator) {
  if (!denominator) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: sum.protein / denominator,
    carbs: sum.carbs / denominator,
    fat: sum.fat / denominator
  };
}

function uniqueTrackedDays(entries) {
  return new Set(entries.map((e) => e.date)).size;
}

function averagePerTrackedDay(entries) {
  return divideMacros(sumEntries(entries), uniqueTrackedDays(entries));
}

function getWeekStart(date) {
  const d = parseDate(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return todayISO(d);
}

function averagePerTrackedWeek(entries) {
  const groups = new Map();
  entries.forEach((e) => {
    const key = getWeekStart(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  const totals = Array.from(groups.values()).map(sumEntries);
  if (!totals.length) return { protein: 0, carbs: 0, fat: 0, weeks: 0 };
  const total = totals.reduce((a, b) => ({
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat
  }), { protein: 0, carbs: 0, fat: 0 });
  return { ...divideMacros(total, totals.length), weeks: totals.length };
}

function averagePerTrackedMonth(entries) {
  const groups = new Map();
  entries.forEach((e) => {
    const key = e.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  const totals = Array.from(groups.values()).map(sumEntries);
  if (!totals.length) return { protein: 0, carbs: 0, fat: 0, months: 0 };
  const total = totals.reduce((a, b) => ({
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat
  }), { protein: 0, carbs: 0, fat: 0 });
  return { ...divideMacros(total, totals.length), months: totals.length };
}

function fmtMacroLine(m) {
  if (!m) return "—";
  return formatNumber(m.protein) + "g P · " + formatNumber(m.carbs) + "g C · " + formatNumber(m.fat) + "g F";
}

function renderDashboard() {
  const profile = state.profile;
  const target = calculateTargets(profile);
  const bmi = calculateBMI(profile);
  const today = todayISO();
  $("todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }).toUpperCase();

  if (!target.ready) {
    $("targetHeadline").textContent = "Set up your profile";
    $("targetSubline").textContent = "Add your age, measurements, activity, and focus to calculate a planning range.";
    $("macroTargets").innerHTML = [
      ["Protein", "—"], ["Carbs", "—"], ["Fat", "—"]
    ].map((x) => '<div class="target-pill muted"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>g/day</small></div>').join("");
    $("bmiValue").textContent = bmi ? formatNumber(bmi, 1) : "—";
    $("bmiStatus").textContent = bmi ? "BMI calculated; add age for interpretation." : "Add height and weight in your profile.";
    $("bmiStatus").title = "BMI is a screening measure, not a diagnosis.";
  } else if (!target.adult) {
    $("targetHeadline").textContent = "Tracking mode for under 18";
    $("targetSubline").textContent = "Macro averages are available. Personalized calorie or body-weight-change targets are intentionally not generated.";
    $("macroTargets").innerHTML = [
      ["Protein", "—"], ["Carbs", "—"], ["Fat", "—"]
    ].map((x) => '<div class="target-pill muted"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>tracked only</small></div>').join("");
    $("bmiValue").textContent = bmi ? formatNumber(bmi, 1) : "—";
    $("bmiStatus").textContent = "For ages 2–19, CDC uses BMI-for-age percentiles.";
  } else {
    $("targetHeadline").textContent = "Estimated fueling plan";
    $("targetSubline").textContent = "Built for " + target.focusLabel + " using an adult resting-energy estimate and activity factor.";
    $("macroTargets").innerHTML = [
      ["Protein", formatNumber(target.proteinG)], ["Carbs", formatNumber(target.carbsG)], ["Fat", formatNumber(target.fatG)]
    ].map((x) => '<div class="target-pill"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>g/day</small></div>').join("");
    $("bmiValue").textContent = bmi ? formatNumber(bmi, 1) : "—";
    $("bmiStatus").textContent = bmi ? adultBmiCategory(bmi) : "Add height and weight in your profile.";
  }

  const last7 = new Date(parseDate(today));
  last7.setDate(last7.getDate() - 6);
  const last7Start = todayISO(last7);
  const last7Entries = getEntriesBetween(last7Start, today);
  const dailyAvg = averagePerTrackedDay(last7Entries);
  const weeklyAvg = averagePerTrackedWeek(getEntriesBetween(offsetDate(today, -27), today));
  const monthStart = today.slice(0, 8) + "01";
  const monthlyAvg = averagePerTrackedMonth(getEntriesBetween(monthStart, today));

  $("dailyAvgMain").textContent = last7Entries.length ? fmtMacroLine(dailyAvg) : "—";
  $("weeklyAvgMain").textContent = weeklyAvg.weeks ? fmtMacroLine(weeklyAvg) : "—";
  $("monthlyAvgMain").textContent = monthlyAvg.months ? fmtMacroLine(monthlyAvg) : "—";
  $("dailyAvgDetail").textContent = last7Entries.length ? "Average per tracked day, last 7 days" : "No tracked days yet";
  $("weeklyAvgDetail").textContent = weeklyAvg.weeks ? "Average per tracked week, last 4 weeks" : "No tracked weeks yet";
  $("monthlyAvgDetail").textContent = monthlyAvg.months ? "Average per tracked month, current month" : "No tracked month yet";

  renderTrendChart(last7Start, today, target);
  renderRecommendations(dailyAvg, target, last7Entries.length);
  renderRecentEntries();
}

function offsetDate(dateStr, deltaDays) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return todayISO(d);
}

function renderTrendChart(start, end, target) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(offsetDate(start, i));
  }
  const data = days.map((date) => {
    const entry = state.entries.find((e) => e.date === date);
    return {
      date,
      protein: entry ? num(entry.protein) : 0,
      carbs: entry ? num(entry.carbs) : 0,
      fat: entry ? num(entry.fat) : 0
    };
  });

  const maxBase = target && target.adult
    ? Math.max(target.proteinG, target.carbsG, target.fatG, 1)
    : Math.max(...data.map((d) => Math.max(d.protein, d.carbs, d.fat)), 1);

  $("trendChart").innerHTML = data.map((d) => {
    const p = d.protein ? Math.max(6, (d.protein / maxBase) * 100) : 2;
    const c = d.carbs ? Math.max(6, (d.carbs / maxBase) * 100) : 2;
    const f = d.fat ? Math.max(6, (d.fat / maxBase) * 100) : 2;
    return '<div class="trend-day">' +
      '<div class="bar-stack">' +
      '<div class="bar protein-bg" style="height:' + Math.min(p, 100) + '%" title="' + formatNumber(d.protein) + 'g protein"></div>' +
      '<div class="bar carbs-bg" style="height:' + Math.min(c, 100) + '%" title="' + formatNumber(d.carbs) + 'g carbs"></div>' +
      '<div class="bar fat-bg" style="height:' + Math.min(f, 100) + '%" title="' + formatNumber(d.fat) + 'g fat"></div>' +
      '</div>' +
      '<div class="day-label">' + parseDate(d.date).toLocaleDateString(undefined, { weekday: "narrow" }) + '</div>' +
      '</div>';
  }).join("");

  const tracked = data.filter((d) => d.protein || d.carbs || d.fat).length;
  $("trendTag").textContent = tracked + "/7 tracked";
}

function renderRecommendations(avg, target, trackedDays) {
  const box = $("recommendations");
  const items = [];

  if (!target.ready) {
    items.push({
      title: "Build your baseline",
      text: "Complete the profile first. Then the dashboard can compare your logged intake with a planning target."
    });
  } else if (!target.adult) {
    const focus = state.profile.focus;
    const advice = {
      general: "Aim for regular meals with a mix of carbohydrate foods, protein foods, fats, fruits or vegetables, and fluids.",
      strength: "For training days, regular meals and snacks with carbohydrate plus protein can support practice and recovery.",
      endurance: "Carbohydrate-rich foods and adequate fluids matter more as endurance training volume rises.",
      team: "Keep regular meals and snacks around practices and games. Carbohydrates help fuel higher-intensity work.",
      high: "Higher training loads generally require more food and fluids. Avoid skipping meals to make a target fit.",
      academics: "Long study days still need regular meals, snacks as needed, and hydration. Studying itself is not a reason to restrict food."
    };
    items.push({ title: "Use trends, not single days", text: advice[focus] || advice.general });
    items.push({ title: "Personal targets", text: "For a growing person or competitive athlete, a pediatric clinician or registered dietitian can tailor nutrition to growth, training, and health." });
  } else if (!trackedDays) {
    items.push({ title: "Start with 3–7 days", text: "A few tracked days gives you a baseline before you interpret the averages." });
  } else {
    const checks = [
      ["Protein", avg.protein, target.proteinG, "Spread protein across meals and snacks instead of trying to make up for a low day all at once."],
      ["Carbohydrate", avg.carbs, target.carbsG, "For active days, place carbohydrate-rich foods around training and keep enough available for recovery."],
      ["Fat", avg.fat, target.fatG, "Include regular sources of unsaturated fats such as nuts, seeds, olive oil, avocado, or fatty fish."]
    ];

    checks.forEach(([name, actual, goal, advice]) => {
      const pct = goal ? actual / goal : 1;
      if (pct < 0.85) {
        items.push({ title: name + " looks lower than the planning target", text: advice, type: "warn" });
      } else if (pct > 1.25) {
        items.push({ title: name + " is above the planning target", text: "A planning target is not a pass/fail score. Review the trend alongside training demands, hunger, recovery, and overall diet quality.", type: "good" });
      } else {
        items.push({ title: name + " is near the planning target", text: "Your recent average is within the app's broad planning zone. Keep looking at the multi-day trend.", type: "good" });
      }
    });
    items.push({ title: "Keep the model in perspective", text: "The energy estimate is a formula, not a direct measurement. Real needs can differ substantially from calculated values." });
  }

  box.innerHTML = items.map((item) =>
    '<div class="recommendation ' + (item.type || "") + '">' +
    '<strong>' + item.title + '</strong>' +
    '<p>' + item.text + '</p>' +
    '</div>'
  ).join("");
}

function renderRecentEntries() {
  const sorted = [...state.entries].sort((a, b) => b.date.localeCompare(a.date));
  const recent = sorted.slice(0, 8);
  $("recentEntries").innerHTML = recent.length ? recent.map(entryRow).join("") : '<div class="empty">No intake logged yet. Use “Log intake” to add your first day.</div>';
  $("allEntries").innerHTML = sorted.length ? sorted.map(entryRow).join("") : '<div class="empty">No logged days yet.</div>';
  $("entryCountTag").textContent = state.entries.length + (state.entries.length === 1 ? " day" : " days");
  $$("[data-delete-entry]").forEach((button) => {
    button.addEventListener("click", () => deleteEntry(button.dataset.deleteEntry));
  });
}

function entryRow(entry) {
  return '<div class="entry">' +
    '<div class="entry-date">' + formatDate(entry.date) + '</div>' +
    '<div class="entry-macros">' +
    '<span class="macro-chip">P ' + formatNumber(num(entry.protein)) + 'g</span>' +
    '<span class="macro-chip">C ' + formatNumber(num(entry.carbs)) + 'g</span>' +
    '<span class="macro-chip">F ' + formatNumber(num(entry.fat)) + 'g</span>' +
    '<span class="macro-chip">' + formatNumber(caloriesFromMacros(num(entry.protein), num(entry.carbs), num(entry.fat))) + ' kcal</span>' +
    '</div>' +
    '<button class="entry-action" title="Delete entry" data-delete-entry="' + entry.date + '">Delete</button>' +
    '</div>';
}

function deleteEntry(date) {
  state.entries = state.entries.filter((e) => e.date !== date);
  saveState();
  renderAll();
  toast("Entry deleted");
}

function renderProfile() {
  const p = state.profile;
  $("ageInput").value = p.age || "";
  $("sexInput").value = p.sex || "unspecified";
  $("heightCmInput").value = p.heightCm || "";
  $("weightKgInput").value = p.weightKg || "";
  $("activityInput").value = p.activity || "moderate";
  $("focusInput").value = p.focus || "general";
  $("sportInput").value = p.sport || "";
  setUnitUI(state.units);
  renderCalculationBreakdown();
}

function renderCalculationBreakdown() {
  const t = calculateTargets(state.profile);
  const bmi = calculateBMI(state.profile);
  const rows = [];

  if (!t.ready) {
    rows.push(["Profile incomplete", "Add age, height, and weight to calculate the planning model."]);
  } else if (!t.adult) {
    rows.push(["Under-18 mode", t.message]);
    rows.push(["BMI interpretation", "For ages 2–19, use CDC BMI-for-age percentiles with age and sex. This app does not assign an adult BMI category."]);
  } else {
    rows.push(["Resting-energy estimate", "Mifflin–St Jeor gives an estimated resting energy of about " + formatNumber(t.bmr) + " kcal/day."]);
    rows.push(["Activity multiplier", "The selected activity level uses a factor of " + t.factor.toFixed(3) + ", giving an estimated fueling energy of about " + formatNumber(t.estimatedEnergy) + " kcal/day."]);
    rows.push(["Protein math", t.proteinRate.toFixed(1) + " g/kg/day × " + formatNumber(num(state.profile.weightKg), 1) + " kg = " + formatNumber(t.proteinG) + " g/day."]);
    rows.push(["Fat math", formatNumber(t.fatPct * 100, 0) + "% of estimated energy = " + formatNumber(t.fatG) + " g/day."]);
    rows.push(["Carbohydrate math", "Remaining estimated energy after protein and fat is converted at 4 kcal/g, giving " + formatNumber(t.carbsG) + " g/day."]);
  }

  if (bmi) {
    rows.push(["BMI calculation", formatNumber(bmi, 1) + " kg/m². BMI is a screening measure and should not be used as a medical diagnosis."]);
  }

  $("calculationBreakdown").innerHTML = rows.map((row) =>
    '<div class="break-row"><strong>' + row[0] + '</strong><span>' + row[1] + '</span></div>'
  ).join("");
}

function setUnitUI(units) {
  state.units = units;
  $$(".unit-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.unit === units));
  $("metricFields").classList.toggle("hidden", units !== "metric");
  $("usFields").classList.toggle("hidden", units !== "us");
  if (units === "us") {
    const totalInches = num(state.profile.heightCm) / 2.54;
    if (state.profile.heightCm && !$("heightFtInput").value) $("heightFtInput").value = Math.floor(totalInches / 12);
    if (state.profile.heightCm && !$("heightInInput").value) $("heightInInput").value = (totalInches % 12).toFixed(1);
    if (state.profile.weightKg && !$("weightLbInput").value) $("weightLbInput").value = (num(state.profile.weightKg) * 2.2046226218).toFixed(1);
  }
}

function readProfileForm() {
  const age = num($("ageInput").value);
  const sex = $("sexInput").value;
  let heightCm = num($("heightCmInput").value);
  let weightKg = num($("weightKgInput").value);

  if (state.units === "us") {
    const ft = num($("heightFtInput").value);
    const inch = num($("heightInInput").value);
    heightCm = (ft * 12 + inch) * 2.54;
    weightKg = num($("weightLbInput").value) / 2.2046226218;
  }

  return {
    age,
    sex,
    heightCm,
    weightKg,
    activity: $("activityInput").value,
    focus: $("focusInput").value,
    sport: $("sportInput").value.trim()
  };
}

function seedEncode(data) {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  const checksum = bytes.reduce((sum, b) => (sum + b) % 1000000, 0);
  return "1" + String(checksum).padStart(6, "0") + Array.from(bytes, (b) => String(b).padStart(3, "0")).join("");
}

function seedDecode(seed) {
  const clean = seed.replace(/\s+/g, "");
  if (!/^\d+$/.test(clean) || clean.length < 10 || clean[0] !== "1" || (clean.length - 7) % 3 !== 0) {
    throw new Error("Invalid seed format");
  }
  const expected = Number(clean.slice(1, 7));
  const body = clean.slice(7);
  const bytes = new Uint8Array(body.length / 3);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number(body.slice(i * 3, i * 3 + 3));
  const checksum = Array.from(bytes).reduce((sum, b) => (sum + b) % 1000000, 0);
  if (checksum !== expected) throw new Error("Seed checksum failed");
  return JSON.parse(new TextDecoder().decode(bytes));
}

function makeExportPayload() {
  return {
    app: "MacroTrack",
    version: 1,
    exportedAt: new Date().toISOString(),
    units: state.units,
    profile: state.profile,
    entries: state.entries
  };
}

function applyImportedData(data) {
  if (!data || typeof data !== "object") throw new Error("Backup is not an object");
  const next = cloneDefault();
  next.version = 1;
  next.units = data.units === "us" ? "us" : "metric";
  next.profile = { ...DEFAULT_STATE.profile, ...(data.profile || {}) };
  next.entries = Array.isArray(data.entries) ? data.entries.map((e) => ({
    date: String(e.date || ""),
    protein: num(e.protein),
    carbs: num(e.carbs),
    fat: num(e.fat),
    notes: String(e.notes || "")
  })).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)) : [];
  state = next;
  saveState();
  renderAll();
}

function downloadText(filename, textContent, type) {
  const blob = new Blob([textContent], { type: type || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function switchTab(tab) {
  $$(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === "tab-" + tab));
  $("pageTitle").textContent = ({ dashboard: "Dashboard", log: "Daily log", profile: "Profile & goals", data: "Data & privacy", research: "Research" })[tab];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAll() {
  renderDashboard();
  renderProfile();
  renderRecentEntries();
}

function setup() {
  $("logDate").value = todayISO();

  $$(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $$("[data-tab-target]").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tabTarget)));
  $("addLogTop").addEventListener("click", () => switchTab("log"));
  $("exportSeedTop").addEventListener("click", () => {
    $("seedBox").value = seedEncode(makeExportPayload());
    $("seedStatus").textContent = "Seed generated. It contains your profile and logged days.";
    switchTab("data");
  });

  $$(".unit-btn").forEach((btn) => btn.addEventListener("click", () => {
    setUnitUI(btn.dataset.unit);
  }));

  ["logProtein", "logCarbs", "logFat"].forEach((id) => $(id).addEventListener("input", () => {
    $("logCaloriesPreview").textContent = formatNumber(
      caloriesFromMacros(num($("logProtein").value), num($("logCarbs").value), num($("logFat").value))
    ) + " kcal";
  }));

  $("logForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = {
      date: $("logDate").value,
      protein: num($("logProtein").value),
      carbs: num($("logCarbs").value),
      fat: num($("logFat").value),
      notes: $("logNotes").value.trim()
    };
    if (!entry.date) return toast("Choose a date");
    state.entries = state.entries.filter((e) => e.date !== entry.date);
    state.entries.push(entry);
    state.entries.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    renderAll();
    toast("Daily intake saved");
    $("logForm").reset();
    $("logDate").value = todayISO();
    $("logCaloriesPreview").textContent = "0 kcal";
  });

  $("profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const profile = readProfileForm();
    state.profile = profile;
    saveState();
    renderAll();
    toast("Profile saved and recalculated");
  });

  $("generateSeed").addEventListener("click", () => {
    $("seedBox").value = seedEncode(makeExportPayload());
    $("seedStatus").textContent = "Numeric seed generated. Keep a copy somewhere private.";
    toast("Seed generated");
  });

  $("copySeed").addEventListener("click", async () => {
    if (!$("seedBox").value.trim()) $("seedBox").value = seedEncode(makeExportPayload());
    try {
      await navigator.clipboard.writeText($("seedBox").value.trim());
      $("seedStatus").textContent = "Copied to clipboard.";
      toast("Seed copied");
    } catch {
      $("seedStatus").textContent = "Clipboard access was blocked. Select the seed and copy it manually.";
    }
  });

  $("importSeed").addEventListener("click", () => {
    try {
      const data = seedDecode($("seedBox").value);
      applyImportedData(data);
      $("seedStatus").textContent = "Seed imported successfully.";
      toast("Seed imported");
    } catch (error) {
      $("seedStatus").textContent = error.message || "Could not import that seed.";
      toast("Seed import failed");
    }
  });

  $("downloadJson").addEventListener("click", () => {
    downloadText("macrotrack-backup.json", JSON.stringify(makeExportPayload(), null, 2), "application/json;charset=utf-8");
    toast("JSON backup downloaded");
  });

  $("importJsonButton").addEventListener("click", () => $("jsonFile").click());

  $("jsonFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      applyImportedData(data);
      toast("JSON backup imported");
    } catch {
      toast("JSON import failed");
    } finally {
      event.target.value = "";
    }
  });

  $("clearData").addEventListener("click", () => {
    if (!confirm("Delete all local MacroTrack data from this browser?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = cloneDefault();
    renderAll();
    toast("Local data cleared");
  });

  renderAll();
}

setup();