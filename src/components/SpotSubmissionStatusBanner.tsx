import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, CheckCircle2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { radius, shadow, spacing } from '../constants/design';
import { useTheme } from '../hooks/useTheme';
import {
  spotSubmissionQueueService,
  type SpotSubmissionJob,
} from '../services/spotSubmissionQueueService';

export function SpotSubmissionStatusBanner() {
  const { appColors } = useTheme();
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<SpotSubmissionJob[]>([]);

  useEffect(() => spotSubmissionQueueService.subscribe(setJobs), []);

  const visibleJob = useMemo(
    () => jobs.find((job) => job.status === 'queued' || job.status === 'processing') ?? jobs[0],
    [jobs]
  );

  useEffect(() => {
    if (!visibleJob || visibleJob.status !== 'completed') return;
    const timeout = setTimeout(() => {
      void spotSubmissionQueueService.dismiss(visibleJob.id);
    }, 8_000);
    return () => clearTimeout(timeout);
  }, [visibleJob]);

  if (!visibleJob) return null;

  const isActive = visibleJob.status === 'queued' || visibleJob.status === 'processing';
  const isFailed = visibleJob.status === 'failed';
  const accent = isFailed ? colors.danger : colors.primary;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View
        style={[
          styles.banner,
          {
            bottom: Math.max(insets.bottom, spacing.sm) + 82,
            backgroundColor: appColors.white,
            borderColor: accent + '38',
          },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: accent + '14' }]}>
          {isActive ? (
            <ActivityIndicator size="small" color={accent} />
          ) : isFailed ? (
            <AlertCircle size={19} color={accent} />
          ) : (
            <CheckCircle2 size={19} color={accent} />
          )}
        </View>

        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={[styles.title, { color: appColors.onSurface }]}>
              {visibleJob.spotName}
            </Text>
            {isActive ? (
              <Text style={[styles.percent, { color: accent }]}>{visibleJob.percent}%</Text>
            ) : null}
          </View>
          <Text numberOfLines={2} style={[styles.message, { color: appColors.onSurfaceVariant }]}>
            {visibleJob.message}
          </Text>
          {isActive ? (
            <View style={[styles.track, { backgroundColor: appColors.surfaceLow }]}>
              <View style={[styles.progress, { width: `${visibleJob.percent}%`, backgroundColor: accent }]} />
            </View>
          ) : null}
        </View>

        {!isActive ? (
          <Pressable
            accessibilityLabel="Dismiss submission status"
            hitSlop={10}
            onPress={() => void spotSubmissionQueueService.dismiss(visibleJob.id)}
            style={styles.dismiss}
          >
            <X size={17} color={appColors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  banner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    minHeight: 74,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    ...shadow.card,
    elevation: 8,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  percent: {
    fontSize: 11,
    fontWeight: '900',
  },
  message: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progress: {
    height: '100%',
    borderRadius: 2,
  },
  dismiss: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
