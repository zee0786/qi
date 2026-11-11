import { useEffect, useState } from 'react';
import { OUTCOMES, api, formatPercent } from './api.js';

const AI_PROBLEM =
  'The AI could not give a usable answer for this photo. Choose the defect type yourself.';

export default function NewInspection({ onSaved }) {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [finalType, setFinalType] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .batches()
      .then((list) => {
        setBatches(list);
        setBatchId(list[0]?.id ?? '');
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const aiAnswer = prediction?.status === 'ok' ? prediction.predictedDefectType : null;
  const isOverride = aiAnswer !== null && finalType !== '' && finalType !== aiAnswer;

  function pickFile(next) {
    setFile(next ?? null);
    setPrediction(null);
    setFinalType('');
    setError('');
  }

  async function analyze() {
    setBusy(true);
    setError('');
    try {
      const result = await api.classify(file);
      setPrediction(result);
      setFinalType(result.status === 'ok' ? result.predictedDefectType : '');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.createInspection({
        batchId,
        predictionId: prediction.predictionId,
        finalDefectType: finalType,
        comments,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="log">
      <div className="panel">
        <h2>1. Photo of the unit</h2>
        <label className="field">
          Batch
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} — {b.productName} ({b.productionLine})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Photo (JPEG, PNG or WebP, up to 5 MB)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => pickFile(e.target.files[0])}
          />
        </label>
        {preview && <img className="preview" src={preview} alt="Selected unit" />}
        <button className="primary" disabled={!file || !batchId || busy} onClick={analyze}>
          {busy && !prediction
            ? 'Analysing photo…'
            : prediction
              ? 'Analyse again'
              : 'Analyse photo'}
        </button>
      </div>

      {prediction && (
        <div className="panel">
          <h2>2. Confirm the result</h2>

          <div className="verdict">
            <div>
              <span className="muted">AI suggests</span>
              <strong className="call">{aiAnswer ?? 'No answer'}</strong>
              {aiAnswer && (
                <div className="gauge" title="Model confidence">
                  <span style={{ width: `${(prediction.confidence ?? 0) * 100}%` }} />
                  <em>
                    {prediction.confidence === null
                      ? 'No confidence reported'
                      : `${formatPercent(Math.round(prediction.confidence * 100))} confident`}
                  </em>
                </div>
              )}
            </div>
            <div className={isOverride ? 'human overriding' : 'human'}>
              <span className="muted">Your call</span>
              <strong className="call">{finalType || 'Not chosen'}</strong>
              {isOverride && <em>Overriding the AI</em>}
            </div>
          </div>

          {!aiAnswer && <p className="notice warn">{AI_PROBLEM}</p>}

          <fieldset className="choices">
            <legend>Final defect type</legend>
            {OUTCOMES.map((o) => (
              <label key={o} className={o === finalType ? 'choice picked' : 'choice'}>
                <input
                  type="radio"
                  name="finalType"
                  value={o}
                  checked={o === finalType}
                  onChange={() => setFinalType(o)}
                />
                {o}
                {o === aiAnswer && <span className="tag">AI suggestion</span>}
              </label>
            ))}
          </fieldset>

          <label className="field">
            Comments (optional)
            <textarea
              rows={3}
              maxLength={1000}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What did you see that the photo doesn't show?"
            />
          </label>

          <button className="primary" disabled={!finalType || busy} onClick={save}>
            {isOverride
              ? 'Save with my override'
              : aiAnswer
                ? 'Accept and save'
                : 'Save inspection'}
          </button>
        </div>
      )}

      {error && <p className="notice error">{error}</p>}
    </section>
  );
}
