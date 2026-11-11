import { useEffect, useState } from 'react';
import { OUTCOMES, api, formatTime } from './api.js';

function aiVerdict(row) {
  if (row.aiPredictedDefectType === null) return { text: 'No AI result', cls: 'neutral' };
  if (row.wasOverridden)
    return { text: `Overridden (AI said ${row.aiPredictedDefectType})`, cls: 'over' };
  return { text: 'AI accepted', cls: 'ok' };
}

export default function InspectionList() {
  const [defectType, setDefectType] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    api
      .inspections({ defectType })
      .then((data) => current && (setRows(data), setError('')))
      .catch((err) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [defectType]);

  return (
    <section>
      <div className="toolbar">
        <h2>Inspections</h2>
        <label className="inline">
          Defect type
          <select value={defectType} onChange={(e) => setDefectType(e.target.value)}>
            <option value="">All</option>
            {OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="notice error">{error}</p>}
      {rows && rows.length === 0 && (
        <p className="empty">
          {defectType ? `No inspections with “${defectType}” yet.` : 'No inspections logged yet.'}
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Batch</th>
                <th>Final result</th>
                <th>AI prediction</th>
                <th>Inspector</th>
                <th>Logged</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const verdict = aiVerdict(row);
                return (
                  <tr key={row.id}>
                    <td>
                      <img className="thumb" src={row.imageRef} alt={`Unit from ${row.batchId}`} />
                    </td>
                    <td>{row.batchId}</td>
                    <td>
                      <span
                        className={row.finalDefectType === 'No Defect' ? 'pill pass' : 'pill fail'}
                      >
                        {row.finalDefectType}
                      </span>
                      {row.comments && <div className="comment">{row.comments}</div>}
                    </td>
                    <td>
                      <span className={`verdict-text ${verdict.cls}`}>{verdict.text}</span>
                    </td>
                    <td>{row.inspector}</td>
                    <td>{formatTime(row.inspectedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
