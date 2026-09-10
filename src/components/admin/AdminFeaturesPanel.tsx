'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Badge,
  Section,
  ToggleRow,
  Select,
  Button,
  Input,
  Textarea,
} from '@/components/ui';
import { type TtsProviderId } from '@openreader/tts/provider-catalog';
import { useSharedProviders, type SharedProviderEntry } from '@/hooks/useSharedProviders';
import { queryKeys } from '@/lib/client/query-keys';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  COMPUTE_ACTIONS,
  cloneComputeLimitPolicyDocument,
  parseComputeLimitPolicyDocument,
  type ComputeAction,
  type ComputeLimitMode,
} from '@openreader/runtime-config/compute-limits';

type RuntimeConfigSource = 'json-seed' | 'env-seed' | 'admin' | 'default';

interface SettingsResponse {
  values: Record<string, unknown>;
  sources: Record<string, RuntimeConfigSource>;
}

interface ProviderOption {
  id: string;
  name: string;
  providerType: TtsProviderId;
}

type PlaybackBackgroundExtent = 'section' | 'document';

interface PlaybackBackgroundExtentOption {
  value: PlaybackBackgroundExtent;
  label: string;
  description: string;
}

const PLAYBACK_BACKGROUND_EXTENT_OPTIONS: PlaybackBackgroundExtentOption[] = [
  {
    value: 'section',
    label: 'Current section',
    description: 'Continue through the current PDF page or EPUB chapter after the client stops heartbeating.',
  },
  {
    value: 'document',
    label: 'Full document',
    description: 'Continue generating from the current position through the rest of the document.',
  },
];

const COMPUTE_ACTION_LABELS: Record<ComputeAction, string> = {
  pdf_layout: 'PDF layout analysis',
  tts_playback: 'Live TTS playback',
  tts_playback_plan: 'TTS plan creation',
  tts_playback_export: 'Audiobook assembly',
  document_preview: 'Document previews',
  document_conversion: 'Document conversion',
  account_export: 'Account export',
  tts_synthesis: 'TTS segment synthesis',
};

const COMPUTE_LIMIT_MODES: ComputeLimitMode[] = ['off', 'observe', 'enforce'];

async function fetchAdminSettings(): Promise<SettingsResponse> {
  const res = await fetch('/api/admin/settings');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as SettingsResponse;
}

async function patchAdminSettings(payload: { updates?: Record<string, unknown>; reset?: string[] }): Promise<void> {
  const res = await fetch('/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 207) throw new Error(`HTTP ${res.status}`);
}

export function AdminFeaturesPanel() {
  const queryClient = useQueryClient();
  const { data: session } = useAuthSession();
  const adminSettingsQueryKey = queryKeys.admin(session?.user?.id ?? 'no-session', 'settings');
  const { data, error } = useQuery({
    queryKey: adminSettingsQueryKey,
    queryFn: fetchAdminSettings,
    enabled: Boolean(session?.user?.id),
  });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [policyText, setPolicyText] = useState('');
  const [policyError, setPolicyError] = useState<string | null>(null);
  const { providers: sharedProviders } = useSharedProviders();

  useEffect(() => {
    if (!data) return;
    setDraft({ ...data.values });
    setPolicyText(JSON.stringify(data.values.computeLimitPolicies, null, 2));
    setPolicyError(null);
    setDirty(new Set());
  }, [data]);

  useEffect(() => {
    if (!error) return;
    console.error('[AdminFeaturesPanel] load failed:', error);
    toast.error('Failed to load site settings');
  }, [error]);

  const resetMutation = useMutation({
    mutationFn: async (key: string) => {
      await patchAdminSettings({ reset: [key] });
    },
    onSuccess: async () => {
      toast.success('Reset to env default');
      await queryClient.invalidateQueries({ queryKey: adminSettingsQueryKey });
    },
    onError: (mutationError) => {
      console.error(mutationError);
      toast.error('Reset failed');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      await patchAdminSettings({ updates });
    },
    onSuccess: async () => {
      toast.success('Settings saved');
      await queryClient.invalidateQueries({ queryKey: adminSettingsQueryKey });
    },
    onError: (mutationError) => {
      console.error(mutationError);
      toast.error('Save failed');
    },
  });

  const saving = resetMutation.isPending || saveMutation.isPending;

  const updateDraft = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty((s) => {
      const next = new Set(s);
      const baselineValue = data?.values?.[key];
      if (Object.is(value, baselineValue)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updatePositiveIntDraft = (key: string, raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    updateDraft(key, Math.max(1, Math.floor(parsed)));
  };

  const resetField = (key: string) => {
    if (saving) return;
    resetMutation.mutate(key);
  };

  const saveAll = () => {
    if (saving || dirty.size === 0) return;
    const updates: Record<string, unknown> = {};
    for (const key of dirty) updates[key] = draft[key];
    saveMutation.mutate(updates);
  };

  const discardAll = () => {
    if (!data) return;
    setDraft({ ...data.values });
    setPolicyText(JSON.stringify(data.values.computeLimitPolicies, null, 2));
    setPolicyError(null);
    setDirty(new Set());
  };

  const providerOptions = useMemo<ProviderOption[]>(() => {
    return sharedProviders.map((entry) => ({
      id: entry.slug,
      name: `${entry.displayName} (shared)`,
      providerType: entry.providerType,
    }));
  }, [sharedProviders]);

  const currentProviderId =
    typeof draft.defaultTtsProvider === 'string'
      ? draft.defaultTtsProvider
      : '';
  const currentSharedEntry: SharedProviderEntry | undefined = sharedProviders.find(
    (p) => p.slug === currentProviderId,
  );
  const fallbackShared = providerOptions[0];
  const effectiveSelectedProvider = currentSharedEntry
    ? {
      id: currentSharedEntry.slug,
      name: `${currentSharedEntry.displayName} (shared)`,
      providerType: currentSharedEntry.providerType,
    } as ProviderOption
    : fallbackShared;
  const selectedProviderOption = effectiveSelectedProvider;
  const playbackBackgroundExtentValue: PlaybackBackgroundExtent =
    draft.ttsPlaybackBackgroundExtent === 'document' ? 'document' : 'section';
  const playbackBackgroundExtentOption = PLAYBACK_BACKGROUND_EXTENT_OPTIONS.find(
    (option) => option.value === playbackBackgroundExtentValue,
  ) ?? PLAYBACK_BACKGROUND_EXTENT_OPTIONS[0];

  const handleProviderChange = (opt: ProviderOption) => {
    updateDraft('defaultTtsProvider', opt.id);
  };

  const handlePolicyChange = (raw: string) => {
    setPolicyText(raw);
    try {
      const parsed = parseComputeLimitPolicyDocument(JSON.parse(raw) as unknown);
      if (!parsed) {
        setPolicyError('The policy is incomplete or contains an invalid field or value.');
        return;
      }
      setPolicyError(null);
      updateDraft('computeLimitPolicies', parsed);
    } catch {
      setPolicyError('Enter valid JSON before saving.');
    }
  };

  const updateComputePolicy = (
    mutate: (policy: NonNullable<ReturnType<typeof parseComputeLimitPolicyDocument>>) => void,
  ) => {
    const current = parseComputeLimitPolicyDocument(draft.computeLimitPolicies);
    if (!current) return;
    const next = cloneComputeLimitPolicyDocument(current);
    mutate(next);
    const parsed = parseComputeLimitPolicyDocument(next);
    if (!parsed) return;
    setPolicyText(JSON.stringify(parsed, null, 2));
    setPolicyError(null);
    updateDraft('computeLimitPolicies', parsed);
  };

  const computePolicy = parseComputeLimitPolicyDocument(draft.computeLimitPolicies);

  const renderSource = (key: string) => {
    const source = data?.sources?.[key] ?? 'default';
    const isDirty = dirty.has(key);
    return (
      <SourceBadge
        source={source}
        dirty={isDirty}
        canReset={source !== 'default'}
        onReset={() => resetField(key)}
        saving={saving}
      />
    );
  };

  if (!data) {
    return (
      <AdminFeaturesSkeleton />
    );
  }

  return (
    <div className="space-y-4">
      <Section
        title="TTS defaults"
        subtitle="Defaults for new users."
        action={<Badge tone="foreground">Defaults</Badge>}
      >
        <div className="space-y-1.5 pb-2 border-b border-offbase">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Default TTS provider</p>
              <p className="text-xs text-muted mt-0.5">
                Starting provider for new users.
              </p>
            </div>
            <div className="shrink-0">{renderSource('defaultTtsProvider')}</div>
          </div>
          {providerOptions.length > 0 ? (
            <Select
              value={selectedProviderOption}
              onChange={handleProviderChange}
              options={providerOptions}
              getOptionKey={(option) => option.id}
              renderValue={(option) => option.name}
              renderOption={(option, { selected }) => (
                <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                  {option.name}
                </span>
              )}
              chevronClassName="h-4 w-4 text-muted"
            />
          ) : (
            <div className="px-0.5 py-2 text-sm text-muted">
              No shared providers yet. Add one first.
            </div>
          )}
        </div>

        <ToggleRow
          label="Show TTS provider settings tab"
          description="Allow per-user provider overrides."
          checked={Boolean(draft.enableTtsProvidersTab)}
          onChange={(checked) => updateDraft('enableTtsProvidersTab', checked)}
          right={renderSource('enableTtsProvidersTab')}
          variant="flat"
        />
        <ToggleRow
          label="Show all provider models"
          description="Allow model selection beyond defaults."
          checked={Boolean(draft.showAllProviderModels)}
          onChange={(checked) => updateDraft('showAllProviderModels', checked)}
          right={renderSource('showAllProviderModels')}
          variant="flat"
        />
      </Section>

      <Section
        title="Rate limiting"
        subtitle="One validated policy for every compute action, plus upload size."
        action={<Badge tone="foreground">Limits</Badge>}
      >
        <div className="space-y-2 px-0.5 py-1.5 border-b border-offbase">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Compute limit policy</p>
              <p className="text-xs text-muted mt-0.5">
                Controls admission, active work, queues, worker resources, provider capacity, and per-segment TTS usage. Use <code>off</code>, <code>observe</code>, or <code>enforce</code> per action.
              </p>
            </div>
            <div className="shrink-0">{renderSource('computeLimitPolicies')}</div>
          </div>
          {computePolicy ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {COMPUTE_ACTIONS.map((action) => {
                const actionPolicy = computePolicy.actions[action];
                const constraintCount = actionPolicy.admission.windows.length
                  + actionPolicy.admission.active.length
                  + actionPolicy.usage.length;
                return (
                  <div key={action} className="rounded-md border border-offbase bg-background px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {COMPUTE_ACTION_LABELS[action]}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {constraintCount} {constraintCount === 1 ? 'limit' : 'limits'}
                          {actionPolicy.execution
                            ? ` · ${actionPolicy.execution.maxConcurrentPerWorker} per worker`
                            : ' · soft segment threshold'}
                        </p>
                      </div>
                      <div
                        className="flex shrink-0 overflow-hidden rounded border border-offbase"
                        role="group"
                        aria-label={`${COMPUTE_ACTION_LABELS[action]} mode`}
                      >
                        {COMPUTE_LIMIT_MODES.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={actionPolicy.mode === mode}
                            className={`px-1.5 py-1 text-[10px] capitalize transition-colors ${
                              actionPolicy.mode === mode
                                ? 'bg-foreground text-background'
                                : 'bg-background text-muted hover:text-foreground'
                            }`}
                            onClick={() => updateComputePolicy((policy) => {
                              policy.actions[action].mode = mode;
                            })}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {computePolicy ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-surface-sunken px-2.5 py-2 text-[11px] text-muted">
              <span><strong className="font-medium text-foreground">Worker:</strong> {computePolicy.worker.maxExecutingPerWorker} executing</span>
              <span><strong className="font-medium text-foreground">Policy refresh:</strong> {computePolicy.worker.policyRefreshSeconds}s</span>
              <span><strong className="font-medium text-foreground">Provider:</strong> {computePolicy.providers.defaults.mode}</span>
            </div>
          ) : null}
          <p className="text-xs text-muted">
            TTS synthesis checks each uncached segment. A segment that starts below the threshold finishes in full; the next segment stops.
          </p>
          <details className="group rounded-md border border-offbase">
            <summary className="cursor-pointer select-none px-2.5 py-2 text-xs font-medium text-foreground">
              Advanced policy editor
            </summary>
            <div className="space-y-2 border-t border-offbase p-2.5">
              <p className="text-[11px] text-muted">
                Edit every admission window, active lease, usage threshold, queue, resource, worker, and provider limit. The complete document is validated before it can be saved.
              </p>
              <Textarea
                aria-label="Compute limit policy JSON"
                className="min-h-96 font-mono text-xs"
                spellCheck={false}
                value={policyText}
                onChange={(event) => handlePolicyChange(event.target.value)}
              />
              {policyError ? <p className="text-xs text-danger" role="alert">{policyError}</p> : null}
            </div>
          </details>
        </div>

        <div className="px-0.5 pt-1 pb-2 border-b border-offbase last:border-b-0">
          <div className="flex items-center gap-2.5">
            <div className="flex-1 min-w-0 space-y-0.5">
              <span className="block text-sm font-medium leading-5 text-foreground">Max upload size</span>
              <span className="block text-xs leading-4 text-muted">Largest single document upload accepted.</span>
            </div>
            <div className="shrink-0 self-start pl-1.5">{renderSource('maxUploadMb')}</div>
            <div className="shrink-0 flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                aria-label="Max upload size in megabytes"
                className="w-20 text-right"
                value={String(draft.maxUploadMb ?? '')}
                onChange={(event) => updatePositiveIntDraft('maxUploadMb', event.target.value)}
              />
              <span className="text-xs text-muted">MB</span>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="TTS playback"
        subtitle="Worker generation behavior for progressive playback."
        action={<Badge tone="foreground">Playback</Badge>}
      >
        <div className="space-y-1.5 pb-2 border-b border-offbase">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Background generation extent</p>
              <p className="text-xs text-muted mt-0.5">
                How far the worker keeps generating after playback cursor updates stop.
              </p>
            </div>
            <div className="shrink-0">{renderSource('ttsPlaybackBackgroundExtent')}</div>
          </div>
          <Select
            value={playbackBackgroundExtentOption}
            onChange={(option) => updateDraft('ttsPlaybackBackgroundExtent', option.value)}
            options={PLAYBACK_BACKGROUND_EXTENT_OPTIONS}
            getOptionKey={(option) => option.value}
            renderValue={(option) => option.label}
            renderOption={(option, { selected }) => (
              <span className="block">
                <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                  {option.label}
                </span>
                <span className="block truncate text-xs text-muted">
                  {option.description}
                </span>
              </span>
            )}
            chevronClassName="h-4 w-4 text-muted"
          />
        </div>
      </Section>

      <Section
        title="Site features"
        subtitle="Feature flags for all users."
        action={<Badge tone="foreground">Feature Flags</Badge>}
      >
        <div className="space-y-1.5 pb-2 border-b border-offbase">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Changelog feed URL</p>
              <p className="text-xs text-muted mt-0.5">
                Public URL to the changelog manifest JSON used by Settings.
              </p>
            </div>
            <div className="shrink-0">{renderSource('changelogFeedUrl')}</div>
          </div>
          <Input
            type="text"
            value={String(draft.changelogFeedUrl ?? '')}
            onChange={(event) => updateDraft('changelogFeedUrl', event.target.value)}
            placeholder="https://docs.openreader.richardr.dev/changelog/manifest.json"
          />
        </div>
        <ToggleRow
          label="Allow new account sign-ups"
          description="When off, new accounts cannot be created. Existing accounts can still sign in."
          checked={Boolean(draft.enableUserSignups)}
          onChange={(checked) => updateDraft('enableUserSignups', checked)}
          right={renderSource('enableUserSignups')}
          variant="flat"
        />
        <ToggleRow
          label="Audiobook export"
          description='Show "Export audiobook" on PDF/EPUB pages.'
          checked={Boolean(draft.enableAudiobookExport)}
          onChange={(checked) => updateDraft('enableAudiobookExport', checked)}
          right={renderSource('enableAudiobookExport')}
          variant="flat"
        />
        <ToggleRow
          label="DOCX upload conversion"
          description="Allow DOCX uploads (converted to PDF)."
          checked={Boolean(draft.enableDocxConversion)}
          onChange={(checked) => updateDraft('enableDocxConversion', checked)}
          right={renderSource('enableDocxConversion')}
          variant="flat"
        />
      </Section>

      <Section
        title="TTS upstream"
        subtitle="Server-side retry, timeout, and cache controls for TTS generation."
        action={<Badge tone="foreground">Upstream</Badge>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-0.5 py-1.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-foreground">Retry attempts</label>
              {renderSource('ttsUpstreamMaxRetries')}
            </div>
            <Input
              type="number"
              min={1}
              step={1}
              value={String(draft.ttsUpstreamMaxRetries ?? '')}
              onChange={(event) => updatePositiveIntDraft('ttsUpstreamMaxRetries', event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-foreground">Upstream timeout (ms)</label>
              {renderSource('ttsUpstreamTimeoutMs')}
            </div>
            <Input
              type="number"
              min={1}
              step={1}
              value={String(draft.ttsUpstreamTimeoutMs ?? '')}
              onChange={(event) => updatePositiveIntDraft('ttsUpstreamTimeoutMs', event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-foreground">Audio cache size (bytes)</label>
              {renderSource('ttsCacheMaxSizeBytes')}
            </div>
            <Input
              type="number"
              min={1}
              step={1}
              value={String(draft.ttsCacheMaxSizeBytes ?? '')}
              onChange={(event) => updatePositiveIntDraft('ttsCacheMaxSizeBytes', event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-foreground">Audio cache TTL (ms)</label>
              {renderSource('ttsCacheTtlMs')}
            </div>
            <Input
              type="number"
              min={1}
              step={1}
              value={String(draft.ttsCacheTtlMs ?? '')}
              onChange={(event) => updatePositiveIntDraft('ttsCacheTtlMs', event.target.value)}
            />
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {dirty.size > 0
            ? `${dirty.size} unsaved change${dirty.size === 1 ? '' : 's'}`
            : 'No unsaved changes'}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={discardAll}
            disabled={dirty.size === 0 || saving}
            variant="secondary"
            size="sm"
          >
            Discard
          </Button>
          <Button
            onClick={saveAll}
            disabled={dirty.size === 0 || saving || Boolean(policyError)}
            variant="primary"
            size="sm"
          >
            {saving ? 'Saving…' : dirty.size > 0 ? `Save (${dirty.size})` : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdminFeaturesSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-label="Loading feature settings" aria-busy="true">
      <Section
        title="TTS defaults"
        subtitle="Defaults for new users."
        action={<div className="h-4 w-16 rounded bg-offbase" />}
      >
        <div className="space-y-1.5 pb-2 border-b border-offbase">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="h-4 w-40 rounded bg-offbase" />
              <div className="h-3 w-56 rounded bg-offbase" />
            </div>
            <div className="h-5 w-20 rounded bg-offbase" />
          </div>
          <div className="h-9 w-full rounded-md bg-offbase" />
        </div>
        <div className="space-y-2">
          <div className="h-14 w-full rounded-md border border-offbase bg-background" />
          <div className="h-14 w-full rounded-md border border-offbase bg-background" />
          <div className="h-14 w-full rounded-md border border-offbase bg-background" />
        </div>
      </Section>

      <Section
        title="Site features"
        subtitle="Feature flags for all users."
        action={<div className="h-4 w-24 rounded bg-offbase" />}
      >
        <div className="space-y-2">
          <div className="h-14 w-full rounded-md border border-offbase bg-background" />
          <div className="h-14 w-full rounded-md border border-offbase bg-background" />
          <div className="h-14 w-full rounded-md border border-offbase bg-background" />
        </div>
      </Section>
    </div>
  );
}

function SourceBadge({
  source,
  dirty,
  canReset,
  onReset,
  saving,
}: {
  source: RuntimeConfigSource;
  dirty: boolean;
  canReset: boolean;
  onReset: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {canReset && !dirty && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onReset}
          disabled={saving}
          className="h-auto px-1 py-0 text-[11px] font-medium text-muted hover:text-accent"
        >
          Reset
        </Button>
      )}
      {dirty ? (
        <Badge tone="accent">Modified</Badge>
      ) : source === 'json-seed' ? (
        <Badge tone="muted">from seed</Badge>
      ) : source === 'env-seed' ? (
        <Badge tone="muted">from env</Badge>
      ) : source === 'admin' ? (
        <Badge tone="foreground">admin</Badge>
      ) : (
        <Badge tone="muted">default</Badge>
      )}
    </div>
  );
}
