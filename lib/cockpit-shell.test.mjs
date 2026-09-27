import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { medirCockpitShell } from '../public/src/cockpit-shell.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
function hostFixture(hostRect, screens = [], knobs = []) {
  return {
    getBoundingClientRect: () => hostRect,
    querySelectorAll: selector => (selector === '[data-cp-screen]' ? screens : knobs).map(item => ({
      dataset: { cpKnob: item.type }, getBoundingClientRect: () => item.rect ?? item,
    })),
  };
}

describe('cockpit shell layout', () => {
  it('aligns the shell to screen and knob centres after the cockpit moves on the page', () => {
    const host = hostFixture(rect(120, 600, 1100, 340), [rect(146, 638, 320, 220)], [{ type: 'power', rect: rect(1050, 870, 30, 30) }]);
    const layout = medirCockpitShell(host);
    assert.equal(layout.width, 1100);
    assert.equal(layout.height, 340);
    assert.deepEqual(layout.screens, [{ x: -364, y: 22, width: 320, height: 220 }]);
    assert.deepEqual(layout.knobs, [{ x: 395, y: -115, radius: 15, type: 'power' }]);
  });

  it('ignores hidden mobile tabs and rebuilds the geometry description for the visible screen', () => {
    const host = hostFixture(rect(0, 420, 390, 240), [rect(0, 0, 0, 0), rect(12, 450, 366, 170), rect(500, 450, 366, 170)]);
    assert.deepEqual(medirCockpitShell(host).screens, [{ x: 0, y: 5, width: 366, height: 170 }]);
  });

  it('does not try to render a hidden host or non-finite geometry', () => {
    assert.equal(medirCockpitShell(hostFixture(rect(0, 0, 0, 0))), null);
    const host = hostFixture(rect(0, 0, 390, 240), [rect(NaN, 15, 50, 80)], [{ type: 'trim', rect: rect(15, 15, 0, 0) }]);
    assert.deepEqual(medirCockpitShell(host).screens, []);
    assert.deepEqual(medirCockpitShell(host).knobs, []);
  });
});
