import { Bell, Clock, FileText, Bug } from 'lucide-react';
import { useShowStore } from '../store';
import type { AppSettings } from '../types';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-amber-500' : 'bg-show-border'
      }`}
      style={{ height: '22px' }}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function SettingsView() {
  const { settings, updateSettings } = useShowStore();

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSettings({ [key]: value });
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-xl">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-6">
        Settings
      </h2>

      {/* Time format */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-300">Time Display</h3>
        </div>
        <div className="flex gap-2">
          {(['24h', '12h'] as const).map(fmt => (
            <button
              key={fmt}
              onClick={() => set('timeFormat', fmt)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                settings.timeFormat === fmt
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-show-border bg-show-card text-slate-500 hover:text-slate-300'
              }`}
            >
              {fmt === '24h' ? '24-hour (19:30)' : '12-hour (7:30 PM)'}
            </button>
          ))}
        </div>
      </section>

      {/* Report time format */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-300">Report Clock</h3>
        </div>
        <p className="text-xs text-slate-600 mb-3">Time format used in generated PDF reports — independent of the interface.</p>
        <div className="flex gap-2">
          {([
            { v: 'match', label: 'Match interface' },
            { v: '24h', label: '24-hour' },
            { v: '12h', label: '12-hour' },
          ] as const).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => set('reportTimeFormat', v)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                settings.reportTimeFormat === v
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-show-border bg-show-card text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Pre-show alerts */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-300">Pre-show Alerts</h3>
        </div>

        <div className="space-y-3 bg-show-card rounded-xl border border-show-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Enable pre-show alerts</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Notify before planned show start time
              </p>
            </div>
            <Toggle
              checked={settings.preshowAlertsEnabled}
              onChange={v => set('preshowAlertsEnabled', v)}
            />
          </div>

          {settings.preshowAlertsEnabled && (
            <div className="border-t border-show-border pt-3">
              <p className="text-xs text-slate-500 mb-2">Alert at (minutes before show start):</p>
              <div className="flex gap-2 flex-wrap">
                {[5, 10, 15, 20, 30, 45, 60].map(min => {
                  const active = settings.preshowAlertMinutes.includes(min);
                  return (
                    <button
                      key={min}
                      onClick={() => {
                        const arr = active
                          ? settings.preshowAlertMinutes.filter(m => m !== min)
                          : [...settings.preshowAlertMinutes, min].sort((a, b) => a - b);
                        set('preshowAlertMinutes', arr);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        active
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                          : 'border-show-border bg-show-surface text-slate-600 hover:text-slate-300'
                      }`}
                    >
                      {min}m
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-600 mt-3">
                A "Beginners Call" notification is always sent 5 min before show start.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Auto-start */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-semibold text-slate-300">Auto-advance</h3>
        </div>
        <div className="bg-show-card rounded-xl border border-show-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Auto-start next segment</p>
              <p className="text-xs text-slate-600 mt-0.5">
                When you end a segment, the next one starts automatically at the same time
              </p>
            </div>
            <Toggle
              checked={settings.autoStartNext}
              onChange={v => set('autoStartNext', v)}
            />
          </div>
        </div>
      </section>

      {/* Interval warnings */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-slate-300">Interval Warnings</h3>
        </div>

        <div className="space-y-3 bg-show-card rounded-xl border border-show-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Interval ending warning</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Notify before interval ends (requires expected duration set)
              </p>
            </div>
            <Toggle
              checked={settings.intervalWarningEnabled}
              onChange={v => set('intervalWarningEnabled', v)}
            />
          </div>

          {settings.intervalWarningEnabled && (
            <div className="border-t border-show-border pt-3">
              <p className="text-xs text-slate-500 mb-2">Warn this many minutes before interval ends:</p>
              <div className="flex gap-2">
                {[2, 3, 5, 10].map(min => (
                  <button
                    key={min}
                    onClick={() => set('intervalWarningMinutes', min)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      settings.intervalWarningMinutes === min
                        ? 'border-purple-500/40 bg-purple-500/10 text-purple-400'
                        : 'border-show-border bg-show-surface text-slate-600 hover:text-slate-300'
                    }`}
                  >
                    {min}m
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Developer */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Bug className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-slate-300">Developer</h3>
        </div>
        <div className="bg-show-card rounded-xl border border-show-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Dev mode</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Floating panel to seed sample data, time-travel the clock, and inspect state
              </p>
            </div>
            <Toggle
              checked={settings.devMode}
              onChange={v => set('devMode', v)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
