import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import {
  canConfigureStages,
  isDuplicateStageName,
  isUncertainOutcome,
  isValidText,
  moveStageId,
  sortedStages,
  STAGE_LIMIT,
  STAGE_NAME_MAX,
  uuidv7,
  type Stage,
  type StageList,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { useBusiness } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { ActionError, ActionPanel } from '@/features/orders/action-panel';
import { useCreateStage, useOrderStages, useRenameStage, useReorderStages, useRetireStage } from '@/features/orders/queries';

/** Vendor stack `stages`: custom order stage configuration (mirrors web /vendor/settings/stages). */
export function StageSettingsScreen() {
  const t = useT('ordStages');
  const { account } = useBusiness();
  const stages = useOrderStages();
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {stages.isError ? (
        <ErrorState error={stages.error} onRetry={() => void stages.refetch()} />
      ) : stages.isPending ? (
        <LoadingState />
      ) : (
        <Editor list={stages.data} editable={canConfigureStages(account.role)} />
      )}
    </>
  );
}

function Editor({ list, editable }: { list: StageList; editable: boolean }) {
  const t = useT('ordStages');
  const ts = useT('ordState');
  const ordered = sortedStages(list);
  const reorder = useReorderStages();
  const retire = useRetireStage();
  const [retiring, setRetiring] = useState<Stage | null>(null);
  const move = (index: number, delta: -1 | 1) =>
    reorder.mutate({ expectedRevision: list.revision, stageIds: moveStageId(ordered.map((s) => s.id), index, delta) });

  return (
    <FormScreen>
      <AppText className="text-sm text-muted-foreground">{t('description', { accepted: ts('ACCEPTED') })}</AppText>
      {!editable && <AppText className="text-sm text-muted-foreground">{t('readOnly')}</AppText>}
      {retiring && (
        <ActionPanel
          destructive
          title={t('retireTitle', { name: retiring.name })}
          description={t('retireDescription')}
          confirmLabel={t('retire')}
          pending={retire.isPending}
          error={retire.error}
          onBack={() => {
            setRetiring(null);
            retire.reset();
          }}
          onConfirm={() => retire.mutate({ stageId: retiring.id, expectedRevision: retiring.revision }, { onSuccess: () => setRetiring(null) })}
        />
      )}
      <Card>
        <CardHeader title={t('title')} />
        {ordered.length === 0 && <AppText className="text-sm text-muted-foreground">{t('empty')}</AppText>}
        {ordered.map((s, i) => (
          <StageRow
            key={s.id}
            stage={s}
            stages={ordered}
            editable={editable}
            first={i === 0}
            last={i === ordered.length - 1}
            moving={reorder.isPending}
            onMove={(d) => move(i, d)}
            onRetire={() => setRetiring(s)}
          />
        ))}
        <ActionError error={reorder.error} />
      </Card>
      {editable && <NewStage stages={ordered} />}
    </FormScreen>
  );
}

function StageRow({
  stage,
  stages,
  editable,
  first,
  last,
  moving,
  onMove,
  onRetire,
}: {
  stage: Stage;
  stages: Stage[];
  editable: boolean;
  first: boolean;
  last: boolean;
  moving: boolean;
  onMove: (d: -1 | 1) => void;
  onRetire: () => void;
}) {
  const t = useT('ordStages');
  const tc = useT('common');
  const rename = useRenameStage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const duplicate = isDuplicateStageName(stages, name, stage.id);
  const valid = isValidText(name, STAGE_NAME_MAX) && !duplicate;

  return (
    <View className="gap-2 border-t border-border pt-3">
      <View className="flex-row items-center justify-between gap-2">
        <AppText weight={stage.state === 'ACTIVE' ? 'medium' : 'regular'} className={`flex-1 text-sm ${stage.state === 'ACTIVE' ? 'text-foreground' : 'text-muted-foreground'}`}>
          {stage.name}
        </AppText>
        <Badge variant={stage.state === 'ACTIVE' ? 'success' : 'secondary'}>{t(stage.state)}</Badge>
      </View>
      {editing ? (
        <View className="gap-2">
          <Input accessibilityLabel={t('nameOf', { name: stage.name })} value={name} onChangeText={setName} autoFocus />
          {duplicate && <AppText className="text-xs text-destructive">{t('duplicate')}</AppText>}
          <ActionError error={rename.error} />
          <View className="flex-row gap-2">
            <Button
              size="sm"
              variant="outline"
              onPress={() => {
                setEditing(false);
                setName(stage.name);
                rename.reset();
              }}>
              {t('cancelEdit')}
            </Button>
            <Button
              size="sm"
              loading={rename.isPending}
              disabled={!valid}
              onPress={() =>
                name.trim() === stage.name
                  ? setEditing(false)
                  : rename.mutate({ stageId: stage.id, expectedRevision: stage.revision, name }, { onSuccess: () => setEditing(false) })
              }>
              {t('saveName')}
            </Button>
          </View>
        </View>
      ) : editable ? (
        <View className="flex-row flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={first || moving} accessibilityLabel={t('moveUp', { name: stage.name })} onPress={() => onMove(-1)}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" disabled={last || moving} accessibilityLabel={t('moveDown', { name: stage.name })} onPress={() => onMove(1)}>
            ↓
          </Button>
          <Button size="sm" variant="outline" accessibilityLabel={t('rename', { name: stage.name })} onPress={() => setEditing(true)}>
            {tc('edit')}
          </Button>
          {stage.state === 'ACTIVE' && (
            <Button size="sm" variant="destructive" accessibilityLabel={t('retireAria', { name: stage.name })} onPress={onRetire}>
              {t('retire')}
            </Button>
          )}
        </View>
      ) : null}
    </View>
  );
}

function NewStage({ stages }: { stages: Stage[] }) {
  const t = useT('ordStages');
  const tc = useT('common');
  const create = useCreateStage();
  const [name, setName] = useState('');
  const [intent, setIntent] = useState<{ id: string; name: string } | null>(null);
  const full = stages.length >= STAGE_LIMIT;
  const duplicate = isDuplicateStageName(stages, name);
  const valid = isValidText(name, STAGE_NAME_MAX) && !duplicate && !full;

  const submit = () => {
    if (!valid || create.isPending) return;
    const body = name.trim();
    const next = intent && intent.name === body ? intent : { id: uuidv7(), name: body };
    setIntent(next);
    create.mutate(next, {
      onSuccess: () => {
        setName('');
        setIntent(null);
      },
      onError: (e) => {
        if (!isUncertainOutcome(e)) setIntent(null);
      },
    });
  };

  return (
    <Card>
      <Field label={t('new')} description={full ? t('limitReached', { max: STAGE_LIMIT }) : duplicate ? t('duplicate') : t('limit', { max: STAGE_LIMIT })}>
        <Input placeholder={t('newPlaceholder')} value={name} onChangeText={setName} editable={!full} onSubmitEditing={submit} />
      </Field>
      <ActionError error={create.error} />
      <Button loading={create.isPending} disabled={!valid} onPress={submit}>
        {tc('add')}
      </Button>
    </Card>
  );
}
