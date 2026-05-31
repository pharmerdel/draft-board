// DEV ONLY — remove this component before deploying to production
// Lets you preview all three views without cycling through tabs/devices

const VIEWS = [
  { id: 'commissioner',        label: 'Commish' },
  { id: 'participant-desktop', label: 'Part. Desktop' },
  { id: 'participant-mobile',  label: 'Part. Mobile' },
];

export default function DevViewSwitcher({ current, onChange }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '0.4rem',
    }}>
      <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 800, letterSpacing: '0.08em' }}>
        ⚙ DEV
      </span>
      <div style={{ display: 'flex', gap: '0.3rem', background: '#13151f', border: '1px solid #f59e0b', borderRadius: '8px', padding: '4px' }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            style={{
              background: current === v.id ? '#f59e0b' : 'transparent',
              color: current === v.id ? '#0f1117' : '#888',
              border: 'none',
              borderRadius: '5px',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '4px 10px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
