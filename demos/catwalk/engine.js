import {
  PHASES,
  ARTIFACT_COLORS,
  WALK_SPEED,
  CHUTE_DURATION,
  WORK_DURATION,
  PAUSE_DURATION,
  CATWALK_Y,
  GROUND_Y,
  CHUTE_TOP,
  CHUTE_BOT,
  stationX,
  agentX,
  computeStepWeight,
  computeTotalWeight,
  resetPhaseAgents,
  setPhaseAgents,
} from './scenarios.js';

// Apply per-scenario agent overrides before layout computation.
// Call this before compact positioning and before playScenario.
export function initScenarioPhases(scenario) {
  resetPhaseAgents();
  for (const step of scenario.steps) {
    if (step.type === 'reviewCycle' && step.agents) {
      setPhaseAgents(step.station, step.agents);
    }
  }
}

// § ANIMATION PRIMITIVES

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// § ENGINE FACTORY — closes over state and playback

export function createEngine(state, playback) {
  function wait(ms) {
    const actualMs = ms / playback.speedMultiplier;
    return new Promise(function (resolve) {
      if (playback.paused) {
        playback.pauseResolve = function () {
          playback.pauseResolve = null;
          setTimeout(resolve, actualMs);
        };
      } else {
        setTimeout(resolve, actualMs);
      }
    });
  }

  function animateProp(target, prop, end, duration, easeFn) {
    duration = duration / playback.speedMultiplier;
    if (easeFn === undefined) easeFn = easeInOutCubic;
    const start = target[prop];
    const startTime = performance.now();
    return new Promise(function (resolve) {
      function tick(now) {
        const elapsed = now - startTime;
        if (elapsed >= duration) {
          target[prop] = end;
          resolve();
          return;
        }
        const t = easeFn(elapsed / duration);
        target[prop] = lerp(start, end, t);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function orchWalkTo(targetX) {
    const distance = Math.abs(targetX - state.orch.x);
    const duration = (distance / WALK_SPEED) * 1000;
    return animateProp(state.orch, 'x', targetX, duration);
  }

  function chuteDescend(x, label, color) {
    const art = { x: x, y: CHUTE_TOP, label: label, color: color, alpha: 1 };
    state.flyingArtifacts.push(art);
    return animateProp(art, 'y', CHUTE_BOT, CHUTE_DURATION).then(function () {
      const idx = state.flyingArtifacts.indexOf(art);
      if (idx !== -1) state.flyingArtifacts.splice(idx, 1);
    });
  }

  function chuteAscend(x, label, color) {
    const art = { x: x, y: CHUTE_BOT, label: label, color: color, alpha: 1 };
    state.flyingArtifacts.push(art);
    return animateProp(art, 'y', CHUTE_TOP, CHUTE_DURATION).then(function () {
      const idx = state.flyingArtifacts.indexOf(art);
      if (idx !== -1) state.flyingArtifacts.splice(idx, 1);
    });
  }

  function materialize(stationIndex, label, color, version) {
    const art = {
      x: stationX(stationIndex),
      y: GROUND_Y - 30,
      label: label,
      color: color,
      alpha: 0,
    };
    state.flyingArtifacts.push(art);
    return animateProp(art, 'alpha', 1, WORK_DURATION).then(function () {
      const idx = state.flyingArtifacts.indexOf(art);
      if (idx !== -1) state.flyingArtifacts.splice(idx, 1);
      const recordLabel = version !== undefined ? label + ' v' + version : label;
      state.stationRecords[stationIndex].push({
        label: recordLabel,
        color: color,
        version: version,
      });
    });
  }

  async function showPhaseLabel(text) {
    if (state.phaseDisplay.alpha > 0) {
      await animateProp(state.phaseDisplay, 'alpha', 0, 150);
    }
    state.phaseDisplay.text = text;
    await animateProp(state.phaseDisplay, 'alpha', 1, 150);
  }

  // § VERDICT HELPERS

  function setVerdict(agentLabel, criticality, dismissed) {
    state.agentVerdicts[agentLabel] = { criticality: criticality, dismissed: !!dismissed };
  }

  function clearVerdict(agentLabel) {
    delete state.agentVerdicts[agentLabel];
  }

  // § GATE + TRANSIENT HELPERS

  async function openGate(index) {
    if (index >= 0 && index < state.gates.length && !state.gates[index].open) {
      state.gates[index].open = true;
      await animateProp(state.gates[index], 'size', 0, 300);
    }
  }

  function orchAddTransient(label, color) {
    state.orch.transient.push({ label, color, alpha: 1 });
  }

  function orchRemoveTransient(label) {
    const idx = state.orch.transient.findIndex(function (a) {
      return a.label === label;
    });
    if (idx !== -1) state.orch.transient.splice(idx, 1);
  }

  async function orchFadeTransient(label) {
    const item = state.orch.transient.find(function (a) {
      return a.label === label;
    });
    if (item) {
      await animateProp(item, 'alpha', 0, 200);
      orchRemoveTransient(label);
    }
  }

  // § CHOREOGRAPHY

  async function threeBeat(stationIndex, agentLabel, dispatch, produce) {
    const sx = stationX(stationIndex);
    await orchWalkTo(sx);
    await wait(PAUSE_DURATION);
    await chuteDescend(sx, dispatch.label, dispatch.color);

    state.agents[agentLabel] = 'working';
    await materialize(stationIndex, produce.label, produce.color, produce.version);
    state.agents[agentLabel] = 'resting';
    await wait(PAUSE_DURATION);

    await chuteAscend(sx, produce.label, produce.color);
    await openGate(stationIndex);
    await wait(PAUSE_DURATION);
  }

  async function twoBeat(stationIndex, agentLabel, dispatch, produce) {
    const sx = stationX(stationIndex);
    await orchWalkTo(sx);
    await wait(PAUSE_DURATION);
    await chuteDescend(sx, dispatch.label, dispatch.color);

    state.agents[agentLabel] = 'working';
    await materialize(stationIndex, produce.label, produce.color);
    state.agents[agentLabel] = 'resting';

    await openGate(stationIndex);
    await wait(PAUSE_DURATION);
  }

  // § STEP HANDLERS

  async function showInputs() {
    state.inputs = [
      { label: 'reqs', color: ARTIFACT_COLORS.reqs },
      { label: 'xplan', color: ARTIFACT_COLORS.xplan },
    ];
    await wait(600);
  }

  async function skipStation(stationIndex) {
    await orchWalkTo(stationX(stationIndex));
    await wait(PAUSE_DURATION);
    state.orch.working = true;
    await wait(800);
    state.orch.working = false;
    state.stationInputs[stationIndex].push({ label: 'skipped', color: '#dee2e6', outline: true });
    await openGate(stationIndex);
    await wait(PAUSE_DURATION);
  }

  async function reviewCycle(station, rounds, codeVersionRef) {
    const reviewAgents = PHASES[station].agents;
    const totalDisplayRounds = rounds.reduce(function (n, r) {
      return n + 1 + (r.fix ? 1 : 0);
    }, 0);
    let displayRound = 0;

    await orchWalkTo(stationX(station));
    state.reviewRound = { current: 1, total: totalDisplayRounds, visible: true };

    for (let ri = 0; ri < rounds.length; ri++) {
      const round = rounds[ri];
      const codeLabel = 'code v' + codeVersionRef.version;

      displayRound++;
      state.reviewRound.current = displayRound;

      // Clear verdicts for dispatched reviewers (outcome pending)
      for (var vi = 0; vi < round.reviewers.length; vi++) {
        clearVerdict(reviewAgents[round.reviewers[vi]]);
      }

      // Dispatch code copies to specified reviewers
      await wait(PAUSE_DURATION);
      await Promise.all(
        round.reviewers.map(function (reviewerIdx) {
          return chuteDescend(agentX(station, reviewerIdx, reviewAgents.length), codeLabel, ARTIFACT_COLORS.code);
        }),
      );

      // Reviewers work
      for (const idx of round.reviewers) {
        state.agents[reviewAgents[idx]] = 'working';
      }

      // Staggered completion
      await Promise.all(
        round.reviewers.map(function (reviewerIdx, arrIdx) {
          const agent = reviewAgents[reviewerIdx];
          return wait(WORK_DURATION + arrIdx * 400).then(function () {
            state.agents[agent] = 'resting';
            if (!state.agentRecords[agent]) state.agentRecords[agent] = [];
            state.agentRecords[agent].push({ label: 'rev ' + (ri + 1), color: ARTIFACT_COLORS.review });
            var verdict = round.verdicts ? round.verdicts[arrIdx] : 'none';
            var dismissed = !round.fix && verdict !== 'none';
            setVerdict(agent, verdict, dismissed);
            return chuteAscend(agentX(station, reviewerIdx, reviewAgents.length), 'review', ARTIFACT_COLORS.review);
          });
        }),
      );

      await wait(PAUSE_DURATION);

      // Fix shuttle (if this round requires it)
      if (round.fix) {
        state.orch.working = true;
        await wait(800);
        state.orch.working = false;
        orchAddTransient('fixes', ARTIFACT_COLORS.fixes);

        displayRound++;
        state.reviewRound.current = displayRound;

        // Shuttle to coder
        await orchWalkTo(stationX(2));
        await orchFadeTransient('fixes');
        state.stationInputs[2].push({ label: 'fixes', color: ARTIFACT_COLORS.fixes });
        await chuteDescend(stationX(2), 'fixes', ARTIFACT_COLORS.fixes);

        // Coder produces next version
        codeVersionRef.version++;
        const newLabel = 'code v' + codeVersionRef.version;
        state.agents['coder'] = 'working';
        await materialize(2, 'code', ARTIFACT_COLORS.code, codeVersionRef.version);
        state.agents['coder'] = 'resting';
        await wait(PAUSE_DURATION);
        await chuteAscend(stationX(2), newLabel, ARTIFACT_COLORS.code);
        state.orch.code = { label: newLabel, color: ARTIFACT_COLORS.code };

        // Record new code version as review station input
        state.stationInputs[station].push({ label: newLabel, color: ARTIFACT_COLORS.code });

        // Return to review station for next round (if there is one)
        if (ri < rounds.length - 1) {
          await orchWalkTo(stationX(station));
          await wait(PAUSE_DURATION);
        }
      }
    }

    // Convergence
    state.reviewRound.visible = false;
    await openGate(station);

    // Brief celebration
    for (const agent of reviewAgents) {
      state.agents[agent] = 'working';
    }
    await wait(500);
    for (const agent of reviewAgents) {
      state.agents[agent] = 'resting';
    }
    await wait(PAUSE_DURATION);
  }

  async function fixShuttle(targetStation, codeVersionRef) {
    state.orch.working = true;
    await wait(600);
    state.orch.working = false;
    orchAddTransient('fixes', ARTIFACT_COLORS.fixes);

    await orchWalkTo(stationX(targetStation));
    await orchFadeTransient('fixes');
    await chuteDescend(stationX(targetStation), 'fixes', ARTIFACT_COLORS.fixes);

    codeVersionRef.version++;
    const newLabel = 'code v' + codeVersionRef.version;
    state.agents['coder'] = 'working';
    await materialize(targetStation, 'code', ARTIFACT_COLORS.code, codeVersionRef.version);
    state.agents['coder'] = 'resting';
    await wait(PAUSE_DURATION);
    await chuteAscend(stationX(targetStation), newLabel, ARTIFACT_COLORS.code);
    state.orch.code = { label: newLabel, color: ARTIFACT_COLORS.code };
  }

  async function showOutputs(stationIndex) {
    await orchWalkTo(stationX(stationIndex));
    await wait(PAUSE_DURATION);

    state.orch.working = true;
    await wait(WORK_DURATION);
    state.orch.working = false;

    // Drop summary — code stays on the orchestrator for final prominence
    await chuteDescend(stationX(stationIndex), 'summary', ARTIFACT_COLORS.summary);
    state.stationRecords[stationIndex].push({ label: 'summary', color: ARTIFACT_COLORS.summary });

    await wait(PAUSE_DURATION);
  }

  async function completion() {
    state.completed = true;

    for (let i = 0; i < state.gates.length; i++) {
      if (!state.gates[i].open) {
        state.gates[i].open = true;
        state.gates[i].size = 0;
      }
    }

    const allAgents = Object.keys(state.agents);
    for (const agent of allAgents) {
      state.agents[agent] = 'working';
    }
    state.orch.working = true;

    await wait(2000);

    for (const agent of allAgents) {
      state.agents[agent] = 'resting';
    }
    state.orch.working = false;
  }

  // § SCENARIO INITIALIZATION

  function initGatesForScenario(scenario) {
    const absentStations = new Set();
    for (const step of scenario.steps) {
      if (step.type === 'absent') absentStations.add(step.station);
    }
    state.absentStations = absentStations;

    for (let i = 0; i < state.gates.length; i++) {
      const shouldOpen = absentStations.has(i) || absentStations.has(i + 1);
      state.gates[i] = { open: shouldOpen, size: shouldOpen ? 0 : 1.0 };
    }
  }

  // § MAIN ENGINE

  async function playScenario(scenario) {
    const totalWeight = computeTotalWeight(scenario.steps);
    const codeVersionRef = { version: 1 };

    state.clock.targetDuration = scenario.targetDuration;
    state.clock.elapsed = 0;
    state.clock.visible = true;

    initGatesForScenario(scenario);

    await wait(500);

    for (const step of scenario.steps) {
      switch (step.type) {
        case 'inputs':
          await showInputs();
          break;

        case 'absent':
          state.currentPhase = step.station;
          await wait(200);
          break;

        case 'skip':
          state.currentPhase = step.station;
          await showPhaseLabel(PHASES[step.station].name);
          await skipStation(step.station);
          break;

        case 'threeBeat': {
          state.currentPhase = step.station;
          await showPhaseLabel(PHASES[step.station].name);

          if (step.orchUpdate && step.orchUpdate.consumeTransient) {
            await orchFadeTransient(step.orchUpdate.consumeTransient);
          }

          state.stationInputs[step.station].push({ label: step.dispatch.label, color: step.dispatch.color });
          await threeBeat(step.station, step.agent, step.dispatch, step.produce);

          if (step.orchUpdate) {
            if (step.orchUpdate.setSlot === 'code') {
              state.orch.code = { label: step.produce.label, color: step.produce.color };
            }
            if (step.orchUpdate.addTransient) {
              orchAddTransient(step.orchUpdate.addTransient.label, step.orchUpdate.addTransient.color);
            }
          }
          break;
        }

        case 'twoBeat': {
          state.currentPhase = step.station;
          await showPhaseLabel(PHASES[step.station].name);

          const dispatch = step.dispatch || {
            label: state.orch.code ? state.orch.code.label : 'code',
            color: ARTIFACT_COLORS.code,
          };

          state.stationInputs[step.station].push({ label: 'reqs', color: ARTIFACT_COLORS.reqs });
          state.stationInputs[step.station].push({ label: dispatch.label, color: dispatch.color });
          await twoBeat(step.station, step.agent, dispatch, step.produce);
          if (step.verdict !== undefined) {
            setVerdict(step.agent, step.verdict, step.verdictDismissed);
          }
          break;
        }

        case 'reviewCycle':
          {
            state.currentPhase = step.station;
            await showPhaseLabel(PHASES[step.station].name);
            state.stationInputs[step.station].push({ label: 'reqs', color: ARTIFACT_COLORS.reqs });
            var planTransient = state.orch.transient.find(function (t) {
              return t.label === 'plan';
            });
            if (planTransient) {
              state.stationInputs[step.station].push({ label: 'plan', color: ARTIFACT_COLORS.plan });
              await orchFadeTransient('plan');
            }
            state.stationInputs[step.station].push({
              label: 'code v' + codeVersionRef.version,
              color: ARTIFACT_COLORS.code,
            });
            await reviewCycle(step.station, step.rounds, codeVersionRef);
          }
          break;

        case 'fixShuttle':
          state.stationInputs[step.targetStation].push({ label: 'fixes', color: ARTIFACT_COLORS.fixes });
          await fixShuttle(step.targetStation, codeVersionRef);
          if (step.resolveAgent) {
            setVerdict(step.resolveAgent, 'none', false);
          }
          break;

        case 'outputs':
          state.currentPhase = step.station;
          await showPhaseLabel('Run complete');
          await showOutputs(step.station);
          break;
      }

      // Advance clock proportionally
      const weight = computeStepWeight(step);
      state.clock.elapsed += (weight / totalWeight) * state.clock.targetDuration;
    }

    state.clock.elapsed = state.clock.targetDuration;
    await completion();
  }

  return { playScenario };
}
