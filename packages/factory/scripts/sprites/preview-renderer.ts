// Frame labels for subagent sprite sheet
// Row 0 (frames 0-3): Idle 1, Idle 2, Walking, Resting 1
// Row 1 (frames 4-7): Working 1, Working 2, Working 3, Resting 2
// Row 2 (frames 8-11): Celebrating 1, Celebrating 2, Concerned, Resting 3
const SUBAGENT_FRAME_LABELS = [
  'Idle 1',
  'Idle 2',
  'Walking',
  'Resting 1',
  'Working 1',
  'Working 2',
  'Working 3',
  'Resting 2',
  'Celebrating 1',
  'Celebrating 2',
  'Concerned',
  'Resting 3',
];

// Frame labels for orchestrator sprite sheet
// Row 0 (frames 0-3): Idle 1, Idle 2, Concerned, (spare)
// Row 1 (frames 4-7): Working 1, Working 2, Walking 1, Walking 2
// Row 2 (frames 8-11): Celebrating 1, Celebrating 2, (spare), (spare)
const ORCHESTRATOR_FRAME_LABELS = [
  'Idle 1',
  'Idle 2',
  'Concerned',
  '(spare)',
  'Working 1',
  'Working 2',
  'Walking 1',
  'Walking 2',
  'Celebrating 1',
  'Celebrating 2',
  '(spare)',
  '(spare)',
];

const SUBAGENT_ANIMATION_NAMES = ['Idle', 'Walking', 'Working', 'Celebrating', 'Concerned', 'Resting'];
const ORCHESTRATOR_ANIMATION_NAMES = ['Idle', 'Walking', 'Working', 'Celebrating', 'Concerned'];

/** Renders the 4x3 grid of individually labeled sprite frames as HTML. */
function renderFrameGridHtml(dataUri: string, frameLabels: readonly string[]): string {
  return frameLabels
    .map((label, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      return `<div class="frame-cell">
  <div class="frame-preview" style="background-image: url('${dataUri}'); background-position: -${col * 128}px -${row * 128}px;"></div>
  <div class="frame-label">${label}</div>
</div>`;
    })
    .join('\n');
}

/** Renders animation preview cells with element IDs for JS-driven playback. */
function renderAnimationSectionsHtml(idPrefix: string, animationNames: readonly string[]): string {
  return animationNames
    .map((name) => {
      const id = `${idPrefix}-${name.toLowerCase()}`;
      return `<div class="anim-cell">
  <div class="frame-preview" id="${id}"></div>
  <div class="frame-label">${name}</div>
</div>`;
    })
    .join('\n');
}

/** Generates a self-contained HTML preview page displaying labeled sprite frames and animated previews. */
export function renderPreviewHtml(subagentSvg: string, orchestratorSvg: string): string {
  const subagentDataUri = `data:image/svg+xml;base64,${Buffer.from(subagentSvg).toString('base64')}`;
  const orchestratorDataUri = `data:image/svg+xml;base64,${Buffer.from(orchestratorSvg).toString('base64')}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sprite sheet preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: monospace;
    padding: 24px;
  }
  h1 { text-align: center; margin-bottom: 24px; font-size: 20px; }
  h2 { margin-bottom: 12px; font-size: 16px; color: #aaa; }
  h3 { margin-top: 16px; margin-bottom: 8px; font-size: 14px; color: #888; }
  .columns {
    display: flex;
    gap: 48px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .column { flex: 0 1 auto; }
  .frame-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .anim-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .frame-cell, .anim-cell {
    text-align: center;
  }
  .frame-preview {
    width: 128px;
    height: 128px;
    background-repeat: no-repeat;
    background-size: ${4 * 128}px ${3 * 128}px;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
    image-rendering: pixelated;
    border: 1px solid #333;
    margin: 0 auto;
  }
  .frame-label {
    margin-top: 4px;
    font-size: 11px;
    color: #999;
  }
</style>
</head>
<body>
<h1>Sprite sheet preview</h1>
<div class="columns">
  <div class="column">
    <h2>subagent</h2>
    <h3>Frames</h3>
    <div class="frame-grid">
${renderFrameGridHtml(subagentDataUri, SUBAGENT_FRAME_LABELS)}
    </div>
    <h3>Animations</h3>
    <div class="anim-grid">
${renderAnimationSectionsHtml('subagent', SUBAGENT_ANIMATION_NAMES)}
    </div>
  </div>
  <div class="column">
    <h2>orchestrator</h2>
    <h3>Frames</h3>
    <div class="frame-grid">
${renderFrameGridHtml(orchestratorDataUri, ORCHESTRATOR_FRAME_LABELS)}
    </div>
    <h3>Animations</h3>
    <div class="anim-grid">
${renderAnimationSectionsHtml('orchestrator', ORCHESTRATOR_ANIMATION_NAMES)}
    </div>
  </div>
</div>
<script>
(function() {
  var SPRITE_SIZE = 32;
  var SCALE = 128 / SPRITE_SIZE;

  var subagentUri = '${subagentDataUri}';
  var orchestratorUri = '${orchestratorDataUri}';

  // Animation strategies
  var PING_PONG = 'PingPong';
  var LOOP = 'Loop';
  var FREEZE = 'Freeze';

  // Animation definitions (duplicated from sprite-definitions.ts)
  var subagentAnimations = [
    { name: 'idle', frames: [{x:0,y:0},{x:1,y:0}], duration: 600, strategy: PING_PONG },
    { name: 'walking', frames: [{x:2,y:0}], duration: 200, strategy: LOOP },
    { name: 'working', frames: [{x:0,y:1},{x:1,y:1},{x:2,y:1}], duration: 300, strategy: LOOP },
    { name: 'celebrating', frames: [{x:0,y:2},{x:1,y:2}], duration: 500, strategy: PING_PONG },
    { name: 'concerned', frames: [{x:2,y:2}], duration: 600, strategy: FREEZE },
    { name: 'resting', frames: [{x:3,y:0},{x:3,y:1},{x:3,y:2}], duration: 500, strategy: PING_PONG }
  ];

  var orchestratorAnimations = [
    { name: 'idle', frames: [{x:0,y:0},{x:1,y:0}], duration: 1200, strategy: PING_PONG },
    { name: 'walking', frames: [{x:2,y:1},{x:3,y:1}], duration: 300, strategy: LOOP },
    { name: 'working', frames: [{x:0,y:1},{x:1,y:1}], duration: 500, strategy: LOOP },
    { name: 'celebrating', frames: [{x:0,y:2},{x:1,y:2}], duration: 250, strategy: LOOP },
    { name: 'concerned', frames: [{x:2,y:0}], duration: 600, strategy: FREEZE },
  ];

  var prefixes = [
    { prefix: 'subagent', uri: subagentUri, animations: subagentAnimations },
    { prefix: 'orchestrator', uri: orchestratorUri, animations: orchestratorAnimations }
  ];

  prefixes.forEach(function(cfg) {
    cfg.animations.forEach(function(anim) {
      var el = document.getElementById(cfg.prefix + '-' + anim.name);
      if (!el) return;

      el.style.backgroundImage = 'url(' + cfg.uri + ')';

      if (anim.strategy === FREEZE || anim.frames.length <= 1) {
        var f = anim.frames[0];
        if (f) {
          el.style.backgroundPosition = '-' + (f.x * SPRITE_SIZE * SCALE) + 'px -' + (f.y * SPRITE_SIZE * SCALE) + 'px';
        }
        return;
      }

      var sequence = anim.frames.slice();
      if (anim.strategy === PING_PONG && sequence.length > 2) {
        var reversed = sequence.slice(1, -1).reverse();
        sequence = sequence.concat(reversed);
      }

      var idx = 0;
      function tick() {
        var f = sequence[idx % sequence.length];
        if (f) {
          el.style.backgroundPosition = '-' + (f.x * SPRITE_SIZE * SCALE) + 'px -' + (f.y * SPRITE_SIZE * SCALE) + 'px';
        }
        idx++;
      }
      tick();
      setInterval(tick, anim.duration);
    });
  });
})();
</script>
</body>
</html>`;
}
