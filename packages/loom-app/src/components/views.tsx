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
import { useState } from 'react';

import { projectLabel } from '../loomClient';
import { markdownStyles, styles } from '../styles';
import { colors } from '../theme';
import type { LoomProject, TaskDetail, TaskDiff } from '../types';
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
            contentContainerStyle={styles.projectModalList}
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

export function DiffPatch({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = content.length > DIFF_PREVIEW_LIMIT;
  const visibleContent = expanded ? content : content.slice(0, DIFF_PREVIEW_LIMIT);

  return (
    <View style={styles.patchShell}>
      <View style={styles.patch}>
        <Text selectable style={styles.patchText}>
          {visibleContent}
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


export function ChangesView({ diff }: { diff: TaskDiff | null }) {
  const worktrees = diff?.worktrees || [];
  const files = worktrees.flatMap((worktree) =>
    (worktree.files || []).map((file) => ({ worktree, file })),
  );
  const errors = worktrees.filter((worktree) => worktree.error);

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
          {files.map(({ worktree, file }, index) => (
            <View key={`${worktree.path || 'worktree'}:${file.path}:${index}`} style={styles.diffFile}>
              <View style={styles.diffFileHeader}>
                <View style={styles.diffFileName}>
                  <Icon name="document-text-outline" size={16} color={colors.textMuted} />
                  <Text numberOfLines={1} style={styles.diffPath}>
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
              </View>
              {(file.patch || file.diff) && (
                <DiffPatch content={file.patch || file.diff || ''} />
              )}
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
        <View style={styles.markdownDocument}>
          <Markdown mergeStyle style={markdownStyles}>
            {content}
          </Markdown>
        </View>
      )}
    </SectionCard>
  );
}

export function NotesView({ detail }: { detail: TaskDetail | null }) {
  const documents: Array<{ name: string; content: string }> = [];
  const seen = new Set<string>();

  for (const [name, content] of Object.entries(detail?.templates || {})) {
    if (!content) continue;
    documents.push({ name, content });
    seen.add(name.toLowerCase());
  }
  for (const file of detail?.task_markdown_files || []) {
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


