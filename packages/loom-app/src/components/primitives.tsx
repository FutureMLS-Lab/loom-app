import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';

import { styles } from '../styles';
import { colors } from '../theme';
import type { ActivityPulse, LoomTask } from '../types';

export type IconName = keyof typeof Ionicons.glyphMap;

export const loomIcon = require('../../assets/loom-icon.png');

export function Icon({
  name,
  size = 18,
  color = colors.textMuted,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function LoomMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.mark, compact && styles.markCompact]}>
      <Image
        accessibilityLabel="Loom"
        source={loomIcon}
        resizeMode="cover"
        style={styles.markImage}
      />
    </View>
  );
}

export function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  tone = 'neutral',
  compact = false,
  iconOnly = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
  compact?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'primary' && styles.actionButtonPrimary,
        tone === 'danger' && styles.actionButtonDanger,
        compact && styles.actionButtonCompact,
        iconOnly && styles.actionButtonIconOnly,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon
        name={icon}
        size={compact ? 15 : 17}
        color={
          tone === 'primary'
            ? '#211a4a'
            : tone === 'danger'
              ? colors.red
              : colors.text
        }
      />
      {!iconOnly && (
        <Text
          style={[
            styles.actionButtonText,
            tone === 'primary' && styles.actionButtonTextPrimary,
            tone === 'danger' && styles.actionButtonTextDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function StatusPill({
  running,
  label,
}: {
  running: boolean;
  label?: string;
}) {
  return (
    <View style={[styles.statusPill, running ? styles.statusRunning : styles.statusIdle]}>
      <View style={[styles.statusDot, running ? styles.dotRunning : styles.dotIdle]} />
      <Text style={[styles.statusText, running && styles.statusTextRunning]}>
        {label || (running ? 'Running' : 'Idle')}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: IconName;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={25} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

/**
 * Wraps a glyph with the agent's liveness: a ring that spins while the agent
 * works, and blinks once it finishes something nobody has looked at yet.
 */
export function ActivityRing({
  pulse,
  size,
  children,
}: {
  pulse: ActivityPulse;
  size: number;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pulse === 'idle') {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: pulse === 'working' ? 1400 : 1000,
        easing: pulse === 'working' ? Easing.linear : Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, pulse]);

  if (pulse === 'idle') return <>{children}</>;

  const ringStyle =
    pulse === 'working'
      ? {
          transform: [
            {
              rotate: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              }),
            },
          ],
        }
      : {
          opacity: progress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0.25, 1, 0.25],
          }),
        };

  return (
    <View style={styles.activityRingHost}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.activityRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: pulse === 'working' ? colors.primary : colors.green,
          },
          pulse === 'working' && styles.activityRingWorking,
          ringStyle,
        ]}
      />
      {children}
    </View>
  );
}

export function TaskRow({
  task,
  selected,
  onPress,
  compact,
  pulse = 'idle',
}: {
  task: LoomTask;
  selected: boolean;
  onPress: () => void;
  compact: boolean;
  pulse?: ActivityPulse;
}) {
  const hasPane = Boolean(task.tmux_interview_target);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title || task.slug}. ${task.general_goal || 'No task description'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.taskRow,
        selected && styles.taskRowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.taskRowTop}>
        <ActivityRing pulse={pulse} size={38}>
          <View style={[styles.agentGlyph, selected && styles.agentGlyphSelected]}>
            <Icon
              name={task.kind === 'kernel' ? 'hardware-chip-outline' : 'sparkles-outline'}
              size={16}
              color={selected ? colors.primary : colors.textMuted}
            />
          </View>
        </ActivityRing>
        <View style={styles.taskRowCopy}>
          <Text numberOfLines={compact ? 2 : 1} style={styles.taskTitle}>
            {task.title || task.slug}
          </Text>
          <Text numberOfLines={compact ? 3 : 2} style={styles.taskGoal}>
            {task.general_goal || 'No task description'}
          </Text>
        </View>
      </View>
      <View style={styles.taskMeta}>
        <View style={styles.taskMetaItem}>
          <View style={[styles.miniDot, hasPane && styles.miniDotLive]} />
          <Text style={styles.taskMetaText}>{task.agent || 'cursor'}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.taskMetaText, styles.taskMetaModel]}>
          {task.interview_model || task.kind || 'agent'}
        </Text>
      </View>
    </Pressable>
  );
}

export function SectionCard({
  title,
  icon,
  action,
  children,
  fill = false,
  hideHeader = false,
}: {
  title: string;
  icon: IconName;
  action?: ReactNode;
  children: ReactNode;
  fill?: boolean;
  hideHeader?: boolean;
}) {
  return (
    <View style={[styles.sectionCard, fill && styles.sectionCardFill]}>
      {!hideHeader && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Icon name={icon} size={17} color={colors.primary} />
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

