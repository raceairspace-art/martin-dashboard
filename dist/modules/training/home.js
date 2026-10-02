/* Training Home strip — adapter for Greg progress.json + today's lesson */
(function (global) {
  function adaptProgress(raw) {
    if (!raw) return null;
    const p = raw.progress || {};
    const completed = Array.isArray(p.completed_topic_ids)
      ? p.completed_topic_ids
      : Array.isArray(raw.completed_topic_ids)
        ? raw.completed_topic_ids
        : [];
    let percent = 0;
    if (typeof p.percent_complete === "number") {
      percent = p.percent_complete;
    } else if (typeof raw.percent_complete === "number") {
      percent = raw.percent_complete;
    } else if (completed.length && typeof p.total_topics === "number" && p.total_topics > 0) {
      percent = Math.round((completed.length / p.total_topics) * 100);
    }

    const next = p.next_recommended || {};
    const nextRec = next.why || next.title || raw.next_recommendation || "";
    const todays = raw.todays_lesson || null;

    return {
      session_id: raw.session_id || raw.current_session_id || (todays && todays.session_id) || null,
      current_phase: (raw.phase && raw.phase.name) || raw.current_phase || "—",
      current_topic: (raw.topic && raw.topic.title) || raw.current_topic || (todays && todays.title) || "—",
      percent_complete: percent,
      awaiting_answer: p.status === "awaiting_answer" || !!raw.awaiting_answer,
      home_badge: p.home_badge || (todays && todays.status === "awaiting_answer" ? "Today's lesson awaiting answer" : "Awaiting answer"),
      awaiting_what: p.awaiting || null,
      next_recommendation: nextRec,
      last_one_thing_to_remember: raw.last_one_thing_to_remember || null,
      updated_at: raw.updated_at || null,
      status: p.status || (todays && todays.status) || null,
      completed_topic_ids: completed,
      weak_areas: Array.isArray(p.weak_areas) ? p.weak_areas : Array.isArray(raw.weak_areas) ? raw.weak_areas : [],
      todays_lesson: todays,
    };
  }

  function renderHomeStrip(data) {
    const el = document.getElementById("training-strip-body");
    if (!el) return { banner: null };

    const adapted = adaptProgress(data.progress);
    if (!adapted) {
      el.innerHTML = `<p class="empty-state">No sessions yet — waiting on Greg (<code>systems-training/progress.json</code>).</p>`;
      return { banner: null };
    }

    const { escapeHtml } = MartinData;

    // Prefer one_thing from loaded session
    let remember = adapted.last_one_thing_to_remember;
    if (!remember && adapted.session_id && data.sessions && data.sessions[adapted.session_id]) {
      remember = data.sessions[adapted.session_id].one_thing_to_remember || null;
    }

    const badge = adapted.awaiting_answer
      ? `<span class="badge awaiting">🔔 ${escapeHtml(adapted.home_badge)}</span>`
      : "";
    const rememberHtml = remember
      ? `<div class="strip-remember">Remember: ${escapeHtml(remember)}</div>`
      : "";
    const next = adapted.next_recommendation
      ? `<p class="strip-line"><span class="label">Next:</span> ${escapeHtml(adapted.next_recommendation)}</p>`
      : "";

    const todays = adapted.todays_lesson;
    const lessonHref = adapted.session_id
      ? `#/training/${encodeURIComponent(adapted.session_id)}`
      : "#/training";
    const todaysBlock = todays
      ? `<a class="todays-home-chip" href="${escapeHtml(lessonHref)}">
           <span class="todays-kicker">Today's lesson</span>
           <strong>${escapeHtml(todays.title || adapted.current_topic)}</strong>
           ${todays.estimated_minutes ? `<span class="muted">· ~${todays.estimated_minutes} min</span>` : ""}
           <span class="todays-cta-inline">Open →</span>
         </a>`
      : `<p class="strip-line muted tiny"><a href="${escapeHtml(lessonHref)}">Open today's lesson →</a></p>`;

    const sessionCount =
      data.sessionsIndex && Array.isArray(data.sessionsIndex.session_ids)
        ? data.sessionsIndex.session_ids.length
        : 0;

    el.innerHTML = `
      <p class="strip-headline">${escapeHtml(adapted.current_phase)} · ${escapeHtml(adapted.current_topic)}</p>
      <div class="strip-meta">
        <span class="progress-bar" title="${adapted.percent_complete}%">
          <span class="progress-track"><span class="progress-fill" style="width:${adapted.percent_complete}%"></span></span>
          <span>${adapted.percent_complete}%</span>
        </span>
        ${badge}
        ${adapted.session_id ? `<span><code>${escapeHtml(adapted.session_id)}</code></span>` : ""}
      </div>
      ${todaysBlock}
      ${next}
      ${rememberHtml}
      <p class="strip-line muted tiny">${sessionCount} session file(s) · <a href="#/training">Training module →</a></p>
    `;

    if (adapted.awaiting_answer) {
      return {
        banner: {
          priority: 2,
          severity: "medium",
          title: "Training: today's lesson open",
          summary: adapted.home_badge + (adapted.awaiting_what ? ` (${adapted.awaiting_what})` : ""),
          ctaLabel: "Open lesson",
          ctaHref: lessonHref,
        },
        adapted,
      };
    }
    return { banner: null, adapted };
  }

  global.TrainingHome = {
    adaptProgress,
    renderHomeStrip,
  };
})(window);
