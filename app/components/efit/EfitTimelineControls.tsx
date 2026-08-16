'use client';

import { EFIT_PLAYBACK_RATES, type EfitStore, type EfitStoreSnapshot } from './store';
import { useI18n } from '../../i18n';

type EfitTimelineControlsProps = {
  store: EfitStore;
  snapshot: EfitStoreSnapshot;
};

function formatTime(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(3)} s`;
}
export default function EfitTimelineControls({ store, snapshot }: EfitTimelineControlsProps) {
  const { t } = useI18n();
  const { actions } = store;
  const first = snapshot.timeline[0];
  const last = snapshot.timeline.at(-1);
  const disabled = snapshot.timeline.length === 0;

  return (
    <div className="efitTransport" aria-label={t('efit.playerAria')}>
      <div className="efitTransportTopline">
        <div className="efitTransportButtons">
          <button
            type="button"
            className="efitIconButton"
            onClick={() => void actions.step(-1)}
            disabled={disabled}
            aria-label={t('efit.previous')}
            title={t('efit.previousTitle')}
          >
            <span aria-hidden="true">|‹</span>
          </button>
          <button
            type="button"
            className="efitPlayButton"
            onClick={actions.togglePlayback}
            disabled={disabled}
            aria-label={snapshot.isPlaying ? t('efit.pauseAria') : t('efit.playAria')}
            aria-pressed={snapshot.isPlaying}
          >
            <span aria-hidden="true">{snapshot.isPlaying ? 'Ⅱ' : '▶'}</span>
            {snapshot.isPlaying ? t('efit.pause') : t('efit.play')}
          </button>
          <button
            type="button"
            className="efitIconButton"
            onClick={() => void actions.step(1)}
            disabled={disabled}
            aria-label={t('efit.next')}
            title={t('efit.nextTitle')}
          >
            <span aria-hidden="true">›|</span>
          </button>
        </div>

        <output className="efitTimeReadout" aria-live="off">
          <strong>{formatTime(snapshot.currentTimeMs)}</strong>
          <span>{snapshot.currentFrameIndex >= 0 ? snapshot.currentFrameIndex + 1 : 0} / {snapshot.timeline.length}</span>
        </output>
      </div>

      <label className="efitScrubber">
        <span className="srOnly">{t('efit.realTime')}</span>
        <input
          type="range"
          min={first?.timeMs ?? 0}
          max={last?.timeMs ?? 1}
          step={1}
          value={snapshot.currentTimeMs}
          disabled={disabled}
          onChange={(event) => void actions.seekTimeMs(Number(event.currentTarget.value))}
          aria-valuetext={formatTime(snapshot.currentTimeMs)}
        />
        <span className="efitScrubberLabels" aria-hidden="true">
          <span>{formatTime(first?.timeMs ?? 0)}</span>
          <span>{t('efit.realTimeline')}</span>
          <span>{formatTime(last?.timeMs ?? 0)}</span>
        </span>
      </label>

      <div className="efitTransportSettings">
        <label>
          <span>{t('efit.speed')}</span>
          <select value={snapshot.playbackRate} onChange={(event) => actions.setPlaybackRate(Number(event.currentTarget.value))}>
            {EFIT_PLAYBACK_RATES.map((speed) => <option key={speed} value={speed}>{speed.toFixed(speed < 0.1 ? 2 : 1)}×</option>)}
          </select>
        </label>
        <label className="efitLoopToggle">
          <input type="checkbox" checked={snapshot.loop} onChange={(event) => actions.setLoop(event.currentTarget.checked)} />
          <span>{t('efit.loop')}</span>
        </label>
        <span className="efitKeyboardHint">{t('efit.keyboardHint')}</span>
      </div>
    </div>
  );
}
