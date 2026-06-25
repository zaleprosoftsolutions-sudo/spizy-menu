function ToggleSwitch({ checked, onChange, label, hint, disabled = false }) {
  return (
    <button
      type="button"
      className={`toggle-switch ${checked ? 'on' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>

      <span className="toggle-copy">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  )
}

export default ToggleSwitch