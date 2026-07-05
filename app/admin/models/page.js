'use client';

import PageHead from '@/components/PageHead';

import { useEffect, useCallback } from 'react';
import { RefreshCw } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from '@/components/icons';

import { useErrorLogs } from './hooks/useErrorLogs';
import { useEndpoints } from './hooks/useEndpoints';
import { useRoundRobin } from './hooks/useRoundRobin';
import { useModelConfig } from './hooks/useModelConfig';
import { PresetUrlSettings } from './components/PresetUrlSettings';
import { CategoryPanel } from './components/CategoryPanel';
import { ModelCard } from './components/ModelCard';
import { ModelForm } from './components/ModelForm';
import { ErrorLogsPanel } from './components/ErrorLogsPanel';
import { UsageGuide } from './components/UsageGuide';

// Tooltip component
const Tooltip = ({ text, children }) => (
  <div className='relative group'>
    {children}
    <div className='absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2 bg-card text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10'>
      {text}
      <div className='absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-foreground'></div>
    </div>
  </div>
);

// Draggable model item wrapper
function SortableModelItem({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className='flex items-center gap-1'>
      <div
        {...attributes}
        {...listeners}
        className='cursor-grab p-4 text-muted-foreground hover:text-foreground touch-none'
      >
        <GripVertical size={18} />
      </div>
      <div className='flex-grow'>{children}</div>
    </div>
  );
}

export default function ModelsPage() {
  const { t } = useTranslation();
  const { isReadOnly } = useAdminAuth();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Hooks
  const errorLogsHook = useErrorLogs();

  const endpointsHook = useEndpoints();
  const {
    endpoints,
    selectedEndpoint,
    setSelectedEndpoint,
    availableModels,
    setAvailableModels,
    modelsLoading,
    manualPresetBaseUrl,
    setManualPresetBaseUrl,
    manualPresetApiBase,
    setManualPresetApiBase,
    savingPresetSettings,
    buildManualPreset,
    fetchEndpointsFromSettings,
    fetchAvailableModels,
    saveManualPresetSettings,
  } = endpointsHook;

  const modelConfigHook = useModelConfig({ endpoints });
  const {
    modelConfig,
    loading,
    savingSection,
    savingCategory,
    editingModel,
    setEditingModel,
    showAddForm,
    setShowAddForm,
    editingCategory,
    setEditingCategory,
    newModel,
    setNewModel,
    editForm,
    setEditForm,
    modelRoundRobinMap,
    modelLabelRoundRobinMap,
    fetchModelConfig,
    saveCategoryOrder,
    handleCategoryLabelChange,
    handleDragEnd,
    addModel,
    startEditing,
    saveEdit,
    deleteModel,
    copyModel,
    setDefaultModel,
  } = modelConfigHook;

  const roundRobinHook = useRoundRobin({
    modelConfig,
    editForm,
    editingModel,
    newModel,
    modelLabelRoundRobinMap,
  });
  const {
    roundRobinInfo,
    checkingRoundRobin,
    newModelRoundRobinInfo,
    checkingNewModelRoundRobin,
    labelRoundRobinInfo,
    newModelLabelRoundRobinInfo,
    getLabelInfoForModel,
    getFirstModelInRoundRobinGroup,
  } = roundRobinHook;

  // Handle model select focus for add/edit forms
  const handleModelSelectFocus = useCallback(() => {
    if (
      newModel.endpoint &&
      (!selectedEndpoint || selectedEndpoint !== newModel.endpoint)
    ) {
      setSelectedEndpoint(newModel.endpoint);
    } else if (selectedEndpoint && availableModels.length === 0) {
      fetchAvailableModels();
    }
  }, [newModel.endpoint, selectedEndpoint, availableModels.length, setSelectedEndpoint, fetchAvailableModels]);

  const handleEditModelSelectFocus = useCallback(() => {
    if (
      editForm.endpoint === 'manual' ||
      (editForm.endpoint && (!selectedEndpoint || selectedEndpoint !== editForm.endpoint))
    ) {
      setSelectedEndpoint(editForm.endpoint);
    } else if (selectedEndpoint && availableModels.length === 0) {
      fetchAvailableModels();
    }
  }, [editForm.endpoint, selectedEndpoint, availableModels.length, setSelectedEndpoint, fetchAvailableModels]);

  // Set default endpoint when add form opens
  useEffect(() => {
    if (showAddForm.show && showAddForm.category && endpoints.length > 0) {
      const defaultEndpoint = endpoints[0].url;
      setNewModel((m) => {
        if (!m.endpoint) return { ...m, endpoint: defaultEndpoint };
        return m;
      });
      if (!selectedEndpoint) {
        setSelectedEndpoint(defaultEndpoint);
      }
    }
  }, [showAddForm.show, showAddForm.category, endpoints, selectedEndpoint, setNewModel, setSelectedEndpoint]);

  // Initial data load
  useEffect(() => {
    fetchModelConfig();
    fetchEndpointsFromSettings();
    errorLogsHook.fetchErrorLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchModelConfig, fetchEndpointsFromSettings]);

  if (loading)
    return (
      <div className='flex items-center justify-center min-h-96'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
      </div>
    );
  if (!modelConfig)
    return (
      <div className='text-center text-muted-foreground'>
        {t('admin_models.cannot_load_config')}
      </div>
    );

  return (
    <div className='space-y-6'>
      <PageHead
        eyebrow='모델'
        title={t('admin.models')}
        sub={t('admin_models.page_description')}
      />

      {/* Preset URL settings */}
      <PresetUrlSettings
        manualPresetBaseUrl={manualPresetBaseUrl}
        manualPresetApiBase={manualPresetApiBase}
        onBaseUrlChange={setManualPresetBaseUrl}
        onApiBaseChange={setManualPresetApiBase}
        onSave={saveManualPresetSettings}
        saving={savingPresetSettings}
        t={t}
      />

      {/* LLM model section */}
      <div className='space-y-4'>
        <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
          <div className='flex items-center justify-between mb-4'>
            <div>
              <h2 className='text-xl font-semibold text-foreground'>
                {t('admin_models.llm_model_settings')}
              </h2>
              <p className='text-sm text-muted-foreground mt-1'>
                {t('admin_models.drag_to_reorder')}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <button
                onClick={fetchAvailableModels}
                disabled={modelsLoading}
                className='px-3 py-2 text-sm font-medium rounded-lg bg-card border border-border text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5'
              >
                <RefreshCw
                  className={`h-4 w-4 ${modelsLoading ? 'animate-spin' : ''}`}
                />
                {modelsLoading ? t('admin_models.loading') : t('admin_models.refresh')}
              </button>
            </div>
          </div>
        </div>

        <div className='grid gap-6 lg:grid-cols-2'>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            {Object.entries(modelConfig.categories).map(
              ([categoryKey, category]) => (
                <CategoryPanel
                  key={categoryKey}
                  categoryKey={categoryKey}
                  category={category}
                  editingCategory={editingCategory}
                  setEditingCategory={setEditingCategory}
                  onCategoryLabelChange={handleCategoryLabelChange}
                  onSaveCategoryOrder={saveCategoryOrder}
                  savingCategory={savingCategory}
                  onAddModel={(key) =>
                    setShowAddForm({ category: key, show: true })
                  }
                  t={t}
                >
                  <SortableContext
                    items={category.models.map(
                      (_, idx) => `${categoryKey}-${idx}`
                    )}
                    strategy={verticalListSortingStrategy}
                    id={categoryKey}
                  >
                    <div className='space-y-3'>
                      {category.models.map((model, modelIndex) => {
                        const labelInfo = getLabelInfoForModel(
                          model,
                          categoryKey,
                          modelIndex
                        );
                        const isLabelRoundRobin = Boolean(labelInfo);
                        const isEditing =
                          editingModel?.category === categoryKey &&
                          editingModel?.index === modelIndex;

                        return (
                          <SortableModelItem
                            key={`${categoryKey}-${model.id}-${modelIndex}`}
                            id={`${categoryKey}-${modelIndex}`}
                          >
                            <div
                              className={`p-4 rounded-lg border ${
                                isLabelRoundRobin
                                  ? 'bg-muted border-border dark:border-border'
                                  : 'bg-muted border-border'
                              }`}
                            >
                              {isEditing ? (
                                <ModelForm
                                  mode='edit'
                                  formData={editForm}
                                  onFormChange={(patch) =>
                                    setEditForm((prev) => ({ ...prev, ...patch }))
                                  }
                                  onSave={() => saveEdit(getFirstModelInRoundRobinGroup)}
                                  onCancel={() => setEditingModel(null)}
                                  endpoints={endpoints}
                                  availableModels={availableModels}
                                  setAvailableModels={setAvailableModels}
                                  modelsLoading={modelsLoading}
                                  roundRobinInfo={roundRobinInfo}
                                  labelRoundRobinInfo={labelRoundRobinInfo}
                                  checkingRoundRobin={checkingRoundRobin}
                                  buildManualPreset={buildManualPreset}
                                  modelLabelRoundRobinMap={modelLabelRoundRobinMap}
                                  getFirstModelInRoundRobinGroup={getFirstModelInRoundRobinGroup}
                                  onModelSelectFocus={handleEditModelSelectFocus}
                                  selectedEndpoint={selectedEndpoint}
                                  setSelectedEndpoint={setSelectedEndpoint}
                                  modelConfig={modelConfig}
                                  editingModel={editingModel}
                                  loading={loading}
                                  t={t}
                                />
                              ) : (
                                <ModelCard
                                  model={model}
                                  categoryKey={categoryKey}
                                  modelIndex={modelIndex}
                                  labelInfo={labelInfo}
                                  modelRoundRobinMap={modelRoundRobinMap}
                                  onEdit={startEditing}
                                  onCopy={copyModel}
                                  onDelete={deleteModel}
                                  onSetDefault={setDefaultModel}
                                  t={t}
                                />
                              )}
                            </div>
                          </SortableModelItem>
                        );
                      })}

                      {category.models.length === 0 && (
                        <div className='text-center py-10 text-muted-foreground'>
                          <div className='text-4xl mb-2'>📦</div>
                          <p className='text-sm font-medium'>
                            {t('admin_models.no_models_registered')}
                          </p>
                          <p className='text-xs mt-1'>
                            {t('admin_models.click_add_model_button')}
                          </p>
                        </div>
                      )}
                    </div>
                  </SortableContext>

                  {showAddForm.show && showAddForm.category === categoryKey && (
                    <ModelForm
                      mode='add'
                      formData={newModel}
                      onFormChange={(patch) =>
                        setNewModel((prev) => ({ ...prev, ...patch }))
                      }
                      onSave={() => addModel(categoryKey, getFirstModelInRoundRobinGroup)}
                      onCancel={() => {
                        setShowAddForm({ category: null, show: false });
                        setNewModel({
                          id: '',
                          label: '',
                          tooltip: '',
                          isDefault: false,
                          adminOnly: false,
                          visible: true,
                          systemPrompt: [],
                          endpoint: '',
                        });
                      }}
                      endpoints={endpoints}
                      availableModels={availableModels}
                      setAvailableModels={setAvailableModels}
                      modelsLoading={modelsLoading}
                      roundRobinInfo={newModelRoundRobinInfo}
                      labelRoundRobinInfo={newModelLabelRoundRobinInfo}
                      checkingRoundRobin={checkingNewModelRoundRobin}
                      buildManualPreset={buildManualPreset}
                      modelLabelRoundRobinMap={modelLabelRoundRobinMap}
                      getFirstModelInRoundRobinGroup={getFirstModelInRoundRobinGroup}
                      onModelSelectFocus={handleModelSelectFocus}
                      selectedEndpoint={selectedEndpoint}
                      setSelectedEndpoint={setSelectedEndpoint}
                      modelConfig={modelConfig}
                      editingModel={null}
                      loading={loading}
                      t={t}
                    />
                  )}
                </CategoryPanel>
              )
            )}
          </DndContext>
        </div>
      </div>

      {/* Usage guide */}
      <UsageGuide t={t} />

      {/* Error logs */}
      <ErrorLogsPanel
        errorLogs={errorLogsHook.errorLogs}
        errorLogsTotal={errorLogsHook.errorLogsTotal}
        errorLogsLoading={errorLogsHook.errorLogsLoading}
        errorLogsSource={errorLogsHook.errorLogsSource}
        errorLogsLevel={errorLogsHook.errorLogsLevel}
        setErrorLogsSource={errorLogsHook.setErrorLogsSource}
        setErrorLogsLevel={errorLogsHook.setErrorLogsLevel}
        fetchErrorLogs={errorLogsHook.fetchErrorLogs}
        formatLogTime={errorLogsHook.formatLogTime}
        t={t}
      />
    </div>
  );
}
