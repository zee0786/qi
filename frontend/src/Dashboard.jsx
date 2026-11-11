import { useEffect, useState } from 'react';
import { api, formatPercent } from './api.js';

export default function Dashboard() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .batches()
      .then(setBatches)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    let current = true;
    api
      .dashboard(batchId)
      .then((data) => current && (setKpis(data), setError('')))
      .catch((err) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [batchId]);

  const maxCount = Math.max(1, ...(kpis?.defectBreakdown.map((d) => d.count) ?? []));

  return (
    <section>
      <div className="toolbar">
        <h2>Dashboard</h2>
        <label className="inline">
          Scope
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} — {b.productName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="notice error">{error}</p>}
      {kpis && kpis.totalInspected === 0 && (
        <p className="empty">Nothing to summarise yet. Log an inspection to see results here.</p>
      )}

      {kpis && kpis.totalInspected > 0 && (
        <div className="dash">
          <dl className="ledger">
            <div>
              <dt>Total inspected</dt>
              <dd>{kpis.totalInspected}</dd>
            </div>
            <div>
              <dt>Passed</dt>
              <dd className="pass-text">{kpis.passed}</dd>
            </div>
            <div>
              <dt>Rejected</dt>
              <dd className="fail-text">{kpis.rejected}</dd>
            </div>
            <div>
              <dt>Defect rate</dt>
              <dd>{formatPercent(kpis.defectRate)}</dd>
            </div>
            <div>
              <dt>
                AI acceptance rate
                <small>
                  Accepted as-is, out of {kpis.aiAssessed} inspection
                  {kpis.aiAssessed === 1 ? '' : 's'} with an AI answer
                </small>
              </dt>
              <dd>{formatPercent(kpis.aiAcceptanceRate)}</dd>
            </div>
          </dl>

          <div className="panel">
            <h3>Rejected units by defect type</h3>
            <ul className="bars">
              {kpis.defectBreakdown.map((d) => (
                <li key={d.defectType}>
                  <span>{d.defectType}</span>
                  <div className="track">
                    <div className="fill" style={{ width: `${(d.count / maxCount) * 100}%` }} />
                  </div>
                  <b>{d.count}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
