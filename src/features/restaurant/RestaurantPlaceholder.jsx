function RestaurantPlaceholder({ label, title, text, nextText }) {
  return (
    <section className="management-section">
      <div className="management-header">
        <div>
          <p className="pricing-label">{label}</p>
          <h2>{title}</h2>
          <span>{text}</span>
        </div>
      </div>

      <div className="empty-state">
        {nextText ||
          'This module layout is ready. We will connect the real function in the next build step.'}
      </div>
    </section>
  )
}

export default RestaurantPlaceholder