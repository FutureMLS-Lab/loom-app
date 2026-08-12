import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { memo, useMemo, useState } from 'react';

import { projectLabel } from '../loomClient';
import { markdownStyles, styles } from '../styles';
import { colors } from '../theme';
import type { DiffFile, LoomProject, TaskDetail, TaskDiff } from '../types';
import { EmptyState, Icon, SectionCard } from './primitives';

const DIFF_PREVIEW_LIMIT = 8000;

export function ProjectPickerModal({
  visible,
  projects,
  selectedId,
  mutationBusy,
  mutationError,
  onSelect,
  onAdd,
  onRemove,
  onClose,
}: {
  visible: boolean;
  projects: LoomProject[];
  selectedId: string;
  mutationBusy: boolean;
  mutationError: string;
  onSelect: (projectId: string) => void;
  onAdd: (path: string) => Promise<boolean>;
  onRemove: (project: LoomProject) => void;
  onClose: () => void;
}) {
  const [showAddProject, setShowAddProject] = useState(false);
  const [projectPath, setProjectPath] = useState('');

  const submitProject = async () => {
    const added = await onAdd(projectPath);
    if (!added) return;
    setProjectPath('');
    setShowAddProject(false);
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.projectModalOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close project picker"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.projectModalSheet}>
          <View style={styles.projectModalHandle} />
          <View style={styles.projectModalHeader}>
            <View>
              <Text style={styles.projectModalTitle}>Projects</Text>
              <Text style={styles.projectModalSubtitle}>
                {projects.length} available workspaces
              </Text>
            </View>
            <View style={styles.projectModalHeaderActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showAddProject ? 'Hide add project form' : 'Add project'}
                disabled={mutationBusy}
                onPress={() => setShowAddProject((current) => !current)}
                style={({ pressed }) => [
                  styles.projectAddButton,
                  pressed && styles.pressed,
                  mutationBusy && styles.disabled,
                ]}
              >
                <Icon name={showAddProject ? 'remove' : 'add'} size={17} color={colors.primary} />
                <Text style={styles.projectAddButtonText}>
                  {showAddProject ? 'Cancel' : 'Add'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                style={styles.iconButton}
              >
                <Icon name="close" color={colors.text} />
              </Pressable>
            </View>
          </View>
          {showAddProject && (
            <View style={styles.projectAddPanel}>
              <Text style={styles.projectAddLabel}>Existing server-side project path</Text>
              <Text style={styles.projectAddHelp}>
                Enter a directory that exists on the machine running Loom.
              </Text>
              <View style={styles.projectAddRow}>
                <TextInput
                  value={projectPath}
                  onChangeText={setProjectPath}
                  editable={!mutationBusy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  placeholder="/home/user/project"
                  placeholderTextColor={colors.textDim}
                  style={styles.projectAddInput}
                  onSubmitEditing={() => void submitProject()}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!projectPath.trim() || mutationBusy}
                  onPress={() => void submitProject()}
                  style={({ pressed }) => [
                    styles.projectAddSubmit,
                    pressed && styles.pressed,
                    (!projectPath.trim() || mutationBusy) && styles.disabled,
                  ]}
                >
                  {mutationBusy ? (
                    <ActivityIndicator size="small" color="#211a4a" />
                  ) : (
                    <Icon name="arrow-forward" color="#211a4a" />
                  )}
                </Pressable>
              </View>
            </View>
          )}
          {mutationError ? (
            <View style={styles.projectMutationError}>
              <Icon name="warning-outline" color={colors.red} size={16} />
              <Text selectable style={styles.projectMutationErrorText}>
                {mutationError}
              </Text>
            </View>
          ) : null}
          <FlatList
            data={projects}
            keyExtractor={(project) => project.id}
            contentContainerStyle={[
              styles.projectModalList,
              !projects.length && styles.projectModalListEmpty,
            ]}
            ListEmptyComponent={
              <EmptyState
                icon="folder-open-outline"
                title="No projects yet"
                detail="Add a directory that already exists on the machine running Loom."
              />
            }
            showsVerticalScrollIndicator
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              return (
                <View
                  style={[
                    styles.projectModalRow,
                    selected && styles.projectModalRowSelected,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onSelect(item.id)}
                    style={({ pressed }) => [styles.projectModalSelect, pressed && styles.pressed]}
                  >
                    <View
                      style={[
                        styles.projectModalIcon,
                        selected && styles.projectModalIconSelected,
                      ]}
                    >
                      <Icon
                        name="folder-open-outline"
                        color={selected ? colors.primary : colors.textMuted}
                      />
                    </View>
                    <View style={styles.projectModalCopy}>
                      <Text
                        style={[
                          styles.projectModalName,
                          selected && styles.projectModalNameSelected,
                        ]}
                      >
                        {projectLabel(item)}
                      </Text>
                      <Text numberOfLines={2} style={styles.projectModalPath}>
                        {item.path}
                      </Text>
                    </View>
                    {selected && (
                      <Icon name="checkmark-circle" color={colors.primary} size={21} />
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Close project ${projectLabel(item)} without deleting files`}
                    disabled={mutationBusy}
                    onPress={() => onRemove(item)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.projectRemoveButton,
                      pressed && styles.pressed,
                      mutationBusy && styles.disabled,
                    ]}
                  >
                    <Icon name="close-circle-outline" color={colors.textDim} size={20} />
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** A task can touch dozens of files; laying every patch out at once is what
 *  makes this screen crawl, so each file opens on demand. */
function DiffFileRow({ file }: { file: DiffFile }) {
  const [open, setOpen] = useState(false);
  const patch = file.patch || file.diff || '';

  return (
    <View style={styles.diffFile}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} diff for ${file.path}`}
        disabled={!patch}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.diffFileHeader, pressed && patch && styles.pressed]}
      >
        <View style={styles.diffFileName}>
          <Icon
            name={patch ? (open ? 'chevron-down' : 'chevron-forward') : 'document-text-outline'}
            size={15}
            color={colors.textMuted}
          />
          <Text numberOfLines={1} ellipsizeMode="head" style={styles.diffPath}>
            {file.path}
          </Text>
        </View>
        <View style={styles.diffStats}>
          {typeof file.additions === 'number' && (
            <Text style={styles.additions}>+{file.additions}</Text>
          )}
          {typeof file.deletions === 'number' && (
            <Text style={styles.deletions}>−{file.deletions}</Text>
          )}
          {file.status && <Text style={styles.diffStatus}>{file.status}</Text>}
        </View>
      </Pressable>
      {open && patch ? <DiffPatch content={patch} /> : null}
    </View>
  );
}

function diffLineStyle(line: string) {
  if (line.startsWith('+++') || line.startsWith('---')) return styles.patchMeta;
  if (line.startsWith('@@')) return styles.patchHunk;
  if (line.startsWith('+')) return styles.patchAdded;
  if (line.startsWith('-')) return styles.patchRemoved;
  if (line.startsWith('diff ') || line.startsWith('index ')) return styles.patchMeta;
  return undefined;
}

export function DiffPatch({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = content.length > DIFF_PREVIEW_LIMIT;
  const visibleContent = expanded ? content : content.slice(0, DIFF_PREVIEW_LIMIT);

  return (
    <View style={styles.patchShell}>
      <View style={styles.patch}>
        <Text selectable style={styles.patchText}>
          {/* Colouring the gutter is what makes a diff readable at a glance. */}
          {visibleContent.split('\n').map((line, index) => (
            <Text key={index} style={diffLineStyle(line)}>
              {line}
              {'\n'}
            </Text>
          ))}
        </Text>
      </View>
      {truncated && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((current) => !current)}
          style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
        >
          <Icon name={expanded ? 'chevron-up' : 'expand-outline'} size={15} color={colors.primary} />
          <Text style={styles.expandButtonText}>
            {expanded ? 'Collapse diff' : `Show complete diff (${content.length.toLocaleString()} characters)`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}


function worktreeLabel(path?: string): string {
  const parts = (path || '').replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || 'worktree';
}

export function ChangesView({ diff }: { diff: TaskDiff | null }) {
  const worktrees = diff?.worktrees || [];
  const files = worktrees.flatMap((worktree) =>
    (worktree.files || []).map((file) => ({ worktree, file })),
  );
  const errors = worktrees.filter((worktree) => worktree.error);
  // A task can span several repos; without the grouping the same file name
  // from two worktrees is indistinguishable.
  const grouped = worktrees.filter((worktree) => (worktree.files || []).length);
  const showGroups = grouped.length > 1;

  return (
    <SectionCard
      title="Code changes"
      icon="git-compare-outline"
      action={files.length ? <Text style={styles.sectionMeta}>{files.length} files</Text> : undefined}
    >
      {!files.length && !errors.length ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Working tree is clean"
          detail="Changes made by the agent will appear here."
        />
      ) : (
        <View style={styles.diffList}>
          {errors.map((worktree, index) => (
            <View key={`${worktree.path || 'worktree'}:error:${index}`} style={styles.inlineError}>
              <Icon name="warning-outline" color={colors.red} />
              <View style={styles.inlineErrorCopy}>
                <Text numberOfLines={2} style={styles.inlineErrorTitle}>
                  {worktree.path || 'Worktree'}
                </Text>
                <Text selectable style={styles.inlineErrorText}>
                  {worktree.error}
                </Text>
              </View>
            </View>
          ))}
          {grouped.map((worktree) => (
            <View key={worktree.path || worktreeLabel(worktree.path)}>
              {showGroups ? (
                <View style={styles.diffGroupHeader}>
                  <Text numberOfLines={1} style={styles.diffGroupName}>
                    {worktreeLabel(worktree.path)}
                  </Text>
                  <Text numberOfLines={1} style={styles.diffGroupMeta}>
                    {worktree.branch
                      ? `${worktree.branch}${worktree.base ? ` → ${worktree.base}` : ''}`
                      : ''}
                  </Text>
                  <Text style={styles.diffGroupCount}>
                    {(worktree.files || []).length}
                  </Text>
                </View>
              ) : null}
              {(worktree.files || []).map((file, index) => (
                <DiffFileRow
                  key={`${worktree.path || 'worktree'}:${file.path}:${index}`}
                  file={file}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

export function MarkdownDocument({
  name,
  content,
}: {
  name: string;
  content: string;
}) {
  const [showSource, setShowSource] = useState(false);

  return (
    <SectionCard
      title={name}
      icon="reader-outline"
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showSource ? `Preview ${name}` : `View ${name} source`}
          onPress={() => setShowSource((current) => !current)}
          style={({ pressed }) => [styles.markdownModeButton, pressed && styles.pressed]}
        >
          <Icon
            name={showSource ? 'reader-outline' : 'code-slash-outline'}
            size={14}
            color={colors.primary}
          />
          <Text style={styles.markdownModeButtonText}>
            {showSource ? 'Preview' : 'Source'}
          </Text>
        </Pressable>
      }
    >
      {showSource ? (
        <Text selectable style={styles.notesSourceText}>
          {content}
        </Text>
      ) : (
        <MarkdownBody content={content} />
      )}
    </SectionCard>
  );
}

const MarkdownBody = memo(function MarkdownBody({ content }: { content: string }) {
  return (
    <View style={styles.markdownDocument}>
      <Markdown mergeStyle style={markdownStyles}>
        {content}
      </Markdown>
    </View>
  );
});

export function collectTaskDocuments(
  detail: TaskDetail | null,
): Array<{ name: string; content: string }> {
  const documents: Array<{ name: string; content: string }> = [];
  const seen = new Set<string>();

  for (const [name, content] of Object.entries(detail?.templates || {})) {
    if (!content) continue;
    documents.push({ name, content });
    seen.add(name.toLowerCase());
  }
  for (const file of detail?.task_markdown_files || []) {
    if (typeof file === 'string') continue;
    if (!file.content || seen.has(file.name.toLowerCase())) continue;
    documents.push({ name: file.name, content: file.content });
    seen.add(file.name.toLowerCase());
  }
  documents.sort((left, right) => {
    const rank = (name: string) => {
      const normalized = name.toLowerCase();
      if (normalized === 'plan.md') return 0;
      if (normalized === 'wiki.md') return 1;
      return 2;
    };
    return rank(left.name) - rank(right.name) || left.name.localeCompare(right.name);
  });
  return documents;
}

/** Re-parsing markdown on every task poll is what makes the pane stutter. */
const PlanPeekBody = memo(function PlanPeekBody({ content }: { content: string }) {
  return (
    <View style={styles.planPeekBody}>
      <Markdown mergeStyle style={planPeekMarkdownStyles}>
        {content}
      </Markdown>
    </View>
  );
});

/** Compact PLAN.md strip under the terminal, matching Loom web interview layout. */
export function PlanPeek({
  detail,
  open = true,
  onToggle,
}: {
  detail: TaskDetail | null;
  open?: boolean;
  onToggle?: () => void;
}) {
  const plan = useMemo(() => {
    const documents = collectTaskDocuments(detail);
    return documents.find((doc) => doc.name.toLowerCase() === 'plan.md') || documents[0];
  }, [detail]);

  return (
    <View style={styles.planPeek}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Collapse plan' : 'Expand plan'}
        onPress={onToggle}
        style={({ pressed }) => [styles.planPeekBar, pressed && styles.pressed]}
      >
        <Text style={styles.planPeekTitle}>{plan?.name || 'PLAN.md'}</Text>
        <Text style={styles.planPeekHint}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open ? (
        plan?.content ? (
          <PlanPeekBody content={plan.content} />
        ) : (
          <Text style={styles.planPeekEmpty}>
            PLAN.md will appear here once the agent writes it.
          </Text>
        )
      ) : null}
    </View>
  );
}

const planPeekMarkdownStyles = StyleSheet.create({
  ...markdownStyles,
  body: {
    ...markdownStyles.body,
    color: '#4a4036',
    fontSize: 12,
    lineHeight: 18,
  },
  heading1: {
    ...markdownStyles.heading1,
    color: '#3f3428',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 8,
  },
  heading2: {
    ...markdownStyles.heading2,
    color: '#3f3428',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 6,
  },
  heading3: {
    ...markdownStyles.heading3,
    color: '#4a4036',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 4,
  },
  paragraph: { marginTop: 0, marginBottom: 8 },
  bullet_list: { marginBottom: 6 },
  ordered_list: { marginBottom: 6 },
  list_item: { marginBottom: 2 },
  code_inline: {
    backgroundColor: 'rgba(120, 90, 40, 0.08)',
    color: '#6b5b43',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 11,
  },
  fence: {
    backgroundColor: 'rgba(120, 90, 40, 0.06)',
    color: '#4a4036',
    borderRadius: 8,
    padding: 8,
    fontSize: 11,
    marginBottom: 8,
  },
});

export function NotesView({ detail }: { detail: TaskDetail | null }) {
  const documents = collectTaskDocuments(detail);

  if (!documents.length) {
    return (
      <SectionCard title="Task notes" icon="reader-outline">
        <EmptyState
          icon="reader-outline"
          title="No notes yet"
          detail="PLAN.md, WIKI.md, and other task documents from Loom will appear here."
        />
      </SectionCard>
    );
  }

  return (
    <View style={styles.contentStack}>
      {documents.map((document) => (
        <MarkdownDocument
          key={document.name}
          name={document.name}
          content={document.content}
        />
      ))}
    </View>
  );
}


