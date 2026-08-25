import { hasSupabaseConfig, supabase } from '../lib/supabase';
import type {
  GamificationAchievement,
  GamificationLeaderboard,
  GamificationLeaderboardEntry,
  GamificationSummary,
  PointTransaction,
  SpotVisit,
} from '../types';

const emptySummary: GamificationSummary = {
  totalXp: 0,
  currentLevel: 1,
  nextLevelXp: 100,
  achievements: [],
  recentTransactions: [],
};

const emptyLeaderboard: GamificationLeaderboard = {
  leaders: [],
  myRank: null,
};

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAchievement(row: any): GamificationAchievement {
  return {
    id: row.id,
    achievementId: row.achievementId ?? row.achievement_id,
    code: row.code ?? 'ACHIEVEMENT',
    name: row.name ?? 'Achievement',
    description: row.description ?? '',
    iconName: row.iconName ?? row.icon_name ?? null,
    requirementType: row.requirementType ?? row.requirement_type ?? '',
    requirementValue: numberValue(row.requirementValue ?? row.requirement_value),
    xpReward: numberValue(row.xpReward ?? row.xp_reward),
    progress: numberValue(row.progress),
    completed: Boolean(row.completed),
    unlockedAt: row.unlockedAt ?? row.unlocked_at ?? null,
  };
}

function normalizeTransaction(row: any): PointTransaction {
  return {
    id: row.id,
    user_id: row.user_id,
    activity_type: row.activityType ?? row.activity_type ?? 'POINTS',
    points: numberValue(row.points),
    reference_id: row.referenceId ?? row.reference_id ?? null,
    reference_type: row.referenceType ?? row.reference_type ?? null,
    metadata: row.metadata ?? null,
    created_at: row.createdAt ?? row.created_at ?? new Date().toISOString(),
  };
}

function normalizeSummary(row: any): GamificationSummary {
  return {
    totalXp: numberValue(row?.totalXp ?? row?.total_xp),
    currentLevel: numberValue(row?.currentLevel ?? row?.current_level, 1),
    nextLevelXp: numberValue(row?.nextLevelXp ?? row?.next_level_xp, 100),
    achievements: Array.isArray(row?.achievements) ? row.achievements.map(normalizeAchievement) : [],
    recentTransactions: Array.isArray(row?.recentTransactions ?? row?.recent_transactions)
      ? (row.recentTransactions ?? row.recent_transactions).map(normalizeTransaction)
      : [],
  };
}

function normalizeLeaderboardEntry(row: any): GamificationLeaderboardEntry {
  return {
    rank: numberValue(row?.rank, 0),
    userId: row?.userId ?? row?.user_id ?? '',
    displayName: row?.displayName ?? row?.display_name ?? 'CebSpot Explorer',
    avatar: row?.avatar ?? 'CE',
    totalXp: numberValue(row?.totalXp ?? row?.total_xp),
    currentLevel: numberValue(row?.currentLevel ?? row?.current_level, 1),
    achievementsUnlocked: numberValue(row?.achievementsUnlocked ?? row?.achievements_unlocked),
  };
}

function normalizeLeaderboard(row: any): GamificationLeaderboard {
  const leaders = Array.isArray(row?.leaders) ? row.leaders.map(normalizeLeaderboardEntry) : [];
  const myRank = row?.myRank ?? row?.my_rank;
  return {
    leaders,
    myRank: myRank ? normalizeLeaderboardEntry(myRank) : null,
  };
}

export const gamificationService = {
  async getSummary(userId?: string | null): Promise<GamificationSummary> {
    if (!hasSupabaseConfig) return emptySummary;

    const { data, error } = await supabase.rpc('get_user_gamification_summary', {
      target_user_id: userId ?? null,
    });

    if (error) {
      const missingRpc = /get_user_gamification_summary|schema cache|could not find the function|pgrst202/i.test(
        error.message ?? '',
      );
      if (missingRpc) return emptySummary;
      throw error;
    }

    return normalizeSummary(data);
  },

  async getLeaderboard(limit = 20): Promise<GamificationLeaderboard> {
    if (!hasSupabaseConfig) return emptyLeaderboard;

    const { data, error } = await supabase.rpc('get_gamification_leaderboard', {
      leaderboard_limit: limit,
    });

    if (error) {
      const missingRpc = /get_gamification_leaderboard|schema cache|could not find the function|pgrst202/i.test(
        error.message ?? '',
      );
      if (missingRpc) return emptyLeaderboard;
      throw error;
    }

    return normalizeLeaderboard(data);
  },

  async recordSpotVisit(input: {
    spotId: string;
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  }): Promise<SpotVisit | null> {
    if (!hasSupabaseConfig) return null;

    const { data, error } = await supabase.rpc('record_spot_visit', {
      target_spot_id: input.spotId,
      visit_latitude: input.latitude,
      visit_longitude: input.longitude,
      location_accuracy: input.accuracy ?? null,
    });

    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) as SpotVisit | null;
  },

  async markReviewHelpful(reviewId: string) {
    if (!hasSupabaseConfig) return { helpful: true, awarded: false };

    const { data, error } = await supabase.rpc('mark_review_helpful', {
      target_review_id: reviewId,
    });

    if (error) throw error;
    return (data ?? { helpful: true, awarded: false }) as { helpful: boolean; awarded: boolean };
  },

  async answerPlaceQuestion(questionId: string, answer: string) {
    if (!hasSupabaseConfig) return null;

    const { data, error } = await supabase.rpc('answer_place_question', {
      target_question_id: questionId,
      answer_body: answer,
    });

    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },
};
