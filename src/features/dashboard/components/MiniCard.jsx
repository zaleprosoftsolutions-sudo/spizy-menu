function MiniCard({ icon, label, value }) {
  return (
    <div className="mini-card">
      {icon && icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default MiniCard