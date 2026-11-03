import { createGame, getCurrentEvent, makeChoice, resetGame } from "./game.js";
import { analyzeEmissions, formatEmission, reviewActivities } from "./carbon.js";

const screens = [...document.querySelectorAll(".screen")];
const roleButtons = [...document.querySelectorAll("[data-role]")];
const beginButton = document.querySelector("#begin-day");
const phases = ["morning", "forenoon", "lunch", "afternoon", "evening"];
const phaseNames = { morning: "아침", forenoon: "오전", lunch: "점심", afternoon: "오후", evening: "저녁" };
const roleNames = { student: "학생의 하루", worker: "직장인의 하루" };
const dayMoments = {
  morning: { clock: "06:10", progress: "5%", note: "도시가 천천히 눈을 뜹니다" },
  forenoon: { clock: "09:25", progress: "27%", note: "햇빛이 창가를 옮겨 다닙니다" },
  lunch: { clock: "12:40", progress: "51%", note: "한낮의 소음 사이로 숨을 고릅니다" },
  afternoon: { clock: "17:35", progress: "76%", note: "길어진 그림자에 하루가 기웁니다" },
  evening: { clock: "21:20", progress: "96%", note: "창마다 불이 켜지고 하루가 접힙니다" },
};
const phaseTransitions = {
  morning: "거리의 셔터가 하나둘 올라가고, 주변의 하루도 조금씩 속도를 올립니다.",
  forenoon: "창밖의 빛이 자리를 옮기는 동안 오전의 소리들은 천천히 멀어집니다.",
  lunch: "짧은 숨을 고르고 나면, 오후의 일정이 다시 가까워집니다.",
  afternoon: "건물 사이로 그림자가 길어지고, 하루는 저녁 쪽으로 기울어갑니다.",
  evening: "집 안의 불빛 아래, 오늘의 선택들이 천천히 마음에 가라앉습니다.",
};
const dataFiles = { student: "./data/student.json", worker: "./data/worker.json" };
const app = { role: null, game: null, factors: null, scenarios: {}, choiceTimer: null, choiceRevealTimer: null, currentEventId: null, preparedEvent: null };
const homeScreen = document.querySelector("#home-screen");
const lifeScreen = document.querySelector("#life-screen");
let atmosphereFrame = 0;
let pickerTimer = 0;
let pickerReturnTimer = 0;
let memoryTimer = 0;

function showScreen(id) {
  screens.forEach((screen) => {
    const active = screen.id === id;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function enterLifePicker() {
  if (pickerTimer) return;
  if (pickerReturnTimer) {
    window.clearTimeout(pickerReturnTimer);
    pickerReturnTimer = 0;
  }
  app.role = null;
  roleButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
  beginButton.disabled = true;
  lifeScreen.hidden = false;
  lifeScreen.classList.remove("is-intro", "is-picker", "is-returning");
  lifeScreen.classList.add("is-active");
  homeScreen.classList.add("is-exiting");
  requestAnimationFrame(() => lifeScreen.classList.add("is-intro"));
  pickerTimer = window.setTimeout(() => {
    homeScreen.hidden = true;
    homeScreen.classList.remove("is-exiting");
    homeScreen.classList.remove("is-active");
    lifeScreen.classList.add("is-picker");
    pickerTimer = 0;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, 1550);
}

function returnToHomeFromPicker() {
  if (pickerTimer) {
    window.clearTimeout(pickerTimer);
    pickerTimer = 0;
  }
  homeScreen.hidden = false;
  homeScreen.classList.remove("is-exiting");
  homeScreen.classList.add("is-active");
  lifeScreen.classList.remove("is-picker");
  lifeScreen.classList.add("is-returning");
  window.scrollTo({ top: 0, behavior: "instant" });
  pickerReturnTimer = window.setTimeout(() => {
    lifeScreen.hidden = true;
    lifeScreen.classList.remove("is-active", "is-intro", "is-returning");
    pickerReturnTimer = 0;
    updateHomeAtmosphere();
  }, 650);
}

async function loadData(role) {
  if (!app.scenarios[role]) {
    const [scenarioResponse, factorResponse] = await Promise.all([
      fetch(dataFiles[role]),
      fetch("./data/factors.json"),
    ]);
    if (!scenarioResponse.ok || !factorResponse.ok) throw new Error("시나리오 데이터를 불러오지 못했습니다.");
    [app.scenarios[role], app.factors] = await Promise.all([scenarioResponse.json(), factorResponse.json()]);
  }
}

function updateDayTime(event) {
  const phase = event?.phase ?? "evening";
  const moment = event
    ? { ...dayMoments[phase], ...event.timeline }
    : { ...dayMoments.evening, clock: "23:50", progress: "100%", note: "도시의 불빛이 하나씩 잠들고 있습니다" };
  const simulation = document.querySelector("#simulation-screen");
  simulation.dataset.phase = phase;
  document.querySelector("#dayline-fill").style.width = moment.progress;
  document.querySelector("#dayline-marker").style.left = moment.progress;
  document.querySelector("#dayline-marker").textContent = phase === "evening" ? "☾" : "☼";
  document.querySelector("#game-clock").textContent = moment.clock;
  document.querySelector("#time-note").textContent = moment.note;
}

function renderEvent(preparedEvent = null) {
  const event = preparedEvent ?? getCurrentEvent(app.game, app.scenarios[app.role]);
  if (!event) {
    renderResults();
    return;
  }
  const phaseIndex = app.game.phaseIndex;
  const moment = { ...dayMoments[event.phase], ...event.timeline };
  const simulation = document.querySelector("#simulation-screen");
  const eventPanel = document.querySelector(".event-panel");
  const choiceArea = document.querySelector("#choice-area");
  const feedback = document.querySelector("#story-feedback");
  if (app.choiceRevealTimer) window.clearTimeout(app.choiceRevealTimer);
  app.preparedEvent = null;
  app.currentEventId = event.id;
  simulation.classList.remove("is-time-passing");
  updateDayTime(event);
  document.querySelector("#role-indicator").textContent = roleNames[app.role];
  document.querySelector("#phase-kicker").textContent = `${event.special ? "뜻밖의 순간" : phaseNames[event.phase]} · ${moment.clock}`;
  document.querySelector("#event-title").textContent = event.title;
  document.querySelector("#event-description").textContent = event.description;
  choiceArea.hidden = true;
  feedback.hidden = true;
  eventPanel.classList.remove("has-choices", "is-responding", "is-entering");
  void eventPanel.offsetWidth;
  eventPanel.classList.add("is-entering");
  const list = document.querySelector("#choice-list");
  list.replaceChildren(...event.choices.map((choice, index) => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.innerHTML = `<span class="choice-letter">${String(index + 1).padStart(2, "0")}</span><span class="choice-text"></span><span class="choice-arrow" aria-hidden="true">↗</span>`;
    button.querySelector(".choice-text").textContent = choice.text;
    button.addEventListener("click", () => choose(event, choice));
    return button;
  }));
  document.querySelector("#live-announcer").textContent = `${phaseNames[event.phase]}. ${event.title}`;
  app.choiceRevealTimer = window.setTimeout(() => {
    app.choiceRevealTimer = null;
    if (app.currentEventId !== event.id || simulation.hidden) return;
    choiceArea.hidden = false;
    eventPanel.classList.remove("is-entering");
    eventPanel.classList.add("has-choices");
  }, 1900);
}

function choose(event, choice) {
  if (app.choiceTimer || app.choiceRevealTimer || app.currentEventId !== event.id) return;
  document.querySelectorAll(".choice-button").forEach((button) => { button.disabled = true; });
  makeChoice(app.game, event, choice, app.factors, app.scenarios[app.role]);
  app.currentEventId = null;
  app.preparedEvent = app.game.phaseIndex >= phases.length
    ? null
    : getCurrentEvent(app.game, app.scenarios[app.role]);
  const eventPanel = document.querySelector(".event-panel");
  const feedback = document.querySelector("#story-feedback");
  eventPanel.classList.remove("has-choices");
  eventPanel.classList.add("is-responding");
  document.querySelector("#choice-response").textContent = choice.result;
  document.querySelector("#story-transition").textContent = phaseTransitions[event.phase];
  feedback.classList.remove("is-fading");
  feedback.hidden = false;
  app.choiceTimer = window.setTimeout(() => {
    feedback.classList.add("is-fading");
    app.choiceTimer = window.setTimeout(() => {
      feedback.hidden = true;
      feedback.classList.remove("is-fading");
      eventPanel.classList.remove("is-responding");
      const nextEvent = app.preparedEvent;
      const simulation = document.querySelector("#simulation-screen");
      simulation.classList.add("is-time-passing");
      updateDayTime(nextEvent);
      app.choiceTimer = window.setTimeout(() => {
        app.choiceTimer = null;
        simulation.classList.remove("is-time-passing");
        if (nextEvent) renderEvent(nextEvent);
        else renderResults();
      }, 1900);
    }, 500);
  }, 2800);
}

function renderActivityReview(records) {
  const impactList = document.querySelector("#impact-list");
  impactList.replaceChildren(...records.map((record) => {
    const item = document.createElement("article");
    item.className = "impact-item";
    const summary = document.createElement("div");
    summary.className = "impact-summary";
    const details = document.createElement("div");
    details.className = "impact-details";
    const title = document.createElement("h4");
    title.textContent = record.eventTitle;
    const choice = document.createElement("p");
    choice.textContent = record.choiceText;
    const activity = document.createElement("span");
    activity.textContent = `${record.activityLabel} · ${record.amount} km × ${formatEmission(record.factor)} kgCO₂e/${record.unit}`;
    const emission = document.createElement("strong");
    emission.textContent = `${formatEmission(record.emission)} kgCO₂e`;
    details.append(title, choice, activity);
    summary.append(details, emission);
    item.append(summary);
    impactList.append(item);
    return item;
  }));

  const reflectionList = document.querySelector("#reflection-list");
  const comparisons = records.flatMap((record) => record.alternatives.map((alternative) => ({ record, alternative })));
  if (comparisons.length === 0) {
    const note = document.createElement("p");
    note.className = "reflection-empty";
    note.textContent = records.length === 0
      ? "이번 하루에는 근거 있는 배출계수와 연결된 활동이 기록되지 않았습니다. 계산할 근거가 없는 선택은 수치로 환산하지 않았습니다."
      : "이번 하루에는 같은 활동량으로 비교할 수 있는 대안이 기록되지 않았습니다. 계산 범위가 다른 선택을 임의로 비교하지 않았습니다.";
    reflectionList.replaceChildren(note);
    return;
  }

  reflectionList.replaceChildren(...comparisons.map(({ record, alternative }) => {
    const item = document.createElement("article");
    item.className = "reflection-item";
    const context = document.createElement("p");
    context.className = "reflection-context";
    context.textContent = `${record.eventTitle} · ${record.amount} km 기준`;
    const chosen = document.createElement("p");
    chosen.className = "reflection-chosen";
    chosen.textContent = `선택: ${record.choiceText} · ${formatEmission(record.emission)} kgCO₂e`;
    const other = document.createElement("p");
    other.className = "reflection-alternative";
    other.textContent = `다른 선택: ${alternative.choiceText} · ${formatEmission(alternative.emission)} kgCO₂e`;
    const difference = document.createElement("strong");
    difference.textContent = `같은 시연 계수 기준 차이 ${formatEmission(record.emission - alternative.emission)} kgCO₂e`;
    item.append(context, chosen, other, difference);
    return item;
  }));
}

function renderResults() {
  const analysis = analyzeEmissions(app.game.emissionRecords);
  const activities = reviewActivities(app.game.emissionRecords, app.scenarios[app.role].events, app.factors);
  document.querySelector("#total-emissions").textContent = formatEmission(analysis.total);
  document.querySelector("#estimate-disclaimer").textContent = app.factors.disclaimer;
  const chart = document.querySelector("#emission-chart");
  chart.replaceChildren(...analysis.categories.map((category) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    const percent = analysis.max > 0 ? (category.value / analysis.max) * 100 : 0;
    row.innerHTML = `<span>${category.label}</span><div class="chart-track"><div class="chart-fill" style="width:${percent}%"></div></div><span class="chart-value">${formatEmission(category.value)}</span>`;
    return row;
  }));
  renderActivityReview(activities);
  const history = document.querySelector("#choice-history");
  history.replaceChildren(...app.game.choiceHistory.map((entry) => {
    const item = document.createElement("li");
    const time = document.createElement("span");
    const choice = document.createElement("span");
    const result = document.createElement("p");
    time.textContent = entry.time ?? dayMoments[entry.phase]?.clock ?? "";
    choice.textContent = entry.choiceText;
    result.textContent = entry.result;
    item.append(time, choice, result);
    return item;
  }));
  document.querySelector("#history-count").textContent = `${app.game.choiceHistory.length}개`;
  startMemorySequence();
}

function startMemorySequence() {
  window.clearTimeout(memoryTimer);
  memoryTimer = 0;
  showScreen("memory-screen");
  const lines = [...document.querySelectorAll(".memory-line")];
  lines.forEach((line) => line.classList.remove("is-visible"));
  document.querySelector("#memory-opening").hidden = false;
  const continueButton = document.querySelector("#memory-continue");
  continueButton.hidden = true;
  continueButton.classList.remove("is-ready");
  continueButton.textContent = "하루의 흔적 보기";

  let lineIndex = 0;
  const revealLine = () => {
    if (lineIndex >= lines.length) {
      continueButton.hidden = false;
      requestAnimationFrame(() => continueButton.classList.add("is-ready"));
      memoryTimer = 0;
      return;
    }
    lines[lineIndex].classList.add("is-visible");
    lineIndex += 1;
    memoryTimer = window.setTimeout(revealLine, 1650);
  };
  memoryTimer = window.setTimeout(revealLine, 400);
}

function finishMemorySequence() {
  window.clearTimeout(memoryTimer);
  memoryTimer = 0;
  showScreen("result-screen");
}

function startDay() {
  if (!app.role) return;
  loadData(app.role).then(() => {
    app.choiceTimer = null;
    app.choiceRevealTimer = null;
    app.preparedEvent = null;
    app.game = createGame(app.role);
    showScreen("simulation-screen");
    renderEvent();
  }).catch((error) => {
    window.alert(error.message);
  });
}
document.querySelectorAll("[data-action='choose-life']").forEach((button) => button.addEventListener("click", enterLifePicker));
document.querySelectorAll("[data-action='home']").forEach((button) => button.addEventListener("click", () => {
  if (button.closest("#life-screen")) {
    returnToHomeFromPicker();
    return;
  }
  if (button.closest("#simulation-screen") || button.closest("#result-screen")) {
    window.clearTimeout(app.choiceTimer);
    window.clearTimeout(app.choiceRevealTimer);
    window.clearTimeout(memoryTimer);
    app.choiceTimer = null;
    app.choiceRevealTimer = null;
    app.preparedEvent = null;
    app.currentEventId = null;
    app.game = null;
    app.role = null;
    roleButtons.forEach((roleButton) => roleButton.setAttribute("aria-pressed", "false"));
    beginButton.disabled = true;
  }
  showScreen("home-screen");
}));
roleButtons.forEach((button) => button.addEventListener("click", () => {
  app.role = button.dataset.role;
  roleButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
  beginButton.disabled = false;
}));
beginButton.addEventListener("click", startDay);
document.querySelector("#memory-continue").addEventListener("click", finishMemorySequence);
document.querySelectorAll("[data-dialog]").forEach((button) => button.addEventListener("click", () => {
  document.querySelector(`#${button.dataset.dialog}`).showModal();
}));
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));

function updateHomeAtmosphere() {
  atmosphereFrame = 0;
  if (homeScreen.hidden) return;
  const maxScroll = Math.max(1, homeScreen.offsetHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
  const night = Math.max(0, Math.min(1, (progress - 0.18) / 0.72));
  homeScreen.style.setProperty("--night-tint", (night * 0.84).toFixed(3));
  homeScreen.style.setProperty("--sun-shift", `${Math.round(progress * 260)}px`);
  homeScreen.style.setProperty("--sun-opacity", (1 - night * 0.92).toFixed(3));
  homeScreen.style.setProperty("--star-opacity", (night * 0.9).toFixed(3));
  homeScreen.style.setProperty("--city-shift", `${Math.round(progress * -24)}px`);
}

function requestAtmosphereUpdate() {
  if (!atmosphereFrame) atmosphereFrame = window.requestAnimationFrame(updateHomeAtmosphere);
}

window.addEventListener("scroll", requestAtmosphereUpdate, { passive: true });
window.addEventListener("resize", requestAtmosphereUpdate);
if ("IntersectionObserver" in window) {
  const storyObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        storyObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".home-story").forEach((story) => storyObserver.observe(story));
} else {
  document.querySelectorAll(".home-story").forEach((story) => story.classList.add("is-visible"));
}
updateHomeAtmosphere();
resetGame();