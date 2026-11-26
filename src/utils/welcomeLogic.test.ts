import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoleWelcomeConfig,
  markStartupSplashSeen,
  shouldShowStartupSplash,
  SPLASH_SESSION_KEY,
} from './welcomeLogic';

function makeMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => {
      store.set(key, val);
    },
  };
}

test('startup splash plays once per browser session and honors ?autostart=1', () => {
  const mem = makeMemoryStorage();
  assert.equal(shouldShowStartupSplash(mem, ''), true);
  assert.equal(shouldShowStartupSplash(mem, '?autostart=1'), false);

  markStartupSplashSeen(mem);
  assert.equal(mem.getItem(SPLASH_SESSION_KEY), '1');
  assert.equal(shouldShowStartupSplash(mem, ''), false);
});

test('buildRoleWelcomeConfig produces tailored greetings and metadata for all 4 roles', () => {
  const adminCfg = buildRoleWelcomeConfig({ name: 'Jahid Islam', role: 'admin' });
  assert.equal(adminCfg.role, 'admin');
  assert.ok(adminCfg.headline.includes('Jahid Islam'));
  assert.ok(adminCfg.headline.includes('Operations & Team Control Ready'));

  const agentCfg = buildRoleWelcomeConfig(
    { name: 'Kathy', role: 'agent' },
    { agentActiveQueueCount: 12, agentScheduledCount: 4 }
  );
  assert.equal(agentCfg.role, 'agent');
  assert.ok(agentCfg.headline.includes('Kathy'));
  assert.ok(agentCfg.subtitle.includes('12 leads'));
  assert.ok(agentCfg.subtitle.includes('4 scheduled callbacks'));

  const collectorCfg = buildRoleWelcomeConfig(
    { name: 'Farhan', role: 'collector' },
    { todayCollectedCount: 9 }
  );
  assert.equal(collectorCfg.role, 'collector');
  assert.ok(collectorCfg.headline.includes('Farhan'));
  assert.ok(collectorCfg.subtitle.includes('9 leads logged today'));

  const posterCfg = buildRoleWelcomeConfig(
    { name: 'Kawsar', role: 'poster' },
    { todayPostsCount: 5 }
  );
  assert.equal(posterCfg.role, 'poster');
  assert.ok(posterCfg.headline.includes('Kawsar'));
  assert.deepEqual(posterCfg.platforms, [
    'facebook',
    'website',
    'tiktok',
    'instagram',
    'twitter',
  ]);
});
