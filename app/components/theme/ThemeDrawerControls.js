export const primaryButton = {
  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 14px', fontWeight: 700, fontSize: 13, background: 'var(--hn-primary)',
  color: 'var(--hn-primary-fg)', border: 0, borderRadius: 8, cursor: 'pointer',
};

export const ghostButton = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 14px', fontWeight: 600, fontSize: 13, background: 'var(--hn-surface)',
  color: 'var(--hn-fg)', border: '1px solid var(--hn-border)', borderRadius: 8, cursor: 'pointer',
};

export function Section({ title, hint, children }) {
  return <section><div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}><h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{title}</h4>{hint && <span style={{ fontSize: 11, color: 'var(--hn-fg-muted)' }}>{hint}</span>}</div>{children}</section>;
}

export function Row({ label, desc, children }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid var(--hn-border)' }}><div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>{desc && <div style={{ fontSize: 11, color: 'var(--hn-fg-muted)' }}>{desc}</div>}</div><div>{children}</div></div>;
}

export function Segmented({ value, options, onChange }) {
  return <div style={{ display: 'inline-flex', padding: 3, background: 'var(--hn-surface-2)', border: '1px solid var(--hn-border)', borderRadius: 8, flexWrap: 'wrap' }}>{options.map((option) => <button key={option.id} type='button' onClick={() => onChange(option.id)} style={{ padding: '5px 10px', border: 0, fontSize: 11.5, fontWeight: 600, borderRadius: 6, background: value === option.id ? 'var(--hn-surface)' : 'transparent', color: value === option.id ? 'var(--hn-fg)' : 'var(--hn-fg-muted)', boxShadow: value === option.id ? 'var(--hn-shadow-sm)' : 'none', cursor: 'pointer' }}>{option.label}</button>)}</div>;
}

export function Toggle({ checked, onChange, label }) {
  return <button type='button' role='switch' aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} style={{ position: 'relative', width: 40, height: 22, padding: 0, borderRadius: 999, cursor: 'pointer', border: '1px solid var(--hn-border)', background: checked ? 'var(--hn-primary)' : 'var(--hn-surface-2)' }}><span style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: checked ? 'var(--hn-primary-fg)' : 'var(--hn-surface)', transition: 'left var(--hn-dur-fast) var(--hn-ease)' }} /></button>;
}
