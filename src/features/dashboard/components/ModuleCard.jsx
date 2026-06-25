function ModuleCard({ icon, title, text, status }) {
  return (
    <article className="module-card">
      <div className="feature-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <span>{status}</span>
    </article>
  )
}

export default ModuleCard