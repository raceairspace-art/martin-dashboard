/* Training module — interactive lesson: Concept → Analogy → Diagram → Architect → Scenario → Quiz → One principle */
(function (global) {
  const LS_QUIZ = "martin-training-quiz-";
  const LS_SCENARIO = "martin-training-scenario-";
  const LS_TEACH = "martin-training-teach-";
  const LS_STEP = "martin-training-step-";
  const LS_REPORTS = "martin-training-learner-reports";

  const STEPS = [
    { id: "concept", label: "Concept" },
    { id: "analogy", label: "Analogy" },
    { id: "diagram", label: "Diagram" },
    { id: "architect", label: "Architect's view" },
    { id: "scenario", label: "Scenario" },
    { id: "quiz", label: "Knowledge check" },
    { id: "principle", label: "One principle" },
  ];

  function topicTitle(session) {
    const t = session && session.topic;
    if (!t) return session && session.session_id ? session.session_id : "Session";
    return typeof t === "string" ? t : t.title || t.id || "Session";
  }

  function phaseName(session) {
    const p = session && session.phase;
    if (!p) return "—";
    return typeof p === "string" ? p : p.name || "—";
  }

  function sectionById(lesson, id) {
    const sections = (lesson && lesson.sections) || [];
    return sections.find((s) => s.id === id) || null;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn("localStorage write failed", key, err.message);
    }
  }

  function normalizeKnowledgeCheck(kc) {
    if (!kc) return [];
    if (Array.isArray(kc)) return kc;
    // Legacy object shape → single question
    return [
      {
        id: "q1",
        question: kc.prompt || kc.question || kc.text || "",
        rubric_points: kc.rubric_points || [],
        choices: kc.choices,
        awaiting_answer: kc.awaiting_answer,
        learner_answer: kc.answer || null,
      },
    ];
  }

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s/-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }

  function scoreAnswer(answer, rubricPoints) {
    const ansTokens = new Set(tokenize(answer));
    if (!ansTokens.size || !Array.isArray(rubricPoints) || !rubricPoints.length) {
      return { estimate: answer && String(answer).trim() ? 0.35 : 0, matched: [], missed: rubricPoints || [] };
    }
    const matched = [];
    const missed = [];
    for (const point of rubricPoints) {
      const pts = tokenize(point);
      const hits = pts.filter((t) => ansTokens.has(t) || String(answer).toLowerCase().includes(t));
      const ratio = pts.length ? hits.length / pts.length : 0;
      if (ratio >= 0.35 || hits.length >= 2) matched.push(point);
      else missed.push(point);
    }
    const estimate = matched.length / rubricPoints.length;
    return { estimate, matched, missed };
  }

  function buildReport(session, quizAnswers, scenarioAnswer, teachAnswers) {
    const questions = normalizeKnowledgeCheck(session.knowledge_check);
    const per = [];
    const weak = [];
    const strengths = [];
    let sum = 0;
    const kcOut = [];
    for (const q of questions) {
      const ans = (quizAnswers && quizAnswers[q.id]) || "";
      const scored = scoreAnswer(ans, q.rubric_points || []);
      per.push({
        id: q.id,
        estimate: Math.round(scored.estimate * 100) / 100,
        matched_rubric: scored.matched,
        missed_rubric: scored.missed,
      });
      sum += scored.estimate;
      weak.push(...scored.missed);
      strengths.push(...scored.matched);
      kcOut.push({ id: q.id, question: q.question || "", answer: ans });
    }
    const n = questions.length || 1;
    const overall = Math.round((sum / n) * 100);
    const topic = session.topic;
    const phase = session.phase;
    const scenario = session.scenario || {};
    const uniqueWeak = [...new Set(weak)].slice(0, 8);
    const uniqueStrong = [...new Set(strengths)].slice(0, 8);
    const scenarioText = scenarioAnswer || null;
    const summaryParts = [
      `Quiz ${kcOut.filter((a) => a.answer && String(a.answer).trim()).length}/${questions.length} answered`,
      `estimate ${overall}%`,
      `scenario draft: ${scenarioText && String(scenarioText).trim() ? "yes" : "no"}`,
    ];
    if (uniqueWeak.length) summaryParts.push("weak: " + uniqueWeak.slice(0, 2).join("; "));

    const teachOut = [];
    if (Array.isArray(session.lesson && session.lesson.interactive_teach)) {
      for (const item of session.lesson.interactive_teach) {
        if (teachAnswers && teachAnswers[item.id] != null && teachAnswers[item.id] !== "") {
          teachOut.push({ id: item.id, answer: teachAnswers[item.id] });
        }
      }
    }

    return {
      schema_version: "1.0",
      type: "learner_progress_report",
      bot_id: "martin_dashboard",
      emitted_at: new Date().toISOString(),
      session_id: session.session_id,
      phase: typeof phase === "object" ? phase : { name: phase },
      topic: typeof topic === "object" ? topic : { title: topic },
      scores: {
        overall_pct: overall,
        knowledge_check_estimate: Math.round((overall / 100) * 100) / 100,
        per_question: per,
      },
      weak_areas: uniqueWeak,
      strengths: uniqueStrong,
      learner_answers: {
        knowledge_check: kcOut,
        scenario: {
          id: scenario.id || null,
          answer: scenarioText,
        },
        interactive_teach: teachOut,
      },
      learner_answers_summary: summaryParts.join(" · "),
      progress_hint: {
        status: "quiz_submitted",
        awaiting: "greg_critique",
        home_badge: "Quiz submitted — waiting on Greg critique",
      },
    };
  }

  function persistReport(report) {
    const list = readJson(LS_REPORTS, []);
    list.unshift(report);
    writeJson(LS_REPORTS, list.slice(0, 20));
    // Also stash last report per session for Copy button
    writeJson(LS_REPORTS + ":" + report.session_id, report);
    return report;
  }

  function downloadReport(report) {
    const ts = (report.emitted_at || "").replace(/[:.]/g, "-");
    const name = `learner_progress_report-${report.session_id}-${ts}.json`;
    const blob = new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderSvgDiagram(lesson) {
    const { escapeHtml } = MartinData;
    const nodes = lesson.diagram_nodes || lesson.nodes || [];
    const edges = lesson.diagram_edges || lesson.edges || [];
    if (!nodes.length) return "";
    const w = 640;
    const rowH = 56;
    const h = Math.max(120, nodes.length * rowH + 24);
    const cx = w / 2;
    const nodePos = {};
    nodes.forEach((n, i) => {
      nodePos[n.id] = { x: cx, y: 28 + i * rowH };
    });
    const edgeLines = edges
      .map((e) => {
        const a = nodePos[e.from];
        const b = nodePos[e.to];
        if (!a || !b) return "";
        const lab = e.protocol || e.label || "";
        const mx = (a.x + b.x) / 2 + 70;
        const my = (a.y + b.y) / 2;
        return `<line x1="${a.x}" y1="${a.y + 16}" x2="${b.x}" y2="${b.y - 16}" stroke="#94a3b8" stroke-width="2" marker-end="url(#arrow)"/>
          ${lab ? `<text x="${mx}" y="${my}" class="svg-edge-label">${escapeHtml(lab)}</text>` : ""}`;
      })
      .join("");
    const nodeRects = nodes
      .map((n) => {
        const p = nodePos[n.id];
        const label = n.label || n.id;
        const zone = n.zone ? ` · ${n.zone}` : "";
        return `<g>
          <rect x="${p.x - 130}" y="${p.y - 16}" width="260" height="32" rx="8" class="svg-node" data-zone="${escapeHtml(n.zone || "")}"/>
          <text x="${p.x}" y="${p.y + 5}" text-anchor="middle" class="svg-node-label">${escapeHtml(label)}</text>
        </g>`;
      })
      .join("");
    return `<svg class="lesson-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Architecture diagram">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8"/>
        </marker>
      </defs>
      ${edgeLines}
      ${nodeRects}
    </svg>`;
  }

  function renderStepNav(current) {
    return `<ol class="lesson-steps" aria-label="Lesson steps">
      ${STEPS.map((s, i) => {
        const cls = s.id === current ? "active" : STEPS.findIndex((x) => x.id === current) > i ? "done" : "";
        return `<li class="${cls}"><button type="button" class="step-btn" data-step="${s.id}"><span class="step-num">${i + 1}</span> ${s.label}</button></li>`;
      }).join("")}
    </ol>`;
  }

  function renderHero(session, adapted) {
    const { escapeHtml, formatTs } = MartinData;
    const ui = session.ui || {};
    const mins = ui.estimated_minutes ? `${ui.estimated_minutes} min` : "";
    const roadmap = ui.phase_roadmap_label || phaseName(session);
    const badge =
      adapted && adapted.awaiting_answer
        ? `<span class="badge awaiting">🔔 ${escapeHtml(adapted.home_badge)}</span>`
        : `<span class="badge strong">In progress</span>`;
    const fixtureNote = session.fixture
      ? `<span class="badge fair">Fixture</span>`
      : "";
    return `
      <header class="lesson-hero">
        <div class="lesson-hero-kicker">Today's lesson · ${escapeHtml(roadmap)}${mins ? ` · ${escapeHtml(mins)}` : ""}</div>
        <h3 class="lesson-hero-title">${escapeHtml(topicTitle(session))}</h3>
        <p class="lesson-hero-sub">${escapeHtml(phaseName(session))} · <code>${escapeHtml(session.session_id || "")}</code>
          ${session.emitted_at ? ` · ${escapeHtml(formatTs(session.emitted_at))}` : ""}</p>
        <div class="lesson-hero-meta">
          ${badge}
          ${fixtureNote}
          ${
            adapted
              ? `<span class="progress-bar"><span class="progress-track"><span class="progress-fill" style="width:${adapted.percent_complete}%"></span></span><span>${adapted.percent_complete}% phase</span></span>`
              : ""
          }
        </div>
        ${
          session.topic && session.topic.primary_concept
            ? `<p class="lesson-primary-concept">${escapeHtml(session.topic.primary_concept)}</p>`
            : ""
        }
      </header>`;
  }

  function renderProgressSidebar(adapted, session) {
    const { escapeHtml } = MartinData;
    const p = (session && session.progress) || {};
    const completed = Array.isArray(p.completed_topic_ids)
      ? p.completed_topic_ids
      : adapted && adapted.completed_topic_ids
        ? adapted.completed_topic_ids
        : [];
    const weak = Array.isArray(p.weak_areas) ? p.weak_areas : [];
    const reports = readJson(LS_REPORTS, []);
    const history = reports
      .filter((r) => r && r.session_id)
      .slice(0, 8)
      .map((r) => {
        const pct = r.scores && r.scores.overall_pct != null ? r.scores.overall_pct + "%" : "—";
        return `<li><strong>${escapeHtml(r.session_id)}</strong> · ${pct} · <span class="muted">${escapeHtml(MartinData.formatTs(r.emitted_at))}</span></li>`;
      })
      .join("");
    return `
      <aside class="train-progress-aside">
        <h4>Progress</h4>
        <p class="strip-headline">${escapeHtml((adapted && adapted.current_phase) || phaseName(session))}</p>
        <div class="progress-bar lg">
          <span class="progress-track"><span class="progress-fill" style="width:${(adapted && adapted.percent_complete) || 0}%"></span></span>
          <span>${(adapted && adapted.percent_complete) || 0}% phase complete</span>
        </div>
        <div class="aside-block">
          <h5>Completed topics</h5>
          ${
            completed.length
              ? `<ul>${completed.map((id) => `<li><code>${escapeHtml(id)}</code></li>`).join("")}</ul>`
              : `<p class="muted tiny">None yet — finish scenario + quiz to close Session 1.</p>`
          }
        </div>
        <div class="aside-block">
          <h5>Weak areas</h5>
          ${
            weak.length
              ? `<ul>${weak.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
              : `<p class="muted tiny">Tracked after quiz submit / Greg critique.</p>`
          }
        </div>
        <div class="aside-block">
          <h5>History</h5>
          ${history ? `<ul class="history-timeline">${history}</ul>` : `<p class="muted tiny">No local quiz submissions yet.</p>`}
        </div>
      </aside>`;
  }

  function renderConcept(lesson) {
    const { escapeHtml } = MartinData;
    const sec = sectionById(lesson, "concept");
    const body = (sec && sec.body) || lesson.concept_summary || "";
    const problem = lesson.problem_statement || "";
    return `
      <section class="lesson-card">
        <h4>${escapeHtml((sec && sec.title) || "Architecture Concept")}</h4>
        ${problem ? `<p class="problem-callout"><strong>Problem:</strong> ${escapeHtml(problem)}</p>` : ""}
        <div class="prose">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>
        ${
          lesson.concept_summary && body !== lesson.concept_summary
            ? `<p class="muted">${escapeHtml(lesson.concept_summary)}</p>`
            : ""
        }
      </section>`;
  }

  function renderAnalogy(lesson) {
    const { escapeHtml } = MartinData;
    const sec = sectionById(lesson, "analogy");
    const body = (sec && sec.body) || lesson.analogy_to_known || "";
    return `
      <section class="lesson-card">
        <h4>${escapeHtml((sec && sec.title) || "Connect to Something You Know")}</h4>
        <div class="prose">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>
        ${
          lesson.analogy_to_known
            ? `<p class="analogy-pill"><strong>Short form:</strong> ${escapeHtml(lesson.analogy_to_known)}</p>`
            : ""
        }
        ${
          lesson.analogy_limits
            ? `<p class="muted"><strong>Limits of the analogy:</strong> ${escapeHtml(lesson.analogy_limits)}</p>`
            : ""
        }
      </section>`;
  }

  function renderDiagram(lesson) {
    const { escapeHtml } = MartinData;
    const sec = sectionById(lesson, "walkthrough");
    const ascii = lesson.diagram_ascii
      ? `<pre class="diagram-ascii">${escapeHtml(lesson.diagram_ascii)}</pre>`
      : "";
    const svg = renderSvgDiagram(lesson);
    return `
      <section class="lesson-card">
        <h4>Diagram</h4>
        ${sec ? `<div class="prose">${escapeHtml(sec.body || "").replace(/\n/g, "<br/>")}</div>` : ""}
        <div class="diagram-stack">
          ${svg}
          ${ascii}
        </div>
      </section>`;
  }

  function renderArchitect(lesson) {
    const { escapeHtml } = MartinData;
    const sec = sectionById(lesson, "architect_view");
    const bullets = lesson.architect_view_bullets || [];
    const teach = lesson.interactive_teach || [];
    return `
      <section class="lesson-card">
        <h4>${escapeHtml((sec && sec.title) || "Architect's View")}</h4>
        ${sec ? `<div class="prose">${escapeHtml(sec.body || "").replace(/\n/g, "<br/>")}</div>` : ""}
        ${
          bullets.length
            ? `<ul class="architect-bullets">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
            : ""
        }
        ${teach.length ? renderInteractiveTeach(teach) : ""}
      </section>`;
  }

  function renderInteractiveTeach(items) {
    const { escapeHtml } = MartinData;
    return `
      <div class="interactive-teach" id="interactive-teach">
        <h5>Quick checks</h5>
        ${items
          .map((item) => {
            if (item.type === "expand") {
              return `<details class="teach-expand" data-teach-id="${escapeHtml(item.id)}">
                <summary>${escapeHtml(item.prompt || "")}</summary>
                <p>${escapeHtml(item.reveal || "")}</p>
              </details>`;
            }
            if (item.type === "choice") {
              const opts = (item.options || [])
                .map(
                  (o) =>
                    `<label class="teach-choice"><input type="radio" name="teach-${escapeHtml(item.id)}" value="${escapeHtml(o)}" /> ${escapeHtml(o)}</label>`
                )
                .join("");
              return `<fieldset class="teach-fieldset" data-teach-id="${escapeHtml(item.id)}" data-correct="${escapeHtml(item.correct || "")}">
                <legend>${escapeHtml(item.prompt || "")}</legend>
                ${opts}
                <p class="teach-feedback muted tiny hidden"></p>
              </fieldset>`;
            }
            if (item.type === "short_answer") {
              return `<div class="teach-short" data-teach-id="${escapeHtml(item.id)}">
                <label>${escapeHtml(item.prompt || "")}
                  <textarea rows="2" class="teach-short-input" placeholder="Your answer…"></textarea>
                </label>
              </div>`;
            }
            return "";
          })
          .join("")}
      </div>`;
  }

  function renderScenario(session) {
    const { escapeHtml } = MartinData;
    const sc = session.scenario || {};
    const prompt = typeof sc === "string" ? sc : sc.prompt || "";
    const questions = (typeof sc === "object" && Array.isArray(sc.questions) ? sc.questions : []) || [];
    const saved = readJson(LS_SCENARIO + session.session_id, { answer: "" });
    const awaiting =
      (session.progress && session.progress.awaiting === "scenario") ||
      (session.progress && session.progress.status === "awaiting_answer");
    return `
      <section class="lesson-card">
        <h4>Scenario</h4>
        ${awaiting ? `<p><span class="badge awaiting">Awaiting your scenario answer</span> — Greg will critique after you submit.</p>` : ""}
        <div class="prose scenario-prompt">${escapeHtml(prompt).replace(/\n/g, "<br/>")}</div>
        ${
          questions.length
            ? `<ol class="scenario-questions">${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ol>`
            : ""
        }
        <label class="field-label">Your design answer (saved locally)
          <textarea id="scenario-answer" rows="8" placeholder="Sketch components, trust boundaries, TLS, auth, and failure modes…">${escapeHtml(saved.answer || "")}</textarea>
        </label>
        <div class="btn-row">
          <button type="button" class="btn-primary" id="scenario-save">Save draft</button>
          <span class="muted tiny" id="scenario-save-status"></span>
        </div>
        <p class="muted tiny">Critique stays with Greg — dashboard holds your draft until the loop closes.</p>
      </section>`;
  }

  function renderQuiz(session) {
    const { escapeHtml } = MartinData;
    const questions = normalizeKnowledgeCheck(session.knowledge_check);
    const saved = readJson(LS_QUIZ + session.session_id, {});
    const lastReport = readJson(LS_REPORTS + ":" + session.session_id, null);
    if (!questions.length) {
      return `<section class="lesson-card"><h4>Knowledge check</h4><p class="empty-state">No questions in this session yet.</p></section>`;
    }
    const cards = questions
      .map((q, idx) => {
        const val = saved[q.id] || "";
        return `
          <div class="quiz-card" data-qid="${escapeHtml(q.id)}">
            <div class="quiz-q-num">Question ${idx + 1}</div>
            <p class="quiz-question">${escapeHtml(q.question || "")}</p>
            <textarea class="quiz-answer" data-qid="${escapeHtml(q.id)}" rows="4" placeholder="Answer in your own words…">${escapeHtml(val)}</textarea>
            <div class="quiz-rubric-feedback hidden" data-feedback-for="${escapeHtml(q.id)}"></div>
          </div>`;
      })
      .join("");
    const reportPanel = lastReport
      ? `<div class="report-panel" id="quiz-report-panel">
          <h5>Last report</h5>
          <p>Estimate <strong>${lastReport.scores && lastReport.scores.overall_pct}%</strong> · ${escapeHtml(lastReport.learner_answers_summary || "")}</p>
          <div class="btn-row">
            <button type="button" class="btn-ghost" id="copy-report-greg">Copy report for Greg</button>
            <button type="button" class="btn-ghost" id="download-report">Download JSON</button>
          </div>
          <p class="muted tiny">Shape: <code>learner_progress_report</code> → <code>data/systems-training/learner_reports/</code></p>
        </div>`
      : `<div class="report-panel hidden" id="quiz-report-panel"></div>`;
    return `
      <section class="lesson-card">
        <h4>Knowledge check</h4>
        <p class="muted">Answer each prompt. On submit you'll see rubric feedback and a score estimate; Martin packages a <code>learner_progress_report</code> for Greg.</p>
        <form id="quiz-form" class="quiz-form">${cards}
          <div class="btn-row">
            <button type="submit" class="btn-primary" id="quiz-submit">Submit quiz</button>
            <button type="button" class="btn-ghost" id="quiz-save-draft">Save draft</button>
          </div>
        </form>
        <div id="quiz-score-summary" class="quiz-score-summary hidden"></div>
        ${reportPanel}
      </section>`;
  }

  function renderPrinciple(session) {
    const { escapeHtml } = MartinData;
    return `
      <section class="lesson-card one-thing">
        <h4>One principle to remember</h4>
        <p class="one-thing-body">${escapeHtml(session.one_thing_to_remember || "—")}</p>
      </section>`;
  }

  function renderStepBody(session, stepId) {
    const lesson = session.lesson || {};
    switch (stepId) {
      case "concept":
        return renderConcept(lesson);
      case "analogy":
        return renderAnalogy(lesson);
      case "diagram":
        return renderDiagram(lesson);
      case "architect":
        return renderArchitect(lesson);
      case "scenario":
        return renderScenario(session);
      case "quiz":
        return renderQuiz(session);
      case "principle":
        return renderPrinciple(session);
      default:
        return renderConcept(lesson);
    }
  }

  function stepIndex(id) {
    return STEPS.findIndex((s) => s.id === id);
  }

  function renderLessonShell(session, adapted, stepId) {
    const idx = stepIndex(stepId);
    const prev = idx > 0 ? STEPS[idx - 1].id : null;
    const next = idx < STEPS.length - 1 ? STEPS[idx + 1].id : null;
    return `
      <div class="lesson-layout">
        <div class="lesson-main">
          ${renderHero(session, adapted)}
          ${renderStepNav(stepId)}
          <div id="lesson-step-body">${renderStepBody(session, stepId)}</div>
          <div class="lesson-nav-footer">
            ${prev ? `<button type="button" class="btn-ghost step-btn" data-step="${prev}">← ${STEPS[idx - 1].label}</button>` : `<span></span>`}
            ${next ? `<button type="button" class="btn-primary step-btn" data-step="${next}">${STEPS[idx + 1].label} →</button>` : `<span class="muted">End of lesson flow</span>`}
          </div>
        </div>
        ${renderProgressSidebar(adapted, session)}
      </div>`;
  }

  function showRubricFeedback(session, quizAnswers, report) {
    const { escapeHtml } = MartinData;
    const questions = normalizeKnowledgeCheck(session.knowledge_check);
    for (const q of questions) {
      const el = document.querySelector(`[data-feedback-for="${q.id}"]`);
      if (!el) continue;
      const per = (report.scores.per_question || []).find((p) => p.id === q.id);
      if (!per) continue;
      el.classList.remove("hidden");
      el.innerHTML = `
        <div class="rubric-score">Estimate: <strong>${Math.round(per.estimate * 100)}%</strong></div>
        ${
          per.matched_rubric && per.matched_rubric.length
            ? `<div class="rubric-matched"><span class="label">Covered:</span><ul>${per.matched_rubric.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul></div>`
            : ""
        }
        ${
          per.missed_rubric && per.missed_rubric.length
            ? `<div class="rubric-missed"><span class="label">Check these:</span><ul>${per.missed_rubric.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul></div>`
            : ""
        }`;
    }
    const summary = document.getElementById("quiz-score-summary");
    if (summary) {
      summary.classList.remove("hidden");
      summary.innerHTML = `
        <strong>Score estimate: ${report.scores.overall_pct}%</strong>
        <p class="muted">${escapeHtml(report.learner_answers_summary)}</p>
        ${
          report.weak_areas && report.weak_areas.length
            ? `<p><span class="label">Weak areas:</span> ${escapeHtml(report.weak_areas.slice(0, 4).join(" · "))}</p>`
            : ""
        }`;
    }
    const panel = document.getElementById("quiz-report-panel");
    if (panel) {
      panel.classList.remove("hidden");
      panel.innerHTML = `
        <h5>Report ready for Greg</h5>
        <p>Estimate <strong>${report.scores.overall_pct}%</strong> · ${escapeHtml(report.learner_answers_summary || "")}</p>
        <div class="btn-row">
          <button type="button" class="btn-ghost" id="copy-report-greg">Copy report for Greg</button>
          <button type="button" class="btn-ghost" id="download-report">Download JSON</button>
        </div>
        <p class="muted tiny">type: <code>learner_progress_report</code> · drop path: <code>data/systems-training/learner_reports/</code></p>`;
    }
  }

  function collectQuizAnswers() {
    const out = {};
    document.querySelectorAll(".quiz-answer").forEach((ta) => {
      out[ta.getAttribute("data-qid")] = ta.value;
    });
    return out;
  }

  function collectTeachAnswers(sessionId) {
    const existing = readJson(LS_TEACH + sessionId, {});
    document.querySelectorAll(".teach-fieldset").forEach((fs) => {
      const id = fs.getAttribute("data-teach-id");
      const checked = fs.querySelector("input:checked");
      if (checked) existing[id] = checked.value;
    });
    document.querySelectorAll(".teach-short").forEach((wrap) => {
      const id = wrap.getAttribute("data-teach-id");
      const ta = wrap.querySelector("textarea");
      if (ta && ta.value.trim()) existing[id] = ta.value;
    });
    writeJson(LS_TEACH + sessionId, existing);
    return existing;
  }

  function bindLessonEvents(data, session, adapted, stepId) {
    const root = document.getElementById("training-module-body");
    if (!root) return;

    root.querySelectorAll(".step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = btn.getAttribute("data-step");
        writeJson(LS_STEP + session.session_id, step);
        paintLesson(data, session, adapted, step);
      });
    });

    // Interactive teach choices
    root.querySelectorAll(".teach-fieldset").forEach((fs) => {
      const correct = fs.getAttribute("data-correct");
      fs.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", () => {
          const feedback = fs.querySelector(".teach-feedback");
          const teach = session.lesson && session.lesson.interactive_teach;
          const item = (teach || []).find((t) => t.id === fs.getAttribute("data-teach-id"));
          if (feedback) {
            feedback.classList.remove("hidden");
            if (input.value === correct) {
              feedback.textContent = "✓ " + ((item && item.explain) || "Correct.");
              feedback.classList.add("ok");
              feedback.classList.remove("bad");
            } else {
              feedback.textContent = "Not quite — rethink AuthN vs AuthZ vs transport.";
              feedback.classList.add("bad");
              feedback.classList.remove("ok");
            }
          }
          collectTeachAnswers(session.session_id);
        });
      });
    });

    const savedTeach = readJson(LS_TEACH + session.session_id, {});
    root.querySelectorAll(".teach-fieldset").forEach((fs) => {
      const id = fs.getAttribute("data-teach-id");
      if (savedTeach[id]) {
        fs.querySelectorAll("input").forEach((input) => {
          if (input.value === savedTeach[id]) input.checked = true;
        });
      }
    });
    root.querySelectorAll(".teach-short").forEach((wrap) => {
      const id = wrap.getAttribute("data-teach-id");
      const ta = wrap.querySelector("textarea");
      if (ta && savedTeach[id]) ta.value = savedTeach[id];
      if (ta) {
        ta.addEventListener("change", () => collectTeachAnswers(session.session_id));
      }
    });

    const saveScenario = document.getElementById("scenario-save");
    if (saveScenario) {
      saveScenario.addEventListener("click", () => {
        const ta = document.getElementById("scenario-answer");
        writeJson(LS_SCENARIO + session.session_id, {
          answer: ta ? ta.value : "",
          saved_at: new Date().toISOString(),
        });
        const st = document.getElementById("scenario-save-status");
        if (st) st.textContent = "Saved locally " + MartinData.formatTs(new Date().toISOString());
      });
    }

    const quizForm = document.getElementById("quiz-form");
    if (quizForm) {
      quizForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const answers = collectQuizAnswers();
        writeJson(LS_QUIZ + session.session_id, answers);
        const scenario = readJson(LS_SCENARIO + session.session_id, {});
        const teach = collectTeachAnswers(session.session_id);
        const report = buildReport(session, answers, scenario.answer || null, teach);
        persistReport(report);
        downloadReport(report);
        showRubricFeedback(session, answers, report);
        bindReportButtons(report);
      });
    }
    const draftBtn = document.getElementById("quiz-save-draft");
    if (draftBtn) {
      draftBtn.addEventListener("click", () => {
        writeJson(LS_QUIZ + session.session_id, collectQuizAnswers());
        draftBtn.textContent = "Draft saved";
        setTimeout(() => {
          draftBtn.textContent = "Save draft";
        }, 1200);
      });
    }

    const lastReport = readJson(LS_REPORTS + ":" + session.session_id, null);
    if (lastReport && stepId === "quiz") bindReportButtons(lastReport);
  }

  function bindReportButtons(report) {
    const copyBtn = document.getElementById("copy-report-greg");
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy report for Greg";
          }, 1500);
        } catch (_) {
          copyBtn.textContent = "Copy failed — use Download";
        }
      };
    }
    const dl = document.getElementById("download-report");
    if (dl) {
      dl.onclick = () => downloadReport(report);
    }
  }

  function paintLesson(data, session, adapted, stepId) {
    const root = document.getElementById("training-module-body");
    if (!root) return;
    const step = stepId || readJson(LS_STEP + session.session_id, "concept") || "concept";
    root.innerHTML = `
      <p class="crumb"><a href="#/training">← All sessions</a></p>
      ${renderLessonShell(session, adapted, step)}`;
    bindLessonEvents(data, session, adapted, step);
  }

  function renderOverview(data, adapted) {
    const { escapeHtml, formatTs } = MartinData;
    const index = data.sessionsIndex || { session_ids: [] };
    const ids = Array.isArray(index.session_ids) ? index.session_ids : [];
    const sessions = data.sessions || {};
    const todays = (data.progress && data.progress.todays_lesson) || null;
    const todaysId =
      (todays && todays.session_id) ||
      (adapted && adapted.session_id) ||
      (ids[0] || null);
    const todaysSession = todaysId ? sessions[todaysId] : null;

    let hero = "";
    if (todaysSession) {
      const mins =
        (todays && todays.estimated_minutes) ||
        (todaysSession.ui && todaysSession.ui.estimated_minutes) ||
        "";
      hero = `
        <a class="todays-lesson-card" href="#/training/${encodeURIComponent(todaysId)}">
          <div class="todays-kicker">Today's lesson</div>
          <h3>${escapeHtml(topicTitle(todaysSession))}</h3>
          <p class="muted">${escapeHtml(phaseName(todaysSession))}${mins ? ` · ~${mins} min` : ""}</p>
          <p class="todays-cta">Continue lesson →</p>
        </a>`;
    } else if (adapted) {
      hero = `
        <div class="todays-lesson-card empty">
          <div class="todays-kicker">Today's lesson</div>
          <h3>${escapeHtml(adapted.current_topic)}</h3>
          <p class="muted">${escapeHtml(adapted.current_phase)} — session file not loaded yet.</p>
        </div>`;
    }

    const list = ids.length
      ? `<ul class="session-list">${ids
          .map((id) => {
            const s = sessions[id];
            const title = s ? topicTitle(s) : id;
            const phase = s ? phaseName(s) : "";
            return `<li>
              <a href="#/training/${encodeURIComponent(id)}">
                <strong>${escapeHtml(title)}</strong>
                <span class="muted">${escapeHtml(phase)} · <code>${escapeHtml(id)}</code></span>
              </a>
            </li>`;
          })
          .join("")}</ul>`
      : `<div class="empty-panel"><p class="empty-state"><strong>No sessions yet</strong></p>
          <p class="muted">Waiting for Greg at <code>data/systems-training/sessions/</code>.</p></div>`;

    return `
      ${hero}
      <div class="train-progress-card">
        ${
          adapted
            ? `<p class="strip-headline">${escapeHtml(adapted.current_phase)} · ${escapeHtml(adapted.current_topic)}</p>
               <div class="strip-meta">
                 <span class="progress-bar"><span class="progress-track"><span class="progress-fill" style="width:${adapted.percent_complete}%"></span></span><span>${adapted.percent_complete}%</span></span>
                 ${adapted.awaiting_answer ? `<span class="badge awaiting">🔔 ${escapeHtml(adapted.home_badge)}</span>` : ""}
               </div>
               ${adapted.next_recommendation ? `<p class="strip-line"><span class="label">Next:</span> ${escapeHtml(adapted.next_recommendation)}</p>` : ""}`
            : `<p class="empty-state">No progress.json — waiting on Greg.</p>`
        }
      </div>
      <div class="train-sessions">
        <h3 class="section-title">Sessions</h3>
        ${list}
      </div>
      <p class="muted tiny"><a href="#/">← Home</a></p>`;
  }

  function render(data, route) {
    const root = document.getElementById("training-module-body");
    if (!root) return;

    const lead = document.querySelector("#view-training > .lead");
    if (lead) {
      lead.textContent =
        "Interactive Systems Training from Greg — concept through knowledge check, with local quiz reports for Greg.";
    }

    const adapted = global.TrainingHome ? TrainingHome.adaptProgress(data.progress) : null;
    // Enrich with one_thing from session when present
    if (adapted && adapted.session_id && data.sessions && data.sessions[adapted.session_id]) {
      const s = data.sessions[adapted.session_id];
      if (s.one_thing_to_remember) adapted.last_one_thing_to_remember = s.one_thing_to_remember;
      if (s.progress && Array.isArray(s.progress.completed_topic_ids)) {
        adapted.completed_topic_ids = s.progress.completed_topic_ids;
      }
    }

    const sessionId =
      route && route.parts && route.parts[1] ? decodeURIComponent(route.parts[1]) : null;

    if (sessionId) {
      const session = (data.sessions && data.sessions[sessionId]) || null;
      if (!session) {
        root.innerHTML = `
          <p class="crumb"><a href="#/training">← All sessions</a></p>
          <div class="empty-panel">
            <p class="empty-state">Session not found</p>
            <p class="muted">No file at <code>data/systems-training/sessions/${MartinData.escapeHtml(sessionId)}.json</code>.</p>
          </div>`;
        return;
      }
      const step = readJson(LS_STEP + sessionId, "concept") || "concept";
      paintLesson(data, session, adapted, step);
      return;
    }

    root.innerHTML = renderOverview(data, adapted);
  }

  global.TrainingModule = { render, buildReport, STEPS };
})(window);
