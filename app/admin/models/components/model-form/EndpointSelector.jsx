import { normalizeJsonString } from '../../model-utils';
import {
  applyEndpointSelection,
  formatEndpointOption,
} from '../model-form-helpers.mjs';

function ManualApiConfig({ formData, onFormChange, buildManualPreset, t }) {
  return (
    <div className='mt-3 p-4 bg-muted rounded-lg border border-border'>
      <div className='mb-4'>
        <p className='text-xs font-medium text-foreground mb-2'>
          {t('admin_models.apply_preset')}
        </p>
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            onClick={() => onFormChange({ apiConfig: buildManualPreset('openai-compatible') })}
            className='px-2 py-1 text-xs rounded bg-card border border-border hover:bg-accent'
          >
            OpenAI Compatible
          </button>
          <button
            type='button'
            onClick={() => onFormChange({ apiConfig: buildManualPreset('responses') })}
            className='px-2 py-1 text-xs rounded bg-card border border-border hover:bg-accent'
          >
            Responses
          </button>
        </div>
      </div>
      <div className='mb-4'>
        <label className='block text-sm font-medium text-foreground mb-2'>
          {t('admin_models.api_key_label')}
        </label>
        <input
          type='text'
          value={formData.apiKey || ''}
          onChange={(event) => onFormChange({ apiKey: event.target.value })}
          placeholder={t('admin_models.placeholder_api_key')}
          className='w-full px-3 py-2 text-sm bg-card border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-transparent'
        />
        <p className='text-xs text-muted-foreground mt-1'>
          {t('admin_models.api_key_description')}
        </p>
      </div>

      <label className='block text-sm font-medium text-foreground mb-2'>
        {t('admin_models.api_request_settings_json')}
      </label>
      <p className='text-xs text-muted-foreground mb-2'>
        {t('admin_models.api_request_description')}
      </p>
      <textarea
        value={formData.apiConfig || ''}
        onChange={(event) => onFormChange({ apiConfig: event.target.value })}
        onBlur={(event) => {
          const normalized = normalizeJsonString(event.target.value);
          if (normalized !== event.target.value) {
            onFormChange({ apiConfig: normalized });
          }
        }}
        className='w-full h-64 px-3 py-2 text-xs font-mono bg-card border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-transparent'
        placeholder={`{
  "method": "POST",
  "url": "https://api.openai.com/v1/chat/completions",
  "headers": {
    "Authorization": "Bearer {{OPENAI_API_KEY}}",
    "Content-Type": "application/json"
  },
  "body": {
    "model": "gpt-4",
    "messages": "{{messages}}",
    "stream": true
  },
  "stream": true,
  "responseMapping": {
    "path": "choices[0].message.content"
  }
}`}
      />
      <div className='mt-2 text-xs space-y-2'>
        <div className='p-3 bg-destructive/10 border border-destructive/20 rounded'>
          <p className='font-semibold text-destructive mb-2'>⚠️ {t('admin_models.fields_need_modification')}</p>
          <ul className='list-disc ml-5 text-destructive space-y-1'>
            <li><code className='bg-destructive/10/40 px-1 rounded'>&quot;url&quot;</code> - {t('admin_models.api_endpoint_address')}</li>
            <li><code className='bg-destructive/10/40 px-1 rounded'>&quot;model&quot;</code> - {t('admin_models.model_name_examples')}</li>
            <li><code className='bg-destructive/10/40 px-1 rounded'>&quot;responseMapping.path&quot;</code> - {t('admin_models.response_path')}</li>
          </ul>
        </div>
        <div className='text-muted-foreground'>
          <p><strong>{t('admin_models.available_variables')}</strong></p>
          <ul className='list-disc ml-5 mt-1'>
            <li><code className='bg-muted px-1 rounded'>{'{{OPENAI_API_KEY}}'}</code> - {t('admin_models.var_api_key_desc')}</li>
            <li><code className='bg-muted px-1 rounded'>{'{{messages}}'}</code> - {t('admin_models.var_messages_desc')}</li>
            <li><code className='bg-muted px-1 rounded'>{'{{message}}'}</code> - {t('admin_models.var_message_desc')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function EndpointSelector({
  formData,
  onFormChange,
  endpoints,
  availableModels,
  setAvailableModels,
  setSelectedEndpoint,
  buildManualPreset,
  t,
}) {
  return (
    <div>
      <label className='block text-xs font-medium text-foreground mb-1'>
        {t('admin_models.model_server')}
      </label>
      <select
        className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm'
        value={formData.endpoint || ''}
        onChange={(event) =>
          applyEndpointSelection({
            endpoint: event.target.value,
            apiConfig: formData.apiConfig,
            buildManualPreset,
            onFormChange,
            setAvailableModels,
            setSelectedEndpoint,
          })
        }
        required
      >
        <option value='manual'>{t('admin_models.manual_add_custom_api')}</option>
        {endpoints.map((endpoint) => (
          <option key={endpoint.url} value={endpoint.url}>
            {formatEndpointOption(endpoint)}
          </option>
        ))}
      </select>

      {formData.endpoint && formData.endpoint !== 'manual' && availableModels.length > 0 && (
        <div className='flex items-start gap-2 p-2 rounded-md bg-muted border border-border mt-2'>
          <span className='text-xs text-foreground'>
            {(() => {
              const endpoint = endpoints.find((item) => item.url === formData.endpoint);
              return endpoint?.name ? `${endpoint.name} (${endpoint.url})` : formData.endpoint;
            })()}{' '}
            {t('admin_models.models_count', { count: availableModels.length })}
            {t('admin_models.loaded')}
          </span>
        </div>
      )}

      {formData.endpoint === 'manual' && (
        <ManualApiConfig
          formData={formData}
          onFormChange={onFormChange}
          buildManualPreset={buildManualPreset}
          t={t}
        />
      )}
    </div>
  );
}
