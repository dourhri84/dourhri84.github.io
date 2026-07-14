import { useCassLabStore } from "../../state/store";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function EventLog() {
  const eventLog = useCassLabStore((s) => s.eventLog);
  const clearEventLog = useCassLabStore((s) => s.clearEventLog);

  return (
    <div className="event-log">
      <div className="event-log-header">
        <span>Event Log</span>
        {eventLog.length > 0 && (
          <button className="btn" onClick={clearEventLog}>
            Clear
          </button>
        )}
      </div>
      <div className="event-log-body scroll-y">
        {eventLog.length === 0 ? (
          <div className="event-log-empty">Event Log — actions you take will be recorded here.</div>
        ) : (
          eventLog.map((entry) => (
            <div key={entry.id} className={`event-log-entry level-${entry.level}`}>
              <span className="event-log-time mono">{formatTime(entry.timestamp)}</span>
              <span className="event-log-message">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
