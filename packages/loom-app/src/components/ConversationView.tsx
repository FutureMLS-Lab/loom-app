import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';

import { conversationMarkdownStyles, styles } from '../styles';
import { colors } from '../theme';
import type {
  ConversationFeed,
  ConversationMessage,
  ConversationQuestion,
  ConversationTool,
  OptimisticActivity,
} from '../types';
import { EmptyState, Icon, type IconName, loomIcon } from './primitives';

/** A single tool can return megabytes; laying all of it out freezes the list. */
const TOOL_TEXT_LIMIT = 4000;

function looksLikePath(value: string): boolean {
  return value.startsWith('/') && !value.includes(' ') && value.lastIndexOf('/') > 0;
}

function clampToolText(value: string): string {
  if (value.length <= TOOL_TEXT_LIMIT) return value;
  const dropped = value.length - TOOL_TEXT_LIMIT;
  return `${value.slice(0, TOOL_TEXT_LIMIT)}\n\n… ${dropped.toLocaleString()} more characters`;
}

function ConversationToolCard({
  tool,
  repeatsName,
}: {
  tool: ConversationTool;
  /** True when the row above ran the same tool, so the name is just noise. */
  repeatsName?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(tool.input || tool.output);
  const status =
    tool.status === 'running'
      ? { icon: 'ellipsis-horizontal-circle-outline' as IconName, color: colors.amber, label: 'Running' }
      : tool.status === 'error'
        ? { icon: 'alert-circle-outline' as IconName, color: colors.red, label: 'Error' }
        : tool.status === 'canceled'
          ? { icon: 'remove-circle-outline' as IconName, color: colors.textDim, label: 'Stopped' }
          : { icon: 'checkmark-circle-outline' as IconName, color: colors.green, label: 'Done' };

  return (
    <View
      style={[
        styles.conversationTool,
        tool.status === 'running' && styles.conversationToolActive,
        tool.status === 'error' && styles.conversationToolFailed,
      ]}
    >
      <Pressable
        accessibilityRole={hasDetails ? 'button' : undefined}
        accessibilityLabel={
          hasDetails
            ? `${expanded ? 'Collapse' : 'Expand'} ${tool.name}, ${status.label}`
            : `${tool.name}, ${status.label}`
        }
        disabled={!hasDetails}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.conversationToolHeader,
          pressed && hasDetails && styles.pressed,
        ]}
      >
        {/* One line per call: the status colour carries the state, so the row
            can stay dense enough to scan a long run at a glance. */}
        <Icon name={status.icon} size={14} color={status.color} />
        <Text
          numberOfLines={1}
          style={[
            styles.conversationToolName,
            repeatsName && styles.conversationToolNameRepeat,
          ]}
        >
          {tool.name}
        </Text>
        {tool.summary ? (
          <Text
            numberOfLines={1}
            // A path's filename is the useful half, so clip the directories.
            // Slash commands also start with "/", so require a real path shape.
            ellipsizeMode={looksLikePath(tool.summary) ? 'head' : 'tail'}
            style={styles.conversationToolSummary}
          >
            {tool.summary}
          </Text>
        ) : (
          <View style={styles.conversationToolSpacer} />
        )}
        {hasDetails ? (
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textDim}
          />
        ) : null}
      </Pressable>
      {expanded ? (
        <View style={styles.conversationToolDetails}>
          {tool.input ? (
            <View style={styles.conversationToolSection}>
              <Text style={styles.conversationToolSectionLabel}>Input</Text>
              <Text selectable style={styles.conversationToolCode}>
                {clampToolText(tool.input)}
              </Text>
            </View>
          ) : null}
          {tool.output ? (
            <View style={styles.conversationToolSection}>
              <Text style={styles.conversationToolSectionLabel}>Result</Text>
              <Text selectable style={styles.conversationToolCode}>
                {clampToolText(tool.output)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Pasted prompts run to hundreds of lines; a wall of them buries the reply. */
const USER_MESSAGE_CLAMP_LINES = 12;
/** Slash commands arrive wrapped in these; the tags are noise to a reader. */
const COMMAND_WRAPPER_TAGS = /<\/?command-(?:args|name|message|contents)>/g;

function readableUserText(value: string): string {
  return value.replace(COMMAND_WRAPPER_TAGS, '').trim();
}

function ConversationUserBubble({ message }: { message: ConversationMessage }) {
  const [expanded, setExpanded] = useState(false);
  const text = readableUserText(message.text || '');
  const clampable = text.split('\n').length > USER_MESSAGE_CLAMP_LINES || text.length > 700;

  return (
    <View style={styles.conversationUserRow}>
      <View style={styles.conversationUserBubble}>
        <Text
          selectable
          numberOfLines={clampable && !expanded ? USER_MESSAGE_CLAMP_LINES : undefined}
          style={styles.conversationUserText}
        >
          {text}
        </Text>
        {clampable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse message' : 'Show full message'}
            onPress={() => setExpanded((current) => !current)}
            style={({ pressed }) => [
              styles.conversationUserExpand,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.conversationUserExpandText}>
              {expanded ? 'Show less' : 'Show more'}
            </Text>
          </Pressable>
        ) : null}
        {message.delivery ? (
          <Text style={styles.conversationUserDelivery}>
            {message.delivery === 'sending' ? 'Sending…' : 'Queued'}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ConversationQuestionCard({
  question,
  disabled,
  feedback,
  onAnswer,
}: {
  question: ConversationQuestion;
  disabled: boolean;
  feedback: string;
  onAnswer: (
    question: ConversationQuestion,
    selected: Record<string, string[]>,
    customAnswer: string,
  ) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      question.questions.map((item) => [
        item.id,
        item.options.filter((option) => option.selected).map((option) => option.value),
      ]),
    ),
  );
  const [customAnswer, setCustomAnswer] = useState('');
  const pending = question.status === 'pending';
  const selectedOther = question.questions.some((item) => {
    const active = new Set(selected[item.id] || []);
    return item.options.some(
      (option) => /^other\b/i.test(option.label.trim()) && active.has(option.value),
    );
  });
  const complete =
    question.questions.every((item) => (selected[item.id] || []).length) &&
    (!selectedOther || Boolean(customAnswer.trim()));

  const toggleOption = (
    questionId: string,
    value: string,
    allowMultiple: boolean,
    isOther: boolean,
    otherValues: string[],
  ) => {
    if (!isOther) setCustomAnswer('');
    setSelected((current) => {
      const active = current[questionId] || [];
      const next = allowMultiple
        ? isOther
          ? active.includes(value)
            ? []
            : [value]
          : active.includes(value)
            ? active.filter((item) => item !== value)
            : [...active.filter((item) => !otherValues.includes(item)), value]
        : [value];
      return { ...current, [questionId]: next };
    });
  };

  const submit = () => {
    if (complete) onAnswer(question, selected, customAnswer.trim());
  };

  return (
    <View style={styles.conversationQuestion}>
      <View style={styles.conversationQuestionHeader}>
        <View style={styles.conversationQuestionIcon}>
          <Icon name="help-circle-outline" size={17} color={colors.primary} />
        </View>
        <View style={styles.conversationQuestionHeaderCopy}>
          <Text style={styles.conversationQuestionTitle}>{question.title || 'Input needed'}</Text>
          <Text style={styles.conversationQuestionStatus}>
            {question.status === 'pending'
              ? 'Waiting for your answer'
              : question.status === 'answered'
                ? 'Answered'
                : question.status === 'error'
                  ? 'Could not submit'
                  : 'No longer active'}
          </Text>
        </View>
      </View>
      {question.questions.map((item) => (
        <View key={item.id} style={styles.conversationPrompt}>
          {item.header ? (
            <Text style={styles.conversationPromptHeader}>{item.header}</Text>
          ) : null}
          <Text style={styles.conversationPromptText}>{item.prompt}</Text>
          {item.allow_multiple ? (
            <Text style={styles.conversationPromptHint}>Select all that apply</Text>
          ) : null}
          <View style={styles.conversationOptions}>
            {item.options.map((option) => {
              const active = (selected[item.id] || []).includes(option.value);
              const isOther = /^other\b/i.test(option.label.trim());
              const otherValues = item.options
                .filter((candidate) => /^other\b/i.test(candidate.label.trim()))
                .map((candidate) => candidate.value);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !pending || disabled }}
                  disabled={!pending || disabled}
                  onPress={() =>
                    toggleOption(
                      item.id,
                      option.value,
                      item.allow_multiple,
                      isOther,
                      otherValues,
                    )
                  }
                  style={({ pressed }) => [
                    styles.conversationOption,
                    active && styles.conversationOptionSelected,
                    pressed && styles.pressed,
                    (!pending || disabled) && styles.conversationOptionDisabled,
                  ]}
                >
                  <View
                    style={[
                      styles.conversationOptionIndicator,
                      active && styles.conversationOptionIndicatorSelected,
                    ]}
                  >
                    {active ? (
                      <Icon name="checkmark" size={12} color="#211a4a" />
                    ) : null}
                  </View>
                  <View style={styles.conversationOptionCopy}>
                    <Text
                      style={[
                        styles.conversationOptionLabel,
                        active && styles.conversationOptionLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text style={styles.conversationOptionDescription}>
                        {option.description}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {pending && selectedOther ? (
        <View style={styles.conversationCustomAnswer}>
          <Text style={styles.conversationCustomAnswerLabel}>Your answer</Text>
          <TextInput
            value={customAnswer}
            onChangeText={setCustomAnswer}
            editable={!disabled}
            autoFocus
            multiline
            maxLength={12000}
            placeholder="Type a custom answer…"
            placeholderTextColor={colors.textDim}
            style={styles.conversationCustomAnswerInput}
          />
        </View>
      ) : null}
      {pending ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send selected answer to agent"
            disabled={!complete || disabled}
            onPress={submit}
            style={({ pressed }) => [
              styles.conversationAnswerButton,
              (!complete || disabled) && styles.conversationAnswerButtonDisabled,
              pressed && complete && !disabled && styles.pressed,
            ]}
          >
            {disabled ? (
              <ActivityIndicator size="small" color="#211a4a" />
            ) : (
              <>
                <Text style={styles.conversationAnswerButtonText}>Send answer</Text>
                <Icon name="arrow-forward" size={15} color="#211a4a" />
              </>
            )}
          </Pressable>
          {feedback ? (
            <Text style={styles.conversationAnswerFeedback}>{feedback}</Text>
          ) : null}
        </>
      ) : question.answer ? (
        <Text numberOfLines={3} style={styles.conversationQuestionAnswer}>
          {question.answer}
        </Text>
      ) : null}
    </View>
  );
}

const ConversationMessageRow = memo(function ConversationMessageRow({
  message,
  repeatsToolName,
  answering,
  answerFeedback,
  onAnswer,
}: {
  message: ConversationMessage;
  repeatsToolName?: boolean;
  answering: boolean;
  answerFeedback: string;
  onAnswer: (
    question: ConversationQuestion,
    selected: Record<string, string[]>,
    customAnswer: string,
  ) => void;
}) {
  if (message.kind === 'tool' && message.tool) {
    return <ConversationToolCard tool={message.tool} repeatsName={repeatsToolName} />;
  }
  if (message.kind === 'question' && message.question) {
    return (
      <ConversationQuestionCard
        question={message.question}
        disabled={answering}
        feedback={answerFeedback}
        onAnswer={onAnswer}
      />
    );
  }
  if (message.kind === 'event') {
    return (
      <View style={styles.conversationEvent}>
        <Text style={styles.conversationEventText}>{message.text}</Text>
      </View>
    );
  }
  if (message.kind === 'user') {
    return <ConversationUserBubble message={message} />;
  }
  return (
    <View style={styles.conversationAgentRow}>
      <View style={styles.conversationAgentAvatar}>
        <Image source={loomIcon} resizeMode="cover" style={styles.conversationAgentAvatarImage} />
      </View>
      <View style={styles.conversationAgentBody}>
        <Markdown mergeStyle style={conversationMarkdownStyles}>
          {message.text || ''}
        </Markdown>
      </View>
    </View>
  );
});

/** Distance from the bottom, in points, still counted as "at the latest message". */
const AT_LATEST_SLACK = 72;
/** Quiet period with no content growth that marks the initial layout as settled. */
const SETTLE_QUIET_MS = 500;
/** Grace period after a drag ends, so its momentum still counts as user intent. */
const DRAG_RELEASE_MS = 400;

function distanceFromBottom(
  event: NativeSyntheticEvent<NativeScrollEvent>,
): number {
  const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
  return contentSize.height - layoutMeasurement.height - contentOffset.y;
}

export function ConversationView({
  feed,
  loading,
  error,
  online,
  working,
  optimisticActivity,
  answering,
  answerFeedback,
  keyboardVisible,
  onLoadMore,
  onAnswer,
}: {
  feed: ConversationFeed | null;
  loading: boolean;
  error: string;
  online: boolean;
  working: boolean;
  optimisticActivity: OptimisticActivity;
  answering: boolean;
  answerFeedback: string;
  keyboardVisible: boolean;
  onLoadMore: () => void;
  onAnswer: (
    question: ConversationQuestion,
    selected: Record<string, string[]>,
    customAnswer: string,
  ) => void;
}) {
  const listRef = useRef<FlatList<ConversationMessage>>(null);
  const stickToLatestRef = useRef(true);
  const settlingRef = useRef(true);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDragRef = useRef(false);
  const sessionRef = useRef('');
  const messageCountRef = useRef(0);
  const [atLatest, setAtLatest] = useState(true);
  const [settling, setSettling] = useState(true);
  const messages = feed?.messages || [];
  messageCountRef.current = messages.length;

  const setSettlingState = useCallback((next: boolean) => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    settlingRef.current = next;
    setSettling(next);
  }, []);

  // scrollToEnd targets an estimated content height, which is wrong while
  // variable-height rows are still measuring. Target the last row instead.
  const scrollToLatest = useCallback((animated = false) => {
    const count = messageCountRef.current;
    if (!count) return;
    listRef.current?.scrollToIndex({
      index: count - 1,
      viewPosition: 1,
      animated,
    });
  }, []);

  // Programmatic scrolls also fire momentum events, so stickiness may only be
  // released by a gesture the user actually started.
  const applyUserScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>, mayResume: boolean) => {
      if (!userDragRef.current) return;
      const nextAtLatest = distanceFromBottom(event) < AT_LATEST_SLACK;
      stickToLatestRef.current = nextAtLatest;
      setAtLatest(nextAtLatest);
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
      }
      if (!mayResume) {
        userDragRef.current = false;
        return;
      }
      dragTimerRef.current = setTimeout(() => {
        userDragRef.current = false;
        dragTimerRef.current = null;
      }, DRAG_RELEASE_MS);
    },
    [],
  );

  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    },
    [],
  );

  // Read through a ref so a poll does not hand FlatList a new renderItem and
  // force every visible row to re-render.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const renderItem = useCallback(
    ({ item, index }: { item: ConversationMessage; index: number }) => {
      const previous = index > 0 ? messagesRef.current[index - 1] : undefined;
      return (
        <ConversationMessageRow
          message={item}
          repeatsToolName={
            item.kind === 'tool' &&
            previous?.kind === 'tool' &&
            previous.tool?.name === item.tool?.name
          }
          answering={answering}
          answerFeedback={answerFeedback}
          onAnswer={onAnswer}
        />
      );
    },
    [answerFeedback, answering, onAnswer],
  );

  useEffect(() => {
    const sessionId = feed?.session_id || '';
    if (!sessionId || sessionRef.current === sessionId) return;
    sessionRef.current = sessionId;
    stickToLatestRef.current = true;
    setSettlingState(true);
    setAtLatest(true);
    requestAnimationFrame(() => scrollToLatest(false));
  }, [feed?.session_id, scrollToLatest, setSettlingState]);

  useEffect(() => {
    if (!messages.length || !stickToLatestRef.current) return;
    // A poll landing mid-gesture must not yank the list out from under the
    // finger; the drag decides where we end up.
    if (userDragRef.current) return;
    requestAnimationFrame(() => scrollToLatest(false));
  }, [feed?.updated_at, messages.length, scrollToLatest]);

  useEffect(() => {
    if (!keyboardVisible || !messages.length) return;
    stickToLatestRef.current = true;
    setSettlingState(false);
    setAtLatest(true);
    requestAnimationFrame(() => scrollToLatest(true));
  }, [keyboardVisible, messages.length, scrollToLatest, setSettlingState]);

  const empty = error ? (
    <EmptyState
      icon="warning-outline"
      title="Conversation unavailable"
      detail={error}
    />
  ) : loading ? (
    <View style={styles.conversationLoading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.conversationLoadingText}>Loading conversation…</Text>
    </View>
  ) : feed && !feed.available ? (
    <EmptyState
      icon="chatbubble-ellipses-outline"
      title="No structured transcript"
      detail="This session has terminal output only. Open Terminal to follow it directly."
    />
  ) : (
    <EmptyState
      icon="chatbubble-outline"
      title="No messages yet"
      detail={online ? 'The agent is ready for a follow-up.' : 'Start the agent to begin.'}
    />
  );

  return (
    <View style={styles.conversation}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        initialNumToRender={18}
        maxToRenderPerBatch={16}
        windowSize={7}
        // Anchoring only matters once the initial layout is done. It must not
        // switch on scroll position: toggling it mid-gesture re-anchors the
        // list and reads as the view jumping back on its own.
        maintainVisibleContentPosition={
          settling ? undefined : { minIndexForVisible: 0 }
        }
        style={styles.conversationList}
        contentContainerStyle={[
          styles.conversationListContent,
          !messages.length && styles.conversationListContentEmpty,
        ]}
        ListEmptyComponent={empty}
        ListHeaderComponent={
          feed?.has_more ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load earlier conversation messages"
              onPress={onLoadMore}
              style={({ pressed }) => [
                styles.conversationLoadEarlier,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="time-outline" size={14} color={colors.primary} />
              <Text style={styles.conversationLoadEarlierText}>
                Load earlier · {Math.max(0, feed.total - messages.length)} remaining
              </Text>
            </Pressable>
          ) : null
        }
        ListFooterComponent={
          working ? (
            <View style={styles.conversationWorking}>
              <ActivityIndicator size="small" color={colors.green} />
              <Text style={styles.conversationWorkingText}>Agent is working</Text>
            </View>
          ) : optimisticActivity === 'sending' ||
            optimisticActivity === 'forcing' ? (
            <View style={styles.conversationWorking}>
              <ActivityIndicator size="small" color={colors.amber} />
              <Text style={styles.conversationActivityText}>
                {optimisticActivity === 'forcing'
                  ? 'Forcing queued message…'
                  : 'Sending message…'}
              </Text>
            </View>
          ) : optimisticActivity === 'queued' ? (
            <View style={styles.conversationWorking}>
              <Icon name="time-outline" size={15} color={colors.amber} />
              <Text style={styles.conversationActivityText}>
                Queued · tap the flash to send now
              </Text>
            </View>
          ) : online ? (
            <View style={styles.conversationWorking}>
              <Icon name="checkmark-circle-outline" size={15} color={colors.green} />
              <Text style={styles.conversationWorkingText}>Agent ready</Text>
            </View>
          ) : null
        }
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, index * averageItemLength),
            animated: false,
          });
          requestAnimationFrame(() => {
            if (stickToLatestRef.current) scrollToLatest(false);
          });
        }}
        onContentSizeChange={() => {
          if (!settlingRef.current && !stickToLatestRef.current) return;
          // Growing content during a gesture must not steal the scroll either.
          if (!settlingRef.current && userDragRef.current) return;
          scrollToLatest(false);
          if (settlingRef.current) {
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            settleTimerRef.current = setTimeout(
              () => setSettlingState(false),
              SETTLE_QUIET_MS,
            );
          }
        }}
        onScroll={(event) => {
          if (settlingRef.current) return;
          const nextAtLatest = distanceFromBottom(event) < AT_LATEST_SLACK;
          setAtLatest(nextAtLatest);
          // Release stickiness the moment a finger moves away from the bottom,
          // rather than waiting for the gesture to end: a poll that lands in
          // between would otherwise still count the list as pinned.
          if (userDragRef.current) stickToLatestRef.current = nextAtLatest;
        }}
        onScrollBeginDrag={() => {
          if (dragTimerRef.current) {
            clearTimeout(dragTimerRef.current);
            dragTimerRef.current = null;
          }
          userDragRef.current = true;
        }}
        onScrollEndDrag={(event) => applyUserScroll(event, true)}
        onMomentumScrollEnd={(event) => applyUserScroll(event, false)}
        scrollEventThrottle={80}
      />
      {!atLatest && messages.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jump to latest conversation message"
          onPress={() => {
            stickToLatestRef.current = true;
            setAtLatest(true);
            scrollToLatest(true);
          }}
          style={({ pressed }) => [
            styles.conversationLatest,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="arrow-down" size={15} color="#211a4a" />
          <Text style={styles.conversationLatestText}>Latest</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
