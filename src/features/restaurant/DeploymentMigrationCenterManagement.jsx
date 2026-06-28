import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  KeyRound,
  Printer,
  Rocket,
  ServerCog,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react'
import './DeploymentMigrationCenterManagement.css'

const sqlMigrations = [
  {
    key: 'staff_shift',
    title: 'Staff Shift Closing',
    file: 'supabase/sql/20260628_staff_shift_closing_foundation.sql',
    reason: 'Creates shift open/close, variance and handover tables.',
  },
  {
    key: 'mamo_billing',
    title: 'Mamo Subscription Billing',
    file: 'supabase/sql/20260628_mamo_subscription_billing_foundation.sql',
    reason: 'Adds Spizy subscription attempts, invoices and restaurant subscription fields.',
  },
  {
    key: 'cogs_profit',
    title: 'Inventory COGS & Profit',
    file: 'supabase/sql/20260628_inventory_cogs_profit_foundation.sql',
    reason: 'Adds recipe cost lines and monthly COGS snapshots.',
  },
  {
    key: 'refund_center',
    title: 'Gateway Refund Automation Center',
    file: 'supabase/sql/20260628_gateway_refund_automation_center.sql',
    reason: 'Adds refund API attempt tracking without moving money automatically.',
  },
  {
    key: 'vat_statutory',
    title: 'VAT Statutory Foundation',
    file: 'supabase/sql/20260628_vat_statutory_upgrade_foundation.sql',
    reason: 'Adds TRN, filing periods, invoice sequences and VAT category settings.',
  },
  {
    key: 'notification_center',
    title: 'Reminder Center',
    file: 'supabase/sql/20260628_restaurant_notification_center_foundation.sql',
    reason: 'Adds notification rules and in-app event audit trail.',
  },
]

const edgeFunctions = [
  {
    key: 'mamo_create',
    name: 'create-mamo-subscription-checkout',
    command: 'supabase functions deploy create-mamo-subscription-checkout',
    purpose: 'Creates Mamo Pay checkout links for Spizy subscription payments only.',
  },
  {
    key: 'mamo_verify',
    name: 'verify-mamo-subscription-payment',
    command: 'supabase functions deploy verify-mamo-subscription-payment',
    purpose: 'Verifies Mamo redirect/payment result and updates subscription records.',
  },
  {
    key: 'paypal_create',
    name: 'create-paypal-checkout-order',
    command: 'supabase functions deploy create-paypal-checkout-order',
    purpose: 'Creates restaurant-owned PayPal customer checkout orders.',
  },
  {
    key: 'paypal_capture',
    name: 'capture-paypal-checkout-order',
    command: 'supabase functions deploy capture-paypal-checkout-order',
    purpose: 'Captures/checks restaurant-owned PayPal payment result after redirect.',
  },
  {
    key: 'refund_record',
    name: 'record-payment-refund',
    command: 'supabase functions deploy record-payment-refund',
    purpose: 'Records refund/adjustment actions in Spizy without exposing gateway secrets.',
  },
  {
    key: 'day_snapshot',
    name: 'create-day-closing-payment-snapshot',
    command: 'supabase functions deploy create-day-closing-payment-snapshot',
    purpose: 'Builds collected/pending/refund payment snapshot for day closing.',
  },
  {
    key: 'post_closing',
    name: 'post-day-closing-to-cash-bank',
    command: 'supabase functions deploy post-day-closing-to-cash-bank',
    purpose: 'Posts day closing collections to Cash & Bank ledger.',
  },
  {
    key: 'reverse_closing',
    name: 'reverse-day-closing-cash-bank-posting',
    command: 'supabase functions deploy reverse-day-closing-cash-bank-posting',
    purpose: 'Reverses day closing Cash & Bank posting safely.',
  },
  {
    key: 'recalc_balances',
    name: 'recalculate-cash-bank-balances',
    command: 'supabase functions deploy recalculate-cash-bank-balances',
    purpose: 'Recalculates account balances from ledger movements.',
  },
  {
    key: 'daily_summary',
    name: 'create-daily-finance-summary',
    command: 'supabase functions deploy create-daily-finance-summary',
    purpose: 'Creates daily finance summary after closing/reconciliation.',
  },
]

const secretChecks = [
  {
    key: 'mamo_api_key',
    name: 'MAMO_API_KEY',
    command: 'supabase secrets set MAMO_API_KEY="your_mamo_api_key"',
    purpose: 'Required for Spizy subscription checkout through Mamo Pay.',
  },
  {
    key: 'mamo_api_base',
    name: 'MAMO_API_BASE_URL',
    command: 'supabase secrets set MAMO_API_BASE_URL="https://sandbox.dev.business.mamopay.com/manage_api/v1"',
    purpose: 'Use sandbox first; switch to live URL only after testing.',
  },
  {
    key: 'spizy_app_url',
    name: 'SPIZY_APP_URL',
    command: 'supabase secrets set SPIZY_APP_URL="https://your-spizy-app-url.com"',
    purpose: 'Used for success/cancel redirect URLs from backend checkout functions.',
  },
  {
    key: 'service_role',
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    command: 'supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"',
    purpose: 'Required by sensitive finance/payment Edge Functions. Never expose in frontend.',
  },
]

const productionSteps = [
  {
    key: 'pull_latest',
    title: 'Pull latest code and apply ZIPs',
    command: 'unzip -o ~/Downloads/<latest_spizy_zip>.zip -d .',
    note: 'Apply packages from oldest pending to newest pending if multiple ZIPs are waiting.',
  },
  {
    key: 'install_build',
    title: 'Run frontend build',
    command: 'npm run build',
    note: 'Fix blank-screen imports, duplicate declarations or CSS import errors before touching production.',
  },
  {
    key: 'sql_migrations',
    title: 'Run SQL migrations',
    command: 'Open Supabase SQL Editor and run each migration once.',
    note: 'Confirm RLS policies use rm.role::text and do not use enum coalesce patterns.',
  },
  {
    key: 'deploy_functions',
    title: 'Deploy Edge Functions',
    command: 'supabase functions deploy <function-name>',
    note: 'Deploy payment/finance functions after secrets are ready.',
  },
  {
    key: 'set_secrets',
    title: 'Set Supabase secrets',
    command: 'supabase secrets set KEY="value"',
    note: 'Keep service-role and gateway secrets backend-only.',
  },
  {
    key: 'simulate_restaurant',
    title: 'Run full restaurant simulation',
    command: 'Onboarding → QR order → payment → bill complete → day close → reports → VAT.',
    note: 'Use the Launch QA module to tick real device and real role tests.',
  },
]

function DeploymentMigrationCenterManagement({ restaurant, onOpenSection }) {
  const storageKey = useMemo(
    () => `spizy_deployment_center_${restaurant?.id || 'global'}`,
    [restaurant?.id],
  )
  const [checkState, setCheckState] = useState(() => readDeploymentState(storageKey))
  const [copiedKey, setCopiedKey] = useState('')

  useEffect(() => {
    setCheckState(readDeploymentState(storageKey))
  }, [storageKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(checkState))
    } catch {
      // Ignore storage failures. The checklist is only a local deployment helper.
    }
  }, [checkState, storageKey])

  const totals = useMemo(() => {
    const sqlDone = countDone(checkState.sql, sqlMigrations)
    const functionDone = countDone(checkState.functions, edgeFunctions)
    const secretDone = countDone(checkState.secrets, secretChecks)
    const stepDone = countDone(checkState.steps, productionSteps)
    const totalItems =
      sqlMigrations.length + edgeFunctions.length + secretChecks.length + productionSteps.length
    const totalDone = sqlDone + functionDone + secretDone + stepDone

    return {
      sqlDone,
      functionDone,
      secretDone,
      stepDone,
      totalItems,
      totalDone,
      score: Math.round((totalDone / Math.max(totalItems, 1)) * 100),
    }
  }, [checkState])

  const toggleItem = (group, key) => {
    setCheckState((current) => ({
      ...current,
      [group]: {
        ...(current[group] || {}),
        [key]: !current[group]?.[key],
      },
    }))
  }

  const resetChecklist = () => {
    const confirmed = window.confirm(
      'Reset this local deployment checklist? This does not change Supabase or project files.',
    )

    if (!confirmed) return

    setCheckState(createEmptyDeploymentState())
  }

  const copyCommand = async (key, command) => {
    try {
      await navigator.clipboard.writeText(command)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(''), 1800)
    } catch {
      setCopiedKey('')
    }
  }

  const exportCsv = () => {
    const rows = [
      ['Group', 'Item', 'Status', 'Command/File', 'Purpose/Note'],
      ...sqlMigrations.map((item) => [
        'SQL Migration',
        item.title,
        checkState.sql?.[item.key] ? 'Done' : 'Pending',
        item.file,
        item.reason,
      ]),
      ...edgeFunctions.map((item) => [
        'Edge Function',
        item.name,
        checkState.functions?.[item.key] ? 'Done' : 'Pending',
        item.command,
        item.purpose,
      ]),
      ...secretChecks.map((item) => [
        'Secret',
        item.name,
        checkState.secrets?.[item.key] ? 'Done' : 'Pending',
        item.command,
        item.purpose,
      ]),
      ...productionSteps.map((item) => [
        'Production Step',
        item.title,
        checkState.steps?.[item.key] ? 'Done' : 'Pending',
        item.command,
        item.note,
      ]),
    ]

    downloadCsv(`spizy-deployment-checklist-${restaurant?.slug || 'restaurant'}.csv`, rows)
  }

  return (
    <section className="deployment-center-shell">
      <div className="deployment-center-hero">
        <div>
          <p className="pricing-label">Deployment Control</p>
          <h1>Migration & Edge Function Center</h1>
          <p>
            Track SQL migrations, Supabase Edge Functions, secrets and production deployment
            checks before going live. This is a local checklist and does not expose secrets.
          </p>
        </div>

        <div className="deployment-center-score-card">
          <span>Deployment Readiness</span>
          <strong>{totals.score}%</strong>
          <small>{totals.totalDone} of {totals.totalItems} checks marked done</small>
        </div>
      </div>

      <div className="deployment-center-warning">
        <AlertTriangle size={18} />
        <span>
          Mamo Pay is only for Spizy subscription billing. Restaurant customer-payment gateways
          and refunds must continue to use each restaurant’s own merchant credentials.
        </span>
      </div>

      <div className="deployment-center-kpis">
        <DeploymentKpi icon={<Database size={20} />} label="SQL migrations" value={`${totals.sqlDone}/${sqlMigrations.length}`} />
        <DeploymentKpi icon={<ServerCog size={20} />} label="Edge functions" value={`${totals.functionDone}/${edgeFunctions.length}`} />
        <DeploymentKpi icon={<KeyRound size={20} />} label="Secrets" value={`${totals.secretDone}/${secretChecks.length}`} />
        <DeploymentKpi icon={<Rocket size={20} />} label="Launch steps" value={`${totals.stepDone}/${productionSteps.length}`} />
      </div>

      <div className="deployment-center-actions">
        <button type="button" onClick={() => window.print()}>
          <Printer size={17} />
          Print checklist
        </button>
        <button type="button" onClick={exportCsv}>
          <Download size={17} />
          Export CSV
        </button>
        <button type="button" onClick={() => onOpenSection?.('launch-qa')}>
          <ShieldCheck size={17} />
          Open Launch QA
        </button>
        <button type="button" className="danger" onClick={resetChecklist}>
          Reset local checklist
        </button>
      </div>

      <DeploymentPanel
        title="SQL migrations"
        subtitle="Run each SQL file once in Supabase SQL Editor, then mark it done."
        icon={<Database size={20} />}
      >
        {sqlMigrations.map((item) => (
          <ChecklistRow
            key={item.key}
            checked={Boolean(checkState.sql?.[item.key])}
            title={item.title}
            code={item.file}
            note={item.reason}
            onToggle={() => toggleItem('sql', item.key)}
          />
        ))}
      </DeploymentPanel>

      <DeploymentPanel
        title="Edge Functions"
        subtitle="Deploy backend functions after secrets are configured."
        icon={<ServerCog size={20} />}
      >
        {edgeFunctions.map((item) => (
          <ChecklistRow
            key={item.key}
            checked={Boolean(checkState.functions?.[item.key])}
            title={item.name}
            code={item.command}
            note={item.purpose}
            copied={copiedKey === item.key}
            onCopy={() => copyCommand(item.key, item.command)}
            onToggle={() => toggleItem('functions', item.key)}
          />
        ))}
      </DeploymentPanel>

      <DeploymentPanel
        title="Secrets"
        subtitle="Keep service-role and payment credentials in Supabase Edge Function secrets only."
        icon={<KeyRound size={20} />}
      >
        {secretChecks.map((item) => (
          <ChecklistRow
            key={item.key}
            checked={Boolean(checkState.secrets?.[item.key])}
            title={item.name}
            code={item.command}
            note={item.purpose}
            copied={copiedKey === item.key}
            onCopy={() => copyCommand(item.key, item.command)}
            onToggle={() => toggleItem('secrets', item.key)}
          />
        ))}
      </DeploymentPanel>

      <DeploymentPanel
        title="Production order"
        subtitle="Recommended release sequence before production use."
        icon={<ClipboardCheck size={20} />}
      >
        {productionSteps.map((item) => (
          <ChecklistRow
            key={item.key}
            checked={Boolean(checkState.steps?.[item.key])}
            title={item.title}
            code={item.command}
            note={item.note}
            copied={copiedKey === item.key}
            onCopy={() => copyCommand(item.key, item.command)}
            onToggle={() => toggleItem('steps', item.key)}
          />
        ))}
      </DeploymentPanel>
    </section>
  )
}

function DeploymentKpi({ icon, label, value }) {
  return (
    <article className="deployment-center-kpi">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function DeploymentPanel({ title, subtitle, icon, children }) {
  return (
    <section className="deployment-center-panel">
      <div className="deployment-center-panel-head">
        <div className="deployment-center-panel-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="deployment-center-list">{children}</div>
    </section>
  )
}

function ChecklistRow({ checked, title, code, note, copied, onCopy, onToggle }) {
  return (
    <article className={`deployment-check-row ${checked ? 'done' : ''}`}>
      <button type="button" className="deployment-check-toggle" onClick={onToggle}>
        {checked ? <CheckCircle2 size={20} /> : <FileCheck2 size={20} />}
      </button>

      <div className="deployment-check-content">
        <div>
          <strong>{title}</strong>
          <span>{note}</span>
        </div>
        <code>{code}</code>
      </div>

      {onCopy && (
        <button type="button" className="deployment-copy-button" onClick={onCopy}>
          <TerminalSquare size={16} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </article>
  )
}

function createEmptyDeploymentState() {
  return {
    sql: {},
    functions: {},
    secrets: {},
    steps: {},
  }
}

function readDeploymentState(storageKey) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
    return {
      ...createEmptyDeploymentState(),
      ...parsed,
    }
  } catch {
    return createEmptyDeploymentState()
  }
}

function countDone(stateGroup, sourceItems) {
  return sourceItems.filter((item) => stateGroup?.[item.key]).length
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default DeploymentMigrationCenterManagement
