'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  BarChart3,
  PieChartIcon,
  TrendingUp,
  Table,
  Coins,
  CircleHelp,
} from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

const COLORS = [
  'var(--hn-primary)',
  'var(--hn-info)',
  'var(--hn-good)',
  'var(--hn-primary-strong)',
  'var(--hn-fg-muted)',
  'var(--hn-warn)',
  'var(--hn-error)',
  'var(--hn-info-soft)',
];

// 차트 타입 토글 컴포넌트
const ChartTypeToggle = ({ currentType, onTypeChange, availableTypes }) => {
  const { t } = useTranslation();

  const typeIcons = {
    table: Table,
    bar: BarChart3,
    pie: PieChartIcon,
    line: TrendingUp,
  };

  const typeLabels = {
    table: t('analytics_charts.chart_type_table'),
    bar: t('analytics_charts.chart_type_bar'),
    pie: t('analytics_charts.chart_type_pie'),
    line: t('analytics_charts.chart_type_line'),
  };

  return (
    <div className='flex items-center gap-1 bg-muted p-1 rounded-lg'>
      {availableTypes.map((type) => {
        const Icon = typeIcons[type];
        return (
          <button
            key={type}
            onClick={() => onTypeChange(type)}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              currentType === type
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={typeLabels[type]}
          >
            <Icon className='h-3 w-3' />
            <span className='hidden sm:inline'>{typeLabels[type]}</span>
          </button>
        );
      })}
    </div>
  );
};

const TitleWithTooltip = ({ title, tooltip }) => {
  if (!tooltip) {
    return <h3 className='text-lg font-medium text-foreground'>{title}</h3>;
  }

  return (
    <span className='relative inline-flex items-center gap-1 group'>
      <h3 className='text-lg font-medium text-foreground'>{title}</h3>
      <CircleHelp className='h-4 w-4 text-muted-foreground cursor-help' />
      <span className='pointer-events-none absolute left-0 bottom-full z-10 mb-2 w-72 rounded-md bg-[var(--hn-fg)] px-3 py-2 text-xs text-[var(--hn-surface)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100'>
        {tooltip}
      </span>
    </span>
  );
};

// 사용자별 사용량 차트
export const UserStatsChart = ({ data, title, tooltip }) => {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState('table');

  const chartData =
    data?.slice(0, 10).map((user, index) => ({
      name: user.name || user.email,
      count: user.messageCount,
      avgPerDay: user.avgPerDay,
      email: user.email,
      department: user.department,
      cell: user.cell,
    })) || [];

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis />
              <Tooltip
                formatter={(value, name) => [t('analytics_charts.count_suffix', { count: value }), t('analytics_charts.message_count')]}
                labelFormatter={(label) => t('analytics_charts.user_label', { label })}
              />
              <Bar dataKey='count' fill='var(--hn-primary)' />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx='50%'
                cy='50%'
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill='var(--hn-primary)'
                dataKey='count'
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [t('analytics_charts.count_suffix', { count: value }), t('analytics_charts.message_count')]} />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis />
              <Tooltip
                formatter={(value, name) => [t('analytics_charts.count_suffix', { count: value }), t('analytics_charts.message_count')]}
                labelFormatter={(label) => t('analytics_charts.user_label', { label })}
              />
              <Line
                type='monotone'
                dataKey='count'
                stroke='var(--hn-primary)'
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      default: // table
        return (
          <div className='space-y-4'>
            {data?.slice(0, 10).map((user, index) => (
              <div key={user._id} className='flex items-center justify-between'>
                <div className='flex items-center min-w-0 flex-1'>
                  <div className='flex-shrink-0 w-8'>
                    <span className='text-sm font-medium text-muted-foreground'>
                      #{index + 1}
                    </span>
                  </div>
                  <div className='ml-3 min-w-0 flex-1'>
                    <p className='text-sm font-medium text-foreground truncate'>
                      {user.name || user.email}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {user.department} • {user.cell}
                    </p>
                  </div>
                </div>
                <div className='flex items-center'>
                  <div className='text-right mr-4'>
                    <p className='text-sm font-medium text-foreground'>
                      {t('analytics_charts.count_suffix', { count: user.messageCount })}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {t('analytics_charts.per_day_suffix', { count: user.avgPerDay != null ? Number(user.avgPerDay).toFixed(1) : '0.0' })}
                    </p>
                  </div>
                  <div className='w-16 bg-muted rounded-full h-2'>
                    <div
                      className='bg-primary h-2 rounded-full'
                      style={{
                        width: `${Math.min(
                          (user.messageCount / (data?.[0]?.messageCount || 1)) *
                            100,
                          100
                        )}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className='bg-card shadow rounded-lg p-6'>
      <div className='flex items-center justify-between mb-4'>
        <TitleWithTooltip title={title} tooltip={tooltip} />
        <ChartTypeToggle
          currentType={chartType}
          onTypeChange={setChartType}
          availableTypes={['table', 'bar', 'pie', 'line']}
        />
      </div>
      {!data || data.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>
          {t('analytics_charts.no_data')}
        </p>
      ) : (
        renderChart()
      )}
    </div>
  );
};

// 모델별 사용량 차트
export const ModelStatsChart = ({ data, title }) => {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState('table');

  const chartData =
    data?.map((model) => ({
      name: model.label || model._id || t('analytics_charts.unknown'),
      count: model.count,
      percentage: (
        (model.count / (data?.reduce((sum, m) => sum + m.count, 0) || 1)) *
        100
      ).toFixed(1),
    })) || [];

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis />
              <Tooltip
                formatter={(value, name) => [t('analytics_charts.count_suffix', { count: value }), t('analytics_charts.usage_count')]}
                labelFormatter={(label) => t('analytics_charts.model_label', { label })}
              />
              <Bar dataKey='count' fill='var(--hn-good)' />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx='50%'
                cy='50%'
                labelLine={false}
                label={({ name, percentage }) => `${name} ${percentage}%`}
                outerRadius={80}
                fill='var(--hn-primary)'
                dataKey='count'
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [t('analytics_charts.count_suffix', { count: value }), t('analytics_charts.usage_count')]} />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis />
              <Tooltip
                formatter={(value, name) => [t('analytics_charts.count_suffix', { count: value }), t('analytics_charts.usage_count')]}
                labelFormatter={(label) => t('analytics_charts.model_label', { label })}
              />
              <Line
                type='monotone'
                dataKey='count'
                stroke='var(--hn-good)'
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      default: // table
        return (
          <div className='space-y-4'>
            {data?.map((model, index) => (
              <div
                key={model._id}
                className='flex items-center justify-between'
              >
                <div className='flex items-center min-w-0 flex-1'>
                  <div className='flex-shrink-0'>
                    <div
                      className={`w-3 h-3 rounded-full ${
                        index === 0
                          ? 'bg-[var(--hn-primary)]'
                          : index === 1
                          ? 'bg-[var(--hn-good)]'
                          : index === 2
                          ? 'bg-[var(--hn-warn)]'
                          : 'bg-[var(--hn-fg-muted)]'
                      }`}
                    ></div>
                  </div>
                  <div className='ml-3 min-w-0 flex-1'>
                    <p className='text-sm font-medium text-foreground truncate'>
                      {model.label || model._id || t('analytics_charts.unknown')}
                    </p>
                  </div>
                </div>
                <div className='flex items-center'>
                  <span className='text-sm font-medium text-foreground mr-2'>
                    {t('analytics_charts.count_suffix', { count: model.count })}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    (
                    {(
                      (model.count /
                        (data?.reduce((sum, m) => sum + m.count, 0) || 1)) *
                      100
                    ).toFixed(1)}
                    %)
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className='bg-card shadow rounded-lg p-6'>
      <div className='flex items-center justify-between mb-4'>
        <h3 className='text-lg font-medium text-foreground'>
          {title}
        </h3>
        <ChartTypeToggle
          currentType={chartType}
          onTypeChange={setChartType}
          availableTypes={['table', 'bar', 'pie', 'line']}
        />
      </div>
      {!data || data.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>
          {t('analytics_charts.no_data')}
        </p>
      ) : (
        renderChart()
      )}
    </div>
  );
};

// 부서별 사용량 차트
export const DepartmentStatsChart = ({ data, title, tooltip }) => {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState('table');

  const chartData =
    data?.map((dept) => ({
      name: dept._id || t('analytics_charts.other'),
      userCount: dept.userCount,
      messageCount: dept.messageCount,
    })) || [];

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey='userCount' fill='var(--hn-info)' name={t('analytics_charts.user_count_label')} />
              <Bar dataKey='messageCount' fill='var(--hn-primary)' name={t('analytics_charts.message_count')} />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx='50%'
                cy='50%'
                labelLine={false}
                label={({ name, userCount }) => `${name} ${t('analytics_charts.user_count_suffix', { count: userCount })}`}
                outerRadius={80}
                fill='var(--hn-primary)'
                dataKey='userCount'
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [t('analytics_charts.user_count_suffix', { count: value }), t('analytics_charts.user_count_label')]} />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type='monotone'
                dataKey='userCount'
                stroke='var(--hn-info)'
                strokeWidth={2}
                name={t('analytics_charts.user_count_label')}
              />
              <Line
                type='monotone'
                dataKey='messageCount'
                stroke='var(--hn-primary)'
                strokeWidth={2}
                name={t('analytics_charts.message_count')}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      default: // table
        return (
          <div className='space-y-4'>
            {data?.map((dept, index) => (
              <div key={dept._id} className='flex items-center justify-between'>
                <div className='flex items-center min-w-0 flex-1'>
                  <div className='flex-shrink-0'>
                    <div
                      className={`w-3 h-3 rounded-full ${
                        index === 0
                          ? 'bg-[var(--hn-primary)]'
                          : index === 1
                          ? 'bg-[var(--hn-info)]'
                          : index === 2
                          ? 'bg-[var(--hn-good)]'
                          : index === 3
                          ? 'bg-[var(--hn-warn)]'
                          : 'bg-[var(--hn-fg-muted)]'
                      }`}
                    ></div>
                  </div>
                  <div className='ml-3 min-w-0 flex-1'>
                    <p className='text-sm font-medium text-foreground truncate'>
                      {dept._id || t('analytics_charts.other')}
                    </p>
                  </div>
                </div>
                <div className='flex items-center'>
                  <span className='text-sm font-medium text-foreground mr-2'>
                    {t('analytics_charts.user_count_suffix', { count: dept.userCount })}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    ({t('analytics_charts.count_suffix_parens', { count: dept.messageCount })})
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className='bg-card shadow rounded-lg p-6'>
      <div className='flex items-center justify-between mb-4'>
        <TitleWithTooltip title={title} tooltip={tooltip} />
        <ChartTypeToggle
          currentType={chartType}
          onTypeChange={setChartType}
          availableTypes={['table', 'bar', 'pie', 'line']}
        />
      </div>
      {!data || data.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>
          {t('analytics_charts.no_data')}
        </p>
      ) : (
        renderChart()
      )}
    </div>
  );
};

// 숫자 포맷 헬퍼 (토큰 수 표시용)
const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
};

// 사용자별 토큰 사용량 차트
export const TokenUsageChart = ({ data, title }) => {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState('table');

  const chartData =
    data?.slice(0, 10).map((user) => ({
      name: user.name || user.email,
      totalTokens: user.totalTokens,
      promptTokens: user.promptTokens,
      responseTokens: user.responseTokens,
      requestCount: user.requestCount,
      email: user.email,
      department: user.department,
      cell: user.cell,
    })) || [];

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis tickFormatter={(v) => formatTokenCount(v)} />
              <Tooltip
                formatter={(value, name) => {
                  const labels = {
                    totalTokens: t('analytics_charts.total_tokens'),
                    promptTokens: t('analytics_charts.prompt_tokens'),
                    responseTokens: t('analytics_charts.response_tokens'),
                  };
                  return [value.toLocaleString(), labels[name] || name];
                }}
                labelFormatter={(label) => t('analytics_charts.user_label', { label })}
              />
              <Legend
                formatter={(value) => {
                  const labels = {
                    totalTokens: t('analytics_charts.total_tokens'),
                    promptTokens: t('analytics_charts.prompt_short'),
                    responseTokens: t('analytics_charts.response_short'),
                  };
                  return labels[value] || value;
                }}
              />
              <Bar dataKey='promptTokens' fill='var(--hn-info)' stackId='a' />
              <Bar dataKey='responseTokens' fill='var(--hn-good)' stackId='a' />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx='50%'
                cy='50%'
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill='var(--hn-primary)'
                dataKey='totalTokens'
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [value.toLocaleString(), t('analytics_charts.token_label')]}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis tickFormatter={(v) => formatTokenCount(v)} />
              <Tooltip
                formatter={(value) => [value.toLocaleString(), t('analytics_charts.token_label')]}
                labelFormatter={(label) => t('analytics_charts.user_label', { label })}
              />
              <Line
                type='monotone'
                dataKey='totalTokens'
                stroke='var(--hn-primary)'
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      default: // table
        return (
          <div className='space-y-4'>
            {data?.slice(0, 10).map((user, index) => (
              <div key={user._id} className='flex items-center justify-between'>
                <div className='flex items-center min-w-0 flex-1'>
                  <div className='flex-shrink-0 w-8'>
                    <span className='text-sm font-medium text-muted-foreground'>
                      #{index + 1}
                    </span>
                  </div>
                  <div className='ml-3 min-w-0 flex-1'>
                    <p className='text-sm font-medium text-foreground truncate'>
                      {user.name || user.email}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {user.department} • {user.cell}
                    </p>
                  </div>
                </div>
                <div className='flex items-center'>
                  <div className='text-right mr-4'>
                    <p className='text-sm font-medium text-foreground'>
                      {t('analytics_charts.total_sum', { count: user.totalTokens?.toLocaleString() || 0 })}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {t('analytics_charts.input_output', { input: formatTokenCount(user.promptTokens || 0), output: formatTokenCount(user.responseTokens || 0) })}
                    </p>
                  </div>
                  <div className='w-16 bg-muted rounded-full h-2'>
                    <div
                      className='bg-[var(--hn-primary)] h-2 rounded-full'
                      style={{
                        width: `${Math.min(
                          (user.totalTokens / (data?.[0]?.totalTokens || 1)) *
                            100,
                          100
                        )}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className='bg-card shadow rounded-lg p-6'>
      <div className='flex items-center justify-between mb-4'>
        <div className='flex items-center gap-2'>
          <Coins className='h-5 w-5 text-[var(--hn-primary)]' />
          <h3 className='text-lg font-medium text-foreground'>
            {title}
          </h3>
        </div>
        <ChartTypeToggle
          currentType={chartType}
          onTypeChange={setChartType}
          availableTypes={['table', 'bar', 'pie', 'line']}
        />
      </div>
      {!data || data.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>
          {t('analytics_charts.no_token_data')}
        </p>
      ) : (
        renderChart()
      )}
    </div>
  );
};

// 부서별 토큰 사용량 차트
export const DepartmentTokenUsageChart = ({ data, title }) => {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState('table');

  const chartData =
    data?.map((dept) => ({
      name: dept._id || t('analytics_charts.other'),
      totalTokens: dept.totalTokens,
      promptTokens: dept.promptTokens,
      responseTokens: dept.responseTokens,
      requestCount: dept.requestCount,
      userCount: dept.userCount,
    })) || [];

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis tickFormatter={(v) => formatTokenCount(v)} />
              <Tooltip
                formatter={(value, name) => {
                  const labels = {
                    totalTokens: t('analytics_charts.total_tokens'),
                    promptTokens: t('analytics_charts.prompt_tokens'),
                    responseTokens: t('analytics_charts.response_tokens'),
                  };
                  return [value.toLocaleString(), labels[name] || name];
                }}
              />
              <Legend
                formatter={(value) => {
                  const labels = {
                    promptTokens: t('analytics_charts.prompt_short'),
                    responseTokens: t('analytics_charts.response_short'),
                  };
                  return labels[value] || value;
                }}
              />
              <Bar dataKey='promptTokens' fill='var(--hn-info)' stackId='a' />
              <Bar dataKey='responseTokens' fill='var(--hn-good)' stackId='a' />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx='50%'
                cy='50%'
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill='var(--hn-primary)'
                dataKey='totalTokens'
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [value.toLocaleString(), t('analytics_charts.token_label')]}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-45}
                textAnchor='end'
                height={80}
              />
              <YAxis tickFormatter={(v) => formatTokenCount(v)} />
              <Tooltip
                formatter={(value) => [value.toLocaleString(), t('analytics_charts.token_label')]}
              />
              <Line
                type='monotone'
                dataKey='totalTokens'
                stroke='var(--hn-primary)'
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      default: // table
        return (
          <div className='space-y-4'>
            {data?.map((dept, index) => (
              <div key={dept._id} className='flex items-center justify-between'>
                <div className='flex items-center min-w-0 flex-1'>
                  <div className='flex-shrink-0'>
                    <div
                      className={`w-3 h-3 rounded-full ${
                        index === 0
                          ? 'bg-[var(--hn-primary)]'
                          : index === 1
                          ? 'bg-[var(--hn-info)]'
                          : index === 2
                          ? 'bg-[var(--hn-good)]'
                          : index === 3
                          ? 'bg-[var(--hn-warn)]'
                          : 'bg-[var(--hn-fg-muted)]'
                      }`}
                    ></div>
                  </div>
                  <div className='ml-3 min-w-0 flex-1'>
                    <p className='text-sm font-medium text-foreground truncate'>
                      {dept._id || t('analytics_charts.other')}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {t('analytics_charts.user_count_dot_request', { userCount: dept.userCount, requestCount: dept.requestCount })}
                    </p>
                  </div>
                </div>
                <div className='flex items-center'>
                  <div className='text-right mr-2'>
                    <p className='text-sm font-medium text-foreground'>
                      {t('analytics_charts.total_sum', { count: dept.totalTokens?.toLocaleString() || 0 })}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {t('analytics_charts.input_output', { input: formatTokenCount(dept.promptTokens || 0), output: formatTokenCount(dept.responseTokens || 0) })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className='bg-card shadow rounded-lg p-6'>
      <div className='flex items-center justify-between mb-4'>
        <div className='flex items-center gap-2'>
          <Coins className='h-5 w-5 text-[var(--hn-primary)]' />
          <h3 className='text-lg font-medium text-foreground'>
            {title}
          </h3>
        </div>
        <ChartTypeToggle
          currentType={chartType}
          onTypeChange={setChartType}
          availableTypes={['table', 'bar', 'pie', 'line']}
        />
      </div>
      {!data || data.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>
          {t('analytics_charts.no_token_data')}
        </p>
      ) : (
        renderChart()
      )}
    </div>
  );
};

// 일별 활동량 차트
export const DailyActivityChart = ({ data, title, tooltip }) => {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState('table');

  const chartData =
    data?.slice(-7).map((day) => ({
      date: new Date(day._id).toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Seoul',
      }),
      messageCount: day.messageCount,
      userCount: day.userCount,
      fullDate: day._id,
    })) || [];

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='date' />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey='messageCount' fill='var(--hn-good)' name={t('analytics_charts.message_count')} />
              <Bar dataKey='userCount' fill='var(--hn-info)' name={t('analytics_charts.active_users')} />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx='50%'
                cy='50%'
                labelLine={false}
                label={({ date, messageCount }) => `${date} ${t('analytics_charts.piece_suffix', { count: messageCount })}`}
                outerRadius={80}
                fill='var(--hn-primary)'
                dataKey='messageCount'
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [t('analytics_charts.piece_suffix', { count: value }), t('analytics_charts.message_count')]} />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='date' />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type='monotone'
                dataKey='messageCount'
                stroke='var(--hn-good)'
                strokeWidth={2}
                name={t('analytics_charts.message_count')}
              />
              <Line
                type='monotone'
                dataKey='userCount'
                stroke='var(--hn-info)'
                strokeWidth={2}
                name={t('analytics_charts.active_users')}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      default: // table
        return (
          <div className='space-y-2'>
            {data?.slice(-7).map((day) => (
              <div
                key={day._id}
                className='flex items-center justify-between py-2'
              >
                <div className='flex items-center'>
                  <span className='text-sm text-foreground'>
                    {new Date(day._id).toLocaleDateString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'Asia/Seoul',
                    })}
                  </span>
                </div>
                <div className='flex items-center'>
                  <div className='text-right mr-3'>
                    <p className='text-sm font-medium text-foreground'>
                      {t('analytics_charts.piece_suffix', { count: day.messageCount })}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {t('analytics_charts.user_count_active', { count: day.userCount })}
                    </p>
                  </div>
                  <div className='w-20 bg-muted rounded-full h-2'>
                    <div
                      className='bg-[var(--hn-good)] h-2 rounded-full'
                      style={{
                        width: `${Math.min(
                          (day.messageCount /
                            (data?.reduce(
                              (max, d) => Math.max(max, d.messageCount),
                              0
                            ) || 1)) *
                            100,
                          100
                        )}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className='bg-card shadow rounded-lg p-6'>
      <div className='flex items-center justify-between mb-4'>
        <TitleWithTooltip title={title} tooltip={tooltip} />
        <ChartTypeToggle
          currentType={chartType}
          onTypeChange={setChartType}
          availableTypes={['table', 'bar', 'line', 'pie']}
        />
      </div>
      {!data || data.length === 0 ? (
        <p className='text-sm text-muted-foreground text-center py-8'>
          {t('analytics_charts.no_data')}
        </p>
      ) : (
        renderChart()
      )}
    </div>
  );
};
