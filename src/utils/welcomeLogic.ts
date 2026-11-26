import { User, UserRole } from '../types';

export const SPLASH_SESSION_KEY = 'runbd_startup_splash_seen_v1';

export type SocialPlatformKey = 'facebook' | 'website' | 'tiktok' | 'instagram' | 'twitter';

export interface RoleWelcomeContext {
  agentActiveQueueCount?: number;
  agentScheduledCount?: number;
  todayCollectedCount?: number;
  todayPostsCount?: number;
}

export interface RoleWelcomeConfig {
  role: UserRole;
  roleLabel: string;
  headline: string;
  subtitle: string;
  accentTone: 'emerald' | 'teal' | 'sky' | 'amber';
  platforms?: readonly SocialPlatformKey[];
}

export function shouldShowStartupSplash(
  storageLike?: Pick<Storage, 'getItem'> | null,
  search: string = ''
): boolean {
  if (search) {
    try {
      const params = new URLSearchParams(search);
      if (params.get('autostart') === '1') {
        return false;
      }
    } catch {
      // Ignore malformed query string
    }
  }

  if (!storageLike) return true;
  try {
    return storageLike.getItem(SPLASH_SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markStartupSplashSeen(
  storageLike?: Pick<Storage, 'setItem'> | null
): void {
  if (!storageLike) return;
  try {
    storageLike.setItem(SPLASH_SESSION_KEY, '1');
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function buildRoleWelcomeConfig(
  user: Pick<User, 'name' | 'role'>,
  context: RoleWelcomeContext = {}
): RoleWelcomeConfig {
  const safeName = user.name.trim() || 'Team Member';

  switch (user.role) {
    case 'admin':
      return {
        role: 'admin',
        roleLabel: 'Admin / Supervisor',
        headline: `Welcome back, ${safeName} — Operations & Team Control Ready`,
        subtitle:
          'Analytics, lead distribution, renewals, and team performance are synchronized.',
        accentTone: 'emerald',
      };

    case 'agent': {
      const active = Math.max(0, Math.floor(context.agentActiveQueueCount ?? 0));
      const scheduled = Math.max(0, Math.floor(context.agentScheduledCount ?? 0));
      const hasQueueData =
        typeof context.agentActiveQueueCount === 'number' ||
        typeof context.agentScheduledCount === 'number';
      const subtitle = hasQueueData
        ? `${active} lead${active === 1 ? '' : 's'} in your active queue · ${scheduled} scheduled callback${
            scheduled === 1 ? '' : 's'
          } ready.`
        : 'Your personal call queue, callbacks, and Today calls workspace are ready.';

      return {
        role: 'agent',
        roleLabel: 'Call Center Agent',
        headline: `Welcome, ${safeName} — Ready to Connect & Convert Today's Leads!`,
        subtitle,
        accentTone: 'teal',
      };
    }

    case 'collector': {
      const collected = Math.max(0, Math.floor(context.todayCollectedCount ?? 0));
      const hasCollected = typeof context.todayCollectedCount === 'number';
      return {
        role: 'collector',
        roleLabel: 'Data Collector',
        headline: `Welcome, ${safeName} — Ready to Capture & Verify New Leads!`,
        subtitle: hasCollected
          ? `${collected} lead${collected === 1 ? '' : 's'} logged today · Live duplicate guard and auto-assignment active.`
          : 'Live duplicate protection and automated agent assignment are active.',
        accentTone: 'sky',
      };
    }

    case 'poster': {
      const posts = Math.max(0, Math.floor(context.todayPostsCount ?? 0));
      const hasPosts = typeof context.todayPostsCount === 'number';
      return {
        role: 'poster',
        roleLabel: 'Content & Link Poster',
        headline: `Welcome, ${safeName} — Ready to Track & Publish Social Campaigns!`,
        subtitle: hasPosts
          ? `${posts} campaign entr${posts === 1 ? 'y' : 'ies'} logged today across social and web channels.`
          : 'Track Facebook, Website, TikTok, Instagram, and Twitter campaign links.',
        accentTone: 'amber',
        platforms: ['facebook', 'website', 'tiktok', 'instagram', 'twitter'],
      };
    }
  }
}
