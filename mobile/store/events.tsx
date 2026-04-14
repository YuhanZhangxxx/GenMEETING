import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import { api, type MeetingEvent } from "@/lib/api";

interface EventsContextType {
  events: MeetingEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setEvents: (events: MeetingEvent[]) => void;
}

const EventsContext = createContext<EventsContextType>({
  events: [],
  loading: false,
  error: null,
  refresh: async () => {},
  setEvents: () => {},
});

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<MeetingEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getEvents();
      setEvents(data.events ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <EventsContext.Provider
      value={{ events, loading, error, refresh, setEvents }}
    >
      {children}
    </EventsContext.Provider>
  );
}

export const useEventsStore = () => useContext(EventsContext);
